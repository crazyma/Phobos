"""Pure tests for the StatsAPI client: retry, cache, and raw recording.

No real network: a fake session records calls and returns canned responses;
`sleep` is a no-op recorder so we can assert the conservative delay without
waiting.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

import pytest

from etl.statsapi import StatsApiClient, StatsApiError, _cache_key
from etl.warnings import collect_warnings


class FakeResponse:
    def __init__(self, payload: Any, status: int = 200) -> None:
        self._payload = payload
        self.status_code = status

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self) -> Any:
        return self._payload


@dataclass
class FakeSession:
    """Returns queued responses/exceptions in order; records each GET."""

    outcomes: list[Any]
    calls: list[dict[str, Any]] = field(default_factory=list)

    def get(self, url: str, params: Optional[dict] = None, timeout: float = 0) -> Any:
        self.calls.append({"url": url, "params": params})
        outcome = self.outcomes[len(self.calls) - 1]
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


class RecordingRecorder:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    def __call__(self, **kwargs: Any) -> None:
        self.calls.append(kwargs)


class DictCache:
    def __init__(self) -> None:
        self.store: dict[str, Any] = {}

    def get(self, key: str) -> Any | None:
        return self.store.get(key)

    def set(self, key: str, value: Any) -> None:
        self.store[key] = value


def _client(session, **kwargs):
    sleeps: list[float] = []
    client = StatsApiClient(
        base_url="https://example.test/api/v1",
        session=session,
        sleep=sleeps.append,
        delay=0.5,
        **kwargs,
    )
    return client, sleeps


def test_get_returns_json_and_records_raw():
    session = FakeSession([FakeResponse({"teams": [1, 2]})])
    recorder = RecordingRecorder()
    client, sleeps = _client(session, recorder=recorder)

    result = client.get("teams", {"sportId": 1})

    assert result == {"teams": [1, 2]}
    assert session.calls[0]["url"] == "https://example.test/api/v1/teams"
    # one raw record with the source/endpoint/params/payload shape
    assert recorder.calls == [
        {
            "source": "statsapi",
            "endpoint": "teams",
            "params": {"sportId": 1},
            "payload": {"teams": [1, 2]},
        }
    ]
    assert sleeps == [0.5]  # one conservative pre-request delay


def test_retries_twice_then_succeeds():
    session = FakeSession(
        [RuntimeError("timeout"), RuntimeError("timeout"), FakeResponse({"ok": True})]
    )
    client, sleeps = _client(session)

    result = client.get("schedule")

    assert result == {"ok": True}
    assert len(session.calls) == 3  # 1 + 2 retries
    assert len(sleeps) == 3


def test_retries_report_structured_warnings_to_the_active_source():
    session = FakeSession([RuntimeError("timeout"), FakeResponse({"ok": True})])
    client, _ = _client(session)

    with collect_warnings() as warnings:
        assert client.get("schedule") == {"ok": True}

    assert warnings == [
        {
            "kind": "statsapi_retry",
            "endpoint": "schedule",
            "attempt": 1,
            "attempts": 3,
            "error": "RuntimeError('timeout')",
        }
    ]


def test_raises_after_exhausting_retries():
    session = FakeSession([RuntimeError("boom")] * 3)
    recorder = RecordingRecorder()
    client, _ = _client(session, recorder=recorder)

    with pytest.raises(StatsApiError):
        client.get("schedule")

    assert len(session.calls) == 3
    assert recorder.calls == []  # nothing recorded on total failure


def test_http_error_status_is_retried():
    session = FakeSession([FakeResponse(None, status=503), FakeResponse({"ok": 1})])
    client, _ = _client(session)

    assert client.get("teams") == {"ok": 1}
    assert len(session.calls) == 2


def test_cache_hit_skips_network_and_recorder():
    cache = DictCache()
    cache.store[_cache_key("teams", {"sportId": 1})] = {"cached": True}
    session = FakeSession([])  # would IndexError if the network were touched
    recorder = RecordingRecorder()
    client, sleeps = _client(session, cache=cache, recorder=recorder)

    result = client.get("teams", {"sportId": 1})

    assert result == {"cached": True}
    assert session.calls == []
    assert recorder.calls == []
    assert sleeps == []


def test_cache_miss_populates_cache():
    cache = DictCache()
    session = FakeSession([FakeResponse({"fresh": 1})])
    client, _ = _client(session, cache=cache)

    client.get("teams", {"sportId": 11})

    assert cache.store[_cache_key("teams", {"sportId": 11})] == {"fresh": 1}
