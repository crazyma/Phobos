"""Tests for the Baseball Savant xwOBA source."""

from __future__ import annotations

import uuid
from datetime import date

import pytest

from etl.sources.savant import (
    SavantError,
    fetch_expected_statistics,
    make_savant_source,
    parse_expected_statistics,
    seasons_to_fetch,
    tracked_csv_rows,
    update_xwoba,
)


def test_parse_expected_statistics_handles_bom_empty_values_and_tracked_filter():
    csv_text = """﻿player_id,year,pa,est_woba
691907,2025,7,0.170
656413,2022,110,0.323
999999,2025,20,0.401
123456,2025,0,
"""

    assert parse_expected_statistics(csv_text, tracked_player_ids={691907, 123456}) == [
        {"player_id": 691907, "season": 2025, "xwoba": 0.170},
        {"player_id": 123456, "season": 2025, "xwoba": None},
    ]


def test_tracked_csv_rows_keeps_only_whitelisted_players():
    """The raw layer stores the tracked slice, not the whole league export."""
    csv_text = """﻿player_id,year,pa,est_woba
691907,2025,7,0.170
999999,2025,20,0.401
not-a-number,2025,3,0.200
"""

    rows = tracked_csv_rows(csv_text, tracked_player_ids={691907})
    assert [row["player_id"] for row in rows] == ["691907"]
    assert rows[0]["est_woba"] == "0.170"  # the row is kept verbatim


# --- fetch: retry discipline and diagnosability -----------------------------


def _fixed_opener(exc: BaseException):
    calls: list[int] = []

    def opener(_request, timeout=None):
        calls.append(1)
        raise exc

    return opener, calls


def test_fetch_surfaces_the_root_cause_in_the_error_message():
    """`batch.py` only records `repr(exc)`, so the cause must be in the text."""
    opener, calls = _fixed_opener(TimeoutError("timed out"))

    with pytest.raises(SavantError) as excinfo:
        fetch_expected_statistics(
            2020, opener=opener, sleep=lambda _d: None, delay=0, max_retries=2
        )

    assert len(calls) == 3
    assert "TimeoutError('timed out')" in str(excinfo.value)
    assert isinstance(excinfo.value.__cause__, TimeoutError)


def test_fetch_does_not_retry_programming_errors():
    """A TypeError is our bug, not an outage — it must surface on attempt one."""
    opener, calls = _fixed_opener(TypeError("bad call"))

    with pytest.raises(TypeError):
        fetch_expected_statistics(
            2020, opener=opener, sleep=lambda _d: None, delay=0, max_retries=2
        )

    assert len(calls) == 1


# --- DB-backed behaviour ----------------------------------------------------


class _Fixture:
    """A throwaway tracked player plus MLB teams, cleaned up by the caller."""

    def __init__(self, conn, team_count: int = 3):
        self.conn = conn
        self.pid = 980000 + (uuid.uuid4().int % 10000)
        self.teams = [970001 + (uuid.uuid4().int % 10000) + i for i in range(team_count)]
        with conn.cursor() as cur:
            cur.execute(
                "insert into players (mlb_player_id, name_en, lifecycle) "
                "values (%s, 'Savant Test', 'tracked')",
                (self.pid,),
            )
            for team in self.teams:
                cur.execute(
                    "insert into teams (mlb_team_id, name_en, level) values (%s, %s, 'mlb')",
                    (team, f"Team {team}"),
                )

    def batting(self, season: int, team_index: int, *, pa: int, xwoba=None) -> None:
        with self.conn.cursor() as cur:
            cur.execute(
                "insert into season_batting_stats "
                "(player_id, season, level, team_id, pa, xwoba) "
                "values (%s, %s, 'mlb', %s, %s, %s)",
                (self.pid, season, self.teams[team_index], pa, xwoba),
            )

    def cleanup(self) -> None:
        self.conn.rollback()
        with self.conn.cursor() as cur:
            cur.execute("delete from season_batting_stats where player_id = %s", (self.pid,))
            cur.execute("delete from players where mlb_player_id = %s", (self.pid,))
            cur.execute("delete from teams where mlb_team_id = any(%s)", (self.teams,))
        self.conn.commit()


@pytest.mark.db
def test_update_xwoba_writes_only_single_team_mlb_seasons(db_conn):
    fx = _Fixture(db_conn)
    try:
        fx.batting(2025, 0, pa=7)
        fx.batting(2024, 1, pa=99)
        fx.batting(2024, 2, pa=8)
        assert update_xwoba(db_conn, [
            {"player_id": fx.pid, "season": 2025, "xwoba": 0.170},
            {"player_id": fx.pid, "season": 2024, "xwoba": 0.323},
        ]) == 1
        db_conn.commit()
        with db_conn.cursor() as cur:
            cur.execute(
                "select season, xwoba from season_batting_stats "
                "where player_id = %s order by season, team_id",
                (fx.pid,),
            )
            assert cur.fetchall() == [(2024, None), (2024, None), (2025, pytest.approx(0.170))]
    finally:
        fx.cleanup()


@pytest.mark.db
def test_update_xwoba_ignores_zero_pa_rows_when_judging_ambiguity(db_conn):
    """Fairchild 2026: `g=14, pa=27` on one team, `g=1, pa=0` on another.

    Only one row can own Savant's season number, so this is not a traded
    season — write the PA row and leave the no-PA row NULL.
    """
    fx = _Fixture(db_conn, team_count=2)
    try:
        fx.batting(2026, 0, pa=27)
        fx.batting(2026, 1, pa=0)
        assert update_xwoba(db_conn, [{"player_id": fx.pid, "season": 2026, "xwoba": 0.28}]) == 1
        db_conn.commit()
        with db_conn.cursor() as cur:
            cur.execute(
                "select pa, xwoba from season_batting_stats "
                "where player_id = %s and season = 2026 order by pa",
                (fx.pid,),
            )
            assert cur.fetchall() == [(0, None), (27, pytest.approx(0.28))]
    finally:
        fx.cleanup()


@pytest.mark.db
def test_update_xwoba_skips_seasons_whose_mlb_rows_all_lack_plate_appearances(db_conn):
    """No row earned the number — writing it anywhere would be a guess."""
    fx = _Fixture(db_conn, team_count=2)
    try:
        fx.batting(2026, 0, pa=0)
        fx.batting(2026, 1, pa=0)
        assert update_xwoba(db_conn, [{"player_id": fx.pid, "season": 2026, "xwoba": 0.28}]) == 0
        db_conn.commit()
        with db_conn.cursor() as cur:
            cur.execute(
                "select count(*) from season_batting_stats "
                "where player_id = %s and xwoba is not null",
                (fx.pid,),
            )
            assert cur.fetchone() == (0,)
    finally:
        fx.cleanup()


@pytest.mark.db
def test_seasons_to_fetch_asks_for_the_current_season_plus_writable_gaps(db_conn):
    today = date(2026, 8, 3)
    fx = _Fixture(db_conn, team_count=2)
    try:
        db_conn.commit()
        before = set(seasons_to_fetch(db_conn, today=today))
        assert 2026 in before  # the current season is always re-pulled

        fx.batting(2020, 0, pa=120)  # writable gap → wanted
        fx.batting(2020, 1, pa=0)    # a no-PA sibling doesn't disqualify it
        fx.batting(2021, 0, pa=99)   # genuinely traded season → never writable
        fx.batting(2021, 1, pa=8)
        fx.batting(2019, 0, pa=50)   # before START_SEASON → out of scope
        db_conn.commit()
        assert set(seasons_to_fetch(db_conn, today=today)) - before == {2020}

        # Once filled, the frozen season stops being re-downloaded every morning.
        update_xwoba(db_conn, [{"player_id": fx.pid, "season": 2020, "xwoba": 0.31}])
        db_conn.commit()
        assert set(seasons_to_fetch(db_conn, today=today)) - before == set()
    finally:
        fx.cleanup()


def _csv_for(pid: int, season: int, xwoba: str) -> str:
    return f"﻿player_id,year,pa,est_woba\n{pid},{season},50,{xwoba}\n"


@pytest.mark.db
def test_source_keeps_the_seasons_that_succeeded_when_one_year_fails(db_conn):
    """A single bad year must not discard the years that did come back.

    `batch.py` rolls the source back on any exception, so a partial failure
    logs and returns instead of raising.
    """
    fx = _Fixture(db_conn, team_count=1)
    with db_conn.cursor() as cur:
        cur.execute("select coalesce(max(id), 0) from raw_payloads")
        raw_watermark = cur.fetchone()[0]
    try:
        fx.batting(2024, 0, pa=50)
        fx.batting(2025, 0, pa=50)
        db_conn.commit()

        def fetcher(season: int) -> str:
            if season == 2024:
                raise TimeoutError("savant flaked")
            return _csv_for(fx.pid, season, "0.345")

        warnings = make_savant_source(
            None, db_conn, fetcher=fetcher, seasons=[2024, 2025]
        ).run()
        assert warnings == [
            {
                "kind": "season_skipped",
                "season": 2024,
                "error": "TimeoutError('savant flaked')",
            }
        ]
        db_conn.commit()

        with db_conn.cursor() as cur:
            cur.execute(
                "select season, xwoba from season_batting_stats "
                "where player_id = %s order by season",
                (fx.pid,),
            )
            assert cur.fetchall() == [(2024, None), (2025, pytest.approx(0.345))]
            # Raw keeps only the tracked slice, and only for the season we got.
            cur.execute(
                "select payload from raw_payloads where id > %s and source = 'savant'",
                (raw_watermark,),
            )
            payloads = [r[0] for r in cur.fetchall()]
        assert len(payloads) == 1
        assert [row["player_id"] for row in payloads[0]] == [str(fx.pid)]
    finally:
        fx.cleanup()  # rolls back first, so the raw cleanup has to follow it
        with db_conn.cursor() as cur:
            cur.execute("delete from raw_payloads where id > %s", (raw_watermark,))
        db_conn.commit()


@pytest.mark.db
def test_source_raises_only_when_every_season_fails(db_conn):
    """Total outage still has to reach `sync_runs` as a failed source."""
    fx = _Fixture(db_conn, team_count=1)
    try:
        fx.batting(2025, 0, pa=50)
        db_conn.commit()

        def fetcher(_season: int) -> str:
            raise TimeoutError("savant down")

        source = make_savant_source(None, db_conn, fetcher=fetcher, seasons=[2024, 2025])
        with pytest.raises(SavantError):
            source.run()
    finally:
        fx.cleanup()
