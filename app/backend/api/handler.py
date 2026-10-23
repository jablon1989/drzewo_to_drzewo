"""Park game API (API Gateway HTTP API -> Lambda, payload v2).

Every route is protected by the Cognito JWT authorizer in API Gateway, so a
request that reaches this code already belongs to a logged-in player. The
player's name comes from the `name` claim of the ID token.

The game in one paragraph: a player photographs Aura in front of a tree and
"hides" it (a challenge). The other player sees only the photo and has to find
the tree and photograph Aura there too. Every photo at a tree also counts for
the tree hunt: a tree turns green on the map once it was found as a hidden tree.
"""

from __future__ import annotations

import json
import logging
import os
import re
import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from decimal import Decimal
from functools import cache
from pathlib import Path
from typing import Any

import boto3
from boto3.dynamodb.conditions import Key
from botocore.config import Config
from botocore.exceptions import ClientError

import game
import players

log = logging.getLogger()
log.setLevel(logging.INFO)

REGION = os.environ.get("AWS_REGION", "eu-central-1")
FINDS_TABLE = os.environ.get("FINDS_TABLE", "finds")
CHALLENGES_TABLE = os.environ.get("CHALLENGES_TABLE", "challenges")
PHOTOS_BUCKET = os.environ.get("PHOTOS_BUCKET", "photos")
TREES_FILE = os.environ.get("TREES_FILE") or str(Path(__file__).with_name("trees.json"))
# Local dev only: the dev server stores photos itself, so URLs point at it.
DEV_S3_BASE = os.environ.get("DEV_S3_BASE")

URL_TTL_SECONDS = 3600
UPLOAD_TTL_SECONDS = 900
MAX_GUESSES = 30
RECENT_LIMIT = 25
PHOTO_ID_RE = re.compile(r"^[0-9a-f]{32}$")
CHALLENGE_ID_RE = re.compile(r"^[0-9a-f]{32}$")
MAX_NOTE = 280

_dynamodb = boto3.resource("dynamodb", region_name=REGION)
_s3 = boto3.client(
    "s3",
    region_name=REGION,
    # Regional endpoint + SigV4 so presigned URLs work right after bucket creation.
    endpoint_url=os.environ.get("S3_ENDPOINT_URL") or f"https://s3.{REGION}.amazonaws.com",
    config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
)
finds_table = _dynamodb.Table(FINDS_TABLE)
challenges_table = _dynamodb.Table(CHALLENGES_TABLE)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def _json_default(value: Any) -> Any:
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, set):
        return sorted(value)
    raise TypeError(f"Not serializable: {type(value)}")


def response(status: int, body: Any = None) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", "Cache-Control": "no-store"},
        "body": "" if body is None else json.dumps(body, default=_json_default),
    }


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def to_decimal(value: float) -> Decimal:
    return Decimal(str(round(value, 7)))


def parse_body(event: dict) -> dict:
    raw = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        import base64

        raw = base64.b64decode(raw).decode()
    try:
        body = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ApiError(400, "Body must be JSON") from exc
    if not isinstance(body, dict):
        raise ApiError(400, "Body must be a JSON object")
    return body


def current_player(event: dict) -> str:
    claims = event.get("requestContext", {}).get("authorizer", {}).get("jwt", {}).get("claims", {})
    name = claims.get("name") or claims.get("email") or claims.get("username") or claims.get("sub")
    if not name:
        raise ApiError(401, "Unknown player")
    return str(name)


@cache
def trees() -> dict[str, dict]:
    with open(TREES_FILE, encoding="utf-8") as fh:
        return {t["id"]: t for t in json.load(fh)["trees"]}


def get_tree(tree_id: Any) -> dict:
    tree = trees().get(tree_id) if isinstance(tree_id, str) else None
    if not tree:
        raise ApiError(400, "Unknown tree")
    return tree


def tree_distance(a: dict, b: dict) -> float:
    return game.distance_m(a["lat"], a["lon"], b["lat"], b["lon"])


def photo_key(photo_id: str) -> str:
    return f"photos/{photo_id}.jpg"


def thumb_key(photo_id: str) -> str:
    return f"thumbs/{photo_id}.jpg"


def presign(method: str, key: str, ttl: int = URL_TTL_SECONDS) -> str:
    if DEV_S3_BASE:
        return f"{DEV_S3_BASE}/{key}"
    params: dict[str, Any] = {"Bucket": PHOTOS_BUCKET, "Key": key}
    if method == "put_object":
        params["ContentType"] = "image/jpeg"
    return _s3.generate_presigned_url(method, Params=params, ExpiresIn=ttl)


def photo_urls(photo_id: str | None) -> dict:
    if not photo_id:
        return {}
    return {
        "photo_url": presign("get_object", photo_key(photo_id)),
        "thumb_url": presign("get_object", thumb_key(photo_id)),
    }


def check_photo(photo_id: Any) -> str:
    """The browser uploads the photo first; make sure it really arrived."""
    if not isinstance(photo_id, str) or not PHOTO_ID_RE.match(photo_id):
        raise ApiError(400, "Invalid photo_id")
    try:
        _s3.head_object(Bucket=PHOTOS_BUCKET, Key=photo_key(photo_id))
    except ClientError as exc:
        raise ApiError(400, "Photo not uploaded yet") from exc
    return photo_id


def optional_position(body: dict) -> dict:
    """Where the phone was when the photo was taken (optional, for the record)."""
    lat, lon = body.get("lat"), body.get("lon")
    if isinstance(lat, int | float) and isinstance(lon, int | float) and -90 <= lat <= 90 and -180 <= lon <= 180:
        return {"lat": to_decimal(lat), "lon": to_decimal(lon)}
    return {}


def scan_all(table, **kwargs) -> list[dict]:
    items: list[dict] = []
    while True:
        page = table.scan(**kwargs)
        items.extend(page.get("Items", []))
        if "LastEvaluatedKey" not in page:
            return items
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def put_find(player: str, tree_id: str, photo_id: str, kind: str, body: dict, challenge_id: str | None = None):
    created = now_iso()
    item = {
        "tree_id": tree_id,
        "find_id": f"{created}#{photo_id}",
        "player": player,
        "photo_id": photo_id,
        "kind": kind,  # hide | guess | solve
        "created_at": created,
        **optional_position(body),
    }
    if challenge_id:
        item["challenge_id"] = challenge_id
    finds_table.put_item(Item=item)
    return item


def load_challenge(challenge_id: str) -> dict:
    if not CHALLENGE_ID_RE.match(challenge_id or ""):
        raise ApiError(404, "Challenge not found")
    item = challenges_table.get_item(Key={"challenge_id": challenge_id}).get("Item")
    if not item:
        raise ApiError(404, "Challenge not found")
    return item


def secret_trees(challenges: list[dict], viewer: str) -> set[str]:
    """Trees the viewer must not see yet: other players' open challenges."""
    return {c["tree_id"] for c in challenges if c.get("status") == "open" and c["creator"] != viewer}


def visible_finds(finds: list[dict], challenges: list[dict], viewer: str) -> list[dict]:
    """Hide the photo that created someone else's open challenge (it would give the tree away)."""
    open_ids = {c["challenge_id"] for c in challenges if c.get("status") == "open" and c["creator"] != viewer}
    return [f for f in finds if not (f.get("kind") == "hide" and f.get("challenge_id") in open_ids)]


def challenge_view(c: dict, viewer: str) -> dict:
    """What the viewer may see of a challenge. The solver never gets the tree while it is open."""
    is_open = c.get("status") == "open"
    secret = is_open and c["creator"] != viewer
    out = {
        "challenge_id": c["challenge_id"],
        "creator": c["creator"],
        "status": c["status"],
        "note": c.get("note"),
        "created_at": c["created_at"],
        "closed_at": c.get("closed_at"),
        "solved_by": c.get("solved_by"),
        "gave_up_by": c.get("gave_up_by"),
        "role": "hider" if c["creator"] == viewer else "seeker",
        **photo_urls(c["photo_id"]),
        "hints": [{"type": h["type"], "value": h["value"], "at": h["at"]} for h in c.get("hints", [])],
        "guesses": [
            {
                "player": g["player"],
                "tree_id": g["tree_id"],
                "correct": g["correct"],
                "distance_m": g["distance_m"],
                "warmth": game.warmth(float(g["distance_m"])),
                "at": g["at"],
                **({"thumb_url": presign("get_object", thumb_key(g["photo_id"]))} if g.get("photo_id") else {}),
            }
            for g in c.get("guesses", [])
        ],
    }
    if not secret:
        tree = trees().get(c["tree_id"], {})
        out["tree"] = tree
        out["tree_id"] = c["tree_id"]
    if c.get("solve_photo_id"):
        out["solve"] = photo_urls(c["solve_photo_id"])
    if c.get("status") == "solved":
        wrong = sum(1 for g in c.get("guesses", []) if not g.get("correct"))
        out["points"] = game.solve_points(wrong, len(c.get("hints", [])))
    return out


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
def get_me(event: dict, params: dict) -> dict:
    me = current_player(event)
    return response(200, {"player": me, "players": sorted(set(players.names()) | {me})})


def get_state(event: dict, params: dict) -> dict:
    """Everything the map and the score page need, in one call."""
    me = current_player(event)
    challenges = scan_all(challenges_table)
    finds = scan_all(finds_table)

    recent = sorted(finds, key=lambda f: f["created_at"], reverse=True)[:RECENT_LIMIT]
    open_secret = {c["challenge_id"] for c in challenges if c.get("status") == "open" and c["creator"] != me}
    activity = []
    for f in recent:
        hidden = f.get("kind") == "hide" and f.get("challenge_id") in open_secret
        entry = {
            "player": f["player"],
            "kind": f["kind"],
            "created_at": f["created_at"],
            "challenge_id": f.get("challenge_id"),
        }
        if not hidden:
            tree = trees().get(f["tree_id"], {})
            entry.update(tree_id=f["tree_id"], species=tree.get("pl"), **photo_urls(f["photo_id"]))
        activity.append(entry)

    return response(
        200,
        {
            "player": me,
            "total_trees": len(trees()),
            # Green on the map: trees found as the other player's hidden tree.
            "found": game.done_trees(challenges),
            "scores": game.scoreboard(set(players.names()) | {me}, finds, challenges),
            "recent": activity,
            "open_for_me": sum(1 for c in challenges if c.get("status") == "open" and c["creator"] != me),
        },
    )


def get_tree_photos(event: dict, params: dict) -> dict:
    me = current_player(event)
    tree = get_tree(params["treeId"])
    challenges = scan_all(challenges_table)
    finds = finds_table.query(KeyConditionExpression=Key("tree_id").eq(tree["id"])).get("Items", [])
    shown = sorted(visible_finds(finds, challenges, me), key=lambda f: f["created_at"], reverse=True)
    return response(
        200,
        {
            "tree": tree,
            "finds": [
                {"player": f["player"], "kind": f["kind"], "created_at": f["created_at"], **photo_urls(f["photo_id"])}
                for f in shown
            ],
        },
    )


def create_upload(event: dict, params: dict) -> dict:
    """Two presigned PUT URLs: the photo (max 2048 px) and a thumbnail. Both are
    resized in the browser, which also drops the EXIF data (incl. GPS)."""
    current_player(event)
    photo_id = uuid.uuid4().hex
    return response(
        201,
        {
            "photo_id": photo_id,
            "content_type": "image/jpeg",
            "photo_upload_url": presign("put_object", photo_key(photo_id), UPLOAD_TTL_SECONDS),
            "thumb_upload_url": presign("put_object", thumb_key(photo_id), UPLOAD_TTL_SECONDS),
        },
    )


def list_challenges(event: dict, params: dict) -> dict:
    me = current_player(event)
    items = sorted(scan_all(challenges_table), key=lambda c: c["created_at"], reverse=True)
    return response(200, {"challenges": [challenge_view(c, me) for c in items if c.get("status") != "cancelled"]})


def create_challenge(event: dict, params: dict) -> dict:
    me = current_player(event)
    body = parse_body(event)
    tree = get_tree(body.get("tree_id"))
    photo_id = check_photo(body.get("photo_id"))
    note = body.get("note")
    if note is not None and (not isinstance(note, str) or len(note) > MAX_NOTE):
        raise ApiError(400, f"Note must be text up to {MAX_NOTE} characters")

    challenge_id = uuid.uuid4().hex
    item = {
        "challenge_id": challenge_id,
        "creator": me,
        "tree_id": tree["id"],
        "photo_id": photo_id,
        "status": "open",
        "created_at": now_iso(),
        "guesses": [],
        "hints": [],
        **optional_position(body),
    }
    if note and note.strip():
        item["note"] = note.strip()
    challenges_table.put_item(Item=item)
    put_find(me, tree["id"], photo_id, "hide", body, challenge_id)
    return response(201, challenge_view(item, me))


def get_challenge(event: dict, params: dict) -> dict:
    me = current_player(event)
    return response(200, challenge_view(load_challenge(params["challengeId"]), me))


def require_seeker(c: dict, me: str) -> None:
    if c["status"] != "open":
        raise ApiError(409, "This challenge is already finished")
    if c["creator"] == me:
        raise ApiError(403, "You hid this tree – the other player has to find it")


def create_guess(event: dict, params: dict) -> dict:
    me = current_player(event)
    c = load_challenge(params["challengeId"])
    require_seeker(c, me)
    body = parse_body(event)
    guess_tree = get_tree(body.get("tree_id"))
    photo_id = check_photo(body.get("photo_id"))
    if len(c.get("guesses", [])) >= MAX_GUESSES:
        raise ApiError(409, "Too many guesses – use a hint or give up")

    target = get_tree(c["tree_id"])
    correct = guess_tree["id"] == target["id"]
    meters = 0 if correct else round(tree_distance(guess_tree, target))
    now = now_iso()
    guess = {
        "player": me,
        "tree_id": guess_tree["id"],
        "photo_id": photo_id,
        "correct": correct,
        "distance_m": meters,
        "at": now,
    }

    update = "SET guesses = list_append(if_not_exists(guesses, :empty), :g)"
    values: dict[str, Any] = {":g": [guess], ":empty": [], ":open": "open"}
    if correct:
        update += ", #s = :solved, solved_by = :me, solved_at = :now, closed_at = :now, solve_photo_id = :p"
        values.update({":solved": "solved", ":me": me, ":now": now, ":p": photo_id})
    try:
        updated = challenges_table.update_item(
            Key={"challenge_id": c["challenge_id"]},
            UpdateExpression=update,
            ConditionExpression="#s = :open",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues=values,
            ReturnValues="ALL_NEW",
        )["Attributes"]
    except ClientError as exc:
        if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise ApiError(409, "This challenge is already finished") from exc
        raise

    put_find(me, guess_tree["id"], photo_id, "solve" if correct else "guess", body, c["challenge_id"])
    return response(
        200,
        {
            "correct": correct,
            "distance_m": meters,
            "warmth": game.warmth(meters),
            "challenge": challenge_view(updated, me),
        },
    )


def create_hint(event: dict, params: dict) -> dict:
    me = current_player(event)
    c = load_challenge(params["challengeId"])
    require_seeker(c, me)
    hint_type = parse_body(event).get("type")
    if hint_type not in game.HINT_TYPES:
        raise ApiError(400, f"Hint type must be one of {', '.join(game.HINT_TYPES)}")
    if any(h["type"] == hint_type for h in c.get("hints", [])):
        raise ApiError(409, "You already have this hint")

    tree = get_tree(c["tree_id"])
    if hint_type == "species":
        value: Any = {"pl": tree.get("pl"), "la": tree.get("la"), "cm": tree.get("cm")}
    elif hint_type == "zone":
        zone = game.zone_hint(tree["lat"], tree["lon"])
        value = {"lat": to_decimal(zone["lat"]), "lon": to_decimal(zone["lon"]), "radius_m": zone["radius_m"]}
    else:
        if not tree.get("tag"):
            raise ApiError(409, "This tree has no tag number")
        value = {"tag": tree["tag"]}

    hint = {"type": hint_type, "value": value, "at": now_iso()}
    updated = challenges_table.update_item(
        Key={"challenge_id": c["challenge_id"]},
        UpdateExpression="SET hints = list_append(if_not_exists(hints, :empty), :h)",
        ConditionExpression="#s = :open",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={":h": [hint], ":empty": [], ":open": "open"},
        ReturnValues="ALL_NEW",
    )["Attributes"]
    return response(200, challenge_view(updated, me))


def give_up(event: dict, params: dict) -> dict:
    me = current_player(event)
    c = load_challenge(params["challengeId"])
    require_seeker(c, me)
    updated = challenges_table.update_item(
        Key={"challenge_id": c["challenge_id"]},
        UpdateExpression="SET #s = :gave_up, gave_up_by = :me, closed_at = :now",
        ConditionExpression="#s = :open",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={":gave_up": "gave_up", ":me": me, ":now": now_iso(), ":open": "open"},
        ReturnValues="ALL_NEW",
    )["Attributes"]
    return response(200, challenge_view(updated, me))


def cancel_challenge(event: dict, params: dict) -> dict:
    """The hider takes a challenge back (e.g. the tree turned out to be wrong)."""
    me = current_player(event)
    c = load_challenge(params["challengeId"])
    if c["creator"] != me:
        raise ApiError(403, "Only the player who hid the tree can cancel it")
    if c["status"] != "open":
        raise ApiError(409, "This challenge is already finished")
    challenges_table.update_item(
        Key={"challenge_id": c["challenge_id"]},
        UpdateExpression="SET #s = :cancelled, closed_at = :now",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={":cancelled": "cancelled", ":now": now_iso()},
    )
    return response(204)


ROUTES: dict[str, Callable[[dict, dict], dict]] = {
    "GET /api/me": get_me,
    "GET /api/state": get_state,
    "GET /api/trees/{treeId}": get_tree_photos,
    "POST /api/uploads": create_upload,
    "GET /api/challenges": list_challenges,
    "POST /api/challenges": create_challenge,
    "GET /api/challenges/{challengeId}": get_challenge,
    "DELETE /api/challenges/{challengeId}": cancel_challenge,
    "POST /api/challenges/{challengeId}/guesses": create_guess,
    "POST /api/challenges/{challengeId}/hints": create_hint,
    "POST /api/challenges/{challengeId}/give-up": give_up,
}


def handler(event: dict, context: Any = None) -> dict:
    route = event.get("routeKey", "")
    fn = ROUTES.get(route)
    if not fn:
        return response(404, {"message": f"No route {route}"})
    try:
        return fn(event, event.get("pathParameters") or {})
    except ApiError as err:
        return response(err.status, {"message": err.message})
    except Exception:
        log.exception("Unhandled error on %s", route)
        return response(500, {"message": "Internal error"})
