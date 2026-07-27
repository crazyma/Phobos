"""Shared domain constants.

`SPORT_ID_TO_LEVEL` maps StatsAPI `sportId` to the curated `team_level` enum
(spec-03 §4). Verified against the `/sports` endpoint; kept as a constant so
every source module agrees on the mapping.
"""

from __future__ import annotations

# StatsAPI sportId → curated team_level enum value.
SPORT_ID_TO_LEVEL: dict[int, str] = {
    1: "mlb",
    11: "aaa",
    12: "aa",
    13: "a_plus",
    14: "a",
    16: "rookie",
}

LEVEL_TO_SPORT_ID: dict[str, int] = {v: k for k, v in SPORT_ID_TO_LEVEL.items()}

# Levels highest → lowest; also the order teams must be inserted so a minor-league
# affiliate's parent_org (an MLB team) already exists when its FK is checked.
LEVELS_TOP_DOWN: tuple[str, ...] = ("mlb", "aaa", "aa", "a_plus", "a", "rookie")

# All sportIds we ingest, MLB first (parents before affiliates).
INGEST_SPORT_IDS: tuple[int, ...] = (1, 11, 12, 13, 14, 16)


def level_for_sport_id(sport_id: int) -> str | None:
    """Return the curated level for a sportId, or None if unmapped."""
    return SPORT_ID_TO_LEVEL.get(sport_id)


def level_rank(level: str) -> int:
    """Sort key for a level (mlb=0 … rookie=5); unknown levels sort last."""
    try:
        return LEVELS_TOP_DOWN.index(level)
    except ValueError:
        return len(LEVELS_TOP_DOWN)
