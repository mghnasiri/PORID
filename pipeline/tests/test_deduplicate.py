"""Tests for pipeline.deduplicate module."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from deduplicate import deduplicate, _normalize_title, _jaccard


# ── DOI deduplication ────────────────────────────────────────────────

def test_doi_dedup_removes_exact_duplicate():
    items = [
        {"id": "a", "title": "Paper A", "doi": "10.1234/abc"},
        {"id": "b", "title": "Paper B", "doi": "10.1234/abc"},
    ]
    result = deduplicate(items)
    assert len(result) == 1
    assert result[0]["id"] == "a"  # first seen wins


def test_doi_dedup_case_insensitive():
    items = [
        {"id": "a", "title": "Paper A", "doi": "10.1234/ABC"},
        {"id": "b", "title": "Paper B", "doi": "10.1234/abc"},
    ]
    result = deduplicate(items)
    assert len(result) == 1


def test_doi_dedup_keeps_different_dois():
    items = [
        {"id": "a", "title": "Branch and bound for integer programming", "doi": "10.1234/abc"},
        {"id": "b", "title": "Neural networks for image classification", "doi": "10.1234/xyz"},
    ]
    result = deduplicate(items)
    assert len(result) == 2


def test_items_without_doi_are_not_doi_deduped():
    items = [
        {"id": "a", "title": "Optimization of supply chain networks"},
        {"id": "b", "title": "Reinforcement learning for robotic control"},
    ]
    result = deduplicate(items)
    assert len(result) == 2


# ── Title Jaccard deduplication ──────────────────────────────────────

def test_title_dedup_removes_near_duplicate():
    items = [
        {"id": "a", "title": "A Genetic Algorithm for the Vehicle Routing Problem"},
        {"id": "b", "title": "A Genetic Algorithm for Vehicle Routing Problem"},
    ]
    result = deduplicate(items)
    assert len(result) == 1
    assert result[0]["id"] == "a"


def test_title_dedup_keeps_different_titles():
    items = [
        {"id": "a", "title": "Branch and Bound for Integer Programming"},
        {"id": "b", "title": "Neural Networks for Image Classification"},
    ]
    result = deduplicate(items)
    assert len(result) == 2


def test_title_dedup_with_name_field():
    """Solvers/software may use 'name' instead of 'title'."""
    items = [
        {"id": "a", "name": "Gurobi Optimizer Professional Edition Suite"},
        {"id": "b", "name": "Gurobi Optimizer Professional Edition Suite v2"},
    ]
    # Jaccard: 5/6 = 0.833... which is below threshold, so use higher overlap
    items = [
        {"id": "a", "name": "Gurobi Mixed Integer Programming Optimizer Solver Package"},
        {"id": "b", "name": "Gurobi Mixed Integer Programming Optimizer Solver"},
    ]
    result = deduplicate(items)
    assert len(result) == 1


# ── Helper functions ─────────────────────────────────────────────────

def test_normalize_title_lowercases():
    words = _normalize_title("Branch And Bound")
    assert "branch" in words
    assert "bound" in words


def test_normalize_title_strips_punctuation():
    words = _normalize_title("Hello, World! Test.")
    assert "hello" in words
    assert "world" in words
    assert "test" in words


def test_normalize_title_filters_short_words():
    """Words with len <= 2 are removed; 3-char words like 'the' are kept."""
    words = _normalize_title("A an to is or")
    assert len(words) == 0
    # 3-char words are kept
    words2 = _normalize_title("the big fox")
    assert "the" in words2
    assert "big" in words2
    assert "fox" in words2


def test_jaccard_identical_sets():
    assert _jaccard({"a", "b", "c"}, {"a", "b", "c"}) == 1.0


def test_jaccard_disjoint_sets():
    assert _jaccard({"a", "b"}, {"c", "d"}) == 0.0


def test_jaccard_partial_overlap():
    sim = _jaccard({"a", "b", "c"}, {"b", "c", "d"})
    assert 0.4 < sim < 0.6  # 2/4 = 0.5


def test_jaccard_empty_sets():
    assert _jaccard(set(), set()) == 1.0


# ── Edge cases ───────────────────────────────────────────────────────

def test_empty_input():
    assert deduplicate([]) == []


def test_single_item():
    items = [{"id": "a", "title": "Only item"}]
    result = deduplicate(items)
    assert len(result) == 1


def test_threshold_parameter():
    """A stricter threshold should keep more items."""
    items = [
        {"id": "a", "title": "Optimization of supply chain logistics networks"},
        {"id": "b", "title": "Optimization of supply chain logistics systems"},
    ]
    lenient = deduplicate(items, threshold=0.5)
    strict = deduplicate(items, threshold=0.95)
    assert len(strict) >= len(lenient)
