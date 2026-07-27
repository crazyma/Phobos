"""Reference data: StatsAPI people → refresh `players` bio columns.

The whitelist (who counts as Taiwanese, plus `name_zh` and `lifecycle`) is
owned by the Node seed and is the source of truth for *which* players exist.
This source only refreshes the *bio* columns (position, handedness, birthdate)
for already-seeded tracked players — it never inserts, and never touches
`lifecycle`, `created_at`, `name_en`, or the manually-curated `name_zh`.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

import psycopg

from ..batch import Source
from ..statsapi import StatsApiClient

_HANDS = {"L", "R", "S"}


@dataclass(frozen=True)
class BioRow:
    player_id: int
    primary_position: Optional[str]
    bats: Optional[str]
    throws: Optional[str]
    birthdate: Optional[str]


def _hand(node: Any) -> Optional[str]:
    code = (node or {}).get("code")
    return code if code in _HANDS else None


def transform_people(payload: dict[str, Any]) -> list[BioRow]:
    """Map a StatsAPI `/people` payload to bio rows (missing fields → None)."""
    rows: list[BioRow] = []
    for person in payload.get("people", []):
        pid = person.get("id")
        if pid is None:
            continue
        position = (person.get("primaryPosition") or {}).get("abbreviation")
        rows.append(
            BioRow(
                player_id=int(pid),
                primary_position=position or None,
                bats=_hand(person.get("batSide")),
                throws=_hand(person.get("pitchHand")),
                birthdate=person.get("birthDate") or None,
            )
        )
    return rows


def upsert_bio(conn: psycopg.Connection, rows: list[BioRow]) -> int:
    """Update bio columns of existing players; returns rows actually updated.

    Whitelist-owned columns (lifecycle, created_at, name_en, name_zh) are left
    untouched. Players not present in the table are ignored (0 rows). No commit.
    """
    updated = 0
    with conn.cursor() as cur:
        for row in rows:
            cur.execute(
                """
                update players set
                    primary_position = %s,
                    bats = %s,
                    throws = %s,
                    birthdate = %s,
                    updated_at = now()
                where mlb_player_id = %s
                """,
                (
                    row.primary_position,
                    row.bats,
                    row.throws,
                    row.birthdate,
                    row.player_id,
                ),
            )
            updated += cur.rowcount
    return updated


def _tracked_player_ids(conn: psycopg.Connection) -> list[int]:
    with conn.cursor() as cur:
        cur.execute(
            "select mlb_player_id from players where lifecycle = 'tracked' order by mlb_player_id"
        )
        return [int(r[0]) for r in cur.fetchall()]


def make_player_bio_source(client: StatsApiClient, conn: psycopg.Connection) -> Source:
    def run() -> None:
        ids = _tracked_player_ids(conn)
        if not ids:
            return
        payload = client.get(
            "people", {"personIds": ",".join(str(i) for i in ids)}
        )
        upsert_bio(conn, transform_people(payload))

    return Source("players_bio", run)
