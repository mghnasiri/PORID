#!/usr/bin/env python3
"""
Fetch recent publications from the Optimization Online RSS feed.

Parses the RSS feed and extracts publication metadata in the standard
PORID schema for merging with other publication sources.

Usage:
    python fetch_optim_online.py
"""

from __future__ import annotations

import json
import re
import sys
import hashlib
from datetime import datetime
from typing import Optional

import feedparser


FEED_URL = "https://optimization-online.org/?feed=rss2"


def parse_author_from_title(raw_title: str) -> tuple[list[str], str]:
    """
    Attempt to parse author names from the title pattern "Author1, Author2: Title".

    Some Optimization Online entries embed authors in the title before a colon.
    This function extracts them when the pattern is present.

    Args:
        raw_title: The raw RSS entry title.

    Returns:
        Tuple of (authors list, cleaned title).
    """
    # Pattern: "Name1, Name2: Actual Title"
    match = re.match(r"^(.+?):\s+(.+)$", raw_title)
    if match:
        potential_authors = match.group(1).strip()
        title = match.group(2).strip()
        # Heuristic: if the part before colon looks like names (contains commas
        # and each segment is short-ish), treat as authors
        parts = [p.strip() for p in potential_authors.split(",")]
        if all(len(p) < 60 for p in parts) and len(parts) <= 10:
            return parts, title
    return [], raw_title


def fetch_optim_online() -> list[dict]:
    """
    Fetch and parse the Optimization Online RSS feed.

    Returns:
        List of publication dicts in the standard PORID schema.
    """
    feed = feedparser.parse(FEED_URL)
    items: list[dict] = []

    for entry in feed.entries:
        raw_title: str = entry.get("title", "").strip()
        if not raw_title:
            continue

        link: str = entry.get("link", "")
        summary: str = entry.get("summary", "") or entry.get("description", "") or ""

        # Strip HTML tags from summary
        summary = re.sub(r"<[^>]+>", "", summary).strip()
        if len(summary) > 500:
            summary = summary[:500] + "\u2026"

        # Parse date
        date_str = ""
        published = entry.get("published_parsed") or entry.get("updated_parsed")
        if published:
            try:
                dt = datetime(*published[:6])
                date_str = dt.strftime("%Y-%m-%d")
            except (TypeError, ValueError):
                pass

        # Parse authors from title if present
        authors, title = parse_author_from_title(raw_title)

        # Generate stable ID
        id_hash = hashlib.md5(link.encode() if link else title.encode()).hexdigest()[:12]

        items.append({
            "id": f"optim-online-{id_hash}",
            "title": title,
            "authors": authors,
            "abstract": summary,
            "date": date_str,
            "source": "Optimization Online",
            "url": link,
            "tags": [],
            "type": "publication",
        })

    return items


def main() -> None:
    """CLI entry point: fetch Optimization Online feed and print JSON."""
    print("Fetching Optimization Online RSS feed...", file=sys.stderr)
    items = fetch_optim_online()
    print(f"Total: {len(items)} items fetched.", file=sys.stderr)
    json.dump(items, sys.stdout, indent=2, ensure_ascii=False)
    print()


if __name__ == "__main__":
    main()
