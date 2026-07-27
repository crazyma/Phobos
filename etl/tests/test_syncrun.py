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
