#!/usr/bin/env python3
"""
Tag classifier for PORID pipeline items.

Scans title + abstract (lowercased) for keyword matches defined in
config.yaml and returns all matching tags. Defaults to ["general-or"]
if no tags match.

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


def classify_items(
    items: list[dict],
    tag_keywords: dict[str, list[str]],
) -> list[dict]:
    """
    Classify a list of items, merging inferred tags with existing ones.

    Args:
        items: List of PORID item dicts.
        tag_keywords: Tag keyword configuration.

    Returns:
        The same list with 'tags' fields updated in place.
    """
    for item in items:
        inferred = classify(item, tag_keywords)
        existing = item.get("tags", [])
        # Merge: keep existing tags, add new inferred ones
        merged = list(dict.fromkeys(existing + inferred))  # preserve order, dedupe
        item["tags"] = merged

    return items


def main() -> None:
    """
    CLI entry point: read items from stdin, classify, write to stdout.

    Usage:
        python fetch_arxiv.py | python classify.py > classified.json
    """
    config = load_config()
    tag_keywords = config.get("tags", {})

    if not tag_keywords:
        print("Warning: no tag keywords found in config.yaml", file=sys.stderr)

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


if __name__ == "__main__":
    main()
