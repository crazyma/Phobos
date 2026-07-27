"""A tiny on-disk JSON cache for raw StatsAPI responses.

StatsAPI has no published rate limit but we stay gentle; a local cache also
makes re-runs during development cheap. Entries expire after a TTL so a season
re-pull still picks up upstream corrections within a day.
"""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path
from typing import Any


class FileCache:
    """File-backed cache keyed by an opaque string, with a TTL in seconds."""

    def __init__(self, root: str | Path, ttl_seconds: float = 6 * 60 * 60) -> None:
        self._root = Path(root)
        self._ttl = ttl_seconds

    def _path(self, key: str) -> Path:
        digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
        return self._root / f"{digest}.json"

    def get(self, key: str) -> Any | None:
        path = self._path(key)
        if not path.exists():
            return None
        if self._ttl >= 0 and (time.time() - path.stat().st_mtime) > self._ttl:
            return None
        try:
            with path.open("r", encoding="utf-8") as fh:
                return json.load(fh)
        except (OSError, json.JSONDecodeError):
            return None

    def set(self, key: str, value: Any) -> None:
        self._root.mkdir(parents=True, exist_ok=True)
        path = self._path(key)
        # Write-then-rename so a crash never leaves a half-written entry.
        tmp = path.with_suffix(".json.tmp")
        with tmp.open("w", encoding="utf-8") as fh:
            json.dump(value, fh)
        tmp.replace(path)
