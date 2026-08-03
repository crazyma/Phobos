"""Baseball Savant expected-statistics CSV → ``season_batting_stats.xwoba``.

Savant's official ``csv=true`` export is one row per player-season, whereas
our curated table is per player-season-team.  We therefore write only when an
MLB player-season has exactly one curated team row; traded seasons stay NULL
rather than placing a season aggregate beside team-specific stats.
"""

from __future__ import annotations

import csv
import io
import time
from datetime import date
from typing import Callable, Optional
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import psycopg

from ..batch import Source
from ..config import MAX_RETRIES, REQUEST_DELAY_SECONDS
from ..raw import store_raw_payload
from .season_stats import START_SEASON, _season_range, _tracked_player_ids

SAVANT_ENDPOINT = "leaderboard/expected_statistics"
SAVANT_BASE_URL = "https://baseballsavant.mlb.com"

SavantRow = dict[str, int | float | None]
CsvFetcher = Callable[[int], str]


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
    last_exc: Optional[Exception] = None
    for _attempt in range(attempts):
        sleep(delay)
        try:
            response = opener(request, timeout=timeout)
            with response:  # type: ignore[union-attr]
                return response.read().decode("utf-8-sig")  # type: ignore[union-attr]
        except Exception as exc:  # noqa: BLE001 - source failures are batch-isolated
            last_exc = exc
    raise SavantError(f"Savant CSV for {season} failed after {attempts} attempts") from last_exc


def _csv_rows(csv_text: str) -> list[dict[str, str]]:
    return list(csv.DictReader(io.StringIO(csv_text.lstrip("\ufeff"))))


def parse_expected_statistics(csv_text: str, *, tracked_player_ids: set[int]) -> list[SavantRow]:
    """Extract tracked players' xwOBA values from a Savant CSV export.

    The source has occasional blank ``est_woba`` cells, which intentionally
    become NULL rather than a made-up zero.
    """
    rows: list[SavantRow] = []
    for row in _csv_rows(csv_text):
        try:
            player_id = int(row["player_id"])
            season = int(row["year"])
        except (KeyError, TypeError, ValueError):
            continue
        if player_id not in tracked_player_ids:
            continue
        value = (row.get("est_woba") or "").strip()
        try:
            xwoba = float(value) if value else None
        except ValueError:
            continue
        rows.append({"player_id": player_id, "season": season, "xwoba": xwoba})
    return rows


def update_xwoba(conn: psycopg.Connection, rows: list[SavantRow]) -> int:
    """Update only the unambiguous MLB player-season row for each CSV value."""
    count = 0
    with conn.cursor() as cur:
        for row in rows:
            cur.execute(
                """
                update season_batting_stats as target
                set xwoba = %s
                where target.player_id = %s
                  and target.season = %s
                  and target.level = 'mlb'
                  and (
                    select count(*)
                    from season_batting_stats as candidate
                    where candidate.player_id = target.player_id
                      and candidate.season = target.season
                      and candidate.level = 'mlb'
                  ) = 1
                """,
                (row["xwoba"], row["player_id"], row["season"]),
            )
            count += cur.rowcount
    return count


def make_savant_source(
    _client, conn: psycopg.Connection, *, fetcher: CsvFetcher = fetch_expected_statistics,
    today: Optional[date] = None,
) -> Source:
    """Build the morning-only Savant source after season-stats creates rows."""

    def run() -> None:
        tracked_ids = set(_tracked_player_ids(conn))
        if not tracked_ids:
            return
        all_rows: list[SavantRow] = []
        for season in _season_range(start=START_SEASON, today=today):
            csv_text = fetcher(season)
            raw_rows = _csv_rows(csv_text)
            store_raw_payload(
                conn,
                source="savant",
                endpoint=SAVANT_ENDPOINT,
                params=_params(season),
                payload=raw_rows,
            )
            all_rows.extend(parse_expected_statistics(csv_text, tracked_player_ids=tracked_ids))
        update_xwoba(conn, all_rows)

    return Source("savant", run)
