"""Tests for the transactions source: classify + pure transform + DB upsert."""

from __future__ import annotations

import uuid

import pytest

from etl.sources.transactions import (
    TxRow,
    classify,
    sanitize_team_refs,
    transform_transactions,
    upsert_transaction_events,
)


def _tx(**kw):
    """Build a TxRow with sensible defaults for team-ref tests."""
    base = dict(
        source_tx_id="1",
        player_id=100,
        type="trade",
        effective_date="2024-04-01",
        announced_at="2024-04-01",
        from_team_id=None,
        to_team_id=None,
        il_detail=None,
        description=None,
    )
    base.update(kw)
    return TxRow(**base)


def test_sanitize_nulls_unknown_team_refs_but_keeps_the_event():
    rows = [
        _tx(source_tx_id="a", from_team_id=133, to_team_id=3296),  # to unknown
        _tx(source_tx_id="b", from_team_id=999, to_team_id=137),  # from unknown
        _tx(source_tx_id="c", from_team_id=133, to_team_id=137),  # both known
    ]
    cleaned, dropped = sanitize_team_refs(rows, {133, 137})

    assert dropped == {3296, 999}
    assert len(cleaned) == 3  # no event is lost
    by_id = {r.source_tx_id: r for r in cleaned}
    assert by_id["a"].to_team_id is None and by_id["a"].from_team_id == 133
    assert by_id["b"].from_team_id is None and by_id["b"].to_team_id == 137
    assert by_id["c"].from_team_id == 133 and by_id["c"].to_team_id == 137


def test_sanitize_noop_when_all_known():
    rows = [_tx(from_team_id=133, to_team_id=137)]
    cleaned, dropped = sanitize_team_refs(rows, {133, 137})
    assert dropped == set()
    assert cleaned == rows


def test_classify_roster_moves():
    assert classify("Signed as Free Agent", "SFA", "") == ("sign", None)
    assert classify("Recalled", "CU", "Recalled from Triple-A") == ("call_up", None)
    assert classify("Selected", "SE", "Selected the contract of") == ("call_up", None)
    assert classify("Optioned", "OPT", "Optioned to Triple-A") == ("send_down", None)
    assert classify("Traded", "TR", "") == ("trade", None)
    assert classify("Designated for Assignment", "DES", "") == ("dfa", None)
    assert classify("Released", "REL", "") == ("release", None)


def test_classify_injured_list_on_and_off_with_detail():
    on, detail = classify(
        "Status Change", "SC", "Placed on the 15-day injured list"
    )
    assert (on, detail) == ("il_on", "il_15")

    on60, detail60 = classify("", "SC", "Transferred to the 60-day injured list")
    assert (on60, detail60) == ("il_on", "il_60")

    off, off_detail = classify(
        "Status Change", "SC", "Activated from the 15-day injured list"
    )
    assert (off, off_detail) == ("il_off", None)

    reinstated, _ = classify("", "SC", "Reinstated from the injured list")
    assert reinstated == "il_off"


def test_classify_unknown_and_waiver_default_to_other():
    # Waiver claim explicitly falls to 'other' per the ticket.
    assert classify("Claimed Off Waivers", "CLW", "")[0] == "other"
    assert classify("Some Novel Move", "ZZ", "")[0] == "other"


def test_classify_typecode_fallback_when_desc_blank():
    assert classify("", "OPT", "")[0] == "send_down"
    assert classify("", "TR", "")[0] == "trade"


def test_classify_real_statsapi_desc_strings():
    # Strings confirmed against live 2024 data (spec-03 §9).
    assert classify("Signed", "SGN", "")[0] == "sign"
    assert classify("Trade", "TR", "")[0] == "trade"
    assert classify("Outrighted", "OUT", "")[0] == "send_down"
    # 'Status Change' that is NOT an IL move must be timeline-only, never 'sign'.
    assert classify("Status Change", "SC", "Roster status changed")[0] == "other"
    # typeCode 'DFA' is *Declared Free Agency*, not a designation → 'other'.
    assert classify("Declared Free Agency", "DFA", "elected free agency")[0] == "other"
    assert classify("Assigned", "ASG", "assigned to Triple-A")[0] == "other"


def test_transform_normal_record():
    payload = {
        "transactions": [
            {
                "id": 424242,
                "person": {"id": 691907},
                "typeCode": "CU",
                "typeDesc": "Recalled",
                "fromTeam": {"id": 235},
                "toTeam": {"id": 147},
                "date": "2024-06-01",
                "effectiveDate": "2024-06-02",
                "description": "Recalled from Triple-A",
            }
        ]
    }
    (row,) = transform_transactions(payload)
    assert row == TxRow(
        source_tx_id="424242",
        player_id=691907,
        type="call_up",
        effective_date="2024-06-02",
        announced_at="2024-06-01",
        from_team_id=235,
        to_team_id=147,
        il_detail=None,
        description="Recalled from Triple-A",
        source="statsapi",
    )


def test_transform_missing_fields_are_tolerated():
    payload = {
        "transactions": [
            # no effectiveDate → falls back to `date`; no teams; no id
            {
                "person": {"id": 808},
                "typeDesc": "Placed on 10-Day Injured List",
                "date": "2024-07-10",
                "description": "Placed on the 10-day injured list",
            },
            {"typeDesc": "Signed"},  # no person → dropped
            {"person": {"id": 9}, "typeDesc": "Signed"},  # no date at all → dropped
        ]
    }
    rows = transform_transactions(payload)
    assert len(rows) == 1
    row = rows[0]
    assert row.source_tx_id is None
    assert row.player_id == 808
    assert row.type == "il_on"
    assert row.il_detail == "il_10"
    assert row.effective_date == "2024-07-10"
    assert row.announced_at == "2024-07-10"
    assert row.from_team_id is None and row.to_team_id is None


@pytest.mark.db
def test_upsert_transaction_events_conflicts_on_source_tx_id(db_conn):
    pid = 960000 + (uuid.uuid4().int % 1000)
    team_id = 992000 + (uuid.uuid4().int % 500)
    tx_id = f"tx-{uuid.uuid4()}"
    try:
        with db_conn.cursor() as cur:
            cur.execute(
                "insert into players (mlb_player_id, name_en, lifecycle) "
                "values (%s, 'TX Player', 'tracked')",
                (pid,),
            )
            cur.execute(
                "insert into teams (mlb_team_id, name_en, level) "
                "values (%s, 'TX Team', 'mlb')",
                (team_id,),
            )
        db_conn.commit()

        row = TxRow(
            source_tx_id=tx_id,
            player_id=pid,
            type="call_up",
            effective_date="2024-06-02",
            announced_at="2024-06-01",
            from_team_id=None,
            to_team_id=team_id,
            il_detail=None,
            description="Recalled",
        )
        assert upsert_transaction_events(db_conn, [row]) == 1
        db_conn.commit()

        # Re-upsert same source_tx_id with a changed type → update, not duplicate.
        upsert_transaction_events(
            db_conn, [TxRow(**{**row.__dict__, "type": "send_down"})]
        )
        db_conn.commit()

        with db_conn.cursor() as cur:
            cur.execute(
                "select count(*), max(type) from transaction_events where source_tx_id = %s",
                (tx_id,),
            )
            count, type_now = cur.fetchone()
        assert count == 1
        assert type_now == "send_down"
    finally:
        with db_conn.cursor() as cur:
            cur.execute(
                "delete from transaction_events where source_tx_id = %s", (tx_id,)
            )
            cur.execute("delete from players where mlb_player_id = %s", (pid,))
            cur.execute("delete from teams where mlb_team_id = %s", (team_id,))
        db_conn.commit()
