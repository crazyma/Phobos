"""Pure tests for batch orchestration: partial semantics + transaction calls.

Uses an in-memory `SyncRunStore` fake so the source-isolation logic is verified
without a database.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

import pytest

from etl.batch import Source, run_batch
from etl.warnings import report_warning


@dataclass
class FakeStore:
    """Records open/close/commit/rollback so tests can assert the sequence."""

    next_id: int = 1
    opened: Optional[str] = None
    closed: Optional[tuple[int, str, Optional[dict[str, Any]]]] = None
    commits: int = 0
    rollbacks: int = 0
    events: list[str] = field(default_factory=list)

    def open_run(self, kind: str) -> int:
        self.opened = kind
        self.events.append(f"open:{kind}")
        return self.next_id

    def close_run(self, run_id, status, detail) -> None:
        self.closed = (run_id, status, detail)
        self.events.append(f"close:{status}")

    def commit(self) -> None:
        self.commits += 1
        self.events.append("commit")

    def rollback(self) -> None:
        self.rollbacks += 1
        self.events.append("rollback")


def _ok_source(name: str, log: list[str]) -> Source:
    return Source(name, lambda: log.append(name))


def _failing_source(name: str, log: list[str]) -> Source:
    def run() -> None:
        log.append(name)
        raise RuntimeError(f"{name} boom")

    return Source(name, run)


def test_empty_batch_opens_and_closes_success():
    store = FakeStore()
    outcome = run_batch("morning", [], store)

    assert store.opened == "morning"
    assert outcome.status == "success"
    assert store.closed == (1, "success", None)
    assert outcome.run_id == 1


def test_all_sources_ok_commits_each():
    store = FakeStore()
    ran: list[str] = []
    sources = [_ok_source("a", ran), _ok_source("b", ran)]

    outcome = run_batch("evening", sources, store)

    assert ran == ["a", "b"]
    assert outcome.status == "success"
    # one commit for the placeholder, one per ok source, one on close
    assert store.commits == 4
    assert store.rollbacks == 0


def test_source_warnings_are_persisted_without_changing_success_status():
    store = FakeStore()
    warning = {"kind": "team_refs_sanitized", "team_ids": [999]}
    source = Source("games", lambda: [warning])

    outcome = run_batch("morning", [source], store)

    assert outcome.status == "success"
    assert outcome.results[0].warnings == [warning]
    assert store.closed == (
        1,
        "success",
        {
            "sources_ok": ["games"],
            "sources_failed": [],
            "sources_warnings": [{"source": "games", "warnings": [warning]}],
        },
    )


def test_helper_warnings_are_attributed_to_the_source_that_emits_them():
    store = FakeStore()
    warning = {"kind": "statsapi_retry", "endpoint": "people", "attempt": 1}

    def run() -> None:
        report_warning(warning)

    outcome = run_batch("morning", [Source("season_stats", run)], store)

    assert outcome.results[0].warnings == [warning]
    assert store.closed[2]["sources_warnings"] == [
        {"source": "season_stats", "warnings": [warning]}
    ]


def test_failing_source_keeps_the_warnings_it_reported_before_blowing_up():
    store = FakeStore()
    warning = {"kind": "statsapi_retry", "endpoint": "people", "attempt": 1}

    def run() -> None:
        report_warning(warning)
        raise RuntimeError("boom")

    outcome = run_batch("morning", [Source("season_stats", run)], store)

    assert outcome.status == "failed"
    assert outcome.results[0].warnings == [warning]
    detail = store.closed[2]
    assert detail["sources_failed"][0]["source"] == "season_stats"
    assert detail["sources_warnings"] == [
        {"source": "season_stats", "warnings": [warning]}
    ]


def test_failing_source_does_not_abort_and_yields_partial():
    store = FakeStore()
    ran: list[str] = []
    sources = [
        _ok_source("a", ran),
        _failing_source("b", ran),
        _ok_source("c", ran),
    ]

    outcome = run_batch("morning", sources, store)

    # c still ran even though b failed
    assert ran == ["a", "b", "c"]
    assert outcome.status == "partial"
    assert store.rollbacks == 1  # only b rolled back
    # detail records the failed source
    _, status, detail = store.closed
    assert status == "partial"
    assert detail["sources_ok"] == ["a", "c"]
    assert detail["sources_failed"][0]["source"] == "b"
    assert "boom" in detail["sources_failed"][0]["error"]


def test_all_sources_failing_yields_failed():
    store = FakeStore()
    ran: list[str] = []
    sources = [_failing_source("a", ran), _failing_source("b", ran)]

    outcome = run_batch("manual", sources, store)

    assert outcome.status == "failed"
    assert store.rollbacks == 2


def test_framework_fatal_marks_failed_and_reraises():
    class ExplodingStore(FakeStore):
        def close_run(self, run_id, status, detail):
            if status != "failed":
                raise RuntimeError("db gone at close")
            super().close_run(run_id, status, detail)

    store = ExplodingStore()

    with pytest.raises(RuntimeError, match="db gone at close"):
        run_batch("morning", [], store)

    # ended by force-closing as failed
    assert store.closed[1] == "failed"
    assert "fatal" in store.closed[2]
