"""Shared test fixtures.

Pure tests need nothing here. DB integration tests (marked `db`) get a psycopg
connection to the curated schema and are skipped when Postgres is unreachable,
so the default `uv run pytest` stays green without a database.
"""

from __future__ import annotations

import pytest

from etl.config import get_database_url


@pytest.fixture
def db_conn():
    psycopg = pytest.importorskip("psycopg")
    try:
        dsn = get_database_url()
    except RuntimeError as exc:  # DATABASE_URL unset
        pytest.skip(str(exc))
    try:
        conn = psycopg.connect(dsn, connect_timeout=2)
    except psycopg.OperationalError as exc:
        pytest.skip(f"Postgres unreachable: {exc}")
    try:
        yield conn
    finally:
        conn.rollback()
        conn.close()
