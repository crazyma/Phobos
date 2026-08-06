"""Batch orchestration with source-level isolation.

Each source runs inside its own transaction: success commits, failure rolls back
just that source's writes and is recorded — the batch never aborts on a single
source (spec-03 §7). The derived status is written when the batch finishes; a
framework-level crash forces `failed` so the site keeps serving old data.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Callable

from .syncrun import (
    FAILED,
    SourceResult,
    SyncRunStore,
    WarningDetail,
    build_detail,
    derive_status,
)
from .warnings import collect_warnings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Source:
    """A named unit of ingest work. `run` closes over whatever it needs (conn)."""

    name: str
    run: Callable[[], list[WarningDetail] | None]


@dataclass(frozen=True)
class BatchOutcome:
    run_id: int
    status: str
    results: list[SourceResult]


def run_batch(kind: str, sources: list[Source], store: SyncRunStore) -> BatchOutcome:
    """Run one batch's sources, then land its `sync_runs` row.

    `sources` may be empty (a walking-skeleton batch still opens + closes a run).
    """
    run_id = store.open_run(kind)
    store.commit()  # persist the 'failed' placeholder immediately

    results: list[SourceResult] = []
    try:
        for source in sources:
            try:
                with collect_warnings() as reported_warnings:
                    source_warnings = source.run() or []
                warnings = source_warnings + reported_warnings
                store.commit()
                results.append(SourceResult(source.name, ok=True, warnings=warnings))
            except Exception as exc:  # noqa: BLE001 — isolate the failing source
                store.rollback()
                logger.warning("source %s failed: %r", source.name, exc)
                results.append(SourceResult(source.name, ok=False, error=repr(exc)))

        status = derive_status(results)
        store.close_run(run_id, status, build_detail(results))
        store.commit()
    except Exception as exc:  # noqa: BLE001 — framework-level fatal
        logger.exception("batch %s failed fatally", kind)
        store.rollback()
        store.close_run(run_id, FAILED, {"fatal": repr(exc)})
        store.commit()
        raise

    return BatchOutcome(run_id=run_id, status=status, results=results)
