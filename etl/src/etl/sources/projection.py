"""Status projection + roster/IL reconciliation.

`player_current_status` is a *projection*: the current (affiliation × health,
team, level, il_detail) is derived by replaying a player's `transaction_events`
in `(effective_date, announced_at, id)` order (spec-01 B.1/B.3). Events are the
only source of truth — this module never mutates events, only the projection.

Three pieces:
  * `project_status(...)` — the pure state machine (spec-01 B.3), unit-tested
    table-driven incl. out-of-order replay (spec-01 §E);
  * `project_all_tracked(conn)` — full replay for every tracked player at batch
    end (small N) writing `player_current_status`;
  * reconciliation — compares a roster/IL snapshot to the projection and *logs a
    warning* on mismatch; it never auto-corrects (spec-03 §6). Surfacing into
    `sync_runs.detail` is out of reach of the per-source batch API, so a logged
    warning is the signal (see module note below).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Optional

import psycopg

from ..batch import Source
from ..statsapi import StatsApiClient

logger = logging.getLogger(__name__)


# ── Pure projection ────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class EventInput:
    """One event as the projection needs it (a slice of transaction_events)."""

    id: int
    type: str
    effective_date: Any  # str "YYYY-MM-DD" or datetime.date — sorted via str()
    announced_at: Any = None  # str/datetime or None (None sorts first)
    to_team_id: Optional[int] = None
    il_detail: Optional[str] = None


@dataclass(frozen=True)
class ProjectedStatus:
    player_id: int
    affiliation: str
    team_id: Optional[int]
    level: Optional[str]
    health: str
    il_detail: Optional[str]
    as_of_event_id: Optional[int]


# Events that (re)assign the player to a roster; team/level follow `to_team`.
_ROSTER_TYPES = frozenset({"sign", "trade", "call_up", "send_down"})


def _sort_key(e: EventInput) -> tuple[str, str, int]:
    # str() unifies date/datetime/str; ISO strings sort chronologically. A missing
    # announced_at → "" so it sorts before any real timestamp on the same day.
    return (
        str(e.effective_date),
        "" if e.announced_at is None else str(e.announced_at),
        e.id,
    )


def project_status(
    player_id: int,
    events: list[EventInput],
    team_levels: dict[int, str],
) -> Optional[ProjectedStatus]:
    """Replay `events` (any order) → current status, or None if indeterminate.

    Returns None when no event ever establishes an affiliation (e.g. a stream of
    only IL toggles) — `player_current_status.affiliation` is NOT NULL, so we
    write nothing rather than fabricate one. `as_of_event_id` tracks the last
    *state-changing* event ('other' events are timeline-only and don't advance it).
    """
    affiliation: Optional[str] = None
    team_id: Optional[int] = None
    level: Optional[str] = None
    health = "active"
    il_detail: Optional[str] = None
    as_of: Optional[int] = None

    for e in sorted(events, key=_sort_key):
        t = e.type
        if t in _ROSTER_TYPES:
            affiliation = "rostered"
            team_id = e.to_team_id
            level = team_levels.get(e.to_team_id) if e.to_team_id is not None else None
            as_of = e.id
        elif t == "dfa":
            affiliation = "dfa"  # keep prior team/level reference (spec-01 B.3)
            as_of = e.id
        elif t == "release":
            affiliation = "released"
            team_id = level = il_detail = None
            health = "active"
            as_of = e.id
        elif t == "declare_fa":
            affiliation = "free_agent"  # off any roster (spec-01 B.3)
            team_id = level = il_detail = None
            health = "active"
            as_of = e.id
        elif t == "depart":
            affiliation = "departed"
            team_id = level = il_detail = None
            health = "active"
            as_of = e.id
        elif t == "il_on":
            health = "il"
            il_detail = e.il_detail
            as_of = e.id
        elif t == "il_off":
            health = "active"
            il_detail = None
            as_of = e.id
        elif t == "other":
            pass  # timeline-only; no state change
        # unknown types are ignored defensively (enum-constrained upstream)

    if affiliation is None:
        return None
    return ProjectedStatus(
        player_id, affiliation, team_id, level, health, il_detail, as_of
    )


# ── DB replay ──────────────────────────────────────────────────────────────────


def _tracked_player_ids(conn: psycopg.Connection) -> list[int]:
    with conn.cursor() as cur:
        cur.execute(
            "select mlb_player_id from players where lifecycle = 'tracked' order by mlb_player_id"
        )
        return [int(r[0]) for r in cur.fetchall()]


def _load_team_levels(conn: psycopg.Connection) -> dict[int, str]:
    with conn.cursor() as cur:
        cur.execute("select mlb_team_id, level from teams")
        return {int(tid): level for tid, level in cur.fetchall()}


def _load_events_by_player(
    conn: psycopg.Connection, player_ids: list[int]
) -> dict[int, list[EventInput]]:
    events: dict[int, list[EventInput]] = {pid: [] for pid in player_ids}
    if not player_ids:
        return events
    with conn.cursor() as cur:
        cur.execute(
            """
            select id, player_id, type, effective_date, announced_at,
                   to_team_id, il_detail
            from transaction_events
            where player_id = any(%s)
            """,
            (player_ids,),
        )
        for row in cur.fetchall():
            events[int(row[1])].append(
                EventInput(
                    id=int(row[0]),
                    type=row[2],
                    effective_date=row[3],
                    announced_at=row[4],
                    to_team_id=int(row[5]) if row[5] is not None else None,
                    il_detail=row[6],
                )
            )
    return events


def upsert_player_current_status(
    conn: psycopg.Connection, status: ProjectedStatus
) -> None:
    """Upsert the projection for one player (PK = player_id). Does not commit."""
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into player_current_status
                (player_id, affiliation, team_id, level, health, il_detail,
                 as_of_event_id, projected_at)
            values (%s, %s, %s, %s, %s, %s, %s, now())
            on conflict (player_id) do update set
                affiliation = excluded.affiliation,
                team_id = excluded.team_id,
                level = excluded.level,
                health = excluded.health,
                il_detail = excluded.il_detail,
                as_of_event_id = excluded.as_of_event_id,
                projected_at = now()
            """,
            (
                status.player_id,
                status.affiliation,
                status.team_id,
                status.level,
                status.health,
                status.il_detail,
                status.as_of_event_id,
            ),
        )


def project_all_tracked(conn: psycopg.Connection) -> int:
    """Full replay for every tracked player → `player_current_status`.

    Returns the number of players whose status was written (those with a
    determinable affiliation). No commit — the batch runner owns the transaction.
    """
    ids = _tracked_player_ids(conn)
    if not ids:
        return 0
    team_levels = _load_team_levels(conn)
    events_by_player = _load_events_by_player(conn, ids)
    written = 0
    for pid in ids:
        status = project_status(pid, events_by_player[pid], team_levels)
        if status is None:
            continue
        upsert_player_current_status(conn, status)
        written += 1
    return written


def make_projection_source(
    _client: StatsApiClient, conn: psycopg.Connection
) -> Source:
    """Batch-end projection (spec-03 §6). Runs after the transactions source so it
    replays the events that batch just committed."""

    def run() -> None:
        project_all_tracked(conn)

    return Source("projection", run)


# ── Reconciliation (signal only; never auto-corrects) ──────────────────────────


@dataclass(frozen=True)
class StatusRef:
    """The projection facts reconciliation cares about."""

    team_id: Optional[int]
    health: str  # "active" | "il"


@dataclass(frozen=True)
class RosterSnapshotEntry:
    """An observed roster/IL fact for one player (from StatsAPI)."""

    player_id: int
    team_id: Optional[int]
    on_il: Optional[bool]  # None = upstream didn't tell us


@dataclass(frozen=True)
class Mismatch:
    player_id: int
    field: str  # "team" | "health"
    projected: Any
    observed: Any


def reconcile(
    projected: dict[int, StatusRef], observed: list[RosterSnapshotEntry]
) -> list[Mismatch]:
    """Pure comparison of projection vs. observed snapshot → mismatches.

    Only compares a field when the observation carries it (team_id / on_il not
    None) and the player exists in both. Never mutates anything.
    """
    out: list[Mismatch] = []
    for entry in observed:
        ref = projected.get(entry.player_id)
        if ref is None:
            continue
        if entry.team_id is not None and ref.team_id != entry.team_id:
            out.append(
                Mismatch(entry.player_id, "team", ref.team_id, entry.team_id)
            )
        if entry.on_il is not None:
            projected_il = ref.health == "il"
            if projected_il != entry.on_il:
                out.append(
                    Mismatch(entry.player_id, "health", ref.health, "il" if entry.on_il else "active")
                )
    return out


def _observed_on_il(person: dict[str, Any]) -> Optional[bool]:
    # Best-effort: the /people status node isn't reliably present, so IL is often
    # unknown (None). See report — full IL reconciliation wants a team roster
    # snapshot with per-entry status codes.
    status = person.get("status") or {}
    desc = (status.get("description") or "").lower()
    if not desc:
        return None
    if "injured" in desc or "disabled" in desc:
        return True
    if "active" in desc:
        return False
    return None


def transform_roster_snapshot(payload: dict[str, Any]) -> list[RosterSnapshotEntry]:
    """Map a StatsAPI `/people?hydrate=currentTeam` payload to snapshot entries."""
    entries: list[RosterSnapshotEntry] = []
    for person in payload.get("people", []):
        pid = person.get("id")
        if pid is None:
            continue
        team = person.get("currentTeam") or {}
        team_id = team.get("id")
        entries.append(
            RosterSnapshotEntry(
                player_id=int(pid),
                team_id=int(team_id) if team_id is not None else None,
                on_il=_observed_on_il(person),
            )
        )
    return entries


def _load_status_refs(
    conn: psycopg.Connection, player_ids: list[int]
) -> dict[int, StatusRef]:
    refs: dict[int, StatusRef] = {}
    if not player_ids:
        return refs
    with conn.cursor() as cur:
        cur.execute(
            """
            select player_id, team_id, health
            from player_current_status
            where player_id = any(%s)
            """,
            (player_ids,),
        )
        for pid, team_id, health in cur.fetchall():
            refs[int(pid)] = StatusRef(
                team_id=int(team_id) if team_id is not None else None, health=health
            )
    return refs


def make_reconciliation_source(
    client: StatsApiClient, conn: psycopg.Connection
) -> Source:
    """Compare a roster/IL snapshot to the projection and warn on mismatch.

    Runs after projection. Does NOT change the projection — a mismatch means
    upstream and our event stream disagree, and the fix is to add a manual event
    (spec-03 §6), which a human does out-of-band.
    """

    def run() -> None:
        ids = _tracked_player_ids(conn)
        if not ids:
            return
        payload = client.get(
            "people",
            {"personIds": ",".join(str(i) for i in ids), "hydrate": "currentTeam"},
        )
        observed = transform_roster_snapshot(payload)
        projected = _load_status_refs(conn, ids)
        for m in reconcile(projected, observed):
            logger.warning(
                "reconciliation mismatch: player %s %s projected=%r observed=%r "
                "(events are truth; add a manual '%s' event if upstream is right)",
                m.player_id,
                m.field,
                m.projected,
                m.observed,
                "depart/trade" if m.field == "team" else "il_on/il_off",
            )

    return Source("reconciliation", run)
