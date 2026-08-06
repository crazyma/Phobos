"""Raw-layer retention: age `raw_payloads` rows out by endpoint class.

The raw layer exists so transform logic can be rewritten and replayed without
re-hitting upstream (ADR §8.1). That promise has no time dimension, and the
table only ever grew — it was 40% of the whole database while holding barely a
week of data.

Deduplication is not the lever: measured, content-hashing the biggest endpoint
saved 1.4% and keeping one row per ``(endpoint, params)`` saved 14%, because
``params`` embeds dates and each gameLog pull is genuinely a byte different.
What varies is how long a payload stays *worth* keeping, so retention is graded
per endpoint (:data:`RETENTION_RULES`): the small, interpretation-heavy
``transactions`` history outlives the bulky player-stats pulls, where each new
payload fully supersedes the last.

Rows whose ``(source, endpoint)`` matches no rule are **kept and reported** as a
warning rather than guessed at — a new endpoint must be classified deliberately,
never aged out by a catch-all default.
"""

from __future__ import annotations

import fnmatch
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Optional, Sequence

import psycopg

from ..batch import Source

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RetentionRule:
    """How long one class of raw payload is kept, matched SQL-LIKE style."""

    name: str
    source: str
    endpoint_like: str  # '%' wildcard, as in SQL LIKE
    days: int


# Graded by "how much would we regret losing this", most valuable first. The
# 2026-08-06 measurement behind the ordering: player stats + Savant are 85% of
# the bytes and are fully re-fetchable; `transactions` is 6% and is the basis on
# which status projection is interpreted.
RETENTION_RULES: tuple[RetentionRule, ...] = (
    # The event history projection is replayed from — smallest and most costly
    # to lose, since a re-fetch cannot recover how upstream once phrased it.
    RetentionRule("transactions", "statsapi", "transactions", 365),
    # Near-static bio; kept a season so an upstream correction stays inspectable.
    RetentionRule("player_bio", "statsapi", "people", 90),
    # Reference data, fetched only in the evening/manual batches and sometimes
    # skipped for days — 60 keeps a copy alive across a quiet stretch.
    RetentionRule("teams", "statsapi", "teams", 60),
    # Superseded by the curated `games` rows once a game settles.
    RetentionRule("schedule", "statsapi", "schedule", 30),
    # 64% of the bytes; each pull returns the full season, so the newest payload
    # completely contains every older one.
    RetentionRule("player_stats", "statsapi", "people/%/stats", 14),
    # Same story: re-pullable per season, newest wins.
    RetentionRule("savant", "savant", "%", 14),
)


@dataclass(frozen=True)
class RawRow:
    """The identifying slice of a `raw_payloads` row (never its payload)."""

    id: int
    source: str
    endpoint: Optional[str]
    fetched_at: datetime


@dataclass(frozen=True)
class PrunePlan:
    """What a sweep would delete, and what it did not recognise."""

    expired_ids: list[int] = field(default_factory=list)
    deleted_by_rule: dict[str, int] = field(default_factory=dict)
    unclassified: list[tuple[str, Optional[str]]] = field(default_factory=list)


def _like_matches(pattern: str, value: str) -> bool:
    """SQL LIKE, restricted to the '%' wildcard our rules actually use."""
    return fnmatch.fnmatchcase(value, pattern.replace("%", "*"))


def rule_for(
    source: str,
    endpoint: Optional[str],
    rules: Sequence[RetentionRule] = RETENTION_RULES,
) -> Optional[RetentionRule]:
    """First matching rule, or None when the endpoint is unrecognised."""
    for rule in rules:
        if rule.source == source and _like_matches(rule.endpoint_like, endpoint or ""):
            return rule
    return None


def plan_prune(
    rows: Iterable[RawRow],
    *,
    now: datetime,
    rules: Sequence[RetentionRule] = RETENTION_RULES,
) -> PrunePlan:
    """Pure: decide which rows have outlived their class's retention."""
    plan = PrunePlan()
    seen_unclassified: set[tuple[str, Optional[str]]] = set()
    for row in rows:
        rule = rule_for(row.source, row.endpoint, rules)
        if rule is None:
            key = (row.source, row.endpoint)
            if key not in seen_unclassified:
                seen_unclassified.add(key)
                plan.unclassified.append(key)
            continue
        if row.fetched_at < now - timedelta(days=rule.days):
            plan.expired_ids.append(row.id)
            plan.deleted_by_rule[rule.name] = plan.deleted_by_rule.get(rule.name, 0) + 1
    return plan


def load_raw_rows(conn: psycopg.Connection) -> list[RawRow]:
    """Every row's identity — deliberately never selecting `payload`."""
    with conn.cursor() as cur:
        cur.execute("select id, source, endpoint, fetched_at from raw_payloads")
        return [RawRow(int(i), s, e, f) for i, s, e, f in cur.fetchall()]


def delete_raw_payloads(conn: psycopg.Connection, ids: Sequence[int]) -> int:
    """Delete by id. Does not commit — the caller owns the transaction."""
    if not ids:
        return 0
    with conn.cursor() as cur:
        cur.execute("delete from raw_payloads where id = any(%s)", (list(ids),))
        return cur.rowcount


def prune_raw_payloads(
    conn: psycopg.Connection,
    *,
    now: Optional[datetime] = None,
    rules: Sequence[RetentionRule] = RETENTION_RULES,
    dry_run: bool = False,
) -> PrunePlan:
    """Age out expired raw payloads, returning what was (or would be) removed."""
    plan = plan_prune(
        load_raw_rows(conn), now=now or datetime.now(timezone.utc), rules=rules
    )
    if not dry_run:
        delete_raw_payloads(conn, plan.expired_ids)
    return plan


def make_raw_retention_source(conn: psycopg.Connection) -> Source:
    """Batch-tail sweep (spec-03 §7).

    Runs as an ordinary source, so it gets the same isolation as every other:
    its deletes commit on their own and a failure here rolls back only the
    sweep, leaving the batch's ingested data alone.
    """

    def run() -> list[dict[str, Any]] | None:
        plan = prune_raw_payloads(conn)
        if plan.expired_ids:
            logger.info(
                "raw retention: deleted %d payload(s) %s",
                len(plan.expired_ids),
                plan.deleted_by_rule,
            )
        warnings: list[dict[str, Any]] = []
        for source, endpoint in plan.unclassified:
            logger.warning(
                "raw retention: no rule for source=%s endpoint=%s — kept; "
                "add a RetentionRule so it stops growing unbounded",
                source,
                endpoint,
            )
            warnings.append(
                {
                    "kind": "raw_retention_unclassified",
                    "source": source,
                    "endpoint": endpoint,
                }
            )
        return warnings or None

    return Source("raw_retention", run)
