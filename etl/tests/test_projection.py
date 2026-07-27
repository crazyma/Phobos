"""Tests for status projection (pure state machine + DB replay) and reconcile."""

from __future__ import annotations

import uuid

import pytest

from etl.sources.projection import (
    EventInput,
    Mismatch,
    RosterSnapshotEntry,
    StatusRef,
    project_all_tracked,
    project_status,
    reconcile,
    transform_roster_snapshot,
)

# sportId levels: MLB team 147, AAA affiliate 235.
LEVELS = {147: "mlb", 235: "aaa"}


def _ev(i, type_, date, **kw):
    return EventInput(id=i, type=type_, effective_date=date, **kw)


# ── Pure projection: table-driven over spec-01 B.3 ─────────────────────────────


def test_sign_sets_rostered_team_and_level():
    s = project_status(1, [_ev(1, "sign", "2024-01-01", to_team_id=147)], LEVELS)
    assert (s.affiliation, s.team_id, s.level, s.health) == ("rostered", 147, "mlb", "active")
    assert s.as_of_event_id == 1


def test_call_up_then_send_down_follows_latest_team():
    events = [
        _ev(1, "sign", "2024-01-01", to_team_id=235),
        _ev(2, "call_up", "2024-05-01", to_team_id=147),
        _ev(3, "send_down", "2024-06-01", to_team_id=235),
    ]
    s = project_status(1, events, LEVELS)
    assert (s.affiliation, s.team_id, s.level) == ("rostered", 235, "aaa")
    assert s.as_of_event_id == 3


def test_il_on_then_off_toggles_health_and_detail():
    events = [
        _ev(1, "call_up", "2024-05-01", to_team_id=147),
        _ev(2, "il_on", "2024-06-10", il_detail="il_15"),
    ]
    s = project_status(1, events, LEVELS)
    assert (s.health, s.il_detail, s.affiliation, s.team_id) == ("il", "il_15", "rostered", 147)
    assert s.as_of_event_id == 2

    events.append(_ev(3, "il_off", "2024-07-01"))
    s2 = project_status(1, events, LEVELS)
    assert (s2.health, s2.il_detail) == ("active", None)
    # affiliation/team survive the IL round-trip
    assert (s2.affiliation, s2.team_id, s2.level) == ("rostered", 147, "mlb")


def test_dfa_keeps_prior_team_reference():
    events = [
        _ev(1, "call_up", "2024-05-01", to_team_id=147),
        _ev(2, "dfa", "2024-06-01"),
    ]
    s = project_status(1, events, LEVELS)
    assert s.affiliation == "dfa"
    assert (s.team_id, s.level) == (147, "mlb")  # 保留原隊參考


def test_release_resets_team_and_health():
    events = [
        _ev(1, "call_up", "2024-05-01", to_team_id=147),
        _ev(2, "il_on", "2024-05-20", il_detail="il_10"),
        _ev(3, "release", "2024-06-01"),
    ]
    s = project_status(1, events, LEVELS)
    assert s.affiliation == "released"
    assert (s.team_id, s.level, s.health, s.il_detail) == (None, None, "active", None)


def test_depart_marks_departed():
    events = [
        _ev(1, "sign", "2024-01-01", to_team_id=147),
        _ev(2, "depart", "2025-01-01"),
    ]
    s = project_status(1, events, LEVELS)
    assert s.affiliation == "departed"
    assert (s.team_id, s.level) == (None, None)


def test_declare_fa_marks_free_agent_off_roster():
    events = [
        _ev(1, "call_up", "2024-05-01", to_team_id=147),
        _ev(2, "il_on", "2024-09-01", il_detail="il_10"),
        _ev(3, "declare_fa", "2024-11-04"),  # elected free agency after the season
    ]
    s = project_status(1, events, LEVELS)
    assert s.affiliation == "free_agent"
    assert (s.team_id, s.level, s.health, s.il_detail) == (None, None, "active", None)

    # A later signing puts them back on a roster.
    events.append(_ev(4, "sign", "2025-01-15", to_team_id=147))
    s2 = project_status(1, events, LEVELS)
    assert s2.affiliation == "rostered"
    assert s2.team_id == 147


def test_other_is_timeline_only_and_does_not_advance_as_of():
    events = [
        _ev(1, "sign", "2024-01-01", to_team_id=147),
        _ev(2, "other", "2024-03-01"),
    ]
    s = project_status(1, events, LEVELS)
    assert s.affiliation == "rostered"
    assert s.as_of_event_id == 1  # 'other' didn't change state


def test_replay_is_order_independent():
    ordered = [
        _ev(1, "sign", "2024-01-01", to_team_id=235),
        _ev(2, "call_up", "2024-05-01", to_team_id=147),
        _ev(3, "il_on", "2024-06-01", il_detail="il_10"),
    ]
    shuffled = [ordered[2], ordered[0], ordered[1]]
    assert project_status(1, shuffled, LEVELS) == project_status(1, ordered, LEVELS)


def test_same_day_events_break_ties_by_announced_then_id():
    # Two moves on the same effective_date; the later announced one wins.
    events = [
        _ev(2, "send_down", "2024-06-01", announced_at="2024-06-01T18:00:00", to_team_id=235),
        _ev(1, "call_up", "2024-06-01", announced_at="2024-06-01T09:00:00", to_team_id=147),
    ]
    s = project_status(1, events, LEVELS)
    assert (s.team_id, s.as_of_event_id) == (235, 2)


def test_no_affiliation_event_yields_none():
    # Only IL toggles, affiliation never established → indeterminate, no row.
    assert project_status(1, [_ev(1, "il_on", "2024-06-01", il_detail="il_10")], LEVELS) is None
    assert project_status(1, [], LEVELS) is None


# ── Reconciliation (pure) ──────────────────────────────────────────────────────


def test_reconcile_flags_team_and_health_mismatches():
    projected = {
        1: StatusRef(team_id=147, health="active"),
        2: StatusRef(team_id=235, health="il"),
    }
    observed = [
        RosterSnapshotEntry(1, team_id=235, on_il=None),  # team differs
        RosterSnapshotEntry(2, team_id=235, on_il=False),  # health differs (we say il)
    ]
    out = reconcile(projected, observed)
    assert Mismatch(1, "team", 147, 235) in out
    assert Mismatch(2, "health", "il", "active") in out


def test_reconcile_ignores_unknown_fields_and_players():
    projected = {1: StatusRef(team_id=147, health="active")}
    observed = [
        RosterSnapshotEntry(1, team_id=None, on_il=None),  # nothing observed → skip
        RosterSnapshotEntry(99, team_id=235, on_il=True),  # not in projection → skip
    ]
    assert reconcile(projected, observed) == []


def test_transform_roster_snapshot_reads_current_team_and_il():
    payload = {
        "people": [
            {"id": 1, "currentTeam": {"id": 147}, "status": {"description": "Active"}},
            {
                "id": 2,
                "currentTeam": {"id": 235},
                "status": {"description": "Injured List 15-Day"},
            },
            {"id": 3},  # no team / no status → team None, on_il None
        ]
    }
    entries = {e.player_id: e for e in transform_roster_snapshot(payload)}
    assert entries[1] == RosterSnapshotEntry(1, 147, False)
    assert entries[2] == RosterSnapshotEntry(2, 235, True)
    assert entries[3] == RosterSnapshotEntry(3, None, None)


# ── DB replay integration ──────────────────────────────────────────────────────


@pytest.mark.db
def test_project_all_tracked_writes_current_status(db_conn):
    pid = 950000 + (uuid.uuid4().int % 1000)
    mlb = 993000 + (uuid.uuid4().int % 300)
    aaa = mlb + 100
    try:
        with db_conn.cursor() as cur:
            cur.execute(
                "insert into players (mlb_player_id, name_en, lifecycle) "
                "values (%s, 'Proj Player', 'tracked')",
                (pid,),
            )
            cur.execute(
                "insert into teams (mlb_team_id, name_en, level) values "
                "(%s, 'Proj MLB', 'mlb'), (%s, 'Proj AAA', 'aaa')",
                (mlb, aaa),
            )
            # A realistic stream: signed to AAA, called up, then IL-15.
            cur.executemany(
                "insert into transaction_events "
                "(source_tx_id, player_id, type, effective_date, to_team_id, il_detail, source) "
                "values (%s, %s, %s, %s, %s, %s, 'statsapi')",
                [
                    (f"p-{pid}-1", pid, "sign", "2024-01-01", aaa, None),
                    (f"p-{pid}-2", pid, "call_up", "2024-05-01", mlb, None),
                    (f"p-{pid}-3", pid, "il_on", "2024-06-10", None, "il_15"),
                ],
            )
        db_conn.commit()

        written = project_all_tracked(db_conn)
        db_conn.commit()
        assert written >= 1

        with db_conn.cursor() as cur:
            cur.execute(
                "select affiliation, team_id, level, health, il_detail "
                "from player_current_status where player_id = %s",
                (pid,),
            )
            assert cur.fetchone() == ("rostered", mlb, "mlb", "il", "il_15")

        # Idempotent re-projection keeps a single row.
        project_all_tracked(db_conn)
        db_conn.commit()
        with db_conn.cursor() as cur:
            cur.execute(
                "select count(*) from player_current_status where player_id = %s",
                (pid,),
            )
            assert cur.fetchone()[0] == 1
    finally:
        with db_conn.cursor() as cur:
            cur.execute("delete from player_current_status where player_id = %s", (pid,))
            cur.execute("delete from transaction_events where player_id = %s", (pid,))
            cur.execute("delete from players where mlb_player_id = %s", (pid,))
            cur.execute("delete from teams where mlb_team_id in (%s, %s)", (mlb, aaa))
        db_conn.commit()
