#!/usr/bin/env python3
"""
Fetch recent arXiv papers using the official ``arxiv`` Python library.

Uses ``arxiv.Client`` with built-in rate-limiting and retry logic
rather than raw HTTP requests to the Atom API.

Usage:
    python fetch_arxiv.py              # uses config.yaml defaults
    python fetch_arxiv.py --days 5     # override lookback window
"""

from __future__ import annotations

import json
import sys
import argparse
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import arxiv
import yaml


def load_config(config_path: str = "config.yaml") -> dict:
    """Load pipeline configuration from YAML file."""
    path = Path(__file__).parent / config_path
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def fetch_category(
    client: arxiv.Client,
    category: str,
    days: int = 3,
    max_results: int = 50,
) -> list[dict]:
    """
    Fetch recent papers from a single arXiv category.

    Args:
        client: Pre-configured arxiv.Client instance.
        category: arXiv category string, e.g. 'math.OC'.
        days: How many days back to include.
        max_results: Maximum number of results per category.

    Returns:
        List of paper dicts in the standard PORID schema.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    search = arxiv.Search(
        query=f"cat:{category}",
        max_results=max_results,
        sort_by=arxiv.SortCriterion.SubmittedDate,
        sort_order=arxiv.SortOrder.Descending,
    )

    items: list[dict] = []

    for result in client.results(search):
        # The arxiv library returns timezone-aware datetimes
        if result.published < cutoff:
            # Results are sorted newest first — once we pass the cutoff
            # we can stop, but sometimes ordering is imperfect, so we
            # continue for a few more to catch stragglers.
            continue

        arxiv_id = result.get_short_id()            # e.g. "2503.09012v1"
        base_id = arxiv_id.split("v")[0]             # e.g. "2503.09012"

        title = result.title.replace("\n", " ").strip()
        abstract = result.summary.replace("\n", " ").strip()
        authors = [a.name for a in result.authors]

        # Primary category from the result
        primary_cat = result.primary_category or category

        # DOI: use the official one if present, else the arxiv DOI
        doi = result.doi or f"10.48550/arXiv.{base_id}"

        items.append({
            "id": f"arxiv-{base_id}",
            "title": title,
            "authors": authors,
            "abstract": abstract,
            "date": result.published.strftime("%Y-%m-%d"),
            "source": "arXiv",
            "source_detail": primary_cat,
            "url": result.entry_id,
            "tags": [primary_cat] if primary_cat else [],
            "type": "publication",
            "doi": doi,
            "arxiv_id": arxiv_id,
        })

    return items


def fetch_all_categories(config: dict) -> list[dict]:
    """
    Fetch papers from all configured arXiv categories.

    The arxiv.Client handles rate limiting internally via
    ``delay_seconds`` and ``num_retries``.

    Args:
        config: Full pipeline configuration dict.

    Returns:
        Combined list of paper dicts from all categories.
    """
    arxiv_cfg = config.get("arxiv", {})
    categories = arxiv_cfg.get("categories", ["math.OC"])
    max_results = arxiv_cfg.get("max_results_per_category", 50)
    lookback = arxiv_cfg.get("lookback_days", 3)
    delay = arxiv_cfg.get("delay_seconds", 3)

    client = arxiv.Client(
        page_size=100,
        delay_seconds=delay,
        num_retries=3,
    )

    all_items: list[dict] = []

    for cat in categories:
        print(f"  Fetching arXiv category: {cat}", file=sys.stderr)
        try:
            items = fetch_category(client, cat, days=lookback, max_results=max_results)
            all_items.extend(items)
            print(f"    → {len(items)} papers", file=sys.stderr)
        except Exception as e:
            print(f"    ✗ Error fetching {cat}: {e}", file=sys.stderr)

    return all_items


def main() -> None:
    """CLI entry point: fetch arXiv papers and print JSON to stdout."""
    parser = argparse.ArgumentParser(description="Fetch recent arXiv papers")
    parser.add_argument("--days", type=int, default=None, help="Override lookback window")
    parser.add_argument("--config", default="config.yaml", help="Path to config file")
    args = parser.parse_args()

    config = load_config(args.config)

    if args.days is not None:
        config.setdefault("arxiv", {})["lookback_days"] = args.days

    lookback = config.get("arxiv", {}).get("lookback_days", 3)
    print(f"Fetching arXiv papers (last {lookback} days)...", file=sys.stderr)

    items = fetch_all_categories(config)
    print(f"Total: {len(items)} papers fetched.", file=sys.stderr)

    json.dump(items, sys.stdout, indent=2, ensure_ascii=False)
    print()  # trailing newline


if __name__ == "__main__":
    main()
