"""sync_runs bookkeeping + batch status derivation.

A run is opened pessimistically as `failed` with no `finished_at`; only a clean
finish rewrites it to `success`/`partial`. That way a process that dies mid-run
leaves a row the site already ignores ("latest non-failed finished_at"), so
stale crashes never masquerade as fresh data (spec-01 C.9 / spec-03 §7).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional, Protocol

import psycopg
from psycopg.types.json import Json

# sync_runs.status values (mirror the Drizzle enum `sync_status`).
SUCCESS = "success"
PARTIAL = "partial"
FAILED = "failed"


@dataclass(frozen=True)
class SourceResult:
    """Outcome of one source module within a batch."""

    name: str
    ok: bool
    error: Optional[str] = None


def derive_status(results: list[SourceResult]) -> str:
    """Map per-source outcomes to a batch status.

    Empty (no sources) or all-ok → success; a mix → partial; every source
    failed → failed. A framework-level crash is handled by the runner, not here.
    """
    if not results:
        return SUCCESS
    ok = sum(1 for r in results if r.ok)
    if ok == len(results):
        return SUCCESS
    if ok == 0:
        return FAILED
    return PARTIAL


def build_detail(results: list[SourceResult]) -> Optional[dict[str, Any]]:
    """A jsonb-friendly summary for `sync_runs.detail`, or None when empty."""
    if not results:
        return None
    return {
        "sources_ok": [r.name for r in results if r.ok],
        "sources_failed": [
            {"source": r.name, "error": r.error} for r in results if not r.ok
        ],
    }


class SyncRunStore(Protocol):
    """Persistence + transaction boundary the batch runner drives."""

    def open_run(self, kind: str) -> int: ...
    def close_run(self, run_id: int, status: str, detail: Optional[dict[str, Any]]) -> None: ...
    def commit(self) -> None: ...
    def rollback(self) -> None: ...


class PgSyncRunStore:
    """`SyncRunStore` backed by a psycopg connection (autocommit off)."""

    def __init__(self, conn: psycopg.Connection) -> None:
        self._conn = conn

    def open_run(self, kind: str) -> int:
        with self._conn.cursor() as cur:
            cur.execute(
                """
                insert into sync_runs (kind, started_at, status)
                values (%s, now(), 'failed')
                returning id
                """,
                (kind,),
            )
            row = cur.fetchone()
        assert row is not None
        return int(row[0])

    def close_run(
        self, run_id: int, status: str, detail: Optional[dict[str, Any]]
    ) -> None:
        with self._conn.cursor() as cur:
            cur.execute(
                """
                update sync_runs
                set status = %s, finished_at = now(), detail = %s
                where id = %s
                """,
                (status, Json(detail) if detail is not None else None, run_id),
            )

    def commit(self) -> None:
        self._conn.commit()

    def rollback(self) -> None:
        self._conn.rollback()
