#!/usr/bin/env python3
"""
Tag classifier for PORID pipeline items.

Scans title + abstract (lowercased) for keyword matches defined in
config.yaml and returns all matching tags. Defaults to ["general-or"]
if no tags match.

Also provides relevance scoring (0-100) based on tag matches, recency,
and metadata completeness.

Usage:
    # As a module:
    from classify import classify
    tags = classify(item, tag_keywords)

    # Standalone test:
    python classify.py < items.json > classified.json
"""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import yaml


def load_config(config_path: str = "config.yaml") -> dict:
    """Load pipeline configuration from YAML file."""
    path = Path(__file__).parent / config_path
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def classify(item: dict, tag_keywords: dict[str, list[str]]) -> list[str]:
    """
    Classify a single item by scanning its text for keyword matches.

    Builds a searchable text blob from the item's title, abstract,
    changelog, and name fields. Each tag's keyword list is checked
    against this blob. Matching is case-insensitive; short keywords
    (<=4 chars) use word-boundary matching to avoid false positives.

    Args:
        item: A PORID item dict (must have at least 'title').
        tag_keywords: Dict mapping tag names to keyword lists,
                      e.g. {"scheduling": ["scheduling", "timetabling", ...]}.

    Returns:
        List of matched tag strings. Falls back to ["general-or"]
        if no tags match.
    """
    # Build searchable text from all relevant fields
    parts = [
        item.get("title", ""),
        item.get("abstract", ""),
        item.get("changelog", ""),
        item.get("name", ""),
    ]
    text = " ".join(parts).lower()

    if not text.strip():
        return ["general-or"]

    matched_tags: list[str] = []

    for tag, keywords in tag_keywords.items():
        for keyword in keywords:
            kw_lower = keyword.lower()

            # Short keywords (e.g., "mip", "tsp", "gnn") use word boundaries
            # to avoid matching inside longer words
            if len(kw_lower) <= 4:
                pattern = r"\b" + re.escape(kw_lower) + r"\b"
                if re.search(pattern, text):
                    matched_tags.append(tag)
                    break
            else:
                # Longer keywords / phrases: substring match is safe
                if kw_lower in text:
                    matched_tags.append(tag)
                    break

    return matched_tags if matched_tags else ["general-or"]


def score_item(item: dict, tag_keywords: dict[str, list[str]]) -> float:
    """
    Compute a relevance score (0-100) for a pipeline item.

    Scoring breakdown:
    - Base score: 10
    - +5 per matching tag (max +40)
    - +20 if published in last 24 hours, +10 if last 3 days, +5 if last 7 days
    - +10 if has DOI (indicates peer-reviewed)
    - +5 if has abstract (more complete metadata)
    - Final score is clamped to 0-100 range.

    Args:
        item: A PORID item dict.
        tag_keywords: Tag keyword configuration from config.

    Returns:
        Float score in the range 0.0 to 100.0.
    """
    score: float = 10.0

    # Tag matching bonus: +5 per tag, max +40
    tags = item.get("tags", [])
    # Count tags that are actual classification tags (not meta like "general-or")
    real_tags = [t for t in tags if t in tag_keywords]
    tag_bonus = min(len(real_tags) * 5.0, 40.0)
    score += tag_bonus

    # Recency bonus
    item_date_str = item.get("date", "")
    if item_date_str:
        try:
            now = datetime.now(timezone.utc)
            item_date = datetime.strptime(item_date_str[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
            age = now - item_date
            if age <= timedelta(hours=24):
                score += 20.0
            elif age <= timedelta(days=3):
                score += 10.0
            elif age <= timedelta(days=7):
                score += 5.0
        except (ValueError, TypeError):
            pass

    # DOI bonus: indicates peer-reviewed
    doi = item.get("doi", "")
    if doi:
        score += 10.0

    # Abstract completeness bonus
    abstract = item.get("abstract", "")
    if abstract and len(abstract.strip()) > 20:
        score += 5.0

    # Clamp to 0-100
    return max(0.0, min(100.0, score))


def classify_items(
    items: list[dict],
    tag_keywords: dict[str, list[str]],
) -> list[dict]:
    """
    Classify a list of items, merging inferred tags with existing ones.

    Also computes a relevance score for each item (stored in item["score"]).

    Args:
        items: List of PORID item dicts.
        tag_keywords: Tag keyword configuration.

    Returns:
        The same list with 'tags' and 'score' fields updated in place.
    """
    for item in items:
        inferred = classify(item, tag_keywords)
        existing = item.get("tags", [])
        # Merge: keep existing tags, add new inferred ones
        merged = list(dict.fromkeys(existing + inferred))  # preserve order, dedupe
        item["tags"] = merged

        # Compute relevance score (backward compatible - score is optional)
        item["score"] = score_item(item, tag_keywords)

    return items


# Alias for backward compatibility with spec
classify_all = classify_items


def main() -> None:
    """
    CLI entry point.

    If stdin has data, classify it. Otherwise, run a demo.

    Usage:
        python fetch_arxiv.py | python classify.py > classified.json
        python classify.py  # demo mode
    """
    config = load_config()
    tag_keywords = config.get("tags", {})

    if not tag_keywords:
        print("Warning: no tag keywords found in config.yaml", file=sys.stderr)

    if '--demo' in sys.argv:
        _run_demo(tag_keywords)
        return

    if sys.stdin.isatty():
        _run_demo(tag_keywords)
        return

    if True:  # pipe mode
        items = json.load(sys.stdin)
        print(f"Classifying {len(items)} items...", file=sys.stderr)

        classified = classify_items(items, tag_keywords)

        # Summary
        tag_counts: dict[str, int] = {}
        for item in classified:
            for tag in item.get("tags", []):
                tag_counts[tag] = tag_counts.get(tag, 0) + 1

        for tag, count in sorted(tag_counts.items(), key=lambda x: -x[1]):
            print(f"  {tag}: {count}", file=sys.stderr)

        json.dump(classified, sys.stdout, indent=2, ensure_ascii=False)
        print()


def _run_demo(tag_keywords: dict[str, list[str]]) -> None:
    """Run demo classification on sample items."""
    print("Demo mode — classifying sample items:\n")
    samples = [
        {"title": "A genetic algorithm for vehicle routing", "abstract": "We propose a metaheuristic approach...", "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"), "doi": "10.1234/test"},
        {"title": "Branch and cut for mixed-integer scheduling", "abstract": "We solve a MILP formulation of the job shop problem.", "date": "2026-03-20"},
        {"title": "Deep reinforcement learning for combinatorial optimization", "abstract": "Neural network policy for TSP.", "date": "2026-03-15"},
        {"title": "Nurse rostering in emergency departments", "abstract": "Healthcare scheduling using robust optimization.", "date": "2026-01-01"},
    ]
    for item in samples:
        tags = classify(item, tag_keywords)
        sc = score_item(item, tag_keywords)
        print(f"  {item['title'][:60]}")
        print(f"    -> tags: {tags}, score: {sc:.0f}\n")


if __name__ == "__main__":
    main()
