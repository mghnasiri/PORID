#!/usr/bin/env python3
"""
Fetch recent publications via the OpenAlex API.

Queries by concept ID for each configured OR concept and returns items
in the standard PORID schema. Abstracts are reconstructed from the
inverted index format that OpenAlex uses.

Usage:
    python fetch_openalex.py              # uses config.yaml defaults
    python fetch_openalex.py --days 14    # override lookback window
"""

from __future__ import annotations

import json
import sys
import time
import argparse
from datetime import datetime, timedelta
from pathlib import Path

import requests
import yaml

OPENALEX_API_URL = "https://api.openalex.org/works"
RATE_LIMIT_SECONDS = 0.5


def load_config(config_path: str = "config.yaml") -> dict:
    """Load pipeline configuration from YAML file."""
    path = Path(__file__).parent / config_path
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def reconstruct_abstract(inv_index: dict | None) -> str:
    """
    Reconstruct a readable abstract from OpenAlex's inverted index format.

    OpenAlex stores abstracts as ``{"word": [pos1, pos2, ...], ...}``
    where each word maps to its position(s) in the text. We sort by
    position and join to produce the original string.

    Args:
        inv_index: The ``abstract_inverted_index`` dict from the API.

    Returns:
        Reconstructed abstract string, or empty string if not available.
    """
    if not inv_index:
        return ""
    word_positions: list[tuple[int, str]] = []
    for word, positions in inv_index.items():
        for pos in positions:
            word_positions.append((pos, word))
    word_positions.sort()
    return " ".join(w for _, w in word_positions)


def fetch_concept(
    concept_id: str,
    concept_name: str,
    days: int = 7,
    max_results: int = 100,
    mailto: str = "mg.nasiri@ulaval.ca",
) -> list[dict]:
    """
    Fetch recent works for a single OpenAlex concept.

    Args:
        concept_id: OpenAlex concept ID (e.g., 'C124101348').
        concept_name: Human-readable concept name for logging.
        days: How many days back to search.
        max_results: Maximum number of results.
        mailto: Contact email for polite pool.

    Returns:
        List of publication dicts in the standard PORID schema.
    """
    from_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

    params = {
        "filter": f"concepts.id:{concept_id},from_publication_date:{from_date}",
        "sort": "publication_date:desc",
        "per_page": min(max_results, 200),  # OpenAlex max per_page is 200
        "mailto": mailto,
    }

    try:
        resp = requests.get(OPENALEX_API_URL, params=params, timeout=30)
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"    ✗ Error fetching concept {concept_name}: {e}", file=sys.stderr)
        return []

    data = resp.json()
    results = data.get("results", [])
    items: list[dict] = []

    for work in results:
        openalex_id = work.get("id", "")
        short_id = openalex_id.split("/")[-1] if "/" in openalex_id else openalex_id

        title = work.get("title") or ""
        if not title:
            continue

        # Authors
        authors = []
        for authorship in work.get("authorships", []):
            author_obj = authorship.get("author", {})
            name = author_obj.get("display_name", "")
            if name:
                authors.append(name)

        # Abstract from inverted index
        abstract = reconstruct_abstract(work.get("abstract_inverted_index"))

        # DOI
        doi = work.get("doi") or ""
        if doi.startswith("https://doi.org/"):
            doi = doi[len("https://doi.org/"):]

        # Date
        pub_date = work.get("publication_date") or ""

        # Source
        source_detail = ""
        primary_loc = work.get("primary_location") or {}
        source_obj = primary_loc.get("source") or {}
        source_detail = source_obj.get("display_name", "")

        # URL: prefer DOI link, fallback to OpenAlex landing page
        url = f"https://doi.org/{doi}" if doi else work.get("id", "")

        items.append({
            "id": f"openalex-{short_id}",
            "title": title,
            "authors": authors,
            "abstract": abstract,
            "date": pub_date,
            "source": "OpenAlex",
            "source_detail": source_detail,
            "url": url,
            "tags": [],
            "type": "publication",
            "doi": doi,
            "citation_count": work.get("cited_by_count", 0),
        })

    return items


def fetch_all_concepts(config: dict) -> list[dict]:
    """
    Fetch publications for all configured OpenAlex concepts.

    Args:
        config: Full pipeline configuration dict.

    Returns:
        Combined list of publication dicts.
    """
    oa_cfg = config.get("openalex", {})
    concepts = oa_cfg.get("concepts", [])
    days = oa_cfg.get("lookback_days", 7)
    max_results = oa_cfg.get("max_results", 100)
    mailto = oa_cfg.get("mailto", "mg.nasiri@ulaval.ca")

    all_items: list[dict] = []

    for i, concept in enumerate(concepts):
        cid = concept["id"]
        cname = concept["name"]
        print(f"  Fetching OpenAlex concept: {cname} ({cid})", file=sys.stderr)

        try:
            items = fetch_concept(cid, cname, days=days, max_results=max_results, mailto=mailto)
            all_items.extend(items)
            print(f"    → {len(items)} publications", file=sys.stderr)
        except Exception as e:
            print(f"    ✗ Error: {e}", file=sys.stderr)

        if i < len(concepts) - 1:
            time.sleep(RATE_LIMIT_SECONDS)

    return all_items


def main() -> None:
    """CLI entry point: fetch OpenAlex publications and print JSON to stdout."""
    parser = argparse.ArgumentParser(description="Fetch recent publications via OpenAlex")
    parser.add_argument("--days", type=int, default=None, help="Override lookback window")
    parser.add_argument("--config", default="config.yaml", help="Path to config file")
    args = parser.parse_args()

    config = load_config(args.config)

    if args.days is not None:
        config.setdefault("openalex", {})["lookback_days"] = args.days

    print("Fetching OpenAlex publications...", file=sys.stderr)
    items = fetch_all_concepts(config)
    print(f"Total: {len(items)} publications fetched.", file=sys.stderr)

    json.dump(items, sys.stdout, indent=2, ensure_ascii=False)
    print()


if __name__ == "__main__":
    main()
