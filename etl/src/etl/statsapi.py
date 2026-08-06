"""StatsAPI HTTP client.

Thin wrapper over `requests` that adds the resilience spec-03 §7 asks for:
conservative delay, retry twice, an optional local cache, and recording every
successful raw response into the raw layer via an injected recorder.

Everything with a side effect — the HTTP session, `sleep`, the cache, the raw
recorder — is injectable, so the retry/cache/record behaviour is unit-testable
with fakes and never touches the real network.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any, Callable, Optional, Protocol

import requests

from .config import MAX_RETRIES, REQUEST_DELAY_SECONDS, STATSAPI_BASE_URL
from .warnings import report_warning

logger = logging.getLogger(__name__)

# Called with the same keyword shape as `raw.store_raw_payload` (minus conn), so
# production can wire it straight through to persist each fetched payload.
Recorder = Callable[..., Any]


class Cache(Protocol):
    def get(self, key: str) -> Any | None: ...
    def set(self, key: str, value: Any) -> None: ...


class StatsApiError(RuntimeError):
    """Raised when a StatsAPI endpoint fails every attempt."""


def _cache_key(endpoint: str, params: Optional[dict[str, Any]]) -> str:
    normalized = json.dumps(params or {}, sort_keys=True, default=str)
    return f"{endpoint}?{normalized}"


class StatsApiClient:
    def __init__(
        self,
        *,
        base_url: str = STATSAPI_BASE_URL,
        session: Optional[requests.Session] = None,
        sleep: Callable[[float], None] = time.sleep,
        delay: float = REQUEST_DELAY_SECONDS,
        max_retries: int = MAX_RETRIES,
        timeout: float = 30.0,
        cache: Optional[Cache] = None,
        recorder: Optional[Recorder] = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._session = session or requests.Session()
        self._sleep = sleep
        self._delay = delay
        self._max_retries = max_retries
        self._timeout = timeout
        self._cache = cache
        self._recorder = recorder

    def get(self, endpoint: str, params: Optional[dict[str, Any]] = None) -> Any:
        """Fetch and JSON-decode an endpoint, using cache + recording raw.

        A cache hit skips both the network and the raw recorder (we already have
        the payload). A miss fetches with retries, caches, then records.
        """
        key = _cache_key(endpoint, params)
        if self._cache is not None:
            cached = self._cache.get(key)
            if cached is not None:
                logger.debug("statsapi cache hit: %s", key)
                return cached

        payload = self._fetch_with_retry(endpoint, params)

        if self._cache is not None:
            self._cache.set(key, payload)
        if self._recorder is not None:
            self._recorder(
                source="statsapi", endpoint=endpoint, params=params, payload=payload
            )
        return payload

    def _fetch_with_retry(self, endpoint: str, params: Optional[dict[str, Any]]) -> Any:
        url = f"{self._base_url}/{endpoint.lstrip('/')}"
        attempts = self._max_retries + 1
        last_exc: Optional[Exception] = None
        for attempt in range(1, attempts + 1):
            # Deliberate pre-request pause; upstream declares no rate limit.
            self._sleep(self._delay)
            try:
                resp = self._session.get(url, params=params, timeout=self._timeout)
                resp.raise_for_status()
                return resp.json()
            except Exception as exc:  # noqa: BLE001 — retry any transport/HTTP error
                last_exc = exc
                logger.warning(
                    "statsapi %s attempt %d/%d failed: %r",
                    endpoint,
                    attempt,
                    attempts,
                    exc,
                )
                report_warning(
                    {
                        "kind": "statsapi_retry",
                        "endpoint": endpoint,
                        "attempt": attempt,
                        "attempts": attempts,
                        "error": repr(exc),
                    }
                )
        raise StatsApiError(
            f"statsapi {endpoint} failed after {attempts} attempts"
        ) from last_exc
