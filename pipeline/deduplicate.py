#!/usr/bin/env python3
"""
Deduplication module for PORID pipeline items.

Two-pass deduplication:
  1. Exact DOI match — keep first seen.
  2. Normalized title Jaccard similarity > 0.85 — keep first seen.

Usage:
    # As a module:
    from deduplicate import deduplicate
    unique = deduplicate(items)

    # Standalone:
    python deduplicate.py < items.json > deduped.json
"""

from __future__ import annotations

import json
import re
import sys
from typing import Optional


def deduplicate(items: list[dict], threshold: float = 0.85) -> list[dict]:
    """
    Remove duplicate items using DOI matching and title similarity.

    Pass 1: Items with identical DOIs are deduplicated (first seen wins).
    Pass 2: For remaining items, normalized title Jaccard similarity above
    the threshold triggers deduplication (first seen wins).

    Args:
        items: List of PORID item dicts.
        threshold: Jaccard similarity threshold for title-based dedup.
                   Default is 0.85 (85% word overlap).

    Returns:
        Deduplicated list of items.
    """
    if not items:
        return []

    # --- Pass 1: exact DOI match ---
    seen_dois: set[str] = set()
    after_doi: list[dict] = []
    doi_dupes = 0

    for item in items:
        doi = (item.get("doi") or "").strip().lower()
        if doi:
            if doi in seen_dois:
                doi_dupes += 1
                _log_dupe("DOI", item)
                continue
            seen_dois.add(doi)
        after_doi.append(item)

    if doi_dupes:
        print(f"  DOI dedup: removed {doi_dupes} duplicates", file=sys.stderr)

    # --- Pass 2: title Jaccard similarity ---
    kept: list[dict] = []
    kept_word_sets: list[set[str]] = []
    title_dupes = 0

    for item in after_doi:
        title = item.get("title") or item.get("name") or ""
        word_set = _normalize_title(title)

        if not word_set:
            kept.append(item)
            kept_word_sets.append(word_set)
            continue

        is_dupe = False
        for existing_set in kept_word_sets:
            if not existing_set:
                continue
            sim = _jaccard(word_set, existing_set)
            if sim > threshold:
                is_dupe = True
                title_dupes += 1
                _log_dupe(f"Title (Jaccard={sim:.2f})", item)
                break

        if not is_dupe:
            kept.append(item)
            kept_word_sets.append(word_set)

    if title_dupes:
        print(f"  Title dedup: removed {title_dupes} duplicates", file=sys.stderr)

    total_removed = doi_dupes + title_dupes
    print(
        f"  Dedup summary: {len(items)} → {len(kept)} items "
        f"({total_removed} duplicates removed)",
        file=sys.stderr,
    )

    return kept


def _normalize_title(title: str) -> set[str]:
    """
    Normalize a title string for comparison.

    Lowercases, strips punctuation, and splits into a word set.

    Args:
        title: Raw title string.

    Returns:
        Set of normalized words.
    """
    lower = title.lower()
    # Remove punctuation
    clean = re.sub(r"[^\w\s]", "", lower)
    # Split to words, filter out very short words (a, an, to, etc.)
    words = {w for w in clean.split() if len(w) > 2}
    return words


def _jaccard(set_a: set[str], set_b: set[str]) -> float:
    """
    Compute Jaccard similarity between two sets.

    Args:
        set_a: First word set.
        set_b: Second word set.

    Returns:
        Jaccard similarity coefficient in [0, 1].
    """
    if not set_a and not set_b:
        return 1.0
    intersection = len(set_a & set_b)
    union = len(set_a | set_b)
    return intersection / union if union > 0 else 0.0


def _log_dupe(reason: str, item: dict) -> None:
    """Log a removed duplicate to stderr."""
    title = (item.get("title") or item.get("name") or "?")[:60]
    print(f"    ✗ Removed ({reason}): {title}...", file=sys.stderr)


def main() -> None:
    """
    CLI entry point: read items from stdin, deduplicate, write to stdout.

    Usage:
        cat all_items.json | python deduplicate.py > deduped.json
    """
    items = json.load(sys.stdin)
    print(f"Deduplicating {len(items)} items...", file=sys.stderr)

    unique = deduplicate(items)

    json.dump(unique, sys.stdout, indent=2, ensure_ascii=False)
    print()


if __name__ == "__main__":
    main()
