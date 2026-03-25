"""Tests for pipeline.validate module."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from validate import validate_items, _check_item


# ── Valid items ──────────────────────────────────────────────────────

VALID_ITEM = {
    "id": "arxiv-2401.00001",
    "title": "A New Approach to Vehicle Routing",
    "type": "publication",
    "date": "2026-03-20",
}


def test_valid_item_passes():
    valid, invalid = validate_items([VALID_ITEM])
    assert len(valid) == 1
    assert len(invalid) == 0


def test_valid_item_with_extras():
    item = {**VALID_ITEM, "doi": "10.1234/test", "abstract": "Some text"}
    valid, invalid = validate_items([item])
    assert len(valid) == 1


# ── Missing required fields ──────────────────────────────────────────

def test_missing_id():
    item = {"title": "Some Title", "type": "publication", "date": "2026-03-20"}
    valid, invalid = validate_items([item])
    assert len(valid) == 0
    assert len(invalid) == 1
    assert any("'id'" in e for e in invalid[0]["_validation_errors"])


def test_missing_title():
    item = {"id": "test-1", "type": "publication", "date": "2026-03-20"}
    valid, invalid = validate_items([item])
    assert len(invalid) == 1
    assert any("'title'" in e for e in invalid[0]["_validation_errors"])


def test_missing_type():
    item = {"id": "test-1", "title": "Valid Title Here", "date": "2026-03-20"}
    valid, invalid = validate_items([item])
    assert len(invalid) == 1
    assert any("'type'" in e for e in invalid[0]["_validation_errors"])


def test_missing_date():
    item = {"id": "test-1", "title": "Valid Title Here", "type": "publication"}
    valid, invalid = validate_items([item])
    assert len(invalid) == 1
    assert any("'date'" in e for e in invalid[0]["_validation_errors"])


def test_none_field_treated_as_missing():
    item = {**VALID_ITEM, "id": None}
    valid, invalid = validate_items([item])
    assert len(invalid) == 1


# ── Date format validation ───────────────────────────────────────────

def test_valid_date_format():
    errors = _check_item(VALID_ITEM)
    assert not any("date format" in e for e in errors)


def test_invalid_date_format_slash():
    item = {**VALID_ITEM, "date": "03/20/2026"}
    errors = _check_item(item)
    assert any("date format" in e for e in errors)


def test_invalid_date_format_text():
    item = {**VALID_ITEM, "date": "March 20, 2026"}
    errors = _check_item(item)
    assert any("date format" in e for e in errors)


def test_invalid_date_format_partial():
    item = {**VALID_ITEM, "date": "2026-03"}
    errors = _check_item(item)
    assert any("date format" in e for e in errors)


# ── Title quality ────────────────────────────────────────────────────

def test_empty_title_rejected():
    item = {**VALID_ITEM, "title": ""}
    errors = _check_item(item)
    assert any("empty title" in e for e in errors)


def test_short_title_rejected():
    item = {**VALID_ITEM, "title": "Hi"}
    errors = _check_item(item)
    assert any("too short" in e for e in errors)


def test_whitespace_only_title_rejected():
    item = {**VALID_ITEM, "title": "   "}
    errors = _check_item(item)
    assert any("empty title" in e for e in errors)


# ── Batch validation ─────────────────────────────────────────────────

def test_mixed_valid_and_invalid():
    items = [
        VALID_ITEM,
        {"id": "bad-1", "title": "OK Title Here", "type": "publication", "date": "bad-date"},
        {**VALID_ITEM, "id": "good-2"},
    ]
    valid, invalid = validate_items(items)
    assert len(valid) == 2
    assert len(invalid) == 1


def test_empty_list():
    valid, invalid = validate_items([])
    assert valid == []
    assert invalid == []


def test_multiple_errors_on_single_item():
    item = {"title": "Hi"}  # missing id, type, date; title too short
    errors = _check_item(item)
    assert len(errors) >= 3
