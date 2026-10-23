import random

import game


def test_distance_is_about_right():
    # 0.001° latitude ≈ 111 m
    assert 110 < game.distance_m(51.0, 17.0, 51.001, 17.0) < 112
    assert game.distance_m(51.0, 17.0, 51.0, 17.0) == 0


def test_warmth_words():
    assert game.warmth(3) == "right next to it"
    assert game.warmth(20) == "hot"
    assert game.warmth(50) == "warm"
    assert game.warmth(100) == "cool"
    assert game.warmth(400) == "cold"


def test_zone_contains_tree_but_is_not_centred_on_it():
    for seed in range(50):
        zone = game.zone_hint(51.075, 17.01, random.Random(seed))
        d = game.distance_m(51.075, 17.01, zone["lat"], zone["lon"])
        assert 0.2 * game.ZONE_RADIUS_M < d < game.ZONE_RADIUS_M


def test_solve_points():
    assert game.solve_points(0, 0) == 10
    assert game.solve_points(2, 1) == 3
    assert game.solve_points(10, 3) == game.MIN_SOLVE_POINTS


def test_scoreboard():
    finds = [
        {"player": "Asia", "tree_id": "D.1"},
        {"player": "Asia", "tree_id": "D.1"},
        {"player": "Asia", "tree_id": "D.2"},
        {"player": "Bartosz", "tree_id": "D.3"},
    ]
    challenges = [
        {
            "creator": "Bartosz",
            "status": "solved",
            "solved_by": "Asia",
            "tree_id": "D.7",
            "guesses": [{"correct": False}, {"correct": True}],
        },
        {"creator": "Asia", "status": "gave_up", "gave_up_by": "Bartosz"},
        {"creator": "Asia", "status": "cancelled"},
        {"creator": "Asia", "status": "open"},
    ]
    rows = {r["player"]: r for r in game.scoreboard(["Asia", "Bartosz", "Nobody"], finds, challenges)}
    assert rows["Asia"]["trees"] == 1  # only the hidden tree she found
    assert rows["Asia"]["photos"] == 3
    assert rows["Asia"]["solved"] == 1
    assert rows["Asia"]["hidden"] == 2  # cancelled one does not count
    assert rows["Asia"]["stumped"] == 1
    assert rows["Asia"]["points"] == 8 + 5
    assert rows["Bartosz"]["points"] == 0
    assert rows["Bartosz"]["trees"] == 0
    assert rows["Bartosz"]["gave_up"] == 1
    assert rows["Nobody"]["points"] == 0


def test_done_trees_only_counts_solved_challenges():
    challenges = [
        {"status": "solved", "tree_id": "D.1", "solved_by": "Asia"},
        {"status": "solved", "tree_id": "D.1", "solved_by": "Bartosz"},
        {"status": "open", "tree_id": "D.2"},
        {"status": "gave_up", "tree_id": "D.3"},
        {"status": "cancelled", "tree_id": "D.4"},
    ]
    assert game.done_trees(challenges) == {"D.1": ["Asia", "Bartosz"]}
