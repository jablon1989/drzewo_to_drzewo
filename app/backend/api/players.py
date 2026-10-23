"""Who plays: the users of the shared pusiaczkowo.pl login (Cognito user pool).

Name = the user's `name` attribute (shown in the game), plus their e-mail for
notifications. Read from Cognito and cached for a few minutes, so adding a user
in the shared stack needs no change here.

Without USER_POOL_ID (tests, local dev) the list comes from the PLAYERS /
PLAYER_EMAILS environment variables.
"""

from __future__ import annotations

import json
import logging
import os
import time

log = logging.getLogger()

USER_POOL_ID = os.environ.get("USER_POOL_ID", "")
CACHE_SECONDS = 300

_cache: tuple[float, dict[str, str]] | None = None


def _from_env() -> dict[str, str]:
    emails = json.loads(os.environ.get("PLAYER_EMAILS") or "{}")
    names = json.loads(os.environ.get("PLAYERS") or "[]")
    return {name: emails.get(name, "") for name in names} | emails


def _from_cognito() -> dict[str, str]:
    import boto3

    client = boto3.client("cognito-idp", region_name=os.environ.get("AWS_REGION", "eu-central-1"))
    out: dict[str, str] = {}
    for page in client.get_paginator("list_users").paginate(UserPoolId=USER_POOL_ID):
        for user in page["Users"]:
            if not user.get("Enabled", True):
                continue
            attrs = {a["Name"]: a["Value"] for a in user.get("Attributes", [])}
            name = attrs.get("name") or attrs.get("email")
            if name:
                out[name] = attrs.get("email", "")
    return out


def directory() -> dict[str, str]:
    """{player name: e-mail}"""
    global _cache
    if not USER_POOL_ID:
        return _from_env()
    if _cache and time.monotonic() - _cache[0] < CACHE_SECONDS:
        return _cache[1]
    try:
        _cache = (time.monotonic(), _from_cognito())
    except Exception:
        log.exception("Could not list users of %s", USER_POOL_ID)
        return _cache[1] if _cache else {}
    return _cache[1]


def names() -> list[str]:
    return sorted(directory())


def emails() -> dict[str, str]:
    return {name: email for name, email in directory().items() if email}
