"""Tests for pipeline.classify module."""

import sys
from pathlib import Path

# Allow imports from the pipeline package
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from classify import classify, classify_items, score_item


# ── Shared fixtures ──────────────────────────────────────────────────

SAMPLE_TAGS = {
    "scheduling": ["scheduling", "timetabling", "rostering"],
    "vehicle-routing": ["vehicle routing", "vrp", "traveling salesman"],
    "metaheuristics": ["genetic algorithm", "simulated annealing", "metaheuristic"],
    "mip": ["mixed-integer", "milp", "mip", "branch and bound"],
}


# ── classify() ───────────────────────────────────────────────────────

def test_classify_matches_single_tag():
    item = {"title": "A genetic algorithm for bin packing"}
    tags = classify(item, SAMPLE_TAGS)
    assert "metaheuristics" in tags


def test_classify_matches_multiple_tags():
    item = {"title": "A genetic algorithm for vehicle routing problems"}
    tags = classify(item, SAMPLE_TAGS)
    assert "metaheuristics" in tags
    assert "vehicle-routing" in tags


def test_classify_uses_abstract():
    item = {"title": "An optimization approach", "abstract": "We solve a scheduling problem."}
    tags = classify(item, SAMPLE_TAGS)
    assert "scheduling" in tags


def test_classify_falls_back_to_general():
    item = {"title": "Something completely unrelated to operations research keywords"}
    tags = classify(item, SAMPLE_TAGS)
    assert tags == ["general-or"]


def test_classify_empty_title_returns_general():
    item = {"title": ""}
    tags = classify(item, SAMPLE_TAGS)
    assert tags == ["general-or"]


def test_classify_short_keyword_uses_word_boundary():
    """Short keywords like 'mip' should not match inside 'manipulation'."""
    item = {"title": "Data manipulation in databases"}
    tags = classify(item, SAMPLE_TAGS)
    assert "mip" not in tags


def test_classify_short_keyword_matches_standalone():
    item = {"title": "Solving a MIP with cutting planes"}
    tags = classify(item, SAMPLE_TAGS)
    assert "mip" in tags


# ── classify_items() ─────────────────────────────────────────────────

def test_classify_items_adds_tags_and_score():
    items = [
        {"title": "Scheduling nurses in hospitals"},
        {"title": "VRP with time windows"},
    ]
    result = classify_items(items, SAMPLE_TAGS)
    assert len(result) == 2
    for item in result:
        assert "tags" in item
        assert "score" in item
        assert isinstance(item["tags"], list)
        assert isinstance(item["score"], float)


def test_classify_items_preserves_existing_tags():
    items = [{"title": "A scheduling problem", "tags": ["custom-tag"]}]
    result = classify_items(items, SAMPLE_TAGS)
    assert "custom-tag" in result[0]["tags"]
    assert "scheduling" in result[0]["tags"]


# ── score_item() ─────────────────────────────────────────────────────

def test_score_item_base_score():
    item = {"title": "Unrelated topic", "tags": []}
    score = score_item(item, SAMPLE_TAGS)
    assert score == 10.0


def test_score_item_doi_bonus():
    item = {"title": "Something", "tags": [], "doi": "10.1234/test"}
    score = score_item(item, SAMPLE_TAGS)
    assert score >= 20.0  # base 10 + doi 10


def test_score_item_abstract_bonus():
    item = {"title": "Something", "tags": [], "abstract": "A long enough abstract with real content."}
    score = score_item(item, SAMPLE_TAGS)
    assert score >= 15.0  # base 10 + abstract 5


def test_score_item_clamped_to_100():
    """Even with many bonuses, score should not exceed 100."""
    from datetime import datetime, timezone
    item = {
        "title": "Something",
        "tags": list(SAMPLE_TAGS.keys()) * 3,  # many tags
        "doi": "10.1234/test",
        "abstract": "A sufficiently long abstract text here.",
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
    }
    score = score_item(item, SAMPLE_TAGS)
    assert score <= 100.0
