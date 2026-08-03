"""Tests for the game-lines source: gameLog transform + DB upsert.

Box lines come from each tracked player's own `people/{id}/stats?stats=gameLog`
(spec-03 §3). Fixtures cover a batter, a pitcher (away game), a two-way player
(both groups, one game), and a minor-league split with missing keys.
"""

from __future__ import annotations

import uuid

import pytest

from etl.sources.game_lines import (
    BattingLineRow,
    PitchingLineRow,
    _ip_outs,
    transform_gamelog,
    upsert_batting_lines,
    upsert_pitching_lines,
)


def _split(game_pk, date, *, team, opp, is_home, sport_id, stat):
    return {
        "season": str(date[:4]),
        "date": date,
        "isHome": is_home,
        "game": {"gamePk": game_pk},
        "team": {"id": team},
        "opponent": {"id": opp},
        "sport": {"id": sport_id},
        "stat": stat,
    }


def _log(group, splits):
    return {
        "stats": [
            {
                "type": {"displayName": "gameLog"},
                "group": {"displayName": group},
                "splits": splits,
            }
        ]
    }


def test_transform_batting_split_carries_home_context():
    payload = _log(
        "hitting",
        [
            _split(
                100, "2025-04-01", team=137, opp=121, is_home=True, sport_id=1,
                stat={
                    "plateAppearances": 4, "atBats": 4, "hits": 2, "doubles": 1,
                    "triples": 0, "homeRuns": 1, "rbi": 3, "runs": 2,
                    "baseOnBalls": 0, "strikeOuts": 1, "stolenBases": 0,
                },
            )
        ],
    )
    batting, pitching = transform_gamelog(
        payload, player_id=691907, default_level="mlb"
    )
    assert pitching == []
    assert batting[0].game_date_us == "2025-04-01"
    assert batting[0].opponent_team_id == 121
    assert batting[0].is_home is True
    assert batting == [
        BattingLineRow(691907, 100, 137, "mlb", pa=4, ab=4, h=2, doubles=1,
                       triples=0, hr=1, rbi=3, r=2, bb=0, so=1, sb=0,
                       game_date_us="2025-04-01", opponent_team_id=121, is_home=True)
    ]


def test_transform_pitching_split_carries_away_context_and_level_from_sport():
    payload = _log(
        "pitching",
        [
            _split(
                200, "2025-08-02", team=137, opp=121, is_home=False, sport_id=11,
                stat={
                    "gamesStarted": 1, "outs": 10, "hits": 4, "runs": 5,
                    "earnedRuns": 5, "baseOnBalls": 3, "strikeOuts": 4, "homeRuns": 1,
                },
            )
        ],
    )
    batting, pitching = transform_gamelog(
        payload, player_id=678906, default_level="mlb"
    )
    assert batting == []
    assert pitching[0].game_date_us == "2025-08-02"
    assert pitching[0].opponent_team_id == 121
    assert pitching[0].is_home is False
    assert pitching == [
        PitchingLineRow(678906, 200, 137, "aaa", started=True, ip_outs=10,
                        h=4, r=5, er=5, bb=3, so=4, hr=1,
                        game_date_us="2025-08-02", opponent_team_id=121, is_home=False)
    ]
    # level came from the split's own sport.id (11 → aaa), not default_level


def test_transform_two_way_player_both_rows_keep_their_own_context():
    payload = {
        "stats": [
            {
                "group": {"displayName": "hitting"},
                "splits": [_split(300, "2025-05-01", team=1, opp=2, is_home=True,
                                  sport_id=1, stat={"atBats": 3, "hits": 2})],
            },
            {
                "group": {"displayName": "pitching"},
                "splits": [_split(300, "2025-05-01", team=1, opp=2, is_home=True,
                                  sport_id=1, stat={"outs": 15, "strikeOuts": 6})],
            },
        ]
    }
    batting, pitching = transform_gamelog(
        payload, player_id=660271, default_level="mlb"
    )
    assert len(batting) == 1 and len(pitching) == 1
    assert batting[0].h == 2 and pitching[0].ip_outs == 15


def test_transform_minor_league_missing_keys_default_zero_and_ip_parse():
    payload = _log(
        "pitching",
        [
            _split(400, "2024-06-01", team=5000, opp=5001, is_home=True, sport_id=14,
                   stat={"gamesStarted": 1, "inningsPitched": "5.2", "hits": 6})
        ],
    )
    _, pitching = transform_gamelog(payload, player_id=700002, default_level="a")
    (row,) = pitching
    assert row.level == "a"
    assert row.h == 6
    assert (row.r, row.er, row.bb, row.so, row.hr) == (0, 0, 0, 0, 0)
    assert row.ip_outs == 17  # parsed from "5.2" (no `outs` field)


def test_transform_skips_split_without_game_pk():
    payload = _log("hitting", [{"date": "2025-04-01", "game": {}, "stat": {"hits": 2}}])
    batting, _ = transform_gamelog(payload, player_id=1, default_level="mlb")
    assert batting == []


def test_ip_outs_prefers_outs_field_over_innings_pitched():
    assert _ip_outs({"outs": 20, "inningsPitched": "1.0"}) == 20


def test_ip_outs_parses_innings_pitched_thirds():
    assert _ip_outs({"inningsPitched": "6.1"}) == 19
    assert _ip_outs({"inningsPitched": "6.2"}) == 20
    assert _ip_outs({}) == 0


# ── DB ───────────────────────────────────────────────────────────────────────


@pytest.mark.db
def test_upsert_lines_is_idempotent(db_conn):
    game_pk = 990200 + (uuid.uuid4().int % 100000)
    player_id = 970200 + (uuid.uuid4().int % 100000)
    try:
        with db_conn.cursor() as cur:
            cur.execute(
                "insert into players (mlb_player_id, name_en, lifecycle) values (%s, 'Test Two-Way', 'tracked')",
                (player_id,),
            )
        db_conn.commit()

        bat_row = BattingLineRow(player_id, game_pk, None, "mlb", pa=4, ab=4, h=2,
                                 doubles=1, triples=0, hr=1, rbi=3, r=2, bb=0, so=1, sb=0,
                                 game_date_us="2026-07-26")
        pitch_row = PitchingLineRow(player_id, game_pk, None, "mlb", started=True,
                                    ip_outs=18, h=4, r=2, er=2, bb=1, so=7, hr=1,
                                    game_date_us="2026-07-26")
        assert upsert_batting_lines(db_conn, [bat_row]) == 1
        assert upsert_pitching_lines(db_conn, [pitch_row]) == 1
        db_conn.commit()

        upsert_batting_lines(db_conn, [BattingLineRow(**{**bat_row.__dict__, "h": 3})])
        upsert_pitching_lines(db_conn, [PitchingLineRow(**{**pitch_row.__dict__, "so": 9})])
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
            cur.execute("delete from game_batting_lines where player_id = %s", (player_id,))
            cur.execute("delete from game_pitching_lines where player_id = %s", (player_id,))
            cur.execute("delete from players where mlb_player_id = %s", (player_id,))
        db_conn.commit()
