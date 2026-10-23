"""E-mails between the players: a new hidden tree, a found tree, a give-up.

Best effort: a failed e-mail is logged and never fails the game action.
Sent with Amazon SES from the shared @pusiaczkowo.pl domain. The photo is
attached inline (it was resized in the browser, so it has no GPS data).
"""

from __future__ import annotations

import logging
import os
from collections.abc import Callable
from datetime import datetime
from email.message import EmailMessage
from email.utils import make_msgid
from html import escape

import players

log = logging.getLogger()

# "Aura's Tree Hunt <game@pusiaczkowo.pl>"; empty = e-mails switched off.
NOTIFY_FROM = os.environ.get("NOTIFY_FROM", "")
SITE_URL = os.environ.get("SITE_URL", "").rstrip("/")

_ses = None


def _send_with_ses(msg: EmailMessage) -> None:
    global _ses
    if _ses is None:
        import boto3

        _ses = boto3.client("sesv2", region_name=os.environ.get("AWS_REGION", "eu-central-1"))
    _ses.send_email(Content={"Raw": {"Data": msg.as_bytes()}})


# Swapped out by tests and by the local dev server (which prints instead).
send: Callable[[EmailMessage], None] = _send_with_ses

# {"Bartosz": "you@example.com", "Asiulka": "her@example.com"}, from the shared login.
player_emails: Callable[[], dict[str, str]] = players.emails


def others(player: str) -> list[str]:
    return [name for name in player_emails() if name != player]


def duration(start_iso: str, end_iso: str) -> str:
    minutes = max(1, round((datetime.fromisoformat(end_iso) - datetime.fromisoformat(start_iso)).total_seconds() / 60))
    if minutes < 60:
        return f"{minutes} min"
    hours, rest = divmod(minutes, 60)
    if hours < 48:
        return f"{hours} h {rest} min"
    return f"{hours // 24} days"


def build(to_player: str, subject: str, lines: list[str], link: str, button: str, photo: bytes | None) -> EmailMessage:
    """Plain text + HTML with the photo inline."""
    msg = EmailMessage()
    msg["From"] = NOTIFY_FROM
    msg["To"] = player_emails()[to_player]
    msg["Subject"] = subject

    url = f"{SITE_URL}{link}"
    msg.set_content("\n\n".join([f"Hi {to_player}!", *lines, f"{button}: {url}", "– Aura 🐺"]))

    cid = make_msgid(domain="pusiaczkowo.pl")
    img = (
        f'<p><img src="cid:{cid[1:-1]}" alt="Aura" style="max-width:100%;width:480px;border-radius:12px"></p>'
        if photo
        else ""
    )
    paragraphs = "".join(f"<p>{escape(line)}</p>" for line in lines)
    msg.add_alternative(
        f"""<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#1b2119;max-width:520px">
<p>Hi {escape(to_player)}!</p>{paragraphs}{img}
<p><a href="{escape(url)}" style="display:inline-block;background:#2f6b3f;color:#fff;padding:12px 20px;
border-radius:999px;text-decoration:none;font-weight:600">{escape(button)}</a></p>
<p style="color:#6c7468">– Aura 🐺</p></body></html>""",
        subtype="html",
    )
    if photo:
        msg.get_payload()[1].add_related(photo, maintype="image", subtype="jpeg", cid=cid, filename="aura.jpg")
    return msg


def deliver(messages: list[EmailMessage]) -> None:
    for msg in messages:
        try:
            send(msg)
            log.info("Sent e-mail %r to %s", msg["Subject"], msg["To"])
        except Exception:
            log.exception("Could not send e-mail %r to %s", msg["Subject"], msg["To"])


def enabled() -> bool:
    return bool(NOTIFY_FROM and player_emails())


# ---------------------------------------------------------------------------
# The three game events
# ---------------------------------------------------------------------------
def new_challenge(challenge: dict, photo: bytes | None) -> None:
    """Tell the other player(s) a tree is waiting for them."""
    if not enabled():
        return
    creator = challenge["creator"]
    lines = [f"{creator} hid a tree in Park Południowy. Here's Aura in front of it – can you find it?"]
    if challenge.get("note"):
        lines.append(f"{creator} says: “{challenge['note']}”")
    deliver(
        [
            build(
                to,
                f"🐺 {creator} hid a tree for you!",
                lines,
                f"/hunt/{challenge['challenge_id']}",
                "Start looking",
                photo,
            )
            for to in others(creator)
        ]
    )


def solved(challenge: dict, points: int, photo: bytes | None) -> None:
    """Tell the hider their tree was found."""
    creator, solver = challenge["creator"], challenge["solved_by"]
    if not enabled() or creator not in player_emails():
        return
    wrong = sum(1 for g in challenge.get("guesses", []) if not g.get("correct"))
    hints = len(challenge.get("hints", []))
    details = f"It took {duration(challenge['created_at'], challenge['solved_at'])}"
    details += f", {wrong} wrong guess{'es' if wrong != 1 else ''}"
    details += f" and {hints} hint{'s' if hints != 1 else ''}" if hints else ""
    lines = [
        f"{solver} found your tree! {details}: +{points} points for {solver}.",
        f"Now it's {solver}'s turn to hide one.",
    ]
    link = f"/hunt/{challenge['challenge_id']}"
    deliver([build(creator, f"🎉 {solver} found your tree!", lines, link, "See both photos", photo)])


def gave_up(challenge: dict) -> None:
    """Tell the hider the other player gave up (+5 for the hider)."""
    creator, quitter = challenge["creator"], challenge.get("gave_up_by", "")
    if not enabled() or creator not in player_emails():
        return
    lines = [f"{quitter} couldn't find your tree and gave up. +5 points for you!"]
    link = f"/hunt/{challenge['challenge_id']}"
    deliver([build(creator, f"🏳️ {quitter} gave up on your tree", lines, link, "Open the game", None)])
