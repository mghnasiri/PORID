#!/usr/bin/env python3
"""
Fetch recent publications via the Semantic Scholar Academic Graph API.

Uses the bulk paper search endpoint with query strings from config.yaml.
Supports optional API key via the ``S2_API_KEY`` environment variable
for higher rate limits.

Usage:
    python fetch_semantic_scholar.py              # uses config.yaml defaults
    python fetch_semantic_scholar.py --days 14    # override lookback window

    # With API key for higher rate limits:
    S2_API_KEY=your-key python fetch_semantic_scholar.py
"""

from __future__ import annotations

import json
import os
import sys
import time
import argparse
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import requests
import yaml

S2_BULK_SEARCH_URL = "https://api.semanticscholar.org/graph/v1/paper/search/bulk"
S2_FIELDS = "title,authors,abstract,year,citationCount,url,externalIds,publicationDate"
RATE_LIMIT_SECONDS = 1.0  # shared rate limit without API key


def load_config(config_path: str = "config.yaml") -> dict:
    """Load pipeline configuration from YAML file."""
    path = Path(__file__).parent / config_path
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def get_headers() -> dict[str, str]:
    """
    Build request headers, optionally including the S2 API key.

    Returns:
        Headers dict with User-Agent and optional x-api-key.
    """
    headers = {
        "User-Agent": "PORID/1.0 (https://mghnasiri.github.io/PORID)",
    }
    api_key = os.environ.get("S2_API_KEY")
    if api_key:
        headers["x-api-key"] = api_key
    return headers


def compute_year_range(days: int) -> str:
    """
    Compute the year range string for S2 API from a lookback window.

    Args:
        days: Number of days to look back.

    Returns:
        Year range string, e.g. "2026" or "2025-2026".
    """
    now = datetime.now()
    start = now - timedelta(days=days)
    if start.year == now.year:
        return str(now.year)
    return f"{start.year}-{now.year}"


def fetch_query(
    query: str,
    year_range: str,
    fields_of_study: list[str],
    max_results: int = 20,
    lookback_days: int = 7,
) -> list[dict]:
    """
    Fetch papers matching a single search query.

    Args:
        query: Free-text search query (e.g., "vehicle routing problem").
        year_range: Year or year range string (e.g., "2025-2026").
        fields_of_study: List of S2 field of study names to filter.
        max_results: Maximum number of results to return.
        lookback_days: Used to filter results by publicationDate.

    Returns:
        List of paper dicts in the standard PORID schema.
    """
    headers = get_headers()
    cutoff_date = (datetime.now() - timedelta(days=lookback_days)).strftime("%Y-%m-%d")

    params: dict = {
        "query": query,
        "year": year_range,
        "fields": S2_FIELDS,
        "limit": min(max_results, 100),  # S2 bulk max per page is 1000
    }

    # Add fields of study filter if configured
    if fields_of_study:
        params["fieldsOfStudy"] = ",".join(fields_of_study)

    try:
        resp = requests.get(S2_BULK_SEARCH_URL, params=params, headers=headers, timeout=30)
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"    ✗ Error searching '{query}': {e}", file=sys.stderr)
        return []

    data = resp.json()
    papers = data.get("data", [])
    items: list[dict] = []

    for paper in papers:
        title = paper.get("title") or ""
        if not title:
            continue

        # Date filtering — S2 returns papers by year, but we want recent ones
        pub_date = paper.get("publicationDate") or ""
        if pub_date and pub_date < cutoff_date:
            continue

        # If no publicationDate, use year as fallback
        if not pub_date:
            year = paper.get("year")
            if year:
                pub_date = f"{year}-01-01"
            else:
                continue  # skip papers with no date info

        # Authors
        authors = [a.get("name", "") for a in paper.get("authors", []) if a.get("name")]

        # Abstract
        abstract = paper.get("abstract") or ""

        # IDs
        paper_id = paper.get("paperId", "")
        external_ids = paper.get("externalIds") or {}
        doi = external_ids.get("DOI", "")
        arxiv_id = external_ids.get("ArXiv", "")

        # URL: prefer DOI, fallback to S2 URL
        url = f"https://doi.org/{doi}" if doi else (paper.get("url") or f"https://www.semanticscholar.org/paper/{paper_id}")

        citation_count = paper.get("citationCount", 0)

        items.append({
            "id": f"s2-{paper_id[:12]}" if paper_id else f"s2-{hash(title)}",
            "title": title,
            "authors": authors,
            "abstract": abstract,
            "date": pub_date,
            "source": "Semantic Scholar",
            "source_detail": query,
            "url": url,
            "tags": [],
            "type": "publication",
            "doi": doi,
            "arxiv_id": arxiv_id,
            "citation_count": citation_count,
        })

    return items


def fetch_all_queries(config: dict) -> list[dict]:
    """
    Fetch papers for all configured Semantic Scholar queries.

    Args:
        config: Full pipeline configuration dict.

    Returns:
        Combined list of paper dicts from all queries.
    """
    s2_cfg = config.get("semantic_scholar", {})
    queries = s2_cfg.get("queries", [])
    fields = s2_cfg.get("fields_of_study", [])
    days = s2_cfg.get("lookback_days", 7)
    max_per_query = s2_cfg.get("max_results_per_query", 20)
    year_range = compute_year_range(days)

    all_items: list[dict] = []

    for i, query in enumerate(queries):
        print(f"  Searching Semantic Scholar: \"{query}\"", file=sys.stderr)

        try:
            items = fetch_query(
                query=query,
                year_range=year_range,
                fields_of_study=fields,
                max_results=max_per_query,
                lookback_days=days,
            )
            all_items.extend(items)
            print(f"    → {len(items)} papers", file=sys.stderr)
        except Exception as e:
            print(f"    ✗ Error: {e}", file=sys.stderr)

        if i < len(queries) - 1:
            time.sleep(RATE_LIMIT_SECONDS)

    return all_items


def main() -> None:
    """CLI entry point: fetch S2 papers and print JSON to stdout."""
    parser = argparse.ArgumentParser(description="Fetch recent papers via Semantic Scholar")
    parser.add_argument("--days", type=int, default=None, help="Override lookback window")
    parser.add_argument("--config", default="config.yaml", help="Path to config file")
    args = parser.parse_args()

    config = load_config(args.config)

    if args.days is not None:
        config.setdefault("semantic_scholar", {})["lookback_days"] = args.days

    has_key = bool(os.environ.get("S2_API_KEY"))
    print(f"Fetching Semantic Scholar papers (API key: {'yes' if has_key else 'no'})...", file=sys.stderr)

    items = fetch_all_queries(config)
    print(f"Total: {len(items)} papers fetched.", file=sys.stderr)

    json.dump(items, sys.stdout, indent=2, ensure_ascii=False)
    print()


if __name__ == "__main__":
    main()
