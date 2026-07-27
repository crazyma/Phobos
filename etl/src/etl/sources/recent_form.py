"""Recent-form one-liner: game lines → `player_recent_form`.

Every batch recomputes, for each tracked player, a single ≤20-char Chinese
sentence describing their recent form (spec-03 §5). A pure rule engine tries
patterns in priority order and takes the first hit; the `status_fallback` always
hits, so the sentence is never empty:

  1. career_high / season_high — the last game set a new single-game high in a
     counting stat (since 2020; we call it 生涯 even though the baseline is 2020,
     accepting the drift per spec-01/§5).
  2. streak — a cross-level run (≥3 games with a hit; ≥3 scoreless outings).
  3. single_game — a notable last game (3+ hits, a homer, a quality start…).
  4. recent_agg — an aggregate over the last few games (AVG / ERA).
  5. status_fallback — no recent games: IL / offseason / idle.

Thresholds and templates live in the constants below; when a pattern is added
or a threshold changes, mirror it into spec-03 §5.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date
from typing import Any, Optional

import psycopg

from ..batch import Source

logger = logging.getLogger(__name__)

# ── Tunables (mirror spec-03 §5) ────────────────────────────────────────────────
MAX_LEN = 20                 # sentence truncation (§5)
HIT_STREAK_MIN = 3           # consecutive games with ≥1 hit
SCORELESS_STREAK_MIN = 3     # consecutive pitching outings with 0 ER
MULTI_HIT_MIN = 3            # "3+ hits" single-game highlight
BIG_RBI_MIN = 3
BIG_K_MIN = 7                # strikeouts in one outing
QS_OUTS = 18                 # quality start: ≥6 IP …
QS_MAX_ER = 3                # … and ≤3 ER
RECENT_WINDOW = 5            # last N games for aggregates
RECENT_MIN_AB = 5            # min at-bats before a recent AVG is meaningful
IDLE_DAYS = 14               # no game within this ⇒ fallback
OFFSEASON_MONTHS = frozenset({11, 12, 1, 2})
# Single-game newsworthiness floors for career/season high.
CAREER_HIGH_FLOOR = {"h": 3, "hr": 2, "rbi": 4, "so_pitch": 8}


# ── Inputs (a slice of the game_*_lines rows the engine needs) ───────────────────


@dataclass(frozen=True)
class BatLine:
    ab: int
    h: int
    hr: int
    rbi: int
    bb: int
    so: int
    sb: int


@dataclass(frozen=True)
class PitchLine:
    started: bool
    ip_outs: int
    h: int
    r: int
    er: int
    bb: int
    so: int


@dataclass(frozen=True)
class Appearance:
    game_date: str  # "YYYY-MM-DD" (game_date_us)
    season: int
    bat: Optional[BatLine] = None
    pitch: Optional[PitchLine] = None


@dataclass(frozen=True)
class StatusInfo:
    affiliation: Optional[str]
    health: Optional[str]  # "active" | "il" | None
    il_detail: Optional[str]


def _truncate(s: str) -> str:
    return s if len(s) <= MAX_LEN else s[:MAX_LEN]


def _md(game_date: str) -> str:
    """"2024-06-12" → "6/12" for compact display."""
    try:
        _, m, d = game_date.split("-")
        return f"{int(m)}/{int(d)}"
    except (ValueError, AttributeError):
        return game_date


def _batted(a: Appearance) -> bool:
    return a.bat is not None and (a.bat.ab > 0 or a.bat.h > 0 or a.bat.bb > 0)


def _pitched(a: Appearance) -> bool:
    return a.pitch is not None and (a.pitch.started or a.pitch.ip_outs > 0)


def _is_pitcher_lens(appearances: list[Appearance]) -> bool:
    """Pick the narrative lens from the most recent appearance's role."""
    last = appearances[-1]
    if _pitched(last) and not _batted(last):
        return True
    if _batted(last) and not _pitched(last):
        return False
    # two-way or ambiguous: prefer pitching if they started
    return bool(last.pitch and last.pitch.started)


# ── Pattern detectors (each returns (sentence, pattern) or None) ─────────────────


def _detect_high(appearances: list[Appearance], pitcher: bool):
    last = appearances[-1]
    prior = appearances[:-1]
    if pitcher:
        if not _pitched(last) or last.pitch is None:
            return None
        val = last.pitch.so
        if val < CAREER_HIGH_FLOOR["so_pitch"]:
            return None
        career_max = max((p.pitch.so for p in prior if p.pitch), default=-1)
        season_max = max(
            (p.pitch.so for p in prior if p.pitch and p.season == last.season),
            default=-1,
        )
        if val > career_max:
            return _truncate(f"上一場投出生涯最多 {val} 次三振"), "career_high"
        if val > season_max:
            return _truncate(f"上一場投出本季最多 {val} 次三振"), "season_high"
        return None

    if not _batted(last) or last.bat is None:
        return None
    # Check stats by descending "impressiveness".
    for key, label in (("hr", "轟"), ("rbi", "分打點"), ("h", "支安打")):
        val = getattr(last.bat, key)
        if val < CAREER_HIGH_FLOOR[key]:
            continue
        career_max = max((getattr(p.bat, key) for p in prior if p.bat), default=-1)
        season_max = max(
            (getattr(p.bat, key) for p in prior if p.bat and p.season == last.season),
            default=-1,
        )
        if val > career_max:
            return _truncate(f"上一場敲生涯最多 {val} {label}"), "career_high"
        if val > season_max:
            return _truncate(f"上一場敲本季最多 {val} {label}"), "season_high"
    return None


def _detect_streak(appearances: list[Appearance], pitcher: bool):
    if pitcher:
        n = 0
        for a in reversed(appearances):
            if not _pitched(a) or a.pitch is None:
                continue
            if a.pitch.er == 0:
                n += 1
            else:
                break
        if n >= SCORELESS_STREAK_MIN:
            return _truncate(f"連續 {n} 場無失分"), "streak"
        return None

    n = 0
    for a in reversed(appearances):
        if not _batted(a) or a.bat is None:
            continue
        if a.bat.h >= 1:
            n += 1
        else:
            break
    if n >= HIT_STREAK_MIN:
        return _truncate(f"連續 {n} 場有安打"), "streak"
    return None


def _detect_single_game(appearances: list[Appearance], pitcher: bool):
    last = appearances[-1]
    if pitcher and last.pitch is not None and _pitched(last):
        p = last.pitch
        if p.started and p.ip_outs >= QS_OUTS and p.er <= QS_MAX_ER:
            return _truncate("上一場優質先發"), "single_game"
        if p.so >= BIG_K_MIN:
            return _truncate(f"上一場飆 {p.so} K"), "single_game"
        return None

    if last.bat is not None and _batted(last):
        b = last.bat
        if b.hr >= 1:
            word = "開轟" if b.hr == 1 else f"敲 {b.hr} 轟"
            return _truncate(f"上一場{word}"), "single_game"
        if b.h >= MULTI_HIT_MIN:
            return _truncate(f"上一場 {b.h} 支安打"), "single_game"
        if b.rbi >= BIG_RBI_MIN:
            return _truncate(f"上一場 {b.rbi} 分打點"), "single_game"
    return None


def _detect_recent_agg(appearances: list[Appearance], pitcher: bool):
    if pitcher:
        recent = [a for a in appearances if _pitched(a) and a.pitch][-RECENT_WINDOW:]
        if len(recent) < 2:
            return None
        outs = sum(a.pitch.ip_outs for a in recent if a.pitch)
        er = sum(a.pitch.er for a in recent if a.pitch)
        if outs == 0:
            return None
        era = er * 27 / outs  # ER per 27 outs (9 IP)
        return _truncate(f"近 {len(recent)} 場防禦率 {era:.2f}"), "recent_agg"

    recent = [a for a in appearances if _batted(a) and a.bat][-RECENT_WINDOW:]
    if len(recent) < 2:
        return None
    ab = sum(a.bat.ab for a in recent if a.bat)
    h = sum(a.bat.h for a in recent if a.bat)
    if ab < RECENT_MIN_AB:
        return None
    avg = h / ab
    return _truncate(f"近 {len(recent)} 場打擊率 {_avg3(avg)}"), "recent_agg"


def _avg3(v: float) -> str:
    """.xxx baseball notation (drop leading zero)."""
    s = f"{v:.3f}"
    return s[1:] if s.startswith("0.") else s


def _status_fallback(status: StatusInfo, appearances: list[Appearance], today: date):
    if status.health == "il":
        if appearances:
            return _truncate(f"傷兵名單中，最後出賽 {_md(appearances[-1].game_date)}"), "status_fallback"
        return _truncate("傷兵名單中"), "status_fallback"
    if today.month in OFFSEASON_MONTHS:
        return "休賽期", "status_fallback"
    return "近兩週無出賽紀錄", "status_fallback"


def _has_recent_game(appearances: list[Appearance], today: date) -> bool:
    if not appearances:
        return False
    try:
        last = date.fromisoformat(appearances[-1].game_date)
    except (ValueError, TypeError):
        return False
    return (today - last).days <= IDLE_DAYS


def build_recent_form(
    appearances: list[Appearance],
    status: StatusInfo,
    today: Optional[date] = None,
) -> tuple[str, str]:
    """Return (sentence_zh, pattern) — never empty (spec-03 §5).

    `appearances` must be sorted ascending by game_date.
    """
    today = today or date.today()

    # No recent games → status drives the sentence, regardless of stale history.
    if not _has_recent_game(appearances, today):
        return _status_fallback(status, appearances, today)

    pitcher = _is_pitcher_lens(appearances)
    for detector in (_detect_high, _detect_streak, _detect_single_game, _detect_recent_agg):
        hit = detector(appearances, pitcher)
        if hit is not None:
            return hit
    # Played recently but nothing notable and too few for an aggregate.
    return _status_fallback(status, appearances, today)


# ── DB glue ─────────────────────────────────────────────────────────────────────


def _tracked_player_ids(conn: psycopg.Connection) -> list[int]:
    with conn.cursor() as cur:
        cur.execute(
            "select mlb_player_id from players where lifecycle = 'tracked' order by mlb_player_id"
        )
        return [int(r[0]) for r in cur.fetchall()]


def _load_appearances(
    conn: psycopg.Connection, player_ids: list[int]
) -> dict[int, list[Appearance]]:
    """Load each player's game lines (batting ∪ pitching), merged per game_pk and
    sorted ascending by game date."""
    # keyed by player_id → game_pk → {date, season, bat, pitch}
    merged: dict[int, dict[int, dict[str, Any]]] = {pid: {} for pid in player_ids}
    if not player_ids:
        return {pid: [] for pid in player_ids}

    with conn.cursor() as cur:
        cur.execute(
            """
            select b.player_id, b.game_pk, g.game_date_us,
                   b.ab, b.h, b.hr, b.rbi, b.bb, b.so, b.sb
            from game_batting_lines b join games g on g.game_pk = b.game_pk
            where b.player_id = any(%s)
            """,
            (player_ids,),
        )
        for r in cur.fetchall():
            pid, pk, gdate = int(r[0]), int(r[1]), r[2].isoformat()
            merged[pid].setdefault(pk, {"date": gdate})
            merged[pid][pk]["bat"] = BatLine(
                ab=r[3], h=r[4], hr=r[5], rbi=r[6], bb=r[7], so=r[8], sb=r[9]
            )
        cur.execute(
            """
            select p.player_id, p.game_pk, g.game_date_us,
                   p.started, p.ip_outs, p.h, p.r, p.er, p.bb, p.so
            from game_pitching_lines p join games g on g.game_pk = p.game_pk
            where p.player_id = any(%s)
            """,
            (player_ids,),
        )
        for r in cur.fetchall():
            pid, pk, gdate = int(r[0]), int(r[1]), r[2].isoformat()
            merged[pid].setdefault(pk, {"date": gdate})
            merged[pid][pk]["pitch"] = PitchLine(
                started=r[3], ip_outs=r[4], h=r[5], r=r[6], er=r[7], bb=r[8], so=r[9]
            )

    out: dict[int, list[Appearance]] = {}
    for pid, by_pk in merged.items():
        apps = [
            Appearance(
                game_date=v["date"],
                season=int(v["date"][:4]),
                bat=v.get("bat"),
                pitch=v.get("pitch"),
            )
            for v in by_pk.values()
        ]
        apps.sort(key=lambda a: a.game_date)
        out[pid] = apps
    return out


def _load_statuses(
    conn: psycopg.Connection, player_ids: list[int]
) -> dict[int, StatusInfo]:
    statuses: dict[int, StatusInfo] = {}
    if not player_ids:
        return statuses
    with conn.cursor() as cur:
        cur.execute(
            """
            select player_id, affiliation, health, il_detail
            from player_current_status where player_id = any(%s)
            """,
            (player_ids,),
        )
        for pid, aff, health, il in cur.fetchall():
            statuses[int(pid)] = StatusInfo(affiliation=aff, health=health, il_detail=il)
    return statuses


def upsert_recent_form(
    conn: psycopg.Connection, player_id: int, sentence: str, pattern: str
) -> None:
    """Upsert one player's recent-form line (PK = player_id). No commit."""
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into player_recent_form (player_id, sentence_zh, pattern, computed_at)
            values (%s, %s, %s, now())
            on conflict (player_id) do update set
                sentence_zh = excluded.sentence_zh,
                pattern = excluded.pattern,
                computed_at = now()
            """,
            (player_id, sentence, pattern),
        )


def recompute_all_tracked(conn: psycopg.Connection, today: Optional[date] = None) -> int:
    """Recompute recent-form for every tracked player. Returns rows written."""
    ids = _tracked_player_ids(conn)
    if not ids:
        return 0
    appearances = _load_appearances(conn, ids)
    statuses = _load_statuses(conn, ids)
    empty_status = StatusInfo(None, None, None)
    written = 0
    for pid in ids:
        sentence, pattern = build_recent_form(
            appearances.get(pid, []), statuses.get(pid, empty_status), today
        )
        upsert_recent_form(conn, pid, sentence, pattern)
        written += 1
    return written


def make_recent_form_source(_client, conn: psycopg.Connection) -> Source:
    """Batch-end recompute (spec-03 §5). Runs after projection so the
    status_fallback sees the freshly-projected status."""

    def run() -> None:
        recompute_all_tracked(conn)

    return Source("recent_form", run)
