#!/usr/bin/env python3
"""
Fetch recent arXiv papers by category via the arXiv Atom API.

Usage:
    python fetch_arxiv.py              # uses config.yaml defaults
    python fetch_arxiv.py --days 5     # override lookback window
"""

from __future__ import annotations

import json
import sys
import time
import argparse
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import requests
import yaml

# arXiv Atom namespace
ATOM_NS = "{http://www.w3.org/2005/Atom}"
ARXIV_NS = "{http://arxiv.org/schemas/atom}"

ARXIV_API_URL = "http://export.arxiv.org/api/query"
RATE_LIMIT_SECONDS = 3


def load_config(config_path: str = "config.yaml") -> dict:
    """Load pipeline configuration from YAML file."""
    path = Path(__file__).parent / config_path
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def fetch_category(
    category: str,
    days: int = 3,
    max_results: int = 50,
) -> list[dict]:
    """
    Fetch recent papers from a single arXiv category.

    Args:
        category: arXiv category string, e.g. 'math.OC'.
        days: How many days back to search.
        max_results: Maximum number of results per category.

    Returns:
        List of paper dicts in the standard PORID schema.
    """
    params = {
        "search_query": f"cat:{category}",
        "sortBy": "submittedDate",
        "sortOrder": "descending",
        "start": 0,
        "max_results": max_results,
    }

    resp = requests.get(ARXIV_API_URL, params=params, timeout=30)
    resp.raise_for_status()

    root = ET.fromstring(resp.text)
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    items: list[dict] = []

    for entry in root.findall(f"{ATOM_NS}entry"):
        published_str = _text(entry, f"{ATOM_NS}published")
        if not published_str:
            continue

        published = datetime.fromisoformat(published_str.replace("Z", "+00:00"))
        if published < cutoff:
            continue

        arxiv_id = _text(entry, f"{ATOM_NS}id", "")
        # Extract just the ID portion (e.g., "2503.09012v1")
        short_id = arxiv_id.split("/abs/")[-1] if "/abs/" in arxiv_id else arxiv_id

        title = _text(entry, f"{ATOM_NS}title", "").replace("\n", " ").strip()
        abstract = _text(entry, f"{ATOM_NS}summary", "").replace("\n", " ").strip()

        authors = [
            name.text.strip()
            for author in entry.findall(f"{ATOM_NS}author")
            if (name := author.find(f"{ATOM_NS}name")) is not None and name.text
        ]

        # Extract DOI if present
        doi = _text(entry, f"{ARXIV_NS}doi", "")

        # Primary category
        primary_cat = ""
        primary_el = entry.find(f"{ARXIV_NS}primary_category")
        if primary_el is not None:
            primary_cat = primary_el.get("term", "")

        items.append({
            "id": f"arxiv-{short_id}",
            "title": title,
            "authors": authors,
            "abstract": abstract,
            "date": published.strftime("%Y-%m-%d"),
            "source": "arXiv",
            "url": f"https://arxiv.org/abs/{short_id}",
            "tags": [primary_cat] if primary_cat else [],
            "type": "publication",
            "doi": doi if doi else f"10.48550/arXiv.{short_id.split('v')[0]}",
        })

    return items


def fetch_all_categories(
    categories: list[str],
    days: int = 3,
    max_results: int = 50,
) -> list[dict]:
    """
    Fetch papers from all configured arXiv categories.

    Respects rate limits with a 3-second delay between requests.

    Args:
        categories: List of arXiv category strings.
        days: Lookback window in days.
        max_results: Max results per category.

    Returns:
        Combined list of paper dicts.
    """
    all_items: list[dict] = []

    for i, cat in enumerate(categories):
        print(f"  Fetching arXiv category: {cat}", file=sys.stderr)
        try:
            items = fetch_category(cat, days=days, max_results=max_results)
            all_items.extend(items)
            print(f"    → {len(items)} papers", file=sys.stderr)
        except requests.RequestException as e:
            print(f"    ✗ Error fetching {cat}: {e}", file=sys.stderr)

        # Rate limit: wait between requests (skip after last)
        if i < len(categories) - 1:
            time.sleep(RATE_LIMIT_SECONDS)

    return all_items


def _text(element: ET.Element, tag: str, default: Optional[str] = None) -> str:
    """Safely extract text from an XML element by tag."""
    el = element.find(tag)
    if el is not None and el.text:
        return el.text
    return default if default is not None else ""


def main() -> None:
    """CLI entry point: fetch arXiv papers and print JSON to stdout."""
    parser = argparse.ArgumentParser(description="Fetch recent arXiv papers")
    parser.add_argument("--days", type=int, default=3, help="Lookback window in days")
    parser.add_argument("--config", default="config.yaml", help="Path to config file")
    args = parser.parse_args()

    config = load_config(args.config)
    categories = config.get("arxiv_categories", ["math.OC"])
    max_items = config.get("max_items_per_source", 50)

    print(f"Fetching arXiv papers (last {args.days} days)...", file=sys.stderr)
    items = fetch_all_categories(categories, days=args.days, max_results=max_items)
    print(f"Total: {len(items)} papers fetched.", file=sys.stderr)

    json.dump(items, sys.stdout, indent=2, ensure_ascii=False)
    print()  # trailing newline


if __name__ == "__main__":
    main()
