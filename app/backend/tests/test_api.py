import json

import pytest

TREE_A = "D.1000"
TREE_B = "D.1001"


def call(h, route, player="Bartosz", body=None, **path):
    event = {
        "routeKey": route,
        "pathParameters": path or None,
        "body": json.dumps(body) if body is not None else None,
        "requestContext": {"authorizer": {"jwt": {"claims": {"name": player}}}},
    }
    res = h.handler(event)
    return res["statusCode"], (json.loads(res["body"]) if res["body"] else None)


def upload(h, player="Bartosz"):
    status, ticket = call(h, "POST /api/uploads", player)
    assert status == 201
    assert "X-Amz-Signature" in ticket["photo_upload_url"]
    h._s3.put_object(Bucket="test-photos", Key=f"photos/{ticket['photo_id']}.jpg", Body=b"jpg")
    h._s3.put_object(Bucket="test-photos", Key=f"thumbs/{ticket['photo_id']}.jpg", Body=b"jpg")
    return ticket["photo_id"]


def test_me_lists_players(aws):
    status, body = call(aws, "GET /api/me", "Asia")
    assert status == 200
    assert body == {"player": "Asia", "players": ["Asia", "Bartosz"]}


def test_unknown_route(aws):
    assert call(aws, "GET /api/nope")[0] == 404


def test_no_free_tree_logging(aws):
    # Trees can only be marked through hide & seek.
    photo = upload(aws)
    assert call(aws, "POST /api/finds", body={"tree_id": TREE_A, "photo_id": photo})[0] == 404
    _, state = call(aws, "GET /api/state", "Asia")
    assert state["found"] == {}
    assert state["total_trees"] > 2000


def test_hide_rejects_unknown_tree_and_missing_photo(aws):
    route = "POST /api/challenges"
    photo = upload(aws)
    assert call(aws, route, body={"tree_id": "D.nope", "photo_id": photo})[0] == 400
    missing = "0" * 32
    status, body = call(aws, route, body={"tree_id": TREE_A, "photo_id": missing})
    assert status == 400 and "not uploaded" in body["message"]
    assert call(aws, route, body={"tree_id": TREE_A, "photo_id": "../x"})[0] == 400


@pytest.fixture
def challenge(aws):
    photo = upload(aws, "Bartosz")
    status, c = call(aws, "POST /api/challenges", "Bartosz", {"tree_id": TREE_A, "photo_id": photo, "note": "Big one"})
    assert status == 201
    assert c["tree_id"] == TREE_A  # the hider sees their tree
    return c["challenge_id"]


def test_seeker_cannot_see_the_tree(aws, challenge):
    _, c = call(aws, "GET /api/challenges/{challengeId}", "Asia", challengeId=challenge)
    assert c["role"] == "seeker"
    assert "tree_id" not in c and "tree" not in c
    assert c["photo_url"]

    _, listing = call(aws, "GET /api/challenges", "Asia")
    assert "tree_id" not in listing["challenges"][0]

    # The hide photo would reveal the tree on the map and in the feed.
    _, state = call(aws, "GET /api/state", "Asia")
    assert TREE_A not in state["found"]
    assert "tree_id" not in state["recent"][0]
    assert state["open_for_me"] == 1

    _, tree = call(aws, "GET /api/trees/{treeId}", "Asia", treeId=TREE_A)
    assert tree["finds"] == []

    # Hiding a tree doesn't mark it as done, not even for the hider.
    _, state = call(aws, "GET /api/state", "Bartosz")
    assert state["found"] == {}
    assert state["recent"][0]["tree_id"] == TREE_A  # the hider sees their own photo in the feed


def test_hider_cannot_guess_own_tree(aws, challenge):
    photo = upload(aws, "Bartosz")
    status, _ = call(
        aws,
        "POST /api/challenges/{challengeId}/guesses",
        "Bartosz",
        {"tree_id": TREE_A, "photo_id": photo},
        challengeId=challenge,
    )
    assert status == 403


def test_wrong_then_right_guess(aws, challenge):
    route = "POST /api/challenges/{challengeId}/guesses"
    status, wrong = call(
        aws, route, "Asia", {"tree_id": TREE_B, "photo_id": upload(aws, "Asia")}, challengeId=challenge
    )
    assert status == 200
    assert wrong["correct"] is False
    assert wrong["distance_m"] > 0
    assert "tree_id" not in wrong["challenge"]
    _, state = call(aws, "GET /api/state", "Asia")
    assert state["found"] == {}  # a wrong guess marks nothing

    status, right = call(
        aws, route, "Asia", {"tree_id": TREE_A, "photo_id": upload(aws, "Asia")}, challengeId=challenge
    )
    assert right["correct"] is True
    c = right["challenge"]
    assert c["status"] == "solved" and c["solved_by"] == "Asia"
    assert c["tree_id"] == TREE_A
    assert c["points"] == 8
    assert c["solve"]["photo_url"]

    # Finished: no more guesses, the tree is visible to everyone.
    assert (
        call(aws, route, "Asia", {"tree_id": TREE_A, "photo_id": upload(aws, "Asia")}, challengeId=challenge)[0] == 409
    )
    _, state = call(aws, "GET /api/state", "Asia")
    assert state["found"] == {TREE_A: ["Asia"]}  # done: found as a hidden tree
    scores = {r["player"]: r for r in state["scores"]}
    assert scores["Asia"]["points"] == 8
    assert scores["Asia"]["solved"] == 1 and scores["Asia"]["trees"] == 1
    assert scores["Asia"]["photos"] == 2
    assert scores["Bartosz"]["points"] == 0 and scores["Bartosz"]["hidden"] == 1


def test_hints(aws, challenge):
    route = "POST /api/challenges/{challengeId}/hints"
    _, c = call(aws, route, "Asia", {"type": "species"}, challengeId=challenge)
    assert c["hints"][0]["value"]["pl"] == "grab pospolity"
    assert call(aws, route, "Asia", {"type": "species"}, challengeId=challenge)[0] == 409
    _, c = call(aws, route, "Asia", {"type": "zone"}, challengeId=challenge)
    assert c["hints"][1]["value"]["radius_m"] == 40
    _, c = call(aws, route, "Asia", {"type": "tag"}, challengeId=challenge)
    assert c["hints"][2]["value"]["tag"] == "042476"
    assert call(aws, route, "Asia", {"type": "x"}, challengeId=challenge)[0] == 400
    assert call(aws, route, "Bartosz", {"type": "zone"}, challengeId=challenge)[0] == 403


def test_give_up_reveals_tree_and_scores_hider(aws, challenge):
    status, c = call(aws, "POST /api/challenges/{challengeId}/give-up", "Asia", challengeId=challenge)
    assert status == 200
    assert c["status"] == "gave_up" and c["tree_id"] == TREE_A
    _, state = call(aws, "GET /api/state", "Asia")
    scores = {r["player"]: r for r in state["scores"]}
    assert scores["Bartosz"]["points"] == 5
    assert state["found"] == {}  # given up = not found


def test_cancel(aws, challenge):
    assert call(aws, "DELETE /api/challenges/{challengeId}", "Asia", challengeId=challenge)[0] == 403
    assert call(aws, "DELETE /api/challenges/{challengeId}", "Bartosz", challengeId=challenge)[0] == 204
    _, listing = call(aws, "GET /api/challenges", "Asia")
    assert listing["challenges"] == []


def test_challenge_not_found(aws):
    assert call(aws, "GET /api/challenges/{challengeId}", challengeId="f" * 32)[0] == 404
    assert call(aws, "GET /api/challenges/{challengeId}", challengeId="../../x")[0] == 404
