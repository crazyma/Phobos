"""Batch-scoped collection for informational ETL warnings.

Low-level helpers such as :mod:`etl.statsapi` cannot return a warning through
every call site. The batch runner opens a collector around one source, so any
such helper can append structured context to that source's eventual result.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any

WarningDetail = dict[str, Any]

_active_warnings: ContextVar[list[WarningDetail] | None] = ContextVar(
    "active_warnings", default=None
)


@contextmanager
def collect_warnings() -> Iterator[list[WarningDetail]]:
    """Collect warnings reported while a single source is running."""
    warnings: list[WarningDetail] = []
    token = _active_warnings.set(warnings)
    try:
        yield warnings
    finally:
        _active_warnings.reset(token)


def report_warning(warning: WarningDetail) -> None:
    """Attach a warning to the active source, if there is one."""
    warnings = _active_warnings.get()
    if warnings is not None:
        warnings.append(warning)
