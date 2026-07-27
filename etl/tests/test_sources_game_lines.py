"""Tests for the game-lines source: pure transform + DB upsert.

Two transform fixtures per spec-03 §8: one MLB-normal boxscore, one
minor-league boxscore missing several stat keys outright.
"""

from __future__ import annotations

import uuid

import pytest

from etl.sources.game_lines import (
    BattingLineRow,
    PitchingLineRow,
    _ip_outs,
    transform_boxscore,
    upsert_batting_lines,
    upsert_pitching_lines,
)

# A two-way player (bats AND pitches) plus a position player and a pure
# reliever, mirroring a normal MLB boxscore's shape.
_MLB_BOXSCORE = {
    "teams": {
        "away": {
            "team": {"id": 147},
            "players": {
                "ID660271": {  # two-way: batted and pitched
                    "person": {"id": 660271},
                    "stats": {
                        "batting": {
                            "gamesPlayed": 1,
                            "plateAppearances": 4,
                            "atBats": 4,
                            "hits": 2,
                            "doubles": 1,
                            "triples": 0,
                            "homeRuns": 1,
                            "rbi": 3,
                            "runs": 2,
                            "baseOnBalls": 0,
                            "strikeOuts": 1,
                            "stolenBases": 0,
                        },
                        "pitching": {
                            "gamesPlayed": 1,
                            "gamesStarted": 1,
                            "outs": 18,
                            "inningsPitched": "6.0",
                            "hits": 4,
                            "runs": 2,
                            "earnedRuns": 2,
                            "baseOnBalls": 1,
                            "strikeOuts": 7,
                            "homeRuns": 1,
                        },
                    },
                },
                "ID999999": {  # untracked player — must be dropped
                    "person": {"id": 999999},
                    "stats": {
                        "batting": {"gamesPlayed": 1, "hits": 3},
                        "pitching": {},
                    },
                },
            },
        },
        "home": {
            "team": {"id": 111},
            "players": {
                "ID543235": {  # pure reliever, didn't bat (batting all zero/absent)
                    "person": {"id": 543235},
                    "stats": {
                        "batting": {"gamesPlayed": 0},
                        "pitching": {
                            "gamesPlayed": 1,
                            "gamesStarted": 0,
                            "outs": 3,
                            "inningsPitched": "1.0",
                            "hits": 0,
                            "runs": 0,
                            "earnedRuns": 0,
                            "baseOnBalls": 1,
                            "strikeOuts": 2,
                            "homeRuns": 0,
                        },
                    },
                },
            },
        },
    }
}

_TRACKED = {660271, 543235}

# Minor-league boxscore: several stat keys are entirely absent, and pitching
# has no `outs` field (must fall back to parsing `inningsPitched`).
_MINOR_LEAGUE_BOXSCORE = {
    "teams": {
        "home": {
            "team": {"id": 5000},
            "players": {
                "ID700001": {
                    "person": {"id": 700001},
                    "stats": {
                        "batting": {
                            "gamesPlayed": 1,
                            "atBats": 3,
                            "hits": 1,
                            # plateAppearances, rbi, doubles, etc. all missing
                        },
                        "pitching": {},
                    },
                },
                "ID700002": {
                    "person": {"id": 700002},
                    "stats": {
                        "batting": {},
                        "pitching": {
                            "gamesPlayed": 1,
                            "gamesStarted": 1,
                            "inningsPitched": "5.2",
                            "hits": 6,
                            # runs/earnedRuns/baseOnBalls/strikeOuts/homeRuns missing
                        },
                    },
                },
            },
        },
        "away": {"team": {"id": 5001}, "players": {}},
    }
}

_MINOR_TRACKED = {700001, 700002}


def test_transform_mlb_boxscore_two_way_player_gets_both_rows():
    batting, pitching = transform_boxscore(
        _MLB_BOXSCORE, game_pk=1, level="mlb", tracked_ids=_TRACKED
    )
    batting_by_id = {r.player_id: r for r in batting}
    pitching_by_id = {r.player_id: r for r in pitching}

    assert set(batting_by_id) == {660271}
    assert set(pitching_by_id) == {660271, 543235}

    two_way_bat = batting_by_id[660271]
    assert two_way_bat == BattingLineRow(
        player_id=660271,
        game_pk=1,
        team_id=147,
        level="mlb",
        pa=4,
        ab=4,
        h=2,
        doubles=1,
        triples=0,
        hr=1,
        rbi=3,
        r=2,
        bb=0,
        so=1,
        sb=0,
    )
    two_way_pitch = pitching_by_id[660271]
    assert two_way_pitch == PitchingLineRow(
        player_id=660271,
        game_pk=1,
        team_id=147,
        level="mlb",
        started=True,
        ip_outs=18,
        h=4,
        r=2,
        er=2,
        bb=1,
        so=7,
        hr=1,
    )

    reliever = pitching_by_id[543235]
    assert reliever.team_id == 111
    assert reliever.started is False
    assert reliever.ip_outs == 3


def test_transform_drops_untracked_players():
    batting, pitching = transform_boxscore(
        _MLB_BOXSCORE, game_pk=1, level="mlb", tracked_ids=_TRACKED
    )
    all_ids = {r.player_id for r in batting} | {r.player_id for r in pitching}
    assert 999999 not in all_ids


def test_transform_minor_league_missing_columns_defaults_to_zero():
    batting, pitching = transform_boxscore(
        _MINOR_LEAGUE_BOXSCORE, game_pk=2, level="a", tracked_ids=_MINOR_TRACKED
    )
    (bat_row,) = batting
    assert bat_row.player_id == 700001
    assert bat_row.ab == 3
    assert bat_row.h == 1
    # Missing keys default to 0 (the only value NOT NULL DEFAULT 0 allows).
    assert bat_row.pa == 0
    assert bat_row.rbi == 0
    assert bat_row.doubles == 0

    (pitch_row,) = pitching
    assert pitch_row.player_id == 700002
    assert pitch_row.h == 6
    assert pitch_row.r == 0
    assert pitch_row.bb == 0
    # No `outs` field present → parsed from "5.2" (5 innings + 2 thirds).
    assert pitch_row.ip_outs == 17


def test_ip_outs_prefers_outs_field_over_innings_pitched():
    assert _ip_outs({"outs": 20, "inningsPitched": "1.0"}) == 20


def test_ip_outs_parses_innings_pitched_thirds():
    assert _ip_outs({"inningsPitched": "6.1"}) == 19
    assert _ip_outs({"inningsPitched": "6.2"}) == 20
    assert _ip_outs({}) == 0


def test_transform_no_participation_yields_no_rows():
    payload = {
        "teams": {
            "home": {
                "team": {"id": 1},
                "players": {
                    "ID1": {
                        "person": {"id": 1},
                        "stats": {"batting": {"gamesPlayed": 0}, "pitching": {}},
                    }
                },
            },
            "away": {"team": {"id": 2}, "players": {}},
        }
    }
    batting, pitching = transform_boxscore(
        payload, game_pk=3, level="mlb", tracked_ids={1}
    )
    assert batting == []
    assert pitching == []


@pytest.mark.db
def test_upsert_lines_is_idempotent(db_conn):
    game_pk = 990200 + (uuid.uuid4().int % 100000)
    player_id = 970200 + (uuid.uuid4().int % 100000)
    try:
        with db_conn.cursor() as cur:
            cur.execute(
                """
                insert into games (game_pk, level, game_date_us, status)
                values (%s, 'mlb', '2026-07-26', 'final')
                """,
                (game_pk,),
            )
            cur.execute(
                """
                insert into players (mlb_player_id, name_en, lifecycle)
                values (%s, 'Test Two-Way', 'tracked')
                """,
                (player_id,),
            )
        db_conn.commit()

        bat_row = BattingLineRow(
            player_id=player_id,
            game_pk=game_pk,
            team_id=None,
            level="mlb",
            pa=4,
            ab=4,
            h=2,
            doubles=1,
            triples=0,
            hr=1,
            rbi=3,
            r=2,
            bb=0,
            so=1,
            sb=0,
        )
        pitch_row = PitchingLineRow(
            player_id=player_id,
            game_pk=game_pk,
            team_id=None,
            level="mlb",
            started=True,
            ip_outs=18,
            h=4,
            r=2,
            er=2,
            bb=1,
            so=7,
            hr=1,
        )
        assert upsert_batting_lines(db_conn, [bat_row]) == 1
        assert upsert_pitching_lines(db_conn, [pitch_row]) == 1
        db_conn.commit()

        # Idempotent re-upsert with a changed value.
        upsert_batting_lines(db_conn, [bat_row.__class__(**{**bat_row.__dict__, "h": 3})])
        upsert_pitching_lines(
            db_conn, [pitch_row.__class__(**{**pitch_row.__dict__, "so": 9})]
        )
        db_conn.commit()

        with db_conn.cursor() as cur:
            cur.execute(
                "select h from game_batting_lines where player_id = %s and game_pk = %s",
                (player_id, game_pk),
            )
            assert cur.fetchone() == (3,)
            cur.execute(
                "select so from game_pitching_lines where player_id = %s and game_pk = %s",
                (player_id, game_pk),
            )
            assert cur.fetchone() == (9,)
    finally:
        with db_conn.cursor() as cur:
            cur.execute(
                "delete from game_batting_lines where player_id = %s and game_pk = %s",
                (player_id, game_pk),
            )
            cur.execute(
                "delete from game_pitching_lines where player_id = %s and game_pk = %s",
                (player_id, game_pk),
            )
            cur.execute("delete from players where mlb_player_id = %s", (player_id,))
            cur.execute("delete from games where game_pk = %s", (game_pk,))
        db_conn.commit()
