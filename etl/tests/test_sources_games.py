"""Tests for the games source: pure transform + DB upsert."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest

from etl.sources.games import GameRow, _map_status, transform_schedule, upsert_games


def _schedule_payload(**overrides):
    game = {
        "gamePk": 746789,
        "gameDate": "2026-07-26T17:05:00Z",
        "officialDate": "2026-07-26",
        "status": {"abstractGameState": "Final", "detailedState": "Final"},
        "teams": {
            "away": {
                "score": 3,
                "team": {"id": 147},
                "probablePitcher": {"id": 111},
            },
            "home": {
                "score": 5,
                "team": {"id": 111},
                "probablePitcher": {"id": 222},
            },
        },
        "venue": {"id": 3313, "name": "Fenway Park"},
        "gameNumber": 1,
        "gamesInSeries": 3,
        "seriesGameNumber": 2,
    }
    game.update(overrides)
    return {"dates": [{"date": "2026-07-26", "games": [game]}]}


def test_transform_maps_schedule_fields():
    (row,) = transform_schedule(_schedule_payload(), default_level="mlb")
    assert row == GameRow(
        game_pk=746789,
        level="mlb",
        game_date_us="2026-07-26",
        start_time_utc=datetime(2026, 7, 26, 17, 5, tzinfo=timezone.utc),
        home_team_id=111,
        away_team_id=147,
        venue_name="Fenway Park",
        status="final",
        home_score=5,
        away_score=3,
        game_number=1,
        games_in_series=3,
        series_game_number=2,
        probable_home_pitcher_id=222,
        probable_away_pitcher_id=111,
    )


def test_transform_skips_games_missing_pk_or_official_date():
    payload = {
        "dates": [
            {
                "games": [
                    {"officialDate": "2026-07-26"},  # no gamePk
                    {"gamePk": 1},  # no officialDate
                ]
            }
        ]
    }
    assert transform_schedule(payload, default_level="mlb") == []


def test_transform_scheduled_game_has_no_scores_or_status_final():
    payload = _schedule_payload(
        status={"abstractGameState": "Preview", "detailedState": "Scheduled"},
    )
    payload["dates"][0]["games"][0]["teams"]["home"]["score"] = None
    payload["dates"][0]["games"][0]["teams"]["away"]["score"] = None
    (row,) = transform_schedule(payload, default_level="mlb")
    assert row.status == "scheduled"
    assert row.home_score is None
    assert row.away_score is None


@pytest.mark.parametrize(
    "status_node,expected",
    [
        ({"abstractGameState": "Preview", "detailedState": "Scheduled"}, "scheduled"),
        ({"abstractGameState": "Preview", "detailedState": "Pre-Game"}, "scheduled"),
        ({"abstractGameState": "Live", "detailedState": "In Progress"}, "live"),
        ({"abstractGameState": "Final", "detailedState": "Final"}, "final"),
        ({"abstractGameState": "Final", "detailedState": "Game Over"}, "final"),
        ({"abstractGameState": "Preview", "detailedState": "Postponed"}, "postponed"),
        ({"abstractGameState": "Final", "detailedState": "Suspended"}, "suspended"),
        ({"abstractGameState": "Preview", "detailedState": "Cancelled"}, "cancelled"),
        ({}, "scheduled"),
        (None, "scheduled"),
    ],
)
def test_map_status(status_node, expected):
    assert _map_status(status_node) == expected


@pytest.mark.db
def test_upsert_games_is_idempotent_and_updates_status(db_conn):
    game_pk = 990100 + (uuid.uuid4().int % 100000)
    row = GameRow(
        game_pk=game_pk,
        level="mlb",
        game_date_us="2026-07-26",
        start_time_utc=datetime(2026, 7, 26, 17, 5, tzinfo=timezone.utc),
        home_team_id=None,
        away_team_id=None,
        venue_name="Test Park",
        status="scheduled",
        home_score=None,
        away_score=None,
        game_number=1,
        games_in_series=3,
        series_game_number=1,
        probable_home_pitcher_id=None,
        probable_away_pitcher_id=None,
    )
    try:
        assert upsert_games(db_conn, [row]) == 1
        db_conn.commit()

        final_row = GameRow(
            game_pk=game_pk,
            level="mlb",
            game_date_us="2026-07-26",
            start_time_utc=row.start_time_utc,
            home_team_id=None,
            away_team_id=None,
            venue_name="Test Park",
            status="final",
            home_score=5,
            away_score=3,
            game_number=1,
            games_in_series=3,
            series_game_number=1,
            probable_home_pitcher_id=None,
            probable_away_pitcher_id=None,
        )
        upsert_games(db_conn, [final_row])
        db_conn.commit()

        with db_conn.cursor() as cur:
            cur.execute(
                "select status, home_score, away_score from games where game_pk = %s",
                (game_pk,),
            )
            assert cur.fetchone() == ("final", 5, 3)
    finally:
        with db_conn.cursor() as cur:
            cur.execute("delete from games where game_pk = %s", (game_pk,))
        db_conn.commit()
