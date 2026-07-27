"""Schedule/results: StatsAPI `schedule` → curated `games` (spec-01 C.5).

Fetches a small rolling window (yesterday..today, in each ingest sportId) with
`hydrate=probablePitcher` and upserts by `game_pk` (StatsAPI's PK, which
naturally disambiguates doubleheaders). Run in both batches (spec-03 §3): the
morning run settles yesterday's results, the evening run settles residual
west-coast finals and refreshes today's probable-pitcher preview. `game_date_us`
is anchored on StatsAPI's own `officialDate`, not on our local clock — the
window below only decides *which* dates to ask for, never what gets stored.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, replace
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

import psycopg

from ..batch import Source
from ..config import GAMELOG_LOOKBACK_DAYS
from ..constants import INGEST_SPORT_IDS, level_for_sport_id
from ..statsapi import StatsApiClient

logger = logging.getLogger(__name__)

# StatsAPI detailedState/abstractGameState → curated `game_status` enum.
# detailedState is checked first (more granular: postponed/suspended/cancelled
# can all show up under an otherwise ambiguous abstractGameState); anything
# left over falls back on abstractGameState, and anything still unmapped
# (e.g. "Scheduled", "Pre-Game", "Warmup") defaults to `scheduled`.
_DETAILED_OVERRIDES = {
    "postponed": "postponed",
    "suspended": "suspended",
    "cancelled": "cancelled",
    "canceled": "cancelled",
}


def _map_status(status_node: Any) -> str:
    node = status_node or {}
    detailed = str(node.get("detailedState") or "").lower()
    for needle, mapped in _DETAILED_OVERRIDES.items():
        if needle in detailed:
            return mapped
    abstract = node.get("abstractGameState")
    if abstract == "Final":
        return "final"
    if abstract == "Live":
        return "live"
    return "scheduled"


def _parse_utc(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


@dataclass(frozen=True)
class GameRow:
    game_pk: int
    level: str
    game_date_us: str
    start_time_utc: Optional[datetime]
    home_team_id: Optional[int]
    away_team_id: Optional[int]
    venue_name: Optional[str]
    status: str
    home_score: Optional[int]
    away_score: Optional[int]
    game_number: Optional[int]
    games_in_series: Optional[int]
    series_game_number: Optional[int]
    probable_home_pitcher_id: Optional[int]
    probable_away_pitcher_id: Optional[int]


def _team_id(side: dict[str, Any]) -> Optional[int]:
    team_id = (side.get("team") or {}).get("id")
    return int(team_id) if team_id is not None else None


def _probable_pitcher_id(side: dict[str, Any]) -> Optional[int]:
    pid = (side.get("probablePitcher") or {}).get("id")
    return int(pid) if pid is not None else None


def transform_schedule(payload: dict[str, Any], *, default_level: str) -> list[GameRow]:
    """Map a StatsAPI `/schedule` payload to `GameRow`s.

    Level prefers the game's own `sport.id` (defensive — schedule payloads are
    usually queried one sportId at a time, but don't always echo it back the
    same way), else `default_level` (the sportId we queried). Games missing a
    `gamePk` or an `officialDate` (our `game_date_us` anchor) are skipped.
    """
    rows: list[GameRow] = []
    for day in payload.get("dates", []):
        for game in day.get("games", []):
            game_pk = game.get("gamePk")
            game_date_us = game.get("officialDate")
            if game_pk is None or not game_date_us:
                continue

            sport_id = (game.get("sport") or {}).get("id")
            level = level_for_sport_id(sport_id) if sport_id is not None else None
            level = level or default_level

            teams = game.get("teams") or {}
            home = teams.get("home") or {}
            away = teams.get("away") or {}

            rows.append(
                GameRow(
                    game_pk=int(game_pk),
                    level=level,
                    game_date_us=str(game_date_us),
                    start_time_utc=_parse_utc(game.get("gameDate")),
                    home_team_id=_team_id(home),
                    away_team_id=_team_id(away),
                    venue_name=(game.get("venue") or {}).get("name"),
                    status=_map_status(game.get("status")),
                    home_score=home.get("score"),
                    away_score=away.get("score"),
                    game_number=game.get("gameNumber"),
                    games_in_series=game.get("gamesInSeries"),
                    series_game_number=game.get("seriesGameNumber"),
                    probable_home_pitcher_id=_probable_pitcher_id(home),
                    probable_away_pitcher_id=_probable_pitcher_id(away),
                )
            )
    return rows


def sanitize_team_refs(
    rows: list[GameRow], known_team_ids: set[int]
) -> tuple[list[GameRow], set[int]]:
    """Null home/away team refs pointing at teams we don't have.

    Schedules include the odd exhibition / spring / foreign opponent outside the
    ingested sportIds (e.g. team 2190); their FK would abort the whole source.
    Both game team columns are nullable, so we keep the game and drop only the
    unresolvable pointer (best-effort, spec-03 §7). Returns (rows, dropped ids).
    """
    dropped: set[int] = set()
    cleaned: list[GameRow] = []
    for r in rows:
        home = r.home_team_id if r.home_team_id in known_team_ids else None
        away = r.away_team_id if r.away_team_id in known_team_ids else None
        if r.home_team_id is not None and home is None:
            dropped.add(r.home_team_id)
        if r.away_team_id is not None and away is None:
            dropped.add(r.away_team_id)
        if home == r.home_team_id and away == r.away_team_id:
            cleaned.append(r)
        else:
            cleaned.append(replace(r, home_team_id=home, away_team_id=away))
    return cleaned, dropped


def _known_team_ids(conn: psycopg.Connection) -> set[int]:
    with conn.cursor() as cur:
        cur.execute("select mlb_team_id from teams")
        return {int(r[0]) for r in cur.fetchall()}


def upsert_games(conn: psycopg.Connection, rows: list[GameRow]) -> int:
    """Upsert games by `game_pk`. Does not commit."""
    count = 0
    with conn.cursor() as cur:
        for row in rows:
            cur.execute(
                """
                insert into games
                    (game_pk, level, game_date_us, start_time_utc,
                     home_team_id, away_team_id, venue_name, status,
                     home_score, away_score, game_number, games_in_series,
                     series_game_number, probable_home_pitcher_id,
                     probable_away_pitcher_id)
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                on conflict (game_pk) do update set
                    level = excluded.level,
                    game_date_us = excluded.game_date_us,
                    start_time_utc = excluded.start_time_utc,
                    home_team_id = excluded.home_team_id,
                    away_team_id = excluded.away_team_id,
                    venue_name = excluded.venue_name,
                    status = excluded.status,
                    home_score = excluded.home_score,
                    away_score = excluded.away_score,
                    game_number = excluded.game_number,
                    games_in_series = excluded.games_in_series,
                    series_game_number = excluded.series_game_number,
                    probable_home_pitcher_id = excluded.probable_home_pitcher_id,
                    probable_away_pitcher_id = excluded.probable_away_pitcher_id
                """,
                (
                    row.game_pk,
                    row.level,
                    row.game_date_us,
                    row.start_time_utc,
                    row.home_team_id,
                    row.away_team_id,
                    row.venue_name,
                    row.status,
                    row.home_score,
                    row.away_score,
                    row.game_number,
                    row.games_in_series,
                    row.series_game_number,
                    row.probable_home_pitcher_id,
                    row.probable_away_pitcher_id,
                ),
            )
            count += 1
    return count


def _schedule_window(today: date, kind: str) -> tuple[date, date]:
    """Schedule window per batch, ending today (so probable pitchers preview).

    `morning` spans the same `GAMELOG_LOOKBACK_DAYS` lookback as the box-line
    sweep, so those games exist in the `games` table for game_lines to settle
    (they read game_pks from it); `evening` only needs yesterday..today.
    """
    if kind == "morning":
        return today - timedelta(days=GAMELOG_LOOKBACK_DAYS), today
    return today - timedelta(days=1), today


def ingest_schedule(
    client: StatsApiClient, conn: psycopg.Connection, start: date, end: date
) -> int:
    """Fetch + upsert every sportId's schedule for [start, end]. Returns rows
    upserted. Reused by the batch source and the `resync --gamelog` CLI."""
    all_rows: list[GameRow] = []
    for sport_id in INGEST_SPORT_IDS:
        level = level_for_sport_id(sport_id)
        if level is None:
            continue
        payload = client.get(
            "schedule",
            {
                "sportId": sport_id,
                "startDate": start.isoformat(),
                "endDate": end.isoformat(),
                "hydrate": "probablePitcher",
            },
        )
        all_rows.extend(transform_schedule(payload, default_level=level))
    cleaned, dropped = sanitize_team_refs(all_rows, _known_team_ids(conn))
    if dropped:
        logger.warning(
            "games: nulled %d team ref(s) not in teams (exhibition/out-of-scope "
            "opponents): %s",
            len(dropped),
            sorted(dropped),
        )
    return upsert_games(conn, cleaned)


def make_games_source(
    client: StatsApiClient, conn: psycopg.Connection, *, kind: str = "evening"
) -> Source:
    def run() -> None:
        start, end = _schedule_window(datetime.now(timezone.utc).date(), kind)
        ingest_schedule(client, conn, start, end)

    return Source("games", run)
