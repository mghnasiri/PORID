#!/usr/bin/env python3
"""
PORID — Fetch NSF Awards.

Fetches recent OR-relevant awards from the NSF Awards API.
Free, no API key required, no documented rate limits.

API docs: https://www.research.gov/common/webapi/awardapisearch-v1.htm

Usage:
    python fetch_nsf.py
"""

from __future__ import annotations

import json
import sys
import time
import hashlib
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

NSF_API = "https://api.nsf.gov/services/v1/awards.json"

# OR-relevant search queries — broad enough to catch relevant awards,
# specific enough to avoid noise from other fields
SEARCH_QUERIES = [
    "operations research",
    "integer programming",
    "combinatorial optimization",
    "vehicle routing",
    "scheduling optimization",
    "mixed-integer",
    "linear programming",
    "stochastic optimization",
    "supply chain optimization",
    "network optimization",
    "mathematical programming",
    "discrete optimization",
    "convex optimization",
    "nonlinear programming",
    "constraint satisfaction",
]

PRINT_FIELDS = (
    "id,title,abstractText,piFirstName,piLastName,"
    "startDate,expDate,awardeeName,fundsObligatedAmt,"
    "fundProgramName,agency"
)

HEADERS = {
    "User-Agent": "PORID-Pipeline/2.0 (https://mghnasiri.github.io/PORID)",
    "Accept": "application/json",
}


def fetch_nsf_awards(lookback_days: int = 365, max_per_query: int = 25) -> list[dict]:
    """
    Fetch recent NSF awards matching OR-related keywords.

    Args:
        lookback_days: How far back to search (default 1 year).
        max_per_query: Max results per search query.

    Returns:
        List of opportunity dicts in PORID schema.
    """
    start_date = (datetime.now(timezone.utc) - timedelta(days=lookback_days)).strftime("%m/%d/%Y")
    seen_ids: set[str] = set()
    all_items: list[dict] = []

    for query in SEARCH_QUERIES:
        print(f"    NSF query: {query!r}...", file=sys.stderr)

        params = {
            "keyword": f'"{query}"',
            "startDateStart": start_date,
            "printFields": PRINT_FIELDS,
            "offset": 1,
            "rpp": max_per_query,
        }

        try:
            resp = requests.get(NSF_API, params=params, headers=HEADERS, timeout=20)
            if resp.status_code != 200:
                print(f"      ! HTTP {resp.status_code}", file=sys.stderr)
                continue

            data = resp.json()
            awards = data.get("response", {}).get("award", [])
            print(f"      -> {len(awards)} awards", file=sys.stderr)

            for award in awards:
                award_id = award.get("id", "")
                if not award_id or award_id in seen_ids:
                    continue
                seen_ids.add(award_id)

                title = award.get("title", "").strip()
                if not title:
                    continue

                pi_first = award.get("piFirstName", "")
                pi_last = award.get("piLastName", "")
                pi = f"{pi_first} {pi_last}".strip()

                institution = award.get("awardeeName", "")
                amount = award.get("fundsObligatedAmt", "")
                program = award.get("fundProgramName", "")
                start = _parse_nsf_date(award.get("startDate", ""))
                end = _parse_nsf_date(award.get("expDate", ""))
                abstract = (award.get("abstractText", "") or "")[:500]

                # Funding amount formatting
                funding_str = ""
                if amount:
                    try:
                        funding_str = f"${int(float(amount)):,}"
                    except (ValueError, TypeError):
                        funding_str = str(amount)

                # Use today's date for the 'date' field so NSF awards
                # don't get stale-dropped by the 90-day pipeline filter.
                # The award start date is stored in a separate field.
                today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

                all_items.append({
                    "id": f"nsf-{award_id}",
                    "title": f"NSF Award: {title}",
                    "type": "opportunity",
                    "subtype": "funding",
                    "institution": institution,
                    "location": "USA",
                    "url": f"https://www.nsf.gov/awardsearch/showAward?AWD_ID={award_id}",
                    "deadline": end,
                    "date": today,
                    "award_start": start,
                    "source": "NSF",
                    "tags": ["funding", "nsf"],
                    "description": abstract,
                    "funding_amount": funding_str,
                    "pi": pi,
                    "program": program,
                    "end_date": end,
                })

        except requests.RequestException as e:
            print(f"      ! Request error: {e}", file=sys.stderr)
        except Exception as e:
            print(f"      ! Parse error: {e}", file=sys.stderr)

        time.sleep(0.5)  # Be polite

    return all_items


def _parse_nsf_date(date_str: str) -> str:
    """Parse NSF date format (MM/DD/YYYY) to ISO (YYYY-MM-DD)."""
    if not date_str:
        return ""
    try:
        dt = datetime.strptime(date_str, "%m/%d/%Y")
        return dt.strftime("%Y-%m-%d")
    except ValueError:
        return ""


def main() -> None:
    """CLI entry point."""
    print("=" * 60)
    print("Fetching NSF Awards...")
    print("=" * 60)

    items = fetch_nsf_awards()
    print(f"\n  Total: {len(items)} unique awards fetched")

    # Output to stdout
    json.dump(items, sys.stdout, indent=2, ensure_ascii=False)
    print()


if __name__ == "__main__":
    main()
