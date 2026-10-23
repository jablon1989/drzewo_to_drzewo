import boto3
import pytest
from moto import mock_aws


@pytest.fixture
def pool(monkeypatch):
    with mock_aws():
        import players

        client = boto3.client("cognito-idp", region_name="eu-central-1")
        pool_id = client.create_user_pool(PoolName="aurathehusky-users")["UserPool"]["Id"]
        for name, email in [("Bartosz", "b@example.com"), ("Asiulka", "a@example.com")]:
            client.admin_create_user(
                UserPoolId=pool_id,
                Username=email,
                UserAttributes=[{"Name": "email", "Value": email}, {"Name": "name", "Value": name}],
            )
        client.admin_create_user(UserPoolId=pool_id, Username="gone@example.com")
        client.admin_disable_user(UserPoolId=pool_id, Username="gone@example.com")
        monkeypatch.setattr(players, "USER_POOL_ID", pool_id)
        monkeypatch.setattr(players, "_cache", None)
        yield players, client, pool_id


def test_players_come_from_the_shared_login(pool):
    players, _, _ = pool
    assert players.names() == ["Asiulka", "Bartosz"]
    assert players.emails() == {"Bartosz": "b@example.com", "Asiulka": "a@example.com"}


def test_list_is_cached(pool):
    players, client, pool_id = pool
    players.names()
    client.admin_create_user(
        UserPoolId=pool_id,
        Username="new@example.com",
        UserAttributes=[{"Name": "email", "Value": "new@example.com"}, {"Name": "name", "Value": "New"}],
    )
    assert "New" not in players.names()
    players._cache = None
    assert "New" in players.names()


def test_without_pool_uses_env(monkeypatch):
    import players

    monkeypatch.setattr(players, "USER_POOL_ID", "")
    monkeypatch.setenv("PLAYERS", '["A", "B"]')
    monkeypatch.setenv("PLAYER_EMAILS", '{"A": "a@x"}')
    assert players.names() == ["A", "B"]
    assert players.emails() == {"A": "a@x"}
