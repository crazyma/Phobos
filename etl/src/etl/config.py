"""Environment + tunables.

`DATABASE_URL` is shared with the Node side via the repo-root `.env` (the ETL
never owns its own database config). Constants here are the conservative
defaults for talking to StatsAPI (spec-03 §7).
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# src/etl/config.py → parents: [0]=src/etl, [1]=src, [2]=etl, [3]=repo root.
_REPO_ROOT = Path(__file__).resolve().parents[3]

# StatsAPI (MLB Stats API is the primary source; ADR §6.4).
STATSAPI_BASE_URL = "https://statsapi.mlb.com/api/v1"
# pybaseball/StatsAPI publish no rate limit; stay deliberately gentle.
REQUEST_DELAY_SECONDS = 1.0
MAX_RETRIES = 2  # 2 retries ⇒ 3 total attempts
# On-disk cache for raw StatsAPI responses, kept out of the repo root.
CACHE_DIR = _REPO_ROOT / "etl" / ".cache" / "statsapi"

_env_loaded = False


def load_env() -> None:
    """Load the repo-root `.env` once (idempotent)."""
    global _env_loaded
    if _env_loaded:
        return
    env_path = _REPO_ROOT / ".env"
    if env_path.exists():
        load_dotenv(env_path)
    else:
        # Fall back to the usual upward search from CWD (e.g. CI overrides).
        load_dotenv()
    _env_loaded = True


def get_database_url() -> str:
    """Return `DATABASE_URL` or raise a pointed error if it is unset."""
    load_env()
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "DATABASE_URL is not set. Copy .env.example to .env at the repo root "
            "(or start Postgres with `pnpm db:up`)."
        )
    return url
