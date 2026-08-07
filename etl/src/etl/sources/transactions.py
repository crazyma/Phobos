"""Transactions: StatsAPI `transactions` → curated `transaction_events`.

`transaction_events` is the single source of truth for a player's movement
(spec-01 B.1); the current status is a *projection* replayed from these rows
(see `projection.py`). This module only ingests the event stream.

Mapping StatsAPI's `typeDesc`/`typeCode` onto the curated `transaction_type`
enum is the crux. The exact upstream string set is not empirically frozen
(spec-03 §9), so classification is deliberately forgiving: it matches on
lower-cased substrings of `typeDesc` (falling back to `typeCode`), detects
injured-list placements/activations, and defaults anything unrecognised — waiver
claims included, per the ticket — to `other` (timeline-only, no state change).
The concrete strings mapped are enumerated in `_TYPEDESC_RULES` so the
consolidator can backfill spec-01 §F.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, replace
from datetime import date
from typing import Any, Optional

import psycopg

from ..batch import Source
from ..statsapi import StatsApiClient

logger = logging.getLogger(__name__)

STATSAPI_SOURCE = "statsapi"

# Earliest date we backfill transactions from (curated data starts 2020, spec-01 A.3).
TRANSACTIONS_START_DATE = "2020-01-01"


@dataclass(frozen=True)
class TxRow:
    source_tx_id: Optional[str]
    player_id: int
    type: str
    effective_date: str
    announced_at: Optional[str]
    from_team_id: Optional[int]
    to_team_id: Optional[int]
    il_detail: Optional[str]
    description: Optional[str]
    source: str = STATSAPI_SOURCE


# Ordered (typeDesc / typeCode substring) → transaction_type rules. First hit
# wins, so put the specific IL/roster verbs before broad ones. Keys are matched
# case-insensitively against `typeDesc`, then `typeCode`.
#
# NOTE (spec-03 §9): these strings are best-effort, not upstream-verified. Any
# `typeDesc` not matched here → 'other'. Injured-list rows are handled separately
# below (they carry an IL detail and map to il_on / il_off, not this table).
_TYPEDESC_RULES: tuple[tuple[str, str], ...] = (
    ("designated for assignment", "dfa"),
    ("designated", "dfa"),
    ("declared free agency", "declare_fa"),  # → affiliation free_agent (spec-01 B.3)
    ("released", "release"),
    ("recalled", "call_up"),
    ("selected", "call_up"),  # "Selected the contract of" → onto MLB roster
    ("purchased", "call_up"),  # contract purchased → onto MLB roster
    ("optioned", "send_down"),
    ("outrighted", "send_down"),
    ("signed as free agent", "sign"),
    ("signed", "sign"),
    ("claimed off waivers", "waiver_claim"),  # → rostered 於 to_team（spec-01 B.3）
    ("traded", "trade"),
    ("trade", "trade"),
    ("retired", "depart"),
)

# typeCode fallbacks (StatsAPI short codes) for when typeDesc is empty/odd.
# Codes confirmed against live 2024 data (see spec-03 §9 note in the report).
# `DFA` is "Declared Free Agency" (NOT designation — that's `DES`).
# Deliberately NOT mapped, so they fall through to 'other' (or, for ASG, are
# resolved earlier by the "assigned to" description check → 'assign'):
#   SC  = "Status Change" (IL rows handled above by description; other SC = other)
#   ASG = "Assigned" (real minor-league assignments → 'assign' via the
#         "assigned to [team]" phrase; spring-training invites / rehab
#         assignments keep 'other');
#   RTN = "Returned"; NUM = "Number Change".
_TYPECODE_RULES: dict[str, str] = {
    "SFA": "sign",
    "SGN": "sign",
    "TR": "trade",
    "CLW": "waiver_claim",  # Claimed Off Waivers — a roster move, not a trade
    "CU": "call_up",  # Recalled
    "SE": "call_up",  # Selected
    "PU": "call_up",  # Purchased
    "OPT": "send_down",
    "OUT": "send_down",  # Outrighted
    "DES": "dfa",  # Designated for Assignment
    "REL": "release",
    "DFA": "declare_fa",  # Declared Free Agency → affiliation free_agent
    "RET": "depart",
}

# IL day-length tokens → curated `il_detail`. Matched against typeDesc/description.
_IL_DETAIL_TOKENS: tuple[tuple[str, str], ...] = (
    ("60-day", "il_60"),
    ("60 day", "il_60"),
    ("15-day", "il_15"),
    ("15 day", "il_15"),
    ("10-day", "il_10"),
    ("10 day", "il_10"),
    ("7-day", "il_7"),
    ("7 day", "il_7"),
)


def _il_detail(text: str) -> Optional[str]:
    for token, detail in _IL_DETAIL_TOKENS:
        if token in text:
            return detail
    return None


def _is_il_placement(text: str) -> bool:
    return ("injured list" in text or "disabled list" in text) and (
        "placed" in text or "transferred" in text or "moved" in text
    )


def _is_il_activation(text: str) -> bool:
    activated = "activated" in text or "reinstated" in text
    return activated and ("injured list" in text or "disabled list" in text or "from the" in text)


def classify(type_desc: str, type_code: str, description: str) -> tuple[str, Optional[str]]:
    """Return (transaction_type, il_detail) for one StatsAPI transaction.

    Injured-list rows take precedence (they map to il_on/il_off and carry an
    il_detail); otherwise the first `_TYPEDESC_RULES` substring hit wins, then a
    `_TYPECODE_RULES` fallback, else 'other'.
    """
    haystack = f"{type_desc} {description}".lower()

    if _is_il_activation(haystack):
        return "il_off", None
    if _is_il_placement(haystack):
        return "il_on", _il_detail(haystack)

    # Minor-league assignment (typeCode ASG, typeDesc "Assigned"): move the
    # player to the to_team's team/level (spec-01 B.3). typeDesc alone can't
    # decide this — spring-training invites and rehab assignments *also* carry
    # ASG/"Assigned" — so we key on the "assigned to [team]" phrase in the
    # description, which appears ONLY in real assignments:
    #   • "invited non-roster … to spring training"  → no "assigned to" → other
    #     (not put on a roster; its to_team is often an MLB club — never rostered)
    #   • "sent … on a rehab assignment to …"        → "assignment to", not
    #     "assigned to" → other (player stays on their real roster)
    #   • national-team activations ("Chinese Taipei activated …") are typeCode
    #     SC and carry no "assigned to" → other
    #
    # Match against `description` ONLY — never the typeDesc-prefixed haystack:
    # typeDesc is the bare word "Assigned", so "Assigned " + a description
    # starting with "To…" (e.g. "…Toledo Mud Hens sent … on a rehab assignment")
    # would spuriously contain the substring "assigned to".
    if "assigned to" in description.lower():
        return "assign", None

    desc_l = type_desc.lower()
    for token, tx_type in _TYPEDESC_RULES:
        # Word-boundary match so "signed" doesn't fire on "as·signed" (a
        # minor-league assignment), etc.
        if re.search(rf"\b{re.escape(token)}\b", desc_l):
            return tx_type, None

    code_type = _TYPECODE_RULES.get(type_code.upper())
    if code_type is not None:
        return code_type, None

    return "other", None


def _team_id(node: Any) -> Optional[int]:
    tid = (node or {}).get("id")
    return int(tid) if tid is not None else None


def transform_transactions(payload: dict[str, Any]) -> list[TxRow]:
    """Map a StatsAPI `/transactions` payload to `TxRow`s.

    Skips rows with no player id or no usable date. `effective_date` prefers
    `effectiveDate`, falling back to the announcement `date`; `announced_at`
    keeps the announcement `date` (StatsAPI supplies no wall-clock time, so this
    is a stable, meaningful tie-breaker behind `effective_date`).
    """
    rows: list[TxRow] = []
    for tx in payload.get("transactions", []):
        person = tx.get("person") or {}
        pid = person.get("id")
        if pid is None:
            continue

        announced = tx.get("date")
        effective = tx.get("effectiveDate") or announced
        if not effective:
            continue

        type_desc = tx.get("typeDesc") or ""
        type_code = tx.get("typeCode") or ""
        description = tx.get("description") or ""
        tx_type, il_detail = classify(type_desc, type_code, description)

        tx_id = tx.get("id")
        rows.append(
            TxRow(
                source_tx_id=str(tx_id) if tx_id is not None else None,
                player_id=int(pid),
                type=tx_type,
                effective_date=str(effective),
                announced_at=str(announced) if announced else None,
                from_team_id=_team_id(tx.get("fromTeam")),
                to_team_id=_team_id(tx.get("toTeam")),
                il_detail=il_detail,
                description=description or None,
            )
        )
    return rows


def sanitize_team_refs(
    rows: list[TxRow], known_team_ids: set[int]
) -> tuple[list[TxRow], set[int]]:
    """Null out from/to team refs pointing at teams we don't have.

    A player's transaction history spans their *whole* career, so it can name
    teams outside the ingested sportIds — foreign/winter/college leagues, defunct
    clubs (e.g. team 3296) — whose FK would otherwise abort the entire source.
    We keep the event (its type/date/il_detail are what the projection replays)
    and drop only the unresolvable team pointer, best-effort per spec-03 §7.
    Returns the cleaned rows plus the set of dropped team ids (for logging).
    """
    dropped: set[int] = set()
    cleaned: list[TxRow] = []
    for r in rows:
        from_id = r.from_team_id if r.from_team_id in known_team_ids else None
        to_id = r.to_team_id if r.to_team_id in known_team_ids else None
        if r.from_team_id is not None and from_id is None:
            dropped.add(r.from_team_id)
        if r.to_team_id is not None and to_id is None:
            dropped.add(r.to_team_id)
        if from_id == r.from_team_id and to_id == r.to_team_id:
            cleaned.append(r)
        else:
            cleaned.append(replace(r, from_team_id=from_id, to_team_id=to_id))
    return cleaned, dropped


def upsert_transaction_events(conn: psycopg.Connection, rows: list[TxRow]) -> int:
    """Upsert events by `source_tx_id` (spec-01 C.3). Does not commit.

    Rows carrying a `source_tx_id` conflict-update on it. Rows without one (never
    produced here, but kept faithful to the contract) fall back to a plain
    insert; the `(player_id, type, effective_date, to_team_id)` natural key from
    spec-01 is reserved for manually-added events and enforced there.
    """
    count = 0
    with conn.cursor() as cur:
        for row in rows:
            cur.execute(
                """
                insert into transaction_events
                    (source_tx_id, player_id, type, effective_date, announced_at,
                     from_team_id, to_team_id, il_detail, description, source)
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                on conflict (source_tx_id) do update set
                    player_id = excluded.player_id,
                    type = excluded.type,
                    effective_date = excluded.effective_date,
                    announced_at = excluded.announced_at,
                    from_team_id = excluded.from_team_id,
                    to_team_id = excluded.to_team_id,
                    il_detail = excluded.il_detail,
                    description = excluded.description,
                    source = excluded.source
                """,
                (
                    row.source_tx_id,
                    row.player_id,
                    row.type,
                    row.effective_date,
                    row.announced_at,
                    row.from_team_id,
                    row.to_team_id,
                    row.il_detail,
                    row.description,
                    row.source,
                ),
            )
            count += 1
    return count


def insert_manual_event(
    conn: psycopg.Connection,
    *,
    player_id: int,
    type: str,
    effective_date: str,
    to_team_id: Optional[int] = None,
    from_team_id: Optional[int] = None,
    il_detail: Optional[str] = None,
    description: Optional[str] = None,
    announced_at: Optional[str] = None,
) -> int:
    """Insert a manually-added event (source='manual', no source_tx_id).

    For human corrections when upstream and the projection disagree (spec-03
    §6/§7) — the fix is a manual event, never editing the projection directly.
    Returns the new event id. Does not commit.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into transaction_events
                (source_tx_id, player_id, type, effective_date, announced_at,
                 from_team_id, to_team_id, il_detail, description, source)
            values (null, %s, %s, %s, %s, %s, %s, %s, %s, 'manual')
            returning id
            """,
            (
                player_id,
                type,
                effective_date,
                announced_at,
                from_team_id,
                to_team_id,
                il_detail,
                description,
            ),
        )
        row = cur.fetchone()
    assert row is not None
    return int(row[0])


def _tracked_player_ids(conn: psycopg.Connection) -> list[int]:
    with conn.cursor() as cur:
        cur.execute(
            "select mlb_player_id from players where lifecycle = 'tracked' order by mlb_player_id"
        )
        return [int(r[0]) for r in cur.fetchall()]


def _known_team_ids(conn: psycopg.Connection) -> set[int]:
    with conn.cursor() as cur:
        cur.execute("select mlb_team_id from teams")
        return {int(r[0]) for r in cur.fetchall()}


def make_transactions_source(client: StatsApiClient, conn: psycopg.Connection) -> Source:
    """Fetch each tracked player's transactions and upsert them.

    One request per player (small N) keyed by `playerId` over the curated date
    window. Team refs are sanitized against the teams we actually have before
    upsert: a career-spanning history can name teams outside the ingested
    sportIds, and those FKs must not abort the source (spec-03 §7).
    """

    def run() -> list[dict[str, Any]] | None:
        ids = _tracked_player_ids(conn)
        if not ids:
            return
        end_date = date.today().isoformat()
        all_rows: list[TxRow] = []
        for pid in ids:
            payload = client.get(
                "transactions",
                {
                    "playerId": pid,
                    "startDate": TRANSACTIONS_START_DATE,
                    "endDate": end_date,
                },
            )
            all_rows.extend(transform_transactions(payload))
        cleaned, dropped = sanitize_team_refs(all_rows, _known_team_ids(conn))
        if dropped:
            logger.warning(
                "transactions: nulled %d team ref(s) not in teams (outside ingested "
                "sportIds): %s",
                len(dropped),
                sorted(dropped),
            )
        warnings = (
            [{"kind": "team_refs_sanitized", "team_ids": sorted(dropped)}]
            if dropped
            else []
        )
        upsert_transaction_events(conn, cleaned)
        return warnings or None

    return Source("transactions", run)
