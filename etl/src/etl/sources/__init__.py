"""Per-batch source registry.

Each source module in this package follows one shape (see `teams.py` as the
reference):

  * a pure ``transform_*(payload) -> list[…Row]`` (no I/O), unit-tested with a
    recorded StatsAPI fixture;
  * an ``upsert_*(conn, rows) -> int`` that `INSERT … ON CONFLICT DO UPDATE`s
    into the Drizzle-owned tables and does **not** commit (the batch runner owns
    the transaction);
  * a ``make_*_source(client, conn) -> Source`` factory wiring fetch → transform
    → upsert into a named :class:`~etl.batch.Source`.

`build_sources(kind, conn, client)` returns the ordered sources a batch runs
(spec-03 §2). Later tickets append their modules here.
"""

from __future__ import annotations

import psycopg

from ..batch import Source
from ..statsapi import StatsApiClient
from .players_bio import make_player_bio_source
from .teams import make_teams_source

VALID_KINDS = ("morning", "evening", "manual")


def build_sources(
    kind: str, conn: psycopg.Connection, client: StatsApiClient
) -> list[Source]:
    if kind not in VALID_KINDS:
        raise ValueError(f"unknown batch kind: {kind!r}")

    # Reference data is low-frequency (spec-03 §3): fold it into the evening
    # sweep and the manual batch; morning stays lean for settlement.
    if kind in ("evening", "manual"):
        return [
            make_teams_source(client, conn),
            make_player_bio_source(client, conn),
        ]
    return []
