"""Manual maintenance CLI (spec-03 §7).

Thin operator tools for corrections and backfills that fall outside the two
scheduled batches:

  etl resync --season
      Full 2020→current season-stats re-pull (same work the morning batch does).

  etl resync --gamelog --from YYYY-MM-DD
      Re-fetch historical gameLog data from before the current season (for
      upstream corrections), then reproject.

  etl add-event --player-id N --type T --date YYYY-MM-DD [--to-team-id N]
                [--from-team-id N] [--il-detail il_10] [--description "..."]
                [--announced YYYY-MM-DD]
      Record a manual transaction_event (source='manual') — the sanctioned way to
      fix a projection that disagrees with reality — then reproject.

  etl reproject
      Replay the event stream into player_current_status and recompute
      player_recent_form (no upstream calls).

  etl backfill [--from YYYY-MM-DD | --season YYYY]
      One-time historical gameLog backfill (default 2020→now) so career/season
      highs have a real base. Idempotent, interruption-safe (commits per
      player), then reprojects.

Each command manages its own transaction; commands that hit upstream open a
StatsAPI client exactly like the batch runner (local cache + raw recording).
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import date

import psycopg

from .db import connect
from .sources.game_lines import (
    _tracked_player_ids,
    current_season,
    ingest_player_gamelogs,
)
from .sources.projection import project_all_tracked
from .sources.recent_form import recompute_all_tracked
from .sources.season_stats import make_season_stats_source
from .sources.transactions import insert_manual_event
from .sync import _build_client

logger = logging.getLogger(__name__)

# Mirrors the Drizzle `transaction_type` enum (lib/db/schema/enums.ts).
TRANSACTION_TYPES = (
    "sign",
    "call_up",
    "send_down",
    "trade",
    "dfa",
    "release",
    "declare_fa",
    "assign",
    "il_on",
    "il_off",
    "depart",
    "other",
)


def _reproject(conn: psycopg.Connection) -> None:
    """Replay projection + recompute recent-form, then commit."""
    statuses = project_all_tracked(conn)
    forms = recompute_all_tracked(conn)
    conn.commit()
    print(f"reprojected {statuses} statuses, recomputed {forms} recent-form rows")


def cmd_reproject(args: argparse.Namespace, conn: psycopg.Connection) -> int:
    _reproject(conn)
    return 0


def cmd_resync(args: argparse.Namespace, conn: psycopg.Connection) -> int:
    client = _build_client(conn)
    if args.season:
        make_season_stats_source(client, conn).run()
        conn.commit()
        print("season stats resynced (2020→current)")
        return 0
    # --gamelog: re-pull each tracked player's gameLog for the affected seasons
    start = date.fromisoformat(args.from_date)
    seasons = list(range(start.year, current_season() + 1))
    tracked = _tracked_player_ids(conn)
    batting, pitching = ingest_player_gamelogs(client, conn, tracked, seasons)
    conn.commit()
    print(f"gamelog resynced seasons {seasons[0]}–{seasons[-1]}: {batting} batting, {pitching} pitching lines")
    _reproject(conn)  # new box lines feed recent-form
    return 0


def cmd_backfill(args: argparse.Namespace, conn: psycopg.Connection) -> int:
    """One-time historical gameLog backfill so career/season highs have a base.

    Idempotent (upsert) and interruption-safe: commits after each player, so a
    re-run only redoes players not yet finished. Manual tool, not a batch.
    """
    client = _build_client(conn)
    tracked = _tracked_player_ids(conn)
    if args.season is not None:
        seasons = [args.season]
    elif args.from_date:
        seasons = list(range(date.fromisoformat(args.from_date).year, current_season() + 1))
    else:
        seasons = list(range(2020, current_season() + 1))  # default: full history

    total_b = total_p = 0
    for pid in tracked:
        batting, pitching = ingest_player_gamelogs(client, conn, [pid], seasons)
        conn.commit()  # persist this player's backfill before moving on
        total_b += batting
        total_p += pitching
        print(f"  player {pid}: {batting} batting, {pitching} pitching lines")
    print(
        f"backfill complete: seasons {seasons[0]}–{seasons[-1]}, "
        f"{total_b} batting, {total_p} pitching lines"
    )
    _reproject(conn)
    return 0


def cmd_add_event(args: argparse.Namespace, conn: psycopg.Connection) -> int:
    event_id = insert_manual_event(
        conn,
        player_id=args.player_id,
        type=args.type,
        effective_date=args.date,
        to_team_id=args.to_team_id,
        from_team_id=args.from_team_id,
        il_detail=args.il_detail,
        description=args.description,
        announced_at=args.announced,
    )
    conn.commit()
    print(f"added manual event #{event_id} ({args.type}) for player {args.player_id}")
    _reproject(conn)  # a manual event exists to change the projection — apply it now
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="etl", description="Phobos ETL maintenance CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    p_resync = sub.add_parser("resync", help="re-pull season stats or game logs")
    what = p_resync.add_mutually_exclusive_group(required=True)
    what.add_argument("--season", action="store_true", help="full season-stats re-pull")
    what.add_argument("--gamelog", action="store_true", help="re-sweep game logs from a date")
    p_resync.add_argument("--from", dest="from_date", help="start date YYYY-MM-DD (with --gamelog)")
    p_resync.set_defaults(func=cmd_resync)

    p_add = sub.add_parser("add-event", help="record a manual transaction event")
    p_add.add_argument("--player-id", type=int, required=True)
    p_add.add_argument("--type", choices=TRANSACTION_TYPES, required=True)
    p_add.add_argument("--date", required=True, help="effective date YYYY-MM-DD")
    p_add.add_argument("--to-team-id", type=int, default=None)
    p_add.add_argument("--from-team-id", type=int, default=None)
    p_add.add_argument("--il-detail", default=None, help="e.g. il_10 / il_60")
    p_add.add_argument("--description", default=None)
    p_add.add_argument("--announced", default=None, help="announced date YYYY-MM-DD")
    p_add.set_defaults(func=cmd_add_event)

    p_reproj = sub.add_parser("reproject", help="replay projection + recompute recent-form")
    p_reproj.set_defaults(func=cmd_reproject)

    p_back = sub.add_parser(
        "backfill", help="one-time historical gameLog backfill (default 2020→now)"
    )
    when = p_back.add_mutually_exclusive_group()
    when.add_argument("--from", dest="from_date", help="start date YYYY-MM-DD")
    when.add_argument("--season", type=int, help="a single season YYYY")
    p_back.set_defaults(func=cmd_backfill)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(sys.argv[1:] if argv is None else argv)

    if args.command == "resync" and args.gamelog and not args.from_date:
        parser.error("resync --gamelog requires --from YYYY-MM-DD")

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s"
    )

    with connect() as conn:
        return args.func(args, conn)


if __name__ == "__main__":
    raise SystemExit(main())
