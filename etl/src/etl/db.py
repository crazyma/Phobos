"""Postgres access via psycopg.

The ETL treats the curated schema as a fixed contract owned by Drizzle: it only
reads/writes existing tables and never issues DDL. Connections default to
autocommit off so the batch runner controls transaction boundaries per source.
"""

from __future__ import annotations

import psycopg

from .config import get_database_url


def connect(dsn: str | None = None) -> psycopg.Connection:
    """Open a psycopg connection (autocommit off) to the curated DB."""
    return psycopg.connect(dsn or get_database_url())
