"""Reference data: StatsAPI teams → curated `teams`.

Reference module for the source-module shape (see the package docstring). Levels
come from the sportId we fetch each set with, and rows are ordered MLB-first so a
minor-league affiliate's `parent_org_team_id` FK resolves within one transaction.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

import psycopg

from ..batch import Source
from ..constants import INGEST_SPORT_IDS, level_for_sport_id, level_rank
from ..statsapi import StatsApiClient


@dataclass(frozen=True)
class TeamRow:
    mlb_team_id: int
    name_en: str
    abbrev: Optional[str]
    level: str
    parent_org_team_id: Optional[int]


def transform_teams(payload: dict[str, Any], *, default_level: str) -> list[TeamRow]:
    """Map a StatsAPI `/teams` payload to `TeamRow`s.

    Level is taken from each team's own `sport.id` when present (robust if a
    payload mixes levels), else `default_level` (the sportId we queried). Teams
    whose level can't be resolved are skipped — `teams.level` is NOT NULL.
    A `parentOrgId` equal to the team itself (MLB orgs) is stored as None.
    """
    rows: list[TeamRow] = []
    for team in payload.get("teams", []):
        team_id = team.get("id")
        name = team.get("name")
        if team_id is None or not name:
            continue

        sport_id = (team.get("sport") or {}).get("id")
        level = level_for_sport_id(sport_id) if sport_id is not None else None
        level = level or default_level
        if level is None:
            continue

        parent = team.get("parentOrgId")
        if parent == team_id:
            parent = None

        rows.append(
            TeamRow(
                mlb_team_id=int(team_id),
                name_en=str(name),
                abbrev=team.get("abbreviation"),
                level=level,
                parent_org_team_id=int(parent) if parent is not None else None,
            )
        )
    return rows


def upsert_teams(conn: psycopg.Connection, rows: list[TeamRow]) -> int:
    """Upsert teams by primary key. Preserves a manually-set `name_zh`.

    Ordered MLB-first so a child's `parent_org_team_id` FK is satisfied within
    the transaction. Does not commit.
    """
    ordered = sorted(rows, key=lambda r: level_rank(r.level))
    count = 0
    with conn.cursor() as cur:
        for row in ordered:
            cur.execute(
                """
                insert into teams
                    (mlb_team_id, name_en, abbrev, level, parent_org_team_id)
                values (%s, %s, %s, %s, %s)
                on conflict (mlb_team_id) do update set
                    name_en = excluded.name_en,
                    abbrev = excluded.abbrev,
                    level = excluded.level,
                    parent_org_team_id = excluded.parent_org_team_id
                """,
                (
                    row.mlb_team_id,
                    row.name_en,
                    row.abbrev,
                    row.level,
                    row.parent_org_team_id,
                ),
            )
            count += 1
    return count


def make_teams_source(client: StatsApiClient, conn: psycopg.Connection) -> Source:
    def run() -> None:
        all_rows: list[TeamRow] = []
        for sport_id in INGEST_SPORT_IDS:
            level = level_for_sport_id(sport_id)
            if level is None:
                continue
            payload = client.get("teams", {"sportId": sport_id})
            all_rows.extend(transform_teams(payload, default_level=level))
        upsert_teams(conn, all_rows)

    return Source("teams", run)
