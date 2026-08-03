"""Per-game box lines from each tracked player's own **gameLog**.

Player-centric by design (spec-03 §3, 2026-07-27): instead of sweeping every
game's full boxscore and fishing out the handful of tracked players (~1.6% hit
rate, and it mistook probable-pitcher listings for appearances), we pull each
tracked player's `people/{id}/stats?stats=gameLog` — only their own games, ~100%
useful. Full boxscores are no longer fetched or stored in the raw layer.

`gameLog` must be queried per level sportId (1/11/12/13/14/16): passing a sportId
returns only that level's games, omitting it returns only MLB — and a player's
level isn't knowable up front (e.g. a AAA-status player who actually threw all
his games in MLB). So we sweep every sportId per player.

Each gameLog split is one game the player actually appeared in, carrying the
game context (gamePk, date, team, opponent, isHome, sport) plus the stat line.
The line tables retain that context themselves; ``games`` is deliberately not
upserted here because it is only the short-lived forward schedule. Role is by
group: the hitting block yields batting rows, the pitching block pitching rows;
a two-way player gets both for the same `game_pk`. Only `lifecycle='tracked'`
players are ingested.

Minor-league gameLogs can omit stat keys; every counting column in the line
tables is `NOT NULL DEFAULT 0` (a fixed Drizzle contract), so "missing → 0".
`team_id` and `opponent_team_id` are nulled when they point outside the ingested
teams.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import date
from typing import Any, Optional

import psycopg

from ..batch import Source
from ..constants import INGEST_SPORT_IDS, level_for_sport_id
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
    game_date_us: str = ""
    opponent_team_id: Optional[int] = None
    is_home: Optional[bool] = None


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
    game_date_us: str = ""
    opponent_team_id: Optional[int] = None
    is_home: Optional[bool] = None


def _int(value: Any) -> int:
    """Best-effort int: missing/unparseable → 0 (see module docstring)."""
    if value is None:
        return 0
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


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


def transform_gamelog(
    payload: dict[str, Any], *, player_id: int, default_level: str
) -> tuple[list[BattingLineRow], list[PitchingLineRow]]:
    """Map a `people/{id}/stats?stats=gameLog` payload (hitting+pitching groups)
    to batting and pitching rows.

    Each split is a real appearance, so no zero-filtering is needed. Level comes
    from the split's own `sport.id` (falling back to the queried level). Game
    context is written alongside each line (both groups can see the same game).
    """
    batting: list[BattingLineRow] = []
    pitching: list[PitchingLineRow] = []

    for block in payload.get("stats") or []:
        group = (block.get("group") or {}).get("displayName")
        for split in block.get("splits") or []:
            game = split.get("game") or {}
            game_pk = game.get("gamePk")
            game_date = split.get("date")
            if game_pk is None or not game_date:
                continue
            game_pk = int(game_pk)

            sport_id = (split.get("sport") or {}).get("id")
            level = level_for_sport_id(sport_id) if sport_id is not None else None
            level = level or default_level
            if level is None:
                continue

            team_id = (split.get("team") or {}).get("id")
            team_id = int(team_id) if team_id is not None else None
            opp_id = (split.get("opponent") or {}).get("id")
            opp_id = int(opp_id) if opp_id is not None else None
            is_home = split.get("isHome")
            is_home = bool(is_home) if is_home is not None else None

            stat = split.get("stat") or {}
            if group == "hitting":
                batting.append(
                    BattingLineRow(
                        player_id=player_id,
                        game_pk=game_pk,
                        team_id=team_id,
                        level=level,
                        pa=_int(stat.get("plateAppearances")),
                        ab=_int(stat.get("atBats")),
                        h=_int(stat.get("hits")),
                        doubles=_int(stat.get("doubles")),
                        triples=_int(stat.get("triples")),
                        hr=_int(stat.get("homeRuns")),
                        rbi=_int(stat.get("rbi")),
                        r=_int(stat.get("runs")),
                        bb=_int(stat.get("baseOnBalls")),
                        so=_int(stat.get("strikeOuts")),
                        sb=_int(stat.get("stolenBases")),
                        game_date_us=str(game_date),
                        opponent_team_id=opp_id,
                        is_home=is_home,
                    )
                )
            elif group == "pitching":
                pitching.append(
                    PitchingLineRow(
                        player_id=player_id,
                        game_pk=game_pk,
                        team_id=team_id,
                        level=level,
                        started=_int(stat.get("gamesStarted")) > 0,
                        ip_outs=_ip_outs(stat),
                        h=_int(stat.get("hits")),
                        r=_int(stat.get("runs")),
                        er=_int(stat.get("earnedRuns")),
                        bb=_int(stat.get("baseOnBalls")),
                        so=_int(stat.get("strikeOuts")),
                        hr=_int(stat.get("homeRuns")),
                        game_date_us=str(game_date),
                        opponent_team_id=opp_id,
                        is_home=is_home,
                    )
                )

    return batting, pitching


def upsert_batting_lines(conn: psycopg.Connection, rows: list[BattingLineRow]) -> int:
    """Upsert by `(player_id, game_pk)`. Does not commit."""
    count = 0
    with conn.cursor() as cur:
        for row in rows:
            cur.execute(
                """
                insert into game_batting_lines
                    (player_id, game_pk, team_id, game_date_us, opponent_team_id, is_home,
                     level, pa, ab, h, doubles,
                     triples, hr, rbi, r, bb, so, sb)
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                on conflict (player_id, game_pk) do update set
                    team_id = excluded.team_id,
                    game_date_us = excluded.game_date_us,
                    opponent_team_id = excluded.opponent_team_id,
                    is_home = excluded.is_home,
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
                    row.game_date_us,
                    row.opponent_team_id,
                    row.is_home,
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
                    (player_id, game_pk, team_id, game_date_us, opponent_team_id, is_home,
                     level, started, ip_outs,
                     h, r, er, bb, so, hr)
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                on conflict (player_id, game_pk) do update set
                    team_id = excluded.team_id,
                    game_date_us = excluded.game_date_us,
                    opponent_team_id = excluded.opponent_team_id,
                    is_home = excluded.is_home,
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
                    row.game_date_us,
                    row.opponent_team_id,
                    row.is_home,
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


def _known_team_ids(conn: psycopg.Connection) -> set[int]:
    with conn.cursor() as cur:
        cur.execute("select mlb_team_id from teams")
        return {int(r[0]) for r in cur.fetchall()}


def _sanitize_line(row, known: set[int]):
    team_id = row.team_id if row.team_id in known else None
    opponent_team_id = row.opponent_team_id if row.opponent_team_id in known else None
    if team_id == row.team_id and opponent_team_id == row.opponent_team_id:
        return row
    return replace(row, team_id=team_id, opponent_team_id=opponent_team_id)


def current_season(today: Optional[date] = None) -> int:
    return (today or date.today()).year


def ingest_player_gamelogs(
    client: StatsApiClient,
    conn: psycopg.Connection,
    player_ids: list[int],
    seasons: list[int],
) -> tuple[int, int]:
    """Fetch each (player, season, sportId) gameLog → upsert self-contained lines.

    Team refs outside the ingested teams are nulled (best-effort, spec-03 §7).
    Returns (batting, pitching) row counts. Does not commit.
    """
    if not player_ids:
        return (0, 0)
    known = _known_team_ids(conn)
    batting_all: list[BattingLineRow] = []
    pitching_all: list[PitchingLineRow] = []

    for pid in player_ids:
        for season in seasons:
            for sport_id in INGEST_SPORT_IDS:
                level = level_for_sport_id(sport_id)
                if level is None:
                    continue
                payload = client.get(
                    f"people/{pid}/stats",
                    {
                        "stats": "gameLog",
                        "group": "hitting,pitching",
                        "season": season,
                        "sportId": sport_id,
                    },
                )
                b, p = transform_gamelog(payload, player_id=pid, default_level=level)
                batting_all.extend(b)
                pitching_all.extend(p)

    batting_all = [_sanitize_line(r, known) for r in batting_all]
    pitching_all = [_sanitize_line(r, known) for r in pitching_all]

    return (
        upsert_batting_lines(conn, batting_all),
        upsert_pitching_lines(conn, pitching_all),
    )


def make_game_lines_source(
    client: StatsApiClient, conn: psycopg.Connection, *, kind: str
) -> Source:
    """Batch box-line ingest: the current season's gameLog for every tracked
    player (idempotent; evening re-runs catch games that finished after morning).
    Historical seasons are backfilled once via the `etl backfill` CLI."""

    def run() -> None:
        tracked = _tracked_player_ids(conn)
        if not tracked:
            return
        ingest_player_gamelogs(client, conn, tracked, [current_season()])

    return Source(f"game_lines_{kind}", run)
