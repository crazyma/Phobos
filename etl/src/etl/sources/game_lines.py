"""Per-game box lines: StatsAPI boxscore → `game_batting_lines` /
`game_pitching_lines` (spec-01 C.6).

Role is decided by behaviour, not position: a player gets a batting row when
the boxscore shows them with a batting appearance that game, a pitching row
when it shows a pitching appearance — a two-way player can get both rows for
the same `game_pk` (spec-03 §04). Only tracked players are ingested (spec-03
§1), and lookback differs by batch (spec-03 §3): `morning` re-sweeps the last
`GAMELOG_LOOKBACK_DAYS` days (upstream box scores get corrected after the
fact, ADR §6.1), `evening` only sweeps yesterday..today (catching box scores
that finished after the morning run, e.g. late west-coast games).

Minor-league boxscores can omit stat keys entirely. Every counting column in
`game_batting_lines`/`game_pitching_lines` is `NOT NULL DEFAULT 0` (a fixed
Drizzle contract — see games.ts), so "missing → best-effort NULL" per spec-03
§04 is implemented as "missing key → 0", the only value that satisfies the
column. `team_id` is the one nullable column here and is set to None when the
boxscore's team side can't be resolved.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any, Iterable, Optional

import psycopg

from ..batch import Source
from ..config import GAMELOG_LOOKBACK_DAYS
from ..statsapi import StatsApiClient


@dataclass(frozen=True)
class BattingLineRow:
    player_id: int
    game_pk: int
    team_id: Optional[int]
    level: str
    pa: int
    ab: int
    h: int
    doubles: int
    triples: int
    hr: int
    rbi: int
    r: int
    bb: int
    so: int
    sb: int


@dataclass(frozen=True)
class PitchingLineRow:
    player_id: int
    game_pk: int
    team_id: Optional[int]
    level: str
    started: bool
    ip_outs: int
    h: int
    r: int
    er: int
    bb: int
    so: int
    hr: int


def _int(value: Any) -> int:
    """Best-effort int: missing/unparseable → 0 (see module docstring)."""
    if value is None:
        return 0
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _played(stats_node: dict[str, Any]) -> bool:
    """A stat category counts as "played" this game when gamesPlayed >= 1.

    Minor-league (and some MLB) boxscores include a zeroed-out stats object
    for categories a player didn't participate in — this is how a two-way
    player's batting-only or pitching-only appearances are told apart from a
    real dual appearance.
    """
    return _int(stats_node.get("gamesPlayed")) > 0


def _ip_outs(pitching: dict[str, Any]) -> int:
    """Outs recorded, preferring the `outs` field over parsing `inningsPitched`.

    `inningsPitched` is a string like "6.1" where the fractional part is
    thirds-of-an-inning (0/1/2), not decimal tenths.
    """
    outs = pitching.get("outs")
    if outs is not None:
        return _int(outs)
    ip = pitching.get("inningsPitched")
    if not ip:
        return 0
    whole_str, _, frac_str = str(ip).partition(".")
    try:
        whole = int(whole_str or 0)
        frac = int(frac_str or 0)
    except ValueError:
        return 0
    return whole * 3 + frac


def transform_boxscore(
    payload: dict[str, Any],
    *,
    game_pk: int,
    level: str,
    tracked_ids: Iterable[int],
) -> tuple[list[BattingLineRow], list[PitchingLineRow]]:
    """Map a StatsAPI `/game/{gamePk}/boxscore` payload to line rows.

    Only players in `tracked_ids` are emitted. A player can appear in both
    returned lists (two-way behaviour) or neither (didn't play, e.g. a
    healthy scratch still listed on the roster).
    """
    tracked = set(int(pid) for pid in tracked_ids)
    batting_rows: list[BattingLineRow] = []
    pitching_rows: list[PitchingLineRow] = []

    teams_node = payload.get("teams") or {}
    for side_key in ("home", "away"):
        side = teams_node.get(side_key) or {}
        team_id = (side.get("team") or {}).get("id")
        team_id = int(team_id) if team_id is not None else None

        players = side.get("players") or {}
        for pdata in players.values():
            person = pdata.get("person") or {}
            pid = person.get("id")
            if pid is None or int(pid) not in tracked:
                continue
            pid = int(pid)

            stats = pdata.get("stats") or {}
            batting = stats.get("batting") or {}
            pitching = stats.get("pitching") or {}

            if _played(batting):
                batting_rows.append(
                    BattingLineRow(
                        player_id=pid,
                        game_pk=game_pk,
                        team_id=team_id,
                        level=level,
                        pa=_int(batting.get("plateAppearances")),
                        ab=_int(batting.get("atBats")),
                        h=_int(batting.get("hits")),
                        doubles=_int(batting.get("doubles")),
                        triples=_int(batting.get("triples")),
                        hr=_int(batting.get("homeRuns")),
                        rbi=_int(batting.get("rbi")),
                        r=_int(batting.get("runs")),
                        bb=_int(batting.get("baseOnBalls")),
                        so=_int(batting.get("strikeOuts")),
                        sb=_int(batting.get("stolenBases")),
                    )
                )
            if _played(pitching):
                pitching_rows.append(
                    PitchingLineRow(
                        player_id=pid,
                        game_pk=game_pk,
                        team_id=team_id,
                        level=level,
                        started=_int(pitching.get("gamesStarted")) > 0,
                        ip_outs=_ip_outs(pitching),
                        h=_int(pitching.get("hits")),
                        r=_int(pitching.get("runs")),
                        er=_int(pitching.get("earnedRuns")),
                        bb=_int(pitching.get("baseOnBalls")),
                        so=_int(pitching.get("strikeOuts")),
                        hr=_int(pitching.get("homeRuns")),
                    )
                )

    return batting_rows, pitching_rows


def upsert_batting_lines(conn: psycopg.Connection, rows: list[BattingLineRow]) -> int:
    """Upsert by `(player_id, game_pk)`. Does not commit."""
    count = 0
    with conn.cursor() as cur:
        for row in rows:
            cur.execute(
                """
                insert into game_batting_lines
                    (player_id, game_pk, team_id, level, pa, ab, h, doubles,
                     triples, hr, rbi, r, bb, so, sb)
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                on conflict (player_id, game_pk) do update set
                    team_id = excluded.team_id,
                    level = excluded.level,
                    pa = excluded.pa,
                    ab = excluded.ab,
                    h = excluded.h,
                    doubles = excluded.doubles,
                    triples = excluded.triples,
                    hr = excluded.hr,
                    rbi = excluded.rbi,
                    r = excluded.r,
                    bb = excluded.bb,
                    so = excluded.so,
                    sb = excluded.sb
                """,
                (
                    row.player_id,
                    row.game_pk,
                    row.team_id,
                    row.level,
                    row.pa,
                    row.ab,
                    row.h,
                    row.doubles,
                    row.triples,
                    row.hr,
                    row.rbi,
                    row.r,
                    row.bb,
                    row.so,
                    row.sb,
                ),
            )
            count += 1
    return count


def upsert_pitching_lines(conn: psycopg.Connection, rows: list[PitchingLineRow]) -> int:
    """Upsert by `(player_id, game_pk)`. Does not commit."""
    count = 0
    with conn.cursor() as cur:
        for row in rows:
            cur.execute(
                """
                insert into game_pitching_lines
                    (player_id, game_pk, team_id, level, started, ip_outs,
                     h, r, er, bb, so, hr)
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                on conflict (player_id, game_pk) do update set
                    team_id = excluded.team_id,
                    level = excluded.level,
                    started = excluded.started,
                    ip_outs = excluded.ip_outs,
                    h = excluded.h,
                    r = excluded.r,
                    er = excluded.er,
                    bb = excluded.bb,
                    so = excluded.so,
                    hr = excluded.hr
                """,
                (
                    row.player_id,
                    row.game_pk,
                    row.team_id,
                    row.level,
                    row.started,
                    row.ip_outs,
                    row.h,
                    row.r,
                    row.er,
                    row.bb,
                    row.so,
                    row.hr,
                ),
            )
            count += 1
    return count


def _tracked_player_ids(conn: psycopg.Connection) -> list[int]:
    with conn.cursor() as cur:
        cur.execute(
            "select mlb_player_id from players where lifecycle = 'tracked' order by mlb_player_id"
        )
        return [int(r[0]) for r in cur.fetchall()]


def _games_in_window(
    conn: psycopg.Connection, start: date, end: date
) -> list[tuple[int, str]]:
    with conn.cursor() as cur:
        cur.execute(
            """
            select game_pk, level from games
            where game_date_us between %s and %s
            order by game_pk
            """,
            (start, end),
        )
        return [(int(r[0]), str(r[1])) for r in cur.fetchall()]


def _sweep_window(kind: str, today: date) -> tuple[date, date]:
    if kind == "morning":
        return today - timedelta(days=GAMELOG_LOOKBACK_DAYS), today - timedelta(days=1)
    # evening (and manual, best-effort default): catch yesterday's stragglers
    # plus anything that finished today.
    return today - timedelta(days=1), today


def make_game_lines_source(
    client: StatsApiClient, conn: psycopg.Connection, *, kind: str
) -> Source:
    def run() -> None:
        tracked = _tracked_player_ids(conn)
        if not tracked:
            return

        start, end = _sweep_window(kind, datetime.now(timezone.utc).date())
        batting_all: list[BattingLineRow] = []
        pitching_all: list[PitchingLineRow] = []
        for game_pk, level in _games_in_window(conn, start, end):
            payload = client.get(f"game/{game_pk}/boxscore")
            batting, pitching = transform_boxscore(
                payload, game_pk=game_pk, level=level, tracked_ids=tracked
            )
            batting_all.extend(batting)
            pitching_all.extend(pitching)

        upsert_batting_lines(conn, batting_all)
        upsert_pitching_lines(conn, pitching_all)

    return Source(f"game_lines_{kind}", run)
