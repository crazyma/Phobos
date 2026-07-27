"""Pure tests for the on-disk FileCache."""

from __future__ import annotations

import os
import time

from etl.cache import FileCache


def test_roundtrip(tmp_path):
    cache = FileCache(tmp_path)
    assert cache.get("k") is None

    cache.set("k", {"a": 1, "b": [1, 2, 3]})
    assert cache.get("k") == {"a": 1, "b": [1, 2, 3]}


def test_distinct_keys_do_not_collide(tmp_path):
    cache = FileCache(tmp_path)
    cache.set("teams?sportId=1", {"level": "mlb"})
    cache.set("teams?sportId=11", {"level": "aaa"})

    assert cache.get("teams?sportId=1") == {"level": "mlb"}
    assert cache.get("teams?sportId=11") == {"level": "aaa"}


def test_expired_entry_returns_none(tmp_path):
    cache = FileCache(tmp_path, ttl_seconds=0.0)
    cache.set("k", {"v": 1})
    # ttl 0 → any positive age is stale; nudge mtime into the past
    path = next(tmp_path.glob("*.json"))
    os.utime(path, (time.time() - 10, time.time() - 10))
    assert cache.get("k") is None


def test_corrupt_file_returns_none(tmp_path):
    cache = FileCache(tmp_path)
    cache.set("k", {"v": 1})
    path = next(tmp_path.glob("*.json"))
    path.write_text("{not json", encoding="utf-8")
    assert cache.get("k") is None
