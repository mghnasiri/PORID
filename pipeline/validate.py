#!/usr/bin/env python3
"""
Data quality validation for PORID pipeline items.

Checks required fields, date format, and title quality.
Returns valid and invalid items separately so the pipeline
can proceed with clean data and log problems.
"""

from __future__ import annotations

import re
import sys
from typing import Any

# Required fields every item must have
REQUIRED_FIELDS = ("id", "title", "type", "date")

# ISO date pattern: YYYY-MM-DD
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# Minimum acceptable title length
_MIN_TITLE_LENGTH = 5


def validate_items(items: list[dict]) -> tuple[list[dict], list[dict]]:
    """
    Validate a list of pipeline items for data quality.

    Checks performed on each item:
      1. Required fields (id, title, type, date) must be present and non-None.
      2. The ``date`` field must match YYYY-MM-DD format.
      3. The ``title`` must be a non-empty string of at least 5 characters.

    Args:
        items: Raw items from fetchers/classification.

    Returns:
        A tuple of (valid_items, invalid_items).  Each invalid item is
        augmented with a ``_validation_errors`` key listing the reasons.
    """
    valid: list[dict] = []
    invalid: list[dict] = []

    for item in items:
        errors: list[str] = _check_item(item)
        if errors:
            item["_validation_errors"] = errors
            invalid.append(item)
        else:
            valid.append(item)

    # Log summary to stderr
    _log_summary(len(items), len(valid), len(invalid), invalid)

    return valid, invalid


def _check_item(item: dict[str, Any]) -> list[str]:
    """Return a list of validation error strings for *item* (empty = valid)."""
    errors: list[str] = []

    # 1. Required fields
    for field in REQUIRED_FIELDS:
        if field not in item or item[field] is None:
            errors.append(f"missing required field '{field}'")

    # 2. Date format
    date_val = item.get("date")
    if date_val is not None and not _DATE_RE.match(str(date_val)):
        errors.append(f"invalid date format '{date_val}' (expected YYYY-MM-DD)")

    # 3. Title quality
    title = item.get("title")
    if title is not None:
        title_str = str(title).strip()
        if not title_str:
            errors.append("empty title")
        elif len(title_str) < _MIN_TITLE_LENGTH:
            errors.append(f"title too short ({len(title_str)} chars, min {_MIN_TITLE_LENGTH})")

    return errors


def _log_summary(
    total: int,
    valid_count: int,
    invalid_count: int,
    invalid_items: list[dict],
) -> None:
    """Print a concise validation summary to stderr."""
    print(
        f"  Validation: {valid_count}/{total} valid, "
        f"{invalid_count} dropped",
        file=sys.stderr,
    )
    if invalid_items:
        # Group errors by reason for a compact report
        reason_counts: dict[str, int] = {}
        for item in invalid_items:
            for err in item.get("_validation_errors", []):
                reason_counts[err] = reason_counts.get(err, 0) + 1
        for reason, count in sorted(reason_counts.items(), key=lambda x: -x[1]):
            print(f"    - {reason}: {count}", file=sys.stderr)
