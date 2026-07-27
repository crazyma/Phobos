"""CLI entrypoint: `python -m etl.sync <morning|evening|manual>`.

Opens a connection, builds the batch's sources, runs them, and lands one
`sync_runs` row. Exit code is 0 unless the batch status is `failed`.
"""

from __future__ import annotations

import logging
import sys

import psycopg

from .batch import run_batch
from .cache import FileCache
from .config import CACHE_DIR
from .db import connect
from .raw import store_raw_payload
from .sources import VALID_KINDS, build_sources
from .statsapi import StatsApiClient
from .syncrun import FAILED, PgSyncRunStore


def _build_client(conn: psycopg.Connection) -> StatsApiClient:
    """Wire a StatsAPI client that caches locally and records every raw payload."""
    return StatsApiClient(
        cache=FileCache(CACHE_DIR),
        recorder=lambda **kw: store_raw_payload(conn, **kw),
    )


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if len(argv) != 1 or argv[0] not in VALID_KINDS:
        print(
            f"usage: python -m etl.sync <{'|'.join(VALID_KINDS)}>",
            file=sys.stderr,
        )
        return 2

    kind = argv[0]
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    with connect() as conn:
        store = PgSyncRunStore(conn)
        client = _build_client(conn)
        sources = build_sources(kind, conn, client)
        outcome = run_batch(kind, sources, store)

    print(f"sync_run #{outcome.run_id} [{kind}] -> {outcome.status}")
    return 1 if outcome.status == FAILED else 0


if __name__ == "__main__":
    raise SystemExit(main())
