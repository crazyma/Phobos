"""Tests for the recent-form rule engine (spec-03 §5) + DB recompute."""

from __future__ import annotations

import uuid
from datetime import date

import pytest

from etl.sources.recent_form import (
    Appearance,
    BatLine,
    PitchLine,
    StatusInfo,
    _truncate,
    build_recent_form,
    recompute_all_tracked,
)

TODAY = date(2024, 6, 15)
NO_STATUS = StatusInfo(None, None, None)


def _bat(d, season=2024, **kw):
    fields = {"ab": 4, "h": 0, "hr": 0, "rbi": 0, "bb": 0, "so": 0, "sb": 0}
    fields.update(kw)
    return Appearance(game_date=d, season=season, bat=BatLine(**fields))


def _pitch(d, season=2024, **kw):
    fields = {"started": True, "ip_outs": 18, "h": 3, "r": 0, "er": 0, "bb": 1, "so": 5}
    fields.update(kw)
    return Appearance(game_date=d, season=season, pitch=PitchLine(**fields))


# ── priority 1: career / season high ────────────────────────────────────────────


def test_batter_career_high_home_runs():
    apps = [_bat("2024-06-10", hr=1, h=1), _bat("2024-06-14", hr=2, h=2)]
    sentence, pattern = build_recent_form(apps, NO_STATUS, TODAY)
    assert pattern == "career_high"
    assert sentence == "上一場敲生涯最多 2 轟"


def test_batter_season_high_when_beaten_only_within_season():
    apps = [
        _bat("2023-05-01", season=2023, hr=3, h=3),  # higher career mark last year
        _bat("2024-06-10", hr=1, h=1),
        _bat("2024-06-14", hr=2, h=2),  # season high (2 > 1), not career (< 3)
    ]
    sentence, pattern = build_recent_form(apps, NO_STATUS, TODAY)
    assert pattern == "season_high"
    assert "本季最多 2 轟" in sentence


def test_pitcher_career_high_strikeouts():
    apps = [_pitch("2024-06-09", so=6), _pitch("2024-06-14", so=9)]
    sentence, pattern = build_recent_form(apps, NO_STATUS, TODAY)
    assert pattern == "career_high"
    assert sentence == "上一場投出生涯最多 9 次三振"


# ── priority 2: streak (beats single_game / agg) ─────────────────────────────────


def test_hit_streak():
    apps = [_bat(f"2024-06-{d:02d}", h=1) for d in (10, 11, 12, 13, 14)]
    sentence, pattern = build_recent_form(apps, NO_STATUS, TODAY)
    assert pattern == "streak"
    assert sentence == "連續 5 場有安打"


def test_scoreless_streak():
    apps = [_pitch(f"2024-06-{d:02d}", er=0, so=4) for d in (6, 9, 12, 14)]
    sentence, pattern = build_recent_form(apps, NO_STATUS, TODAY)
    assert pattern == "streak"
    assert sentence == "連續 4 場無失分"


def test_career_high_outranks_streak():
    # hitting streak is live AND the last game is a career-high 2-HR game →
    # priority 1 wins.
    apps = [_bat("2024-06-12", h=1, hr=1), _bat("2024-06-13", h=1), _bat("2024-06-14", h=2, hr=2)]
    _, pattern = build_recent_form(apps, NO_STATUS, TODAY)
    assert pattern == "career_high"


# ── priority 3: single game ──────────────────────────────────────────────────────


def test_single_game_multi_hit():
    apps = [_bat("2024-06-09", h=3), _bat("2024-06-14", h=3)]  # prior 3 blocks career high
    sentence, pattern = build_recent_form(apps, NO_STATUS, TODAY)
    assert pattern == "single_game"
    assert sentence == "上一場 3 支安打"


def test_single_game_quality_start():
    apps = [_pitch("2024-06-08", so=5), _pitch("2024-06-14", started=True, ip_outs=21, er=2, so=5)]
    sentence, pattern = build_recent_form(apps, NO_STATUS, TODAY)
    assert pattern == "single_game"
    assert sentence == "上一場優質先發"


# ── priority 4: recent aggregate ─────────────────────────────────────────────────


def test_recent_agg_batting_average():
    apps = [
        _bat("2024-06-10", ab=4, h=1),
        _bat("2024-06-12", ab=4, h=0),
        _bat("2024-06-14", ab=4, h=2),  # last game 2 hits (<3) → no single_game
    ]
    sentence, pattern = build_recent_form(apps, NO_STATUS, TODAY)
    assert pattern == "recent_agg"
    assert sentence == "近 3 場打擊率 .250"


def test_recent_agg_era():
    # neither outing is a quality start (both <6 IP) so single_game doesn't fire
    apps = [
        _pitch("2024-06-10", started=True, ip_outs=15, er=2, so=4),
        _pitch("2024-06-14", started=True, ip_outs=15, er=1, so=5),
    ]
    sentence, pattern = build_recent_form(apps, NO_STATUS, TODAY)
    assert pattern == "recent_agg"
    assert sentence == "近 2 場防禦率 2.70"


# ── priority 5: status fallback (never empty) ────────────────────────────────────


def test_fallback_injured_list_with_last_game():
    apps = [_bat("2024-05-01", h=1)]  # stale (>14d before TODAY)
    sentence, pattern = build_recent_form(apps, StatusInfo("rostered", "il", "il_10"), TODAY)
    assert pattern == "status_fallback"
    assert sentence == "傷兵名單中，最後出賽 5/1"


def test_fallback_offseason():
    sentence, pattern = build_recent_form([], NO_STATUS, date(2024, 12, 20))
    assert (sentence, pattern) == ("休賽期", "status_fallback")


def test_fallback_idle_in_season():
    sentence, pattern = build_recent_form([], NO_STATUS, TODAY)
    assert (sentence, pattern) == ("近兩週無出賽紀錄", "status_fallback")


def test_sentence_never_empty_and_within_limit():
    for apps, status, today in [
        ([], NO_STATUS, TODAY),
        ([_bat("2024-06-14", h=5, hr=3, rbi=6)], NO_STATUS, TODAY),
        ([_pitch("2024-06-14", so=12, er=0)], NO_STATUS, TODAY),
    ]:
        s, _ = build_recent_form(apps, status, today)
        assert 0 < len(s) <= 20


def test_truncate_caps_at_twenty():
    assert len(_truncate("あ" * 30)) == 20


# ── DB integration ───────────────────────────────────────────────────────────────


@pytest.mark.db
def test_recompute_writes_player_recent_form(db_conn):
    pid = 960000 + (uuid.uuid4().int % 1000)
    game_pk = 970000000 + (uuid.uuid4().int % 100000)
    game_day = date.today().isoformat()
    try:
        with db_conn.cursor() as cur:
            cur.execute(
                "insert into players (mlb_player_id, name_en, lifecycle) values (%s, 'RF Test', 'tracked')",
                (pid,),
            )
            cur.execute(
                """insert into game_batting_lines (player_id, game_pk, game_date_us, level, ab, h)
                   values (%s, %s, %s, 'mlb', 4, 3)""",
                (pid, game_pk, game_day),
            )
        db_conn.commit()

        recompute_all_tracked(db_conn, today=date.today())
        db_conn.commit()

        with db_conn.cursor() as cur:
            cur.execute(
                "select sentence_zh, pattern from player_recent_form where player_id = %s",
                (pid,),
            )
            row = cur.fetchone()
        assert row is not None
        # one game, 3 hits, no prior history → a career high since 2020
        assert row == ("上一場敲生涯最多 3 支安打", "career_high")
    finally:
        with db_conn.cursor() as cur:
            cur.execute("delete from player_recent_form where player_id = %s", (pid,))
            cur.execute("delete from game_batting_lines where player_id = %s", (pid,))
            cur.execute("delete from players where mlb_player_id = %s", (pid,))
        db_conn.commit()
