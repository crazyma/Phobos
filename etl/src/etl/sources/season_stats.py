"""Season stats: StatsAPI season + sabermetrics → curated `season_*_stats`.

Grain is `(player_id, season, level, team_id)` (spec-01 C.7) — same season/level
split across two teams (mid-season trade) lands as two rows, not one aggregate.
Only counting stats are stored; ratios (AVG/OBP/SLG/ERA/WHIP/…) are derived by
`lib/services` at read time and never land here.

Source shape, confirmed 2026-07-27 against the live StatsAPI (no recorded
fixture existed yet for this endpoint, so the shape below is verified, not
guessed):

  `GET /people?personIds=<ids>&hydrate=stats(group=[hitting,pitching],
  type=[season,sabermetrics],season=<Y>,sportId=<N>)`

For each person, `stats` holds one block per (type, group). Each block's
`splits` has, when the player had more than one team that season/level, an
aggregate split with no `team` key followed by one split per team — we keep
only the per-team splits (that's our grain; the aggregate is a services-layer
concern, `不做跨層級合計`/`不做跨隊合計`). Single-team seasons skip the
aggregate row entirely and the one split already carries `team`.

`stats=sabermetrics` is confirmed MLB-only (sportId=1): querying any other
sportId returns a payload with no `sabermetrics` block at all (verified live
for sportId=11), never an error — so the advanced columns simply default to
None for minor-league levels with no special-casing required. `lob_pct` is
ETL-computed (not from StatsAPI) but is gated on the same "did sabermetrics
come back" signal, per the ticket's grouping of `fip`/`lob_pct`/`war` as one
minor-league-NULL advanced set (spec-03 §3 row, ticket 06 bullet 2).

`xwoba` (Savant/Statcast) is explicitly out of scope for this module — it is
left `None` on every insert and, importantly, is **not** included in the
`ON CONFLICT DO UPDATE SET` clause for `season_batting_stats`, so a future
Savant-backed source may set it without this source's re-pulls stomping it
back to NULL on the next run.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date
from typing import Any, Optional

import psycopg

from ..batch import Source
from ..constants import INGEST_SPORT_IDS, level_for_sport_id
from ..statsapi import StatsApiClient

logger = logging.getLogger(__name__)

# StatsAPI season stats are queryable back to 2020 (spec-01 A.3 / spec-03 §3).
START_SEASON = 2020


@dataclass(frozen=True)
class BattingStatRow:
    player_id: int
    season: int
    level: str
    team_id: int
    g: int
    pa: int
    ab: int
    h: int
    doubles: int
    triples: int
    hr: int
    rbi: int
    r: int
    sb: int
    cs: int
    bb: int
    so: int
    hbp: int
    sf: int
    woba: Optional[float] = None
    wrc_plus: Optional[float] = None
    war: Optional[float] = None


@dataclass(frozen=True)
class PitchingStatRow:
    player_id: int
    season: int
    level: str
    team_id: int
    g: int
    gs: int
    ip_outs: int
    bf: int
    h: int
    r: int
    er: int
    hr: int
    bb: int
    so: int
    w: int
    l: int
    sv: int
    hld: int
    fip: Optional[float] = None
    lob_pct: Optional[float] = None
    war: Optional[float] = None


def _int(value: Any, default: int = 0) -> int:
    return int(value) if value is not None else default


def _flt(value: Any) -> Optional[float]:
    return float(value) if value is not None else None


def _outs(stat: dict[str, Any]) -> int:
    """Prefer StatsAPI's own `outs` (already IP×3); fall back to parsing
    `inningsPitched` (a string like "104.1" where the fractional part is
    thirds-of-an-inning, not decimal)."""
    if stat.get("outs") is not None:
        return int(stat["outs"])
    ip = stat.get("inningsPitched")
    if ip is None:
        return 0
    whole, _, frac = str(ip).partition(".")
    thirds = int(frac) if frac else 0
    return _int(whole or 0) * 3 + thirds


def _lob_pct(stat: dict[str, Any]) -> Optional[float]:
    """Left-on-base % for pitchers: (H+BB+HBP-R) / (H+BB+HBP-1.4*HR).

    ETL self-computed (not a StatsAPI field); guards the small-sample division
    by zero some low-IP rows can hit.
    """
    h = _int(stat.get("hits"))
    bb = _int(stat.get("baseOnBalls"))
    hbp = _int(stat.get("hitBatsmen"))
    r = _int(stat.get("runs"))
    hr = _int(stat.get("homeRuns"))
    denom = h + bb + hbp - 1.4 * hr
    if denom == 0:
        return None
    return (h + bb + hbp - r) / denom


def _find_block(
    stats: list[dict[str, Any]], type_name: str, group_name: str
) -> Optional[dict[str, Any]]:
    for block in stats:
        if (
            (block.get("type") or {}).get("displayName") == type_name
            and (block.get("group") or {}).get("displayName") == group_name
        ):
            return block
    return None


def _index_saber_by_team(block: Optional[dict[str, Any]]) -> dict[int, dict[str, Any]]:
    if block is None:
        return {}
    out: dict[int, dict[str, Any]] = {}
    for split in block.get("splits", []):
        team = split.get("team")
        if not team or team.get("id") is None:
            continue
        out[int(team["id"])] = split.get("stat") or {}
    return out


def transform_season_batting(payload: dict[str, Any], *, level: str) -> list[BattingStatRow]:
    """Map a `people` hydrate payload to per-(season, team) batting rows.

    Skips the aggregate-across-teams split (no `team` key) and any split
    missing a resolvable season/team — `season_batting_stats`'s grain requires
    both. Advanced columns default to None when no `sabermetrics` block came
    back (minor-league levels; confirmed empty, not absent-with-error).
    """
    rows: list[BattingStatRow] = []
    for person in payload.get("people", []):
        pid = person.get("id")
        if pid is None:
            continue
        stats = person.get("stats") or []
        season_block = _find_block(stats, "season", "hitting")
        if season_block is None:
            continue
        saber_by_team = _index_saber_by_team(_find_block(stats, "sabermetrics", "hitting"))

        for split in season_block.get("splits", []):
            team = split.get("team")
            season = split.get("season")
            if not team or team.get("id") is None or season is None:
                continue
            team_id = int(team["id"])
            stat = split.get("stat") or {}
            saber = saber_by_team.get(team_id, {})
            rows.append(
                BattingStatRow(
                    player_id=int(pid),
                    season=int(season),
                    level=level,
                    team_id=team_id,
                    g=_int(stat.get("gamesPlayed")),
                    pa=_int(stat.get("plateAppearances")),
                    ab=_int(stat.get("atBats")),
                    h=_int(stat.get("hits")),
                    doubles=_int(stat.get("doubles")),
                    triples=_int(stat.get("triples")),
                    hr=_int(stat.get("homeRuns")),
                    rbi=_int(stat.get("rbi")),
                    r=_int(stat.get("runs")),
                    sb=_int(stat.get("stolenBases")),
                    cs=_int(stat.get("caughtStealing")),
                    bb=_int(stat.get("baseOnBalls")),
                    so=_int(stat.get("strikeOuts")),
                    hbp=_int(stat.get("hitByPitch")),
                    sf=_int(stat.get("sacFlies")),
                    woba=_flt(saber.get("woba")),
                    wrc_plus=_flt(saber.get("wRcPlus")),
                    war=_flt(saber.get("war")),
                )
            )
    return rows


def transform_season_pitching(payload: dict[str, Any], *, level: str) -> list[PitchingStatRow]:
    """Map a `people` hydrate payload to per-(season, team) pitching rows.

    Same aggregate-split skip as batting. `lob_pct` is only computed when a
    `sabermetrics` block came back for this (season, sportId) — i.e. MLB level
    — per the ticket's "小聯盟進階留 NULL" covering the whole advanced set.
    """
    rows: list[PitchingStatRow] = []
    for person in payload.get("people", []):
        pid = person.get("id")
        if pid is None:
            continue
        stats = person.get("stats") or []
        season_block = _find_block(stats, "season", "pitching")
        if season_block is None:
            continue
        saber_by_team = _index_saber_by_team(_find_block(stats, "sabermetrics", "pitching"))

        for split in season_block.get("splits", []):
            team = split.get("team")
            season = split.get("season")
            if not team or team.get("id") is None or season is None:
                continue
            team_id = int(team["id"])
            stat = split.get("stat") or {}
            saber = saber_by_team.get(team_id, {})
            rows.append(
                PitchingStatRow(
                    player_id=int(pid),
                    season=int(season),
                    level=level,
                    team_id=team_id,
                    g=_int(stat.get("gamesPlayed")),
                    gs=_int(stat.get("gamesStarted")),
                    ip_outs=_outs(stat),
                    bf=_int(stat.get("battersFaced")),
                    h=_int(stat.get("hits")),
                    r=_int(stat.get("runs")),
                    er=_int(stat.get("earnedRuns")),
                    hr=_int(stat.get("homeRuns")),
                    bb=_int(stat.get("baseOnBalls")),
                    so=_int(stat.get("strikeOuts")),
                    w=_int(stat.get("wins")),
                    l=_int(stat.get("losses")),
                    sv=_int(stat.get("saves")),
                    hld=_int(stat.get("holds")),
                    fip=_flt(saber.get("fip")),
                    # LOB% is ETL-computed from counting stats (incl. hitBatsmen,
                    # which is NOT a stored pitching column, so services can't
                    # re-derive it). Its inputs exist at every level, so compute
                    # it everywhere — unlike fip/war which only come from the
                    # MLB-only sabermetrics block (decision 2026-07-27).
                    lob_pct=_lob_pct(stat),
                    war=_flt(saber.get("war")),
                )
            )
    return rows


def upsert_season_batting(conn: psycopg.Connection, rows: list[BattingStatRow]) -> int:
    """Upsert `season_batting_stats` by its `(player_id, season, level, team_id)` PK.

    `xwoba` is deliberately absent from the UPDATE SET — this source never
    populates it, and must not clobber a value a future Savant source wrote.
    Does not commit.
    """
    count = 0
    with conn.cursor() as cur:
        for row in rows:
            cur.execute(
                """
                insert into season_batting_stats
                    (player_id, season, level, team_id,
                     g, pa, ab, h, doubles, triples, hr, rbi, r, sb, cs, bb, so, hbp, sf,
                     woba, xwoba, wrc_plus, war, source_updated_at)
                values (%s, %s, %s, %s,
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, now())
                on conflict (player_id, season, level, team_id) do update set
                    g = excluded.g,
                    pa = excluded.pa,
                    ab = excluded.ab,
                    h = excluded.h,
                    doubles = excluded.doubles,
                    triples = excluded.triples,
                    hr = excluded.hr,
                    rbi = excluded.rbi,
                    r = excluded.r,
                    sb = excluded.sb,
                    cs = excluded.cs,
                    bb = excluded.bb,
                    so = excluded.so,
                    hbp = excluded.hbp,
                    sf = excluded.sf,
                    woba = excluded.woba,
                    wrc_plus = excluded.wrc_plus,
                    war = excluded.war,
                    source_updated_at = excluded.source_updated_at
                """,
                (
                    row.player_id,
                    row.season,
                    row.level,
                    row.team_id,
                    row.g,
                    row.pa,
                    row.ab,
                    row.h,
                    row.doubles,
                    row.triples,
                    row.hr,
                    row.rbi,
                    row.r,
                    row.sb,
                    row.cs,
                    row.bb,
                    row.so,
                    row.hbp,
                    row.sf,
                    row.woba,
                    None,  # xwoba: never written here (Savant, out of scope)
                    row.wrc_plus,
                    row.war,
                ),
            )
            count += 1
    return count


def upsert_season_pitching(conn: psycopg.Connection, rows: list[PitchingStatRow]) -> int:
    """Upsert `season_pitching_stats` by its `(player_id, season, level, team_id)` PK.

    Does not commit.
    """
    count = 0
    with conn.cursor() as cur:
        for row in rows:
            cur.execute(
                """
                insert into season_pitching_stats
                    (player_id, season, level, team_id,
                     g, gs, ip_outs, bf, h, r, er, hr, bb, so, w, l, sv, hld,
                     fip, lob_pct, war, source_updated_at)
                values (%s, %s, %s, %s,
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, now())
                on conflict (player_id, season, level, team_id) do update set
                    g = excluded.g,
                    gs = excluded.gs,
                    ip_outs = excluded.ip_outs,
                    bf = excluded.bf,
                    h = excluded.h,
                    r = excluded.r,
                    er = excluded.er,
                    hr = excluded.hr,
                    bb = excluded.bb,
                    so = excluded.so,
                    w = excluded.w,
                    l = excluded.l,
                    sv = excluded.sv,
                    hld = excluded.hld,
                    fip = excluded.fip,
                    lob_pct = excluded.lob_pct,
                    war = excluded.war,
                    source_updated_at = excluded.source_updated_at
                """,
                (
                    row.player_id,
                    row.season,
                    row.level,
                    row.team_id,
                    row.g,
                    row.gs,
                    row.ip_outs,
                    row.bf,
                    row.h,
                    row.r,
                    row.er,
                    row.hr,
                    row.bb,
                    row.so,
                    row.w,
                    row.l,
                    row.sv,
                    row.hld,
                    row.fip,
                    row.lob_pct,
                    row.war,
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


def filter_known_teams(rows: list, known_team_ids: set[int]) -> tuple[list, set[int]]:
    """Drop rows whose `team_id` isn't a team we have (out-of-scope splits).

    Even when hydrated with a specific sportId, StatsAPI can return season
    splits on teams outside the ingested sportIds (winter/foreign leagues, e.g.
    team 5579). `team_id` is part of the NOT-NULL grain, so unlike transactions
    these rows can't be nulled — they're dropped (those leagues are out of the
    tracker's scope, spec-01). Returns (kept rows, dropped team ids).
    """
    kept = [r for r in rows if r.team_id in known_team_ids]
    dropped = {r.team_id for r in rows if r.team_id not in known_team_ids}
    return kept, dropped


def _season_range(*, start: int = START_SEASON, today: Optional[date] = None) -> list[int]:
    """Seasons `start`..current year inclusive (spec-01 A.3: data starts 2020)."""
    current = (today or date.today()).year
    return list(range(start, current + 1))


def _hydrate_param(season: int, sport_id: int) -> str:
    return (
        "stats(group=[hitting,pitching],type=[season,sabermetrics],"
        f"season={season},sportId={sport_id})"
    )


def make_season_stats_source(client: StatsApiClient, conn: psycopg.Connection) -> Source:
    """Full re-pull, `START_SEASON`→current, across every ingested sportId.

    One `people` hydrate call per (season, sportId) covers every tracked
    player's hitting + pitching, both season and sabermetrics types, in a
    single round trip — small player count is what makes the full re-pull
    affordable (spec-03 §3), not this batching, but this batching keeps the
    call count to `len(seasons) × len(sportIds)` rather than also scaling with
    player count.
    """

    def run() -> list[dict[str, Any]] | None:
        ids = _tracked_player_ids(conn)
        if not ids:
            return
        person_ids = ",".join(str(i) for i in ids)

        batting_rows: list[BattingStatRow] = []
        pitching_rows: list[PitchingStatRow] = []
        for season in _season_range():
            for sport_id in INGEST_SPORT_IDS:
                level = level_for_sport_id(sport_id)
                if level is None:
                    continue
                payload = client.get(
                    "people",
                    {
                        "personIds": person_ids,
                        "hydrate": _hydrate_param(season, sport_id),
                    },
                )
                batting_rows.extend(transform_season_batting(payload, level=level))
                pitching_rows.extend(transform_season_pitching(payload, level=level))

        known = _known_team_ids(conn)
        batting_rows, dropped_b = filter_known_teams(batting_rows, known)
        pitching_rows, dropped_p = filter_known_teams(pitching_rows, known)
        dropped = dropped_b | dropped_p
        if dropped:
            logger.warning(
                "season_stats: dropped rows for %d team(s) not in teams (outside "
                "ingested sportIds): %s",
                len(dropped),
                sorted(dropped),
            )
        warnings = (
            [{"kind": "team_rows_dropped", "team_ids": sorted(dropped)}]
            if dropped
            else []
        )

        upsert_season_batting(conn, batting_rows)
        upsert_season_pitching(conn, pitching_rows)
        return warnings or None

    return Source("season_stats", run)
