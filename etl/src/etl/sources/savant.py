"""Baseball Savant expected-statistics CSV → ``season_batting_stats.xwoba``.

Savant's official ``csv=true`` export is one row per player-season, whereas
our curated table is per player-season-team.  We therefore write only when an
MLB player-season has exactly one curated team row **with plate appearances**;
traded seasons stay NULL rather than placing a season aggregate beside
team-specific stats.

Two refinements over the first cut, both driven by real data (2026-08-03):

* ``pa = 0`` rows don't count as ambiguity.  A one-game call-up that never
  batted (Fairchild 2026 team 136: ``g=1, pa=0``) creates a second MLB row for
  the season, but Savant's single number provably belongs to the only row that
  has PA.  Trades, call-ups and pinch-run/defense appearances make this shape
  common, so treating it as ambiguous would silently drop whole seasons.
* Seasons are fetched on demand, not all seven every morning — see
  :func:`seasons_to_fetch`.
"""

from __future__ import annotations

import csv
import http.client
import io
import logging
import time
from datetime import date
from typing import Any, Callable, Optional, Sequence
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import psycopg

from ..batch import Source
from ..config import MAX_RETRIES, REQUEST_DELAY_SECONDS
from ..raw import store_raw_payload
from .season_stats import START_SEASON, _season_range, _tracked_player_ids

logger = logging.getLogger(__name__)

SAVANT_ENDPOINT = "leaderboard/expected_statistics"
SAVANT_BASE_URL = "https://baseballsavant.mlb.com"

SavantRow = dict[str, int | float | None]
CsvFetcher = Callable[[int], str]

# Network/protocol failures worth retrying.  Deliberately *not* bare
# ``Exception``: a TypeError in our own code must surface immediately instead of
# being retried three times and re-labelled as an upstream outage.
# ``URLError``/``HTTPError``/``TimeoutError``/``ssl.SSLError`` are all OSError
# subclasses; ``HTTPException`` covers protocol-level breakage (IncompleteRead…).
TRANSIENT_ERRORS = (OSError, http.client.HTTPException)


class SavantError(RuntimeError):
    """Raised after the official CSV export could not be fetched."""


def _params(season: int) -> dict[str, str | int]:
    return {
        "type": "batter",
        "year": season,
        "position": "",
        "team": "",
        "filterType": "bip",
        "min": 1,
        "csv": "true",
    }


def fetch_expected_statistics(
    season: int,
    *,
    opener: Callable[..., object] = urlopen,
    sleep: Callable[[float], None] = time.sleep,
    delay: float = REQUEST_DELAY_SECONDS,
    max_retries: int = MAX_RETRIES,
    timeout: float = 30.0,
) -> str:
    """Fetch one official Savant CSV export with the ETL's retry discipline."""
    query = urlencode(_params(season))
    request = Request(
        f"{SAVANT_BASE_URL}/{SAVANT_ENDPOINT}?{query}",
        # Savant serves its public CSV export to ordinary browsers but rejects
        # urllib's bare default user agent with 403.
        headers={"Accept": "text/csv", "User-Agent": "Mozilla/5.0 (Phobos ETL)"},
    )
    attempts = max_retries + 1
    last_exc: Optional[BaseException] = None
    for _attempt in range(attempts):
        sleep(delay)
        try:
            response = opener(request, timeout=timeout)
            with response:  # type: ignore[union-attr]
                return response.read().decode("utf-8-sig")  # type: ignore[union-attr]
        except TRANSIENT_ERRORS as exc:
            last_exc = exc
    # The root cause has to travel *in the message*: `batch.py` records only
    # `repr(exc)` into `sync_runs.detail`, so a bare "failed after N attempts"
    # leaves no way to tell a timeout from a 403 or a DNS failure after the fact.
    raise SavantError(
        f"Savant CSV for {season} failed after {attempts} attempts: {last_exc!r}"
    ) from last_exc


def _csv_rows(csv_text: str) -> list[dict[str, str]]:
    return list(csv.DictReader(io.StringIO(csv_text.lstrip('\ufeff'))))


def _row_player_id(row: dict[str, str]) -> Optional[int]:
    try:
        return int(row["player_id"])
    except (KeyError, TypeError, ValueError):
        return None


def tracked_csv_rows(csv_text: str, *, tracked_player_ids: set[int]) -> list[dict[str, str]]:
    """The raw-layer slice worth keeping: only the tracked players' CSV rows.

    The export is league-wide (577–946 rows/season) but the whitelist is five
    players, and any future reprocess only ever concerns them — so storing the
    whole league costs ~240 kB/season/batch for nothing.
    """
    return [
        row for row in _csv_rows(csv_text) if _row_player_id(row) in tracked_player_ids
    ]


def parse_expected_statistics(csv_text: str, *, tracked_player_ids: set[int]) -> list[SavantRow]:
    """Extract tracked players' xwOBA values from a Savant CSV export.

    The source has occasional blank ``est_woba`` cells, which intentionally
    become NULL rather than a made-up zero.
    """
    rows: list[SavantRow] = []
    for row in _csv_rows(csv_text):
        player_id = _row_player_id(row)
        if player_id is None or player_id not in tracked_player_ids:
            continue
        try:
            season = int(row["year"])
        except (KeyError, TypeError, ValueError):
            continue
        value = (row.get("est_woba") or "").strip()
        try:
            xwoba = float(value) if value else None
        except ValueError:
            continue
        rows.append({"player_id": player_id, "season": season, "xwoba": xwoba})
    return rows


# One curated MLB row with PA for this player-season ⇒ Savant's season number is
# unambiguously that row's.  Reused by the UPDATE and by the gap scan so the two
# can never drift apart.
_SINGLE_BATTING_ROW = """
    select count(*)
    from season_batting_stats as candidate
    where candidate.player_id = target.player_id
      and candidate.season = target.season
      and candidate.level = 'mlb'
      and candidate.pa > 0
  """


def update_xwoba(conn: psycopg.Connection, rows: list[SavantRow]) -> int:
    """Update only the unambiguous MLB player-season row for each CSV value.

    Both the guard *and* the UPDATE target are restricted to ``pa > 0``: the
    guard so a no-PA row doesn't fake ambiguity, the target so the value can
    never land on that no-PA row.  A season whose MLB rows are all ``pa = 0``
    has count 0 and is skipped.
    """
    count = 0
    with conn.cursor() as cur:
        for row in rows:
            cur.execute(
                f"""
                update season_batting_stats as target
                set xwoba = %s
                where target.player_id = %s
                  and target.season = %s
                  and target.level = 'mlb'
                  and target.pa > 0
                  and ({_SINGLE_BATTING_ROW}) = 1
                """,
                (row["xwoba"], row["player_id"], row["season"]),
            )
            count += cur.rowcount
    return count


def seasons_to_fetch(conn: psycopg.Connection, *, today: Optional[date] = None) -> list[int]:
    """Which seasons this batch actually needs from Savant.

    The current season (it keeps changing) plus any past season that *could*
    be written but is still NULL — i.e. a tracked player whose MLB rows for
    that season are a single ``pa > 0`` row with no xwOBA yet.  Finished
    seasons are frozen upstream, so re-downloading 2020–last-year every morning
    only burns requests and raw-layer bytes.

    Self-healing by construction: adding a player to the whitelist backfills
    their MLB rows, which reopens exactly the seasons that gained a gap.
    Caveat: a season Savant genuinely has no value for (blank ``est_woba``,
    player absent from the bip leaderboard) stays a gap and is re-checked each
    morning — bounded by the same 7 requests the old code always made.
    """
    seasons = set(_season_range(start=START_SEASON, today=today)[-1:])  # current
    with conn.cursor() as cur:
        cur.execute(
            f"""
            select distinct target.season
            from season_batting_stats as target
            join players on players.mlb_player_id = target.player_id
            where players.lifecycle = 'tracked'
              and target.level = 'mlb'
              and target.pa > 0
              and target.xwoba is null
              and target.season >= %s
              and ({_SINGLE_BATTING_ROW}) = 1
            """,
            (START_SEASON,),
        )
        seasons.update(int(r[0]) for r in cur.fetchall())
    return sorted(seasons)


def make_savant_source(
    _client, conn: psycopg.Connection, *, fetcher: CsvFetcher = fetch_expected_statistics,
    today: Optional[date] = None, seasons: Optional[Sequence[int]] = None,
) -> Source:
    """Build the morning-only Savant source after season-stats creates rows.

    ``seasons=None`` (the batch default) resolves to :func:`seasons_to_fetch`;
    passing an explicit list is the operator escape hatch (``etl resync
    --season`` re-pulls every season).
    """

    def run() -> list[dict[str, Any]] | None:
        tracked_ids = set(_tracked_player_ids(conn))
        if not tracked_ids:
            return
        wanted = (
            list(seasons)
            if seasons is not None
            else seasons_to_fetch(conn, today=today)
        )
        if not wanted:
            return

        all_rows: list[SavantRow] = []
        failed: list[int] = []
        warnings: list[dict[str, Any]] = []
        for season in wanted:
            # Per-season isolation: one bad year must not throw away the years
            # that did come back.  `batch.py` rolls the whole source back on an
            # exception, so a partial failure deliberately does *not* raise —
            # it logs and keeps the good data.  Only a total wipeout raises, so
            # the batch still lands as partial/failed when Savant is really down.
            try:
                csv_text = fetcher(season)
            except Exception as exc:  # noqa: BLE001 — one season, not the source
                logger.warning("savant: season %s skipped: %r", season, exc)
                failed.append(season)
                warnings.append(
                    {
                        "kind": "season_skipped",
                        "season": season,
                        "error": repr(exc),
                    }
                )
                continue
            store_raw_payload(
                conn,
                source="savant",
                endpoint=SAVANT_ENDPOINT,
                params=_params(season),
                payload=tracked_csv_rows(csv_text, tracked_player_ids=tracked_ids),
            )
            all_rows.extend(parse_expected_statistics(csv_text, tracked_player_ids=tracked_ids))

        if failed and len(failed) == len(wanted):
            raise SavantError(f"Savant CSV failed for every requested season: {failed}")
        update_xwoba(conn, all_rows)
        return warnings or None

    return Source("savant", run)
