"""Raw layer: persist upstream payloads verbatim before transforming them.

Keeping the original StatsAPI response lets us reprocess when transform logic
changes, without re-hitting the network (spec-01 C.10 / ADR §8.1). The row is
insert-only; each fetch appends one.
"""

from __future__ import annotations

from typing import Any

import psycopg
from psycopg.types.json import Json


def _json(value: Any) -> Json | None:
    """Wrap for a jsonb column, mapping Python None → SQL NULL (not 'null')."""
    return None if value is None else Json(value)


def store_raw_payload(
    conn: psycopg.Connection,
    *,
    source: str,
    endpoint: str | None = None,
    params: Any = None,
    payload: Any = None,
) -> int:
    """Append a `raw_payloads` row, returning its id.

    Does not commit — the caller (a source within a batch) owns the transaction
    so a raw insert and its derived upserts commit/rollback together.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into raw_payloads (source, endpoint, params, payload)
            values (%s, %s, %s, %s)
            returning id
            """,
            (source, endpoint, _json(params), _json(payload)),
        )
        row = cur.fetchone()
    assert row is not None  # INSERT ... RETURNING always yields a row
    return int(row[0])
