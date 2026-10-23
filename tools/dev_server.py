#!/usr/bin/env python3
"""Local fake backend for trying the game without AWS (`make local`).

Runs the real API Lambda handler against in-memory DynamoDB + S3 (moto), and
stores uploaded photos in that fake S3. No login: the browser says who it is
("Bearer dev:<name>"). Everything is lost when you stop the server.

  app/backend/.venv/bin/python tools/dev_server.py [--port 8787] [--players Bartosz,Asia]
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parents[1]
REGION = "eu-central-1"
BUCKET = "local-photos"

for key, value in {
    "AWS_DEFAULT_REGION": REGION,
    "AWS_REGION": REGION,
    "AWS_ACCESS_KEY_ID": "local",
    "AWS_SECRET_ACCESS_KEY": "local",
    "FINDS_TABLE": "local-finds",
    "CHALLENGES_TABLE": "local-challenges",
    "PHOTOS_BUCKET": BUCKET,
    "TREES_FILE": str(ROOT / "data" / "trees.json"),
    "DEV_S3_BASE": "/dev-s3",  # relative: the Vite dev server proxies it here
}.items():
    os.environ[key] = value

import boto3  # noqa: E402
from moto import mock_aws  # noqa: E402

sys.path.insert(0, str(ROOT / "app" / "backend" / "api"))
LOCK = threading.Lock()  # one request at a time: simple and safe with moto


def setup_aws() -> None:
    ddb = boto3.client("dynamodb", region_name=REGION)
    ddb.create_table(
        TableName="local-finds",
        BillingMode="PAY_PER_REQUEST",
        KeySchema=[{"AttributeName": "tree_id", "KeyType": "HASH"}, {"AttributeName": "find_id", "KeyType": "RANGE"}],
        AttributeDefinitions=[
            {"AttributeName": "tree_id", "AttributeType": "S"},
            {"AttributeName": "find_id", "AttributeType": "S"},
        ],
    )
    ddb.create_table(
        TableName="local-challenges",
        BillingMode="PAY_PER_REQUEST",
        KeySchema=[{"AttributeName": "challenge_id", "KeyType": "HASH"}],
        AttributeDefinitions=[{"AttributeName": "challenge_id", "AttributeType": "S"}],
    )
    boto3.client("s3", region_name=REGION).create_bucket(
        Bucket=BUCKET, CreateBucketConfiguration={"LocationConstraint": REGION}
    )


def compile_routes(route_keys) -> list[tuple[str, re.Pattern, str]]:
    """'GET /api/challenges/{challengeId}' -> (GET, regex with named groups, route key)"""
    out = []
    for key in route_keys:
        method, path = key.split(" ", 1)
        pattern = re.sub(r"\{(\w+)\}", r"(?P<\1>[^/]+)", path)
        out.append((method, re.compile(f"^{pattern}$"), key))
    return out


class Handler(BaseHTTPRequestHandler):
    api = None
    players: list[str] = []
    routes: list = []
    s3 = None

    def log_message(self, fmt, *args):  # quieter log
        sys.stderr.write(f"  {self.command} {self.path.split('?')[0]} -> {args[1] if len(args) > 1 else ''}\n")

    def _send(self, status: int, body: bytes = b"", content_type: str = "application/json", headers=None):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if body and self.command != "HEAD":
            self.wfile.write(body)

    def _body(self) -> bytes:
        length = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(length) if length else b""

    def _dev_s3(self) -> None:
        key = unquote(urlparse(self.path).path[len("/dev-s3/") :])
        if not re.match(r"^(photos|thumbs)/[0-9a-f]{32}\.jpg$", key):
            return self._send(404, b'{"message":"bad key"}')
        with LOCK:
            if self.command == "PUT":
                self.s3.put_object(Bucket=BUCKET, Key=key, Body=self._body(), ContentType="image/jpeg")
                return self._send(200, b"")
            try:
                data = self.s3.get_object(Bucket=BUCKET, Key=key)["Body"].read()
            except self.s3.exceptions.NoSuchKey:
                return self._send(404, b"")
        self._send(200, data, "image/jpeg", {"Cache-Control": "max-age=3600"})

    def _api(self) -> None:
        path = urlparse(self.path).path
        for method, regex, key in self.routes:
            m = regex.match(path)
            if m and method == self.command:
                break
        else:
            return self._send(404, json.dumps({"message": f"No route {self.command} {path}"}).encode())

        auth = self.headers.get("Authorization", "")
        if not auth.startswith("Bearer dev:"):
            return self._send(401, b'{"message":"Unauthorized"}')
        player = unquote(auth[len("Bearer dev:") :])
        event = {
            "routeKey": key,
            "pathParameters": {k: unquote(v) for k, v in m.groupdict().items()} or None,
            "body": self._body().decode() or None,
            "requestContext": {"authorizer": {"jwt": {"claims": {"name": player}}}},
        }
        with LOCK:
            res = self.api.handler(event)
        self._send(res["statusCode"], res["body"].encode(), res["headers"]["Content-Type"])

    def _dispatch(self) -> None:
        if self.path.split("?")[0] == "/config.json":
            return self._send(200, json.dumps({"dev": {"players": self.players}}).encode())
        if self.path.startswith("/dev-s3/"):
            return self._dev_s3()
        if self.path.startswith("/api/"):
            return self._api()
        self._send(404, b"")

    do_GET = do_POST = do_PUT = do_DELETE = do_HEAD = _dispatch


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--players", default="Bartosz,Asiulka", help="comma-separated player names")
    args = parser.parse_args()
    players = [p.strip() for p in args.players.split(",") if p.strip()]
    os.environ["PLAYERS"] = json.dumps(players)
    os.environ["PLAYER_EMAILS"] = json.dumps({p: f"{p.lower()}@example.local" for p in players})

    with mock_aws():
        setup_aws()
        import handler as api
        import notify

        # E-mails: print them instead of sending.
        notify.NOTIFY_FROM = "Aura's Tree Hunt <game@pusiaczkowo.pl>"
        notify.SITE_URL = "http://localhost:5173"
        notify.send = lambda msg: print(
            f"  📧 to {msg['To']}: {msg['Subject']}\n"
            + "\n".join("     " + line for line in msg.get_body(("plain",)).get_content().splitlines() if line),
            file=sys.stderr,
        )

        Handler.api = api
        Handler.players = players
        Handler.routes = compile_routes(api.ROUTES)
        Handler.s3 = boto3.client("s3", region_name=REGION)
        server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
        print(f"Fake park-game API on http://localhost:{args.port} – players: {', '.join(players)}", file=sys.stderr)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
