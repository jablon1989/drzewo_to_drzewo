import pytest
from test_api import TREE_A, TREE_B, call, upload


@pytest.fixture
def outbox(aws, monkeypatch):
    import notify

    sent = []
    monkeypatch.setattr(notify, "NOTIFY_FROM", "Aura's Tree Hunt <game@pusiaczkowo.pl>")
    monkeypatch.setattr(notify, "player_emails", lambda: {"Bartosz": "b@example.com", "Asia": "a@example.com"})
    monkeypatch.setattr(notify, "SITE_URL", "https://park.pusiaczkowo.pl")
    monkeypatch.setattr(notify, "send", sent.append)
    return sent


def hide(h, note=None):
    body = {"tree_id": TREE_A, "photo_id": upload(h, "Bartosz")}
    if note:
        body["note"] = note
    status, c = call(h, "POST /api/challenges", "Bartosz", body)
    assert status == 201
    return c["challenge_id"]


def text_of(msg):
    return msg.get_body(preferencelist=("plain",)).get_content()


def test_new_challenge_emails_the_other_player_with_photo(aws, outbox):
    cid = hide(aws, note="Near the pond")
    assert len(outbox) == 1
    msg = outbox[0]
    assert msg["To"] == "a@example.com"
    assert msg["From"] == "Aura's Tree Hunt <game@pusiaczkowo.pl>"
    assert "Bartosz hid a tree for you" in msg["Subject"]
    body = text_of(msg)
    assert "Near the pond" in body
    assert f"https://park.pusiaczkowo.pl/hunt/{cid}" in body
    images = [p for p in msg.walk() if p.get_content_type() == "image/jpeg"]
    assert len(images) == 1 and images[0].get_content() == b"jpg"
    # The secret stays secret: no tree in the e-mail.
    assert TREE_A not in msg.as_string() and "grab" not in msg.as_string()


def test_wrong_guess_sends_nothing_right_guess_tells_the_hider(aws, outbox):
    cid = hide(aws)
    outbox.clear()
    route = "POST /api/challenges/{challengeId}/guesses"
    call(aws, route, "Asia", {"tree_id": TREE_B, "photo_id": upload(aws, "Asia")}, challengeId=cid)
    assert outbox == []

    call(aws, route, "Asia", {"tree_id": TREE_A, "photo_id": upload(aws, "Asia")}, challengeId=cid)
    assert len(outbox) == 1
    msg = outbox[0]
    assert msg["To"] == "b@example.com"
    assert "Asia found your tree" in msg["Subject"]
    assert "1 wrong guess" in text_of(msg) and "+8 points" in text_of(msg)


def test_give_up_tells_the_hider(aws, outbox):
    cid = hide(aws)
    outbox.clear()
    call(aws, "POST /api/challenges/{challengeId}/give-up", "Asia", challengeId=cid)
    assert len(outbox) == 1
    assert outbox[0]["To"] == "b@example.com"
    assert "+5 points for you" in text_of(outbox[0])


def test_failed_email_does_not_break_the_game(aws, outbox, monkeypatch):
    import notify

    def boom(msg):
        raise RuntimeError("SES says no")

    monkeypatch.setattr(notify, "send", boom)
    hide(aws)  # still 201


def test_switched_off_without_sender(aws, monkeypatch):
    import notify

    sent = []
    monkeypatch.setattr(notify, "NOTIFY_FROM", "")
    monkeypatch.setattr(notify, "send", sent.append)
    hide(aws)
    assert sent == []
