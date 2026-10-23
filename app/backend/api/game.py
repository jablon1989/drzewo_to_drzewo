"""Game rules: distances, hints and scoring. Pure functions, no AWS calls."""

from __future__ import annotations

import math
import random
from collections import defaultdict
from collections.abc import Iterable

EARTH_RADIUS_M = 6_371_000

# A tree counts as "done" (green on the map) only when someone finds the
# other player's hidden tree. Hiding a tree or a wrong guess doesn't count.

# Points
SOLVE_POINTS = 10  # finding the other player's hidden tree…
WRONG_GUESS_PENALTY = 2  # …minus this per wrong guess
HINT_PENALTY = 3  # …minus this per hint
MIN_SOLVE_POINTS = 3
STUMPED_POINTS = 5  # for the hider when the other player gives up

HINT_TYPES = ("species", "zone", "tag")
ZONE_RADIUS_M = 40
CLOSE_ENOUGH_M = 8


def distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in metres (haversine)."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def warmth(meters: float) -> str:
    """A hot/cold word for a wrong guess."""
    if meters < CLOSE_ENOUGH_M:
        return "right next to it"
    if meters < 25:
        return "hot"
    if meters < 60:
        return "warm"
    if meters < 150:
        return "cool"
    return "cold"


def zone_hint(lat: float, lon: float, rng: random.Random | None = None) -> dict:
    """A circle that contains the tree, but not at its centre."""
    rng = rng or random.Random()
    offset = rng.uniform(0.25, 0.6) * ZONE_RADIUS_M
    bearing = rng.uniform(0, 2 * math.pi)
    dlat = offset * math.cos(bearing) / 111_320
    dlon = offset * math.sin(bearing) / (111_320 * math.cos(math.radians(lat)))
    return {"lat": round(lat + dlat, 7), "lon": round(lon + dlon, 7), "radius_m": ZONE_RADIUS_M}


def solve_points(wrong_guesses: int, hints: int) -> int:
    return max(MIN_SOLVE_POINTS, SOLVE_POINTS - WRONG_GUESS_PENALTY * wrong_guesses - HINT_PENALTY * hints)


def done_trees(challenges: Iterable[dict]) -> dict[str, list[str]]:
    """{tree id: players who found it as someone's hidden tree}"""
    done: dict[str, set[str]] = defaultdict(set)
    for c in challenges:
        if c.get("status") == "solved":
            done[c["tree_id"]].add(c["solved_by"])
    return {tree_id: sorted(who) for tree_id, who in done.items()}


def scoreboard(players: Iterable[str], finds: Iterable[dict], challenges: Iterable[dict]) -> list[dict]:
    """Points per player.

    finds:      photo items with at least `player` (hide, guess and solve photos)
    challenges: challenge items (creator, status, tree_id, guesses, hints, solved_by)
    """
    stats: dict[str, dict] = defaultdict(
        lambda: {
            "trees": set(),
            "photos": 0,
            "hidden": 0,
            "solved": 0,
            "stumped": 0,
            "gave_up": 0,
            "points": 0,
        }
    )
    for name in players:
        stats[name]  # noqa: B018 - make sure everyone shows up, even with no activity

    for f in finds:
        stats[f["player"]]["photos"] += 1

    for c in challenges:
        if c.get("status") == "cancelled":
            continue
        stats[c["creator"]]["hidden"] += 1
        if c.get("status") == "solved":
            solver = c["solved_by"]
            wrong = sum(1 for g in c.get("guesses", []) if not g.get("correct"))
            points = solve_points(wrong, len(c.get("hints", [])))
            stats[solver]["solved"] += 1
            stats[solver]["points"] += points
            stats[solver]["trees"].add(c["tree_id"])
        elif c.get("status") == "gave_up":
            stats[c["creator"]]["stumped"] += 1
            stats[c["creator"]]["points"] += STUMPED_POINTS
            if c.get("gave_up_by"):
                stats[c["gave_up_by"]]["gave_up"] += 1

    rows = []
    for name, s in stats.items():
        rows.append({**s, "player": name, "trees": len(s["trees"])})
    rows.sort(key=lambda r: (-r["points"], r["player"]))
    return rows
