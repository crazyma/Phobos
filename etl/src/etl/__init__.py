"""Phobos ETL — pure data layer feeding the Drizzle-owned curated schema.

The package never defines or migrates schema (Node/Drizzle owns it); it only
reads/writes existing curated tables via psycopg. See docs/spec/spec-03.
"""

__all__ = ["__version__"]

__version__ = "0.0.0"
