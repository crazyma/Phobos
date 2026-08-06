"""Shared test fixtures.

Pure tests need nothing here. DB integration tests (marked `db`) get a psycopg
connection and are skipped when Postgres is unreachable, so the default
`uv run pytest` stays green without a database.

That connection always targets the **test** database declared in the repo-root
`.env.test` — never the development `DATABASE_URL` from `.env`. These tests
insert and commit real rows; a fixture player once survived an interrupted run
and showed up on the live roster page. When `.env.test` is missing, points at
the development database, is unreachable, or has no curated schema yet, the db
tests **skip with instructions** rather than silently falling back to `.env`.

Schema ownership: the ETL never migrates (Drizzle owns the curated schema, see
`etl/README.md`), so `phobos_test` gets its tables from the Node side — vitest
runs `migrate()` on every run, or run `pnpm db:migrate` against it once.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from dotenv import dotenv_values

# tests/conftest.py → parents: [0]=tests, [1]=etl, [2]=repo root.
_REPO_ROOT = Path(__file__).resolve().parents[2]
_TEST_ENV = _REPO_ROOT / ".env.test"
_DEV_ENV = _REPO_ROOT / ".env"

_SETUP_HINT = (
    "Set up the test database: `cp .env.example .env.test` and change the "
    "database name to phobos_test (docker compose creates it on first start; "
    "on a local Postgres a superuser must `createdb -O phobos phobos_test` — "
    "see README). Then let Drizzle build the schema there, either with "
    "`pnpm test` (vitest migrates on every run) or "
    '`DATABASE_URL="postgres://phobos:phobos@localhost:5432/phobos_test" '
    "pnpm db:migrate`."
)


def _read_database_url(path: Path) -> str | None:
    if not path.exists():
        return None
    value = dotenv_values(path).get("DATABASE_URL")
    return value.strip() if value else None


def _test_database_url() -> str:
    """Resolve the test DSN from `.env.test`, refusing the development one."""
    dsn = _read_database_url(_TEST_ENV)
    if not dsn:
        missing = "is missing" if not _TEST_ENV.exists() else "has no DATABASE_URL"
        pytest.skip(
            f"{_TEST_ENV} {missing} — db tests need a database of their own "
            f"and never reuse the development one. {_SETUP_HINT}"
        )
    if dsn == _read_database_url(_DEV_ENV):
        pytest.skip(
            f"{_TEST_ENV} points at the same database as {_DEV_ENV}. These "
            "tests commit real rows, so they refuse to run against "
            "development data — change the database name in .env.test to "
            "phobos_test."
        )
    return dsn


@pytest.fixture
def db_conn():
    psycopg = pytest.importorskip("psycopg")
    dsn = _test_database_url()
    try:
        conn = psycopg.connect(dsn, connect_timeout=2)
    except psycopg.OperationalError as exc:
        # psycopg does not expose an sqlstate on connection failures (3.3), so
        # invalid_catalog_name (3D000) is only visible in the server message.
        if "does not exist" in str(exc):
            pytest.skip(f"Test database does not exist: {exc}\n{_SETUP_HINT}")
        pytest.skip(f"Postgres unreachable: {exc}")
    try:
        with conn.cursor() as cur:
            cur.execute("select to_regclass('public.players')")
            if cur.fetchone()[0] is None:
                pytest.skip(
                    "Test database has no curated schema (table `players` is "
                    "missing). The ETL never migrates — Drizzle owns the "
                    f"schema. {_SETUP_HINT}"
                )
        yield conn
    finally:
        conn.rollback()
        conn.close()
