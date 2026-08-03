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
from .game_lines import make_game_lines_source
from .games import make_games_source
from .players_bio import make_player_bio_source
from .projection import make_projection_source, make_reconciliation_source
from .recent_form import make_recent_form_source
from .season_stats import make_season_stats_source
from .savant import make_savant_source
from .teams import make_teams_source
from .transactions import make_transactions_source

VALID_KINDS = ("morning", "evening", "manual")


def build_sources(
    kind: str, conn: psycopg.Connection, client: StatsApiClient
) -> list[Source]:
    if kind not in VALID_KINDS:
        raise ValueError(f"unknown batch kind: {kind!r}")

    sources: list[Source] = []

    # Reference data is low-frequency (spec-03 §3): fold it into the evening
    # sweep and the manual batch; morning stays lean for settlement.
    if kind in ("evening", "manual"):
        sources.append(make_teams_source(client, conn))
        sources.append(make_player_bio_source(client, conn))

    # Schedule (previews + settled-day anchor) and box lines both run in both
    # batches. Box lines now come from each tracked player's own gameLog
    # (spec-03 §3), so they no longer depend on the schedule source's rows;
    # order between them is immaterial.
    if kind in ("morning", "evening"):
        sources.append(make_games_source(client, conn))
        sources.append(make_game_lines_source(client, conn, kind=kind))

    # Season stats are a full re-pull every morning (spec-03 §3): the small
    # tracked-player count makes 2020→current affordable. Independent of the
    # event sources, so ordering among them doesn't matter.
    if kind == "morning":
        sources.append(make_season_stats_source(client, conn))
        # Savant updates only xwOBA, and needs the season-stats source to have
        # created the MLB rows first.
        sources.append(make_savant_source(client, conn))

    # Transactions ingest: evening (primary) + morning (backfill) + manual
    # (spec-03 §2/§3). Runs before projection so the events it commits are
    # replayed within this same batch.
    if kind in ("morning", "evening", "manual"):
        sources.append(make_transactions_source(client, conn))

    # Batch-end status projection: full replay for all tracked players
    # (spec-03 §6). Every event-touching batch recomputes it, after transactions.
    if kind in ("morning", "evening", "manual"):
        sources.append(make_projection_source(client, conn))

    # Recent-form one-liner recompute (spec-03 §5): after projection so the
    # status_fallback sees the freshly-projected status; after game lines so it
    # sees the latest box scores.
    if kind in ("morning", "evening", "manual"):
        sources.append(make_recent_form_source(client, conn))

    # roster/IL reconciliation (signal only, never auto-corrects; spec-03 §6):
    # the snapshot is fetched in the evening sweep; manual runs it too.
    if kind in ("evening", "manual"):
        sources.append(make_reconciliation_source(client, conn))

    return sources
