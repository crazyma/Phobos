"""Tests for the maintenance CLI: arg parsing + add-event/reproject over DB."""

from __future__ import annotations

import uuid

import pytest

from etl.cli import build_parser, cmd_add_event, cmd_reproject
from etl.sources.transactions import insert_manual_event


# ── arg parsing (pure) ───────────────────────────────────────────────────────


def test_parser_requires_a_command():
    with pytest.raises(SystemExit):
        build_parser().parse_args([])


def test_resync_requires_exactly_one_target():
    parser = build_parser()
    with pytest.raises(SystemExit):
        parser.parse_args(["resync"])  # neither --season nor --gamelog
    with pytest.raises(SystemExit):
        parser.parse_args(["resync", "--season", "--gamelog"])  # both


def test_add_event_rejects_unknown_type():
    with pytest.raises(SystemExit):
        build_parser().parse_args(
            ["add-event", "--player-id", "1", "--type", "bogus", "--date", "2024-01-01"]
        )


def test_add_event_parses_full_args():
    args = build_parser().parse_args(
        [
            "add-event", "--player-id", "691907", "--type", "declare_fa",
            "--date", "2024-11-04", "--description", "elected free agency",
        ]
    )
    assert args.player_id == 691907
    assert args.type == "declare_fa"
    assert args.date == "2024-11-04"
    assert args.to_team_id is None


# ── DB-backed command behaviour ──────────────────────────────────────────────


@pytest.mark.db
def test_insert_manual_event_is_source_manual(db_conn):
    pid = 940000 + (uuid.uuid4().int % 1000)
    try:
        with db_conn.cursor() as cur:
            cur.execute(
                "insert into players (mlb_player_id, name_en, lifecycle) values (%s, 'CLI Test', 'tracked')",
                (pid,),
            )
        db_conn.commit()

        eid = insert_manual_event(
            db_conn, player_id=pid, type="sign", effective_date="2024-03-01"
        )
        db_conn.commit()

        with db_conn.cursor() as cur:
            cur.execute(
                "select source, type, source_tx_id from transaction_events where id = %s",
                (eid,),
            )
            assert cur.fetchone() == ("manual", "sign", None)
    finally:
        with db_conn.cursor() as cur:
            cur.execute("delete from transaction_events where player_id = %s", (pid,))
            cur.execute("delete from players where mlb_player_id = %s", (pid,))
        db_conn.commit()


@pytest.mark.db
def test_add_event_then_reproject_updates_status(db_conn, capsys):
    """add-event records a manual roster move and reproject lights up the status."""
    pid = 940000 + (uuid.uuid4().int % 1000)
    team_id = 991234
    try:
        with db_conn.cursor() as cur:
            cur.execute(
                "insert into teams (mlb_team_id, name_en, level) values (%s, 'CLI AAA', 'aaa')",
                (team_id,),
            )
            cur.execute(
                "insert into players (mlb_player_id, name_en, lifecycle) values (%s, 'CLI Reproj', 'tracked')",
                (pid,),
            )
        db_conn.commit()

        args = build_parser().parse_args(
            [
                "add-event", "--player-id", str(pid), "--type", "call_up",
                "--date", "2024-05-01", "--to-team-id", str(team_id),
            ]
        )
        rc = cmd_add_event(args, db_conn)
        assert rc == 0

        with db_conn.cursor() as cur:
            cur.execute(
                "select affiliation, team_id, level from player_current_status where player_id = %s",
                (pid,),
            )
            assert cur.fetchone() == ("rostered", team_id, "aaa")
        # a recent-form row was written too (fallback, since no games)
        with db_conn.cursor() as cur:
            cur.execute(
                "select count(*) from player_recent_form where player_id = %s", (pid,)
            )
            assert cur.fetchone()[0] == 1
    finally:
        with db_conn.cursor() as cur:
            cur.execute("delete from player_recent_form where player_id = %s", (pid,))
            cur.execute("delete from player_current_status where player_id = %s", (pid,))
            cur.execute("delete from transaction_events where player_id = %s", (pid,))
            cur.execute("delete from players where mlb_player_id = %s", (pid,))
            cur.execute("delete from teams where mlb_team_id = %s", (team_id,))
        db_conn.commit()
