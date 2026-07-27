"""Tests for the season-stats source: pure transform + DB upsert semantics.

Fixture payloads mirror the real StatsAPI `people` hydrate shape, verified live
2026-07-27 against `/people?personIds=...&hydrate=stats(group=[hitting,
pitching],type=[season,sabermetrics],season=Y,sportId=N)` (no recorded fixture
existed yet for this endpoint prior to this ticket).
"""

from __future__ import annotations

import uuid

import pytest

from etl.sources.season_stats import (
    BattingStatRow,
    PitchingStatRow,
    _lob_pct,
    _outs,
    _season_range,
    transform_season_batting,
    transform_season_pitching,
    upsert_season_batting,
    upsert_season_pitching,
)


# ---------------------------------------------------------------------------
# Fixtures (trimmed real-shape payloads)
# ---------------------------------------------------------------------------


def _mlb_batting_payload() -> dict:
    """One MLB hitter, single team, season + sabermetrics both present."""
    return {
        "people": [
            {
                "id": 592450,
                "stats": [
                    {
                        "type": {"displayName": "season"},
                        "group": {"displayName": "hitting"},
                        "splits": [
                            {
                                "season": "2024",
                                "stat": {
                                    "gamesPlayed": 158,
                                    "plateAppearances": 704,
                                    "atBats": 559,
                                    "hits": 180,
                                    "doubles": 36,
                                    "triples": 1,
                                    "homeRuns": 58,
                                    "rbi": 144,
                                    "runs": 122,
                                    "stolenBases": 10,
                                    "caughtStealing": 0,
                                    "baseOnBalls": 133,
                                    "strikeOuts": 171,
                                    "hitByPitch": 9,
                                    "sacFlies": 2,
                                },
                                "team": {"id": 147, "name": "New York Yankees"},
                            }
                        ],
                    },
                    {
                        "type": {"displayName": "sabermetrics"},
                        "group": {"displayName": "hitting"},
                        "splits": [
                            {
                                "season": "2024",
                                "stat": {
                                    "woba": 0.475734,
                                    "wRcPlus": 219.784,
                                    "war": 11.32739,
                                },
                                "team": {"id": 147, "name": "New York Yankees"},
                            }
                        ],
                    },
                ],
            }
        ]
    }


def _traded_batting_payload() -> dict:
    """One hitter traded mid-season: aggregate split (no team) + two per-team splits."""
    return {
        "people": [
            {
                "id": 656941,
                "stats": [
                    {
                        "type": {"displayName": "season"},
                        "group": {"displayName": "hitting"},
                        "splits": [
                            {
                                "season": "2024",
                                "numTeams": 2,
                                "stat": {"gamesPlayed": 140, "atBats": 500, "hits": 130},
                                # no "team" key: aggregate-across-teams row
                            },
                            {
                                "season": "2024",
                                "stat": {"gamesPlayed": 90, "atBats": 320, "hits": 80},
                                "team": {"id": 116, "name": "Detroit Tigers"},
                            },
                            {
                                "season": "2024",
                                "stat": {"gamesPlayed": 50, "atBats": 180, "hits": 50},
                                "team": {"id": 119, "name": "Los Angeles Dodgers"},
                            },
                        ],
                    }
                ],
            }
        ]
    }


def _minor_league_batting_payload() -> dict:
    """AAA hitter: only a `season` block, no `sabermetrics` block at all
    (confirmed live: non-MLB sportIds simply omit it, no error)."""
    return {
        "people": [
            {
                "id": 689216,
                "stats": [
                    {
                        "type": {"displayName": "season"},
                        "group": {"displayName": "hitting"},
                        "splits": [
                            {
                                "season": "2025",
                                "stat": {
                                    "gamesPlayed": 18,
                                    "plateAppearances": 59,
                                    "atBats": 50,
                                    "hits": 12,
                                    "doubles": 1,
                                    "triples": 0,
                                    "homeRuns": 0,
                                    "rbi": 2,
                                    "runs": 7,
                                    "stolenBases": 2,
                                    "caughtStealing": 2,
                                    "baseOnBalls": 7,
                                    "strikeOuts": 13,
                                    "hitByPitch": 0,
                                    "sacFlies": 1,
                                },
                                "team": {"id": 234, "name": "Durham Bulls"},
                            }
                        ],
                    }
                ],
            }
        ]
    }


def _mlb_pitching_payload() -> dict:
    return {
        "people": [
            {
                "id": 605483,
                "stats": [
                    {
                        "type": {"displayName": "season"},
                        "group": {"displayName": "pitching"},
                        "splits": [
                            {
                                "season": "2024",
                                "stat": {
                                    "gamesPlayed": 20,
                                    "gamesStarted": 20,
                                    "outs": 312,
                                    "battersFaced": 418,
                                    "hits": 65,
                                    "runs": 38,
                                    "earnedRuns": 36,
                                    "homeRuns": 6,
                                    "baseOnBalls": 44,
                                    "strikeOuts": 145,
                                    "wins": 5,
                                    "losses": 3,
                                    "saves": 0,
                                    "holds": 0,
                                    "hitBatsmen": 1,
                                },
                                "team": {"id": 137, "name": "San Francisco Giants"},
                            }
                        ],
                    },
                    {
                        "type": {"displayName": "sabermetrics"},
                        "group": {"displayName": "pitching"},
                        "splits": [
                            {
                                "season": "2024",
                                "stat": {
                                    "fip": 2.4261,
                                    "xfip": 3.01364,
                                    "war": 3.07454,
                                    "eraMinus": 77.4112,
                                },
                                "team": {"id": 137, "name": "San Francisco Giants"},
                            }
                        ],
                    },
                ],
            }
        ]
    }


def _minor_league_pitching_payload() -> dict:
    """Minor-league pitcher: no `sabermetrics` block → fip/war/lob_pct all None."""
    return {
        "people": [
            {
                "id": 700001,
                "stats": [
                    {
                        "type": {"displayName": "season"},
                        "group": {"displayName": "pitching"},
                        "splits": [
                            {
                                "season": "2025",
                                "stat": {
                                    "gamesPlayed": 10,
                                    "gamesStarted": 10,
                                    "outs": 150,
                                    "battersFaced": 220,
                                    "hits": 40,
                                    "runs": 20,
                                    "earnedRuns": 18,
                                    "homeRuns": 4,
                                    "baseOnBalls": 15,
                                    "strikeOuts": 55,
                                    "wins": 3,
                                    "losses": 2,
                                    "saves": 0,
                                    "holds": 0,
                                    "hitBatsmen": 2,
                                },
                                "team": {"id": 555, "name": "Triple-A Test"},
                            }
                        ],
                    }
                ],
            }
        ]
    }


# ---------------------------------------------------------------------------
# Pure transform: batting
# ---------------------------------------------------------------------------


def test_transform_batting_maps_counting_and_advanced_fields():
    (row,) = transform_season_batting(_mlb_batting_payload(), level="mlb")
    assert row.player_id == 592450
    assert row.season == 2024
    assert row.level == "mlb"
    assert row.team_id == 147
    assert (row.g, row.pa, row.ab, row.h) == (158, 704, 559, 180)
    assert (row.doubles, row.triples, row.hr, row.rbi, row.r) == (36, 1, 58, 144, 122)
    assert (row.sb, row.cs, row.bb, row.so, row.hbp, row.sf) == (10, 0, 133, 171, 9, 2)
    assert row.woba == pytest.approx(0.475734)
    assert row.wrc_plus == pytest.approx(219.784)
    assert row.war == pytest.approx(11.32739)


def test_transform_batting_skips_aggregate_split_keeps_per_team_rows():
    rows = transform_season_batting(_traded_batting_payload(), level="mlb")
    assert len(rows) == 2  # aggregate (no team) row dropped
    by_team = {r.team_id: r for r in rows}
    assert by_team[116].ab == 320
    assert by_team[119].ab == 180
    # no sabermetrics block in this fixture at all → advanced columns None
    assert all(r.woba is None and r.wrc_plus is None and r.war is None for r in rows)


def test_transform_batting_missing_sabermetrics_defaults_to_none():
    (row,) = transform_season_batting(_minor_league_batting_payload(), level="aaa")
    assert row.level == "aaa"
    assert row.team_id == 234
    assert row.g == 18
    assert row.woba is None
    assert row.wrc_plus is None
    assert row.war is None


def test_transform_batting_ignores_person_without_season_block():
    payload = {"people": [{"id": 1, "stats": []}]}
    assert transform_season_batting(payload, level="mlb") == []


# ---------------------------------------------------------------------------
# Pure transform: pitching
# ---------------------------------------------------------------------------


def test_transform_pitching_maps_counting_and_advanced_fields_including_lob_pct():
    (row,) = transform_season_pitching(_mlb_pitching_payload(), level="mlb")
    assert row.player_id == 605483
    assert row.season == 2024
    assert row.team_id == 137
    assert (row.g, row.gs, row.ip_outs, row.bf) == (20, 20, 312, 418)
    assert (row.h, row.r, row.er, row.hr, row.bb, row.so) == (65, 38, 36, 6, 44, 145)
    assert (row.w, row.l, row.sv, row.hld) == (5, 3, 0, 0)
    assert row.fip == pytest.approx(2.4261)
    assert row.war == pytest.approx(3.07454)
    # LOB% = (H+BB+HBP-R) / (H+BB+HBP-1.4*HR) = (65+44+1-38)/(65+44+1-8.4)
    expected = (65 + 44 + 1 - 38) / (65 + 44 + 1 - 1.4 * 6)
    assert row.lob_pct == pytest.approx(expected)


def test_transform_pitching_without_sabermetrics_advanced_all_none():
    (row,) = transform_season_pitching(_minor_league_pitching_payload(), level="aaa")
    assert row.fip is None
    assert row.war is None
    assert row.lob_pct is None  # gated on sabermetrics presence, not just computable


def test_transform_pitching_ignores_person_without_season_block():
    payload = {"people": [{"id": 1, "stats": []}]}
    assert transform_season_pitching(payload, level="mlb") == []


# ---------------------------------------------------------------------------
# Small pure helpers
# ---------------------------------------------------------------------------


def test_lob_pct_guards_zero_denominator():
    # h+bb+hbp-1.4*hr == 0 with these inputs
    assert _lob_pct({"hits": 0, "baseOnBalls": 0, "hitBatsmen": 0, "runs": 0, "homeRuns": 0}) is None


def test_outs_prefers_outs_field_over_innings_pitched_string():
    assert _outs({"outs": 312, "inningsPitched": "999.0"}) == 312


def test_outs_falls_back_to_parsing_innings_pitched():
    # "104.1" = 104 innings + 1 out (StatsAPI thirds notation), not 104.1 decimal
    assert _outs({"inningsPitched": "104.1"}) == 104 * 3 + 1


def test_season_range_is_inclusive_start_to_today():
    from datetime import date

    assert _season_range(start=2020, today=date(2026, 7, 27)) == list(range(2020, 2027))


# ---------------------------------------------------------------------------
# DB integration
# ---------------------------------------------------------------------------


@pytest.mark.db
def test_upsert_season_batting_is_idempotent_and_preserves_xwoba(db_conn):
    pid = 960000 + (uuid.uuid4().int % 1000)
    team_id = 960100 + (uuid.uuid4().int % 1000)
    try:
        with db_conn.cursor() as cur:
            cur.execute(
                """
                insert into players (mlb_player_id, name_en, lifecycle)
                values (%s, 'Test Batter', 'tracked')
                """,
                (pid,),
            )
            cur.execute(
                """
                insert into teams (mlb_team_id, name_en, level)
                values (%s, 'Test Team', 'mlb')
                """,
                (team_id,),
            )
        db_conn.commit()

        row = BattingStatRow(
            player_id=pid,
            season=2024,
            level="mlb",
            team_id=team_id,
            g=100,
            pa=400,
            ab=350,
            h=90,
            doubles=20,
            triples=1,
            hr=15,
            rbi=50,
            r=45,
            sb=5,
            cs=2,
            bb=40,
            so=80,
            hbp=3,
            sf=2,
            woba=0.350,
            wrc_plus=120.0,
            war=2.5,
        )
        assert upsert_season_batting(db_conn, [row]) == 1
        db_conn.commit()

        # Simulate a later Savant source filling xwoba independently.
        with db_conn.cursor() as cur:
            cur.execute(
                """
                update season_batting_stats set xwoba = %s
                where player_id = %s and season = %s and level = %s and team_id = %s
                """,
                (0.360, pid, 2024, "mlb", team_id),
            )
        db_conn.commit()

        # Re-running this source's upsert (e.g. next morning re-pull) must not
        # clobber the Savant-set xwoba back to NULL.
        row2 = BattingStatRow(**{**row.__dict__, "h": 95})
        upsert_season_batting(db_conn, [row2])
        db_conn.commit()

        with db_conn.cursor() as cur:
            cur.execute(
                """
                select h, woba, xwoba, wrc_plus, war
                from season_batting_stats
                where player_id = %s and season = %s and level = %s and team_id = %s
                """,
                (pid, 2024, "mlb", team_id),
            )
            result = cur.fetchone()
        assert result[0] == 95  # updated
        assert result[1] == pytest.approx(0.350)
        assert result[2] == pytest.approx(0.360)  # xwoba preserved, not clobbered
        assert result[3] == pytest.approx(120.0)
        assert result[4] == pytest.approx(2.5)
    finally:
        with db_conn.cursor() as cur:
            cur.execute("delete from season_batting_stats where player_id = %s", (pid,))
            cur.execute("delete from players where mlb_player_id = %s", (pid,))
            cur.execute("delete from teams where mlb_team_id = %s", (team_id,))
        db_conn.commit()


@pytest.mark.db
def test_upsert_season_pitching_is_idempotent(db_conn):
    pid = 961000 + (uuid.uuid4().int % 1000)
    team_id = 961100 + (uuid.uuid4().int % 1000)
    try:
        with db_conn.cursor() as cur:
            cur.execute(
                """
                insert into players (mlb_player_id, name_en, lifecycle)
                values (%s, 'Test Pitcher', 'tracked')
                """,
                (pid,),
            )
            cur.execute(
                """
                insert into teams (mlb_team_id, name_en, level)
                values (%s, 'Test Team', 'mlb')
                """,
                (team_id,),
            )
        db_conn.commit()

        row = PitchingStatRow(
            player_id=pid,
            season=2024,
            level="mlb",
            team_id=team_id,
            g=20,
            gs=20,
            ip_outs=300,
            bf=400,
            h=60,
            r=30,
            er=28,
            hr=8,
            bb=35,
            so=140,
            w=10,
            l=6,
            sv=0,
            hld=0,
            fip=3.1,
            lob_pct=0.72,
            war=2.8,
        )
        assert upsert_season_pitching(db_conn, [row]) == 1
        db_conn.commit()

        # idempotent re-upsert with a changed counting stat
        row2 = PitchingStatRow(**{**row.__dict__, "so": 150})
        upsert_season_pitching(db_conn, [row2])
        db_conn.commit()

        with db_conn.cursor() as cur:
            cur.execute(
                """
                select so, fip, lob_pct, war
                from season_pitching_stats
                where player_id = %s and season = %s and level = %s and team_id = %s
                """,
                (pid, 2024, "mlb", team_id),
            )
            result = cur.fetchone()
        assert result[0] == 150
        assert result[1] == pytest.approx(3.1)
        assert result[2] == pytest.approx(0.72)
        assert result[3] == pytest.approx(2.8)

        with db_conn.cursor() as cur:
            cur.execute(
                "select count(*) from season_pitching_stats where player_id = %s", (pid,)
            )
            assert cur.fetchone()[0] == 1  # upsert, not a second row
    finally:
        with db_conn.cursor() as cur:
            cur.execute("delete from season_pitching_stats where player_id = %s", (pid,))
            cur.execute("delete from players where mlb_player_id = %s", (pid,))
            cur.execute("delete from teams where mlb_team_id = %s", (team_id,))
        db_conn.commit()
