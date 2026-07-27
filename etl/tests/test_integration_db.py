"""DB integration tests against the real curated schema (marked `db`).

These prove the contract touchpoints the ticket calls out: a raw payload lands,
a sync_run transitions open→close, and a failing source rolls back only its own
writes while the batch still records `partial`. Skipped when Postgres is
unreachable (see conftest).
"""

from __future__ import annotations

import uuid

import pytest

from etl.batch import Source, run_batch
from etl.raw import store_raw_payload
from etl.syncrun import PgSyncRunStore

pytestmark = pytest.mark.db


def _count_raw(conn, source: str) -> int:
    with conn.cursor() as cur:
        cur.execute("select count(*) from raw_payloads where source = %s", (source,))
        return int(cur.fetchone()[0])


def test_store_raw_payload_lands_a_row(db_conn):
    tag = f"test-raw-{uuid.uuid4()}"
    try:
        raw_id = store_raw_payload(
            db_conn,
            source=tag,
            endpoint="teams",
            params={"sportId": 1},
            payload={"teams": [{"id": 133}]},
        )
        db_conn.commit()

        with db_conn.cursor() as cur:
            cur.execute(
                "select source, endpoint, params, payload from raw_payloads where id = %s",
                (raw_id,),
            )
            row = cur.fetchone()
        assert row[0] == tag
        assert row[1] == "teams"
        assert row[2] == {"sportId": 1}
        assert row[3] == {"teams": [{"id": 133}]}
    finally:
        with db_conn.cursor() as cur:
            cur.execute("delete from raw_payloads where source = %s", (tag,))
        db_conn.commit()


def test_empty_batch_records_success_run(db_conn):
    store = PgSyncRunStore(db_conn)
    outcome = run_batch("manual", [], store)
    try:
        assert outcome.status == "success"
        with db_conn.cursor() as cur:
            cur.execute(
                "select kind, status, started_at, finished_at from sync_runs where id = %s",
                (outcome.run_id,),
            )
            kind, status, started_at, finished_at = cur.fetchone()
        assert kind == "manual"
        assert status == "success"
        assert started_at is not None
        assert finished_at is not None  # closed, so the footer will pick it up
    finally:
        with db_conn.cursor() as cur:
            cur.execute("delete from sync_runs where id = %s", (outcome.run_id,))
        db_conn.commit()


def test_failing_source_rolls_back_only_itself(db_conn):
    ok_tag = f"test-ok-{uuid.uuid4()}"
    bad_tag = f"test-bad-{uuid.uuid4()}"

    def ok_run():
        store_raw_payload(db_conn, source=ok_tag, payload={"n": 1})

    def bad_run():
        # writes, then blows up: this write must not survive
        store_raw_payload(db_conn, source=bad_tag, payload={"n": 2})
        raise RuntimeError("kaboom")

    store = PgSyncRunStore(db_conn)
    sources = [Source("ok", ok_run), Source("bad", bad_run)]
    outcome = run_batch("evening", sources, store)
    try:
        assert outcome.status == "partial"
        assert _count_raw(db_conn, ok_tag) == 1  # committed
        assert _count_raw(db_conn, bad_tag) == 0  # rolled back
    finally:
        with db_conn.cursor() as cur:
            cur.execute(
                "delete from raw_payloads where source in (%s, %s)", (ok_tag, bad_tag)
            )
            cur.execute("delete from sync_runs where id = %s", (outcome.run_id,))
        db_conn.commit()
