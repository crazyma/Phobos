"""Per-batch source registry.

`build_sources(kind, conn)` returns the ordered list of `Source`s a batch runs.
Ticket 01 is a walking skeleton, so every batch is empty; later tickets (02–07)
append real source modules here — reference data, transactions/projection,
game lines, season stats, recent-form — keyed by which batch owns them
(spec-03 §2).
"""

from __future__ import annotations

import psycopg

from .batch import Source

VALID_KINDS = ("morning", "evening", "manual")


def build_sources(kind: str, conn: psycopg.Connection) -> list[Source]:
    if kind not in VALID_KINDS:
        raise ValueError(f"unknown batch kind: {kind!r}")
    # No sources yet — the skeleton just proves a batch opens and closes a run.
    return []
