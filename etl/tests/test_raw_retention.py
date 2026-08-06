"""Tests for graded raw_payloads retention."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from etl.sources import build_sources
from etl.sources.raw_retention import (
    RETENTION_RULES,
    RawRow,
    RetentionRule,
    make_raw_retention_source,
    plan_prune,
    prune_raw_payloads,
    rule_for,
)

NOW = datetime(2026, 8, 6, 12, 0, tzinfo=timezone.utc)


def _row(id: int, source: str, endpoint: str | None, age_days: float) -> RawRow:
    return RawRow(id, source, endpoint, NOW - timedelta(days=age_days))


def test_every_endpoint_we_actually_write_is_classified():
    """The inventory measured on 2026-08-06 — each one must own a rule."""
    written = [
        ("statsapi", "transactions", "transactions"),
        ("statsapi", "people", "player_bio"),
        ("statsapi", "teams", "teams"),
        ("statsapi", "schedule", "schedule"),
        ("statsapi", "people/656413/stats", "player_stats"),
        ("savant", "leaderboard/expected_statistics", "savant"),
    ]
    for source, endpoint, expected in written:
        rule = rule_for(source, endpoint)
        assert rule is not None and rule.name == expected


def test_each_class_is_pruned_on_its_own_clock():
    rows = [
        _row(1, "statsapi", "people/1/stats", age_days=15),  # over 14
        _row(2, "statsapi", "people/1/stats", age_days=13),
        _row(3, "statsapi", "schedule", age_days=31),  # over 30
        _row(4, "statsapi", "schedule", age_days=20),
        _row(5, "statsapi", "teams", age_days=61),  # over 60
        _row(6, "statsapi", "teams", age_days=45),  # a quiet stretch survives
        _row(7, "statsapi", "people", age_days=91),  # over 90
        _row(8, "statsapi", "transactions", age_days=200),  # kept a year
    ]

    plan = plan_prune(rows, now=NOW)

    assert plan.expired_ids == [1, 3, 5, 7]
    assert plan.deleted_by_rule == {
        "player_stats": 1,
        "schedule": 1,
        "teams": 1,
        "player_bio": 1,
    }


def test_bio_is_not_swept_on_the_player_stats_clock():
    """`people` and `people/*/stats` share a prefix but not a retention class."""
    rows = [_row(1, "statsapi", "people", age_days=30)]

    assert plan_prune(rows, now=NOW).expired_ids == []


def test_unknown_endpoints_are_kept_and_reported_once():
    rows = [
        _row(1, "statsapi", "standings", age_days=400),
        _row(2, "statsapi", "standings", age_days=500),
        _row(3, "statsapi", None, age_days=400),
    ]

    plan = plan_prune(rows, now=NOW)

    # Nothing is aged out on a guess; the operator gets told to classify it.
    assert plan.expired_ids == []
    assert plan.unclassified == [("statsapi", "standings"), ("statsapi", None)]


def test_the_newest_payload_of_a_class_always_survives_its_own_sweep():
    """A batch's own writes are age 0, so the sweep never eats what just landed."""
    rows = [_row(i, "savant", "leaderboard/expected_statistics", age_days=0) for i in (1, 2)]

    assert plan_prune(rows, now=NOW).expired_ids == []


@pytest.mark.db
def test_prune_deletes_expired_rows_in_the_database(db_conn):
    """End to end against real jsonb rows, scoped to a source of our own."""
    source = f"test-retention-{uuid.uuid4()}"
    rules = (RetentionRule("test", source, "%", 14),)
    with db_conn.cursor() as cur:
        cur.execute(
            """
            insert into raw_payloads (source, endpoint, params, payload, fetched_at)
            values (%s, 'x', null, null, now() - interval '15 days'),
                   (%s, 'x', null, null, now() - interval '13 days')
            """,
            (source, source),
        )

        plan = prune_raw_payloads(db_conn, rules=rules)
        assert len(plan.expired_ids) == 1
        assert plan.deleted_by_rule == {"test": 1}

        cur.execute("select count(*) from raw_payloads where source = %s", (source,))
        assert cur.fetchone()[0] == 1
    db_conn.rollback()  # never commit: the fixture connection is the real DB


@pytest.mark.db
def test_source_reports_unclassified_endpoints_as_warnings(db_conn):
    source = f"test-retention-{uuid.uuid4()}"
    with db_conn.cursor() as cur:
        cur.execute(
            "insert into raw_payloads (source, endpoint, params, payload) "
            "values (%s, 'mystery', null, null)",
            (source,),
        )

    warnings = make_raw_retention_source(db_conn).run()

    assert {
        "kind": "raw_retention_unclassified",
        "source": source,
        "endpoint": "mystery",
    } in warnings
    db_conn.rollback()


@pytest.mark.parametrize("kind", ["morning", "evening", "manual"])
def test_every_batch_ends_with_the_sweep(kind):
    """Last, so a sweep failure can never roll back the ingest before it."""
    sources = build_sources(kind, conn=None, client=None)

    assert sources[-1].name == "raw_retention"


def test_rules_stay_ordered_from_most_valuable_to_most_disposable():
    """Guards the grading itself: a careless edit that flattens it is a bug."""
    days = [rule.days for rule in RETENTION_RULES]
    assert days == sorted(days, reverse=True)
    assert days[0] == 365 and days[-1] == 14
