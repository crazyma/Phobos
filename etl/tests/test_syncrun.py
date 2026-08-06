"""Pure tests for batch-status derivation and detail shaping."""

from __future__ import annotations

from etl.syncrun import (
    FAILED,
    PARTIAL,
    SUCCESS,
    SourceResult,
    build_detail,
    derive_status,
)


def test_empty_batch_is_success():
    assert derive_status([]) == SUCCESS


def test_all_sources_ok_is_success():
    results = [SourceResult("a", True), SourceResult("b", True)]
    assert derive_status(results) == SUCCESS


def test_mixed_outcomes_is_partial():
    results = [SourceResult("a", True), SourceResult("b", False, "boom")]
    assert derive_status(results) == PARTIAL


def test_all_sources_failed_is_failed():
    results = [SourceResult("a", False, "x"), SourceResult("b", False, "y")]
    assert derive_status(results) == FAILED


def test_detail_is_none_when_empty():
    assert build_detail([]) is None


def test_detail_lists_ok_and_failed_sources():
    results = [
        SourceResult("transactions", True),
        SourceResult("gamelog", False, "RuntimeError('502')"),
    ]
    detail = build_detail(results)
    assert detail == {
        "sources_ok": ["transactions"],
        "sources_failed": [
            {"source": "gamelog", "error": "RuntimeError('502')"}
        ],
    }


def test_warnings_are_recorded_without_changing_success_status():
    warning = {
        "kind": "reconciliation_mismatch",
        "player_id": 123,
        "field": "team",
        "projected": 147,
        "observed": 121,
        "suggested_manual_event": "depart/trade",
    }
    results = [SourceResult("reconciliation", True, warnings=[warning])]

    assert derive_status(results) == SUCCESS
    assert build_detail(results) == {
        "sources_ok": ["reconciliation"],
        "sources_failed": [],
        "sources_warnings": [{"source": "reconciliation", "warnings": [warning]}],
    }
