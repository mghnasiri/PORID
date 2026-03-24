#!/usr/bin/env python3
"""
PORID — Fetch CORDIS / Horizon Europe funded projects.

Queries the EU Open Data Portal for Horizon Europe projects related to
Operations Research topics. Uses the CORDIS dataset via the SPARQL endpoint
at data.europa.eu.

Free, no API key required.

Fallback: Direct CORDIS search API at cordis.europa.eu.

Usage:
    python fetch_cordis.py
    python fetch_cordis.py --test
"""

from __future__ import annotations

import json
import sys
import time
import hashlib
from datetime import datetime, timezone
from pathlib import Path

import requests

# ── CORDIS project search API ────────────────────────────────────────
# The public search endpoint at cordis.europa.eu supports JSON responses.
CORDIS_SEARCH_API = "https://cordis.europa.eu/search/en"

# OR-relevant search queries for CORDIS
SEARCH_QUERIES = [
    "operations research optimization",
    "combinatorial optimization",
    "integer programming",
    "mathematical optimization logistics",
    "vehicle routing scheduling",
    "supply chain optimization",
    "stochastic optimization",
    "machine learning optimization",
]

HEADERS = {
    "User-Agent": "PORID-Pipeline/2.0 (https://mghnasiri.github.io/PORID)",
    "Accept": "application/json",
}

# ── Alternative: OpenAIRE Research Graph API ─────────────────────────
# OpenAIRE aggregates Horizon Europe, NSF, and other funded projects.
# Free, no auth needed, well-structured JSON.
OPENAIRE_API = "https://api.openaire.eu/search/projects"


def fetch_openaire_projects(
    max_per_query: int = 20,
) -> list[dict]:
    """
    Fetch OR-relevant funded projects from the OpenAIRE Research Graph.

    OpenAIRE aggregates projects from Horizon Europe, FP7, NSF, FCT, etc.
    Free API, no authentication required.

    Returns:
        List of opportunity dicts in PORID schema.
    """
    seen_ids: set[str] = set()
    all_items: list[dict] = []

    # Focus on Horizon Europe and FP7 projects
    queries = [
        "operations research",
        "combinatorial optimization",
        "integer programming",
        "vehicle routing",
        "supply chain optimization",
        "scheduling optimization",
        "mathematical programming",
    ]

    for query in queries:
        print(f"    OpenAIRE query: {query!r}...", file=sys.stderr)

        params = {
            "keywords": query,
            "format": "json",
            "size": max_per_query,
            "funder": "ec",  # European Commission projects
            "sortBy": "projectstartdate,descending",
        }

        try:
            resp = requests.get(OPENAIRE_API, params=params, headers=HEADERS, timeout=20)
            if resp.status_code != 200:
                print(f"      ! HTTP {resp.status_code}", file=sys.stderr)
                continue

            data = resp.json()
            response = data.get("response", {})
            results_wrapper = response.get("results", {})
            if results_wrapper is None:
                results_wrapper = {}
            results = results_wrapper.get("result", [])
            if results is None:
                results = []
            if not isinstance(results, list):
                results = [results] if results else []

            print(f"      -> {len(results)} projects", file=sys.stderr)

            for result in results:
                try:
                    project = result.get("metadata", {}).get("oaf:entity", {}).get("oaf:project", {})
                    if not project:
                        continue

                    # OpenAIRE uses {"$": "value"} pattern for leaf values
                    def val(obj, key, default=""):
                        """Extract value from OpenAIRE's {key: {"$": value}} format."""
                        v = obj.get(key, default)
                        if isinstance(v, dict):
                            return v.get("$", default) or default
                        return v if v else default

                    project_id = val(project, "code")
                    if not project_id:
                        title_raw = val(project, "title")
                        project_id = hashlib.md5(str(title_raw).encode()).hexdigest()[:10]

                    if project_id in seen_ids:
                        continue
                    seen_ids.add(project_id)

                    title = val(project, "title").strip()
                    if not title or len(title) < 5:
                        continue

                    acronym = val(project, "acronym")
                    start_date = val(project, "startdate")[:10]
                    end_date = val(project, "enddate")[:10]
                    website = val(project, "websiteurl")
                    summary = val(project, "summary")[:500]
                    call_id = val(project, "callidentifier")

                    # Extract contract type (ERC-COG, ERC-STG, etc.)
                    contract = project.get("contracttype", {})
                    contract_name = ""
                    if isinstance(contract, dict):
                        contract_name = contract.get("@classname", "") or ""

                    # Build display title
                    source_label = call_id or contract_name or "Horizon Europe"
                    display_title = f"[{source_label}] {acronym}: {title}" if acronym else f"[{source_label}] {title}"

                    # Use today's date so items don't get stale-dropped
                    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

                    all_items.append({
                        "id": f"cordis-{project_id}",
                        "title": display_title[:200],
                        "type": "opportunity",
                        "subtype": "project",
                        "institution": "European Commission",
                        "location": "EU",
                        "url": website or f"https://cordis.europa.eu/project/id/{project_id}",
                        "deadline": end_date,
                        "date": today,
                        "project_start": start_date,
                        "project_end": end_date,
                        "source": "CORDIS/OpenAIRE",
                        "tags": ["funded-project", "eu"],
                        "description": summary or f"EU-funded project ({start_date} to {end_date})",
                    })
                except Exception as e:
                    print(f"      ! Parse error for result: {e}", file=sys.stderr)
                    continue

        except requests.RequestException as e:
            print(f"      ! Request error: {e}", file=sys.stderr)
        except Exception as e:
            print(f"      ! Parse error: {e}", file=sys.stderr)

        time.sleep(0.5)

    return all_items


def fetch_cordis_search(max_results: int = 50) -> list[dict]:
    """
    Fallback: scrape CORDIS search results.

    CORDIS doesn't have a clean REST API, but its search pages
    return HTML that can be parsed. This is fragile but useful
    as a backup if OpenAIRE is down.

    Returns:
        List of opportunity dicts.
    """
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        print("    ! BeautifulSoup not available for CORDIS scraping", file=sys.stderr)
        return []

    items: list[dict] = []
    seen_ids: set[str] = set()

    for query in SEARCH_QUERIES[:3]:  # Limit scraping queries
        print(f"    CORDIS search: {query!r}...", file=sys.stderr)

        params = {
            "q": query,
            "type": "project",
            "p": 1,
            "num": 10,
        }

        try:
            resp = requests.get(
                CORDIS_SEARCH_API,
                params=params,
                headers={**HEADERS, "Accept": "text/html"},
                timeout=15,
            )
            if resp.status_code != 200:
                print(f"      ! HTTP {resp.status_code}", file=sys.stderr)
                continue

            soup = BeautifulSoup(resp.text, "html.parser")
            results = soup.select(".result-item, .search-result")

            for result in results:
                link = result.find("a")
                if not link:
                    continue
                title = link.get_text(strip=True)
                href = link.get("href", "")
                if not title or not href:
                    continue

                pid = hashlib.md5(href.encode()).hexdigest()[:10]
                if pid in seen_ids:
                    continue
                seen_ids.add(pid)

                if not href.startswith("http"):
                    href = f"https://cordis.europa.eu{href}"

                today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

                items.append({
                    "id": f"cordis-{pid}",
                    "title": title[:200],
                    "type": "opportunity",
                    "subtype": "project",
                    "institution": "European Commission",
                    "location": "EU",
                    "url": href,
                    "deadline": "",
                    "date": today,
                    "source": "CORDIS",
                    "tags": ["funded-project", "eu"],
                    "description": "",
                })

        except Exception as e:
            print(f"      ! Error: {e}", file=sys.stderr)

        time.sleep(1)

    return items


def fetch_all() -> list[dict]:
    """
    Fetch EU-funded projects from all available sources.
    Primary: OpenAIRE API. Fallback: CORDIS scraping.
    """
    # Try OpenAIRE first (cleaner, more reliable)
    items = fetch_openaire_projects()

    if not items:
        print("    OpenAIRE returned 0, trying CORDIS scraping...", file=sys.stderr)
        items = fetch_cordis_search()

    return items


def main() -> None:
    """CLI entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="Fetch CORDIS/OpenAIRE funded projects")
    parser.add_argument("--test", action="store_true", help="Quick test with one query")
    args = parser.parse_args()

    print("=" * 60)
    print("Fetching EU-funded projects (CORDIS/OpenAIRE)...")
    print("=" * 60)

    if args.test:
        items = fetch_openaire_projects(max_per_query=3)
    else:
        items = fetch_all()

    print(f"\n  Total: {len(items)} funded projects")

    # Write to stdout
    json.dump(items, sys.stdout, indent=2, ensure_ascii=False)
    print()


if __name__ == "__main__":
    main()
