#!/usr/bin/env python3
"""
Fetch recent journal articles via the Crossref REST API.

Queries by ISSN for each configured journal and returns items
in the standard PORID schema.

Usage:
    python fetch_crossref.py              # uses config.yaml defaults
    python fetch_crossref.py --days 14    # override lookback window
"""

from __future__ import annotations

import json
import sys
import time
import argparse
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import requests
import yaml

CROSSREF_API_URL = "https://api.crossref.org/journals/{issn}/works"
RATE_LIMIT_SECONDS = 1  # polite pool is generous; 1s is safe


def load_config(config_path: str = "config.yaml") -> dict:
    """Load pipeline configuration from YAML file."""
    path = Path(__file__).parent / config_path
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def fetch_journal(
    issn: str,
    journal_name: str,
    days: int = 7,
    max_results: int = 50,
    email: str = "porid-pipeline@example.com",
) -> list[dict]:
    """
    Fetch recent works from a single journal by ISSN.

    Args:
        issn: The journal's ISSN (e.g., '0030-364X').
        journal_name: Human-readable journal name for the source field.
        days: How many days back to search.
        max_results: Maximum number of results.
        email: Contact email for Crossref polite pool.

    Returns:
        List of article dicts in the standard PORID schema.
    """
    from_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    until_date = datetime.now().strftime("%Y-%m-%d")

    params = {
        "filter": f"from-pub-date:{from_date},until-pub-date:{until_date}",
        "rows": max_results,
        "sort": "published",
        "order": "desc",
    }

    headers = {
        "User-Agent": f"PORID/1.0 (mailto:{email})",
    }

    url = CROSSREF_API_URL.format(issn=issn)

    try:
        resp = requests.get(url, params=params, headers=headers, timeout=30)
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"    ✗ Error fetching {issn} ({journal_name}): {e}", file=sys.stderr)
        return []

    data = resp.json()
    works = data.get("message", {}).get("items", [])
    items: list[dict] = []

    for work in works:
        doi = work.get("DOI", "")
        title = _join_text(work.get("title", []))
        if not title:
            continue

        authors = _extract_authors(work.get("author", []))
        abstract = _clean_abstract(work.get("abstract", ""))
        pub_date = _extract_date(work)
        work_url = f"https://doi.org/{doi}" if doi else ""

        items.append({
            "id": f"crossref-{doi.replace('/', '-')}" if doi else f"crossref-{hash(title)}",
            "title": title,
            "authors": authors,
            "abstract": abstract,
            "date": pub_date,
            "source": journal_name,
            "url": work_url,
            "tags": [],  # will be filled by classify.py
            "type": "publication",
            "doi": doi,
        })

    return items


def fetch_all_journals(
    journals: list[dict],
    days: int = 7,
    max_results: int = 50,
    email: str = "porid-pipeline@example.com",
) -> list[dict]:
    """
    Fetch articles from all configured journals.

    Args:
        journals: List of dicts with 'issn' and 'name' keys.
        days: Lookback window in days.
        max_results: Max results per journal.
        email: Contact email for Crossref polite pool.

    Returns:
        Combined list of article dicts.
    """
    all_items: list[dict] = []

    for i, journal in enumerate(journals):
        issn = journal["issn"]
        name = journal["name"]
        print(f"  Fetching Crossref: {name} ({issn})", file=sys.stderr)

        items = fetch_journal(
            issn, name, days=days, max_results=max_results, email=email
        )
        all_items.extend(items)
        print(f"    → {len(items)} articles", file=sys.stderr)

        if i < len(journals) - 1:
            time.sleep(RATE_LIMIT_SECONDS)

    return all_items


def _join_text(parts: list) -> str:
    """Join a Crossref title array (usually single element) into one string."""
    return " ".join(str(p) for p in parts).strip()


def _extract_authors(author_list: list[dict]) -> list[str]:
    """Extract author names from Crossref author objects."""
    authors: list[str] = []
    for a in author_list:
        given = a.get("given", "")
        family = a.get("family", "")
        if family:
            name = f"{family}, {given[0]}." if given else family
            authors.append(name)
    return authors


def _clean_abstract(raw: str) -> str:
    """Strip JATS XML tags from Crossref abstracts."""
    if not raw:
        return ""
    # Remove XML/HTML tags
    clean = re.sub(r"<[^>]+>", "", raw)
    return clean.strip()


def _extract_date(work: dict) -> str:
    """
    Extract the best available publication date from a Crossref work.

    Tries published-print → published-online → created, in that order.
    """
    for key in ("published-print", "published-online", "created"):
        date_obj = work.get(key)
        if date_obj and "date-parts" in date_obj:
            parts = date_obj["date-parts"][0]
            if len(parts) >= 3:
                return f"{parts[0]:04d}-{parts[1]:02d}-{parts[2]:02d}"
            elif len(parts) >= 2:
                return f"{parts[0]:04d}-{parts[1]:02d}-01"
            elif len(parts) >= 1:
                return f"{parts[0]:04d}-01-01"
    return datetime.now().strftime("%Y-%m-%d")


def main() -> None:
    """CLI entry point: fetch Crossref articles and print JSON to stdout."""
    parser = argparse.ArgumentParser(description="Fetch recent journal articles via Crossref")
    parser.add_argument("--days", type=int, default=7, help="Lookback window in days")
    parser.add_argument("--config", default="config.yaml", help="Path to config file")
    args = parser.parse_args()

    config = load_config(args.config)
    journals = config.get("crossref_issns", [])
    max_items = config.get("max_items_per_source", 50)
    email = config.get("email_recipient", "porid-pipeline@example.com")

    print(f"Fetching Crossref articles (last {args.days} days)...", file=sys.stderr)
    items = fetch_all_journals(journals, days=args.days, max_results=max_items, email=email)
    print(f"Total: {len(items)} articles fetched.", file=sys.stderr)

    json.dump(items, sys.stdout, indent=2, ensure_ascii=False)
    print()


if __name__ == "__main__":
    main()
