"""Tests for the Baseball Savant xwOBA source."""

from __future__ import annotations

import uuid

import pytest

from etl.sources.savant import parse_expected_statistics, update_xwoba


def test_parse_expected_statistics_handles_bom_empty_values_and_tracked_filter():
    csv_text = """\ufeffplayer_id,year,pa,est_woba
691907,2025,7,0.170
656413,2022,110,0.323
999999,2025,20,0.401
123456,2025,0,
"""

    assert parse_expected_statistics(csv_text, tracked_player_ids={691907, 123456}) == [
        {"player_id": 691907, "season": 2025, "xwoba": 0.170},
        {"player_id": 123456, "season": 2025, "xwoba": None},
    ]


@pytest.mark.db
def test_update_xwoba_writes_only_single_team_mlb_seasons(db_conn):
    pid = 980000 + (uuid.uuid4().int % 10000)
    teams = [970001 + (uuid.uuid4().int % 10000) for _ in range(3)]
    try:
        with db_conn.cursor() as cur:
            cur.execute("insert into players (mlb_player_id, name_en, lifecycle) values (%s, 'Savant Test', 'tracked')", (pid,))
            for team in teams:
                cur.execute("insert into teams (mlb_team_id, name_en, level) values (%s, %s, 'mlb')", (team, f'Team {team}'))
            cur.execute("insert into season_batting_stats (player_id, season, level, team_id) values (%s, 2025, 'mlb', %s)", (pid, teams[0]))
            cur.execute("insert into season_batting_stats (player_id, season, level, team_id) values (%s, 2024, 'mlb', %s), (%s, 2024, 'mlb', %s)", (pid, teams[1], pid, teams[2]))
        assert update_xwoba(db_conn, [
            {"player_id": pid, "season": 2025, "xwoba": 0.170},
            {"player_id": pid, "season": 2024, "xwoba": 0.323},
        ]) == 1
        db_conn.commit()
        with db_conn.cursor() as cur:
            cur.execute("select season, xwoba from season_batting_stats where player_id = %s order by season, team_id", (pid,))
            assert cur.fetchall() == [(2024, None), (2024, None), (2025, pytest.approx(0.170))]
    finally:
        db_conn.rollback()
        with db_conn.cursor() as cur:
            cur.execute("delete from season_batting_stats where player_id = %s", (pid,))
            cur.execute("delete from players where mlb_player_id = %s", (pid,))
            cur.execute("delete from teams where mlb_team_id = any(%s)", (teams,))
        db_conn.commit()
