#!/usr/bin/env python3
"""
PORID -- Fetch healthcare-OR papers from PubMed Central via NCBI E-utilities.

Uses the free E-utilities API (no API key needed at low volume).
  * esearch.fcgi  – find matching PMIDs
  * efetch.fcgi   – retrieve article metadata in XML

Search queries target the intersection of operations research and
healthcare: scheduling, queuing, optimisation in clinical settings.

Usage:
    python fetch_pubmed.py              # defaults (last 7 days)
    python fetch_pubmed.py --days 14    # override lookback window
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import requests

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

ESEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
EFETCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"

QUERIES = [
    "operations research healthcare",
    "hospital scheduling optimization",
    "emergency department queuing",
]

MAX_RESULTS_PER_QUERY = 20
DEFAULT_LOOKBACK_DAYS = 7

HEADERS = {"User-Agent": "PORID-Pipeline/2.0"}

# Tag mapping -- simple keyword matching on title/abstract
TAG_KEYWORDS = {
    "scheduling": ["scheduling", "rostering", "timetabling", "shift"],
    "healthcare-or": ["hospital", "healthcare", "clinical", "patient", "emergency department"],
    "stochastic": ["stochastic", "uncertainty", "probabilistic", "markov"],
    "simulation": ["simulation", "discrete-event", "monte carlo"],
    "metaheuristics": ["genetic algorithm", "simulated annealing", "tabu search", "metaheuristic"],
    "integer-programming": ["integer programming", "milp", "mip", "linear programming"],
    "ml-for-or": ["machine learning", "deep learning", "reinforcement learning", "neural"],
    "vehicle-routing": ["vehicle routing", "vrp", "transportation"],
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _date_range(days: int) -> tuple[str, str]:
    """Return (mindate, maxdate) strings for NCBI date filtering (YYYY/MM/DD)."""
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=days)
    return start.strftime("%Y/%m/%d"), now.strftime("%Y/%m/%d")


def _assign_tags(title: str, abstract: str) -> list[str]:
    """Auto-assign tags based on keyword matching in title + abstract."""
    text = f"{title} {abstract}".lower()
    tags = []
    for tag, keywords in TAG_KEYWORDS.items():
        if any(kw in text for kw in keywords):
            tags.append(tag)
    # Always include healthcare-or for PubMed results
    if "healthcare-or" not in tags:
        tags.append("healthcare-or")
    return tags


# ---------------------------------------------------------------------------
# API interaction
# ---------------------------------------------------------------------------

def search_pubmed(query: str, days: int, max_results: int) -> list[str]:
    """Run an ESearch query and return a list of PMIDs."""
    mindate, maxdate = _date_range(days)
    params = {
        "db": "pubmed",
        "term": query,
        "retmax": max_results,
        "sort": "pub_date",
        "datetype": "edat",
        "mindate": mindate,
        "maxdate": maxdate,
        "retmode": "json",
    }
    try:
        resp = requests.get(ESEARCH_URL, params=params, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        id_list = data.get("esearchresult", {}).get("idlist", [])
        return id_list
    except Exception as e:
        print(f"    ESearch error for '{query}': {e}", file=sys.stderr)
        return []


def fetch_details(pmids: list[str]) -> list[dict]:
    """Fetch article metadata for a batch of PMIDs via EFetch (XML)."""
    if not pmids:
        return []

    params = {
        "db": "pubmed",
        "id": ",".join(pmids),
        "retmode": "xml",
        "rettype": "abstract",
    }
    try:
        resp = requests.get(EFETCH_URL, params=params, headers=HEADERS, timeout=60)
        resp.raise_for_status()
    except Exception as e:
        print(f"    EFetch error: {e}", file=sys.stderr)
        return []

    return _parse_xml(resp.text)


def _parse_xml(xml_text: str) -> list[dict]:
    """Parse PubMed XML and return list of PORID-schema items."""
    items: list[dict] = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as e:
        print(f"    XML parse error: {e}", file=sys.stderr)
        return []

    for article_el in root.findall(".//PubmedArticle"):
        try:
            item = _parse_article(article_el)
            if item:
                items.append(item)
        except Exception as e:
            print(f"    Article parse error: {e}", file=sys.stderr)

    return items


def _parse_article(article_el: ET.Element) -> Optional[dict]:
    """Extract a single article into PORID schema."""
    medline = article_el.find("MedlineCitation")
    if medline is None:
        return None

    pmid_el = medline.find("PMID")
    pmid = pmid_el.text if pmid_el is not None else ""
    if not pmid:
        return None

    article = medline.find("Article")
    if article is None:
        return None

    # Title
    title_el = article.find("ArticleTitle")
    title = (title_el.text or "").strip() if title_el is not None else ""
    if not title:
        return None

    # Abstract
    abstract_parts = []
    abstract_el = article.find("Abstract")
    if abstract_el is not None:
        for text_el in abstract_el.findall("AbstractText"):
            label = text_el.get("Label", "")
            text = "".join(text_el.itertext()).strip()
            if label:
                abstract_parts.append(f"{label}: {text}")
            else:
                abstract_parts.append(text)
    abstract = " ".join(abstract_parts)

    # Authors
    authors = []
    author_list = article.find("AuthorList")
    if author_list is not None:
        for author_el in author_list.findall("Author"):
            last = author_el.findtext("LastName", "")
            first = author_el.findtext("ForeName", "")
            if last:
                authors.append(f"{last}, {first}".strip(", "))

    # Date
    pub_date = _extract_date(article)

    # DOI
    doi = ""
    for id_el in article_el.findall(".//ArticleId"):
        if id_el.get("IdType") == "doi":
            doi = id_el.text or ""
            break

    # Journal
    journal_el = article.find("Journal/Title")
    journal = journal_el.text if journal_el is not None else ""

    # Tags
    tags = _assign_tags(title, abstract)

    return {
        "id": f"pubmed-{pmid}",
        "title": title,
        "authors": authors,
        "abstract": abstract[:1000],
        "date": pub_date,
        "source": "PubMed",
        "source_detail": journal,
        "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
        "tags": tags,
        "type": "publication",
        "doi": doi,
        "pmid": pmid,
    }


def _extract_date(article_el: ET.Element) -> str:
    """Extract the best available publication date as YYYY-MM-DD."""
    # Try ArticleDate first (electronic publication)
    ad = article_el.find("ArticleDate")
    if ad is not None:
        y = ad.findtext("Year", "")
        m = ad.findtext("Month", "01")
        d = ad.findtext("Day", "01")
        if y:
            return f"{y}-{m.zfill(2)}-{d.zfill(2)}"

    # Fall back to Journal PubDate
    pd = article_el.find("Journal/JournalIssue/PubDate")
    if pd is not None:
        y = pd.findtext("Year", "")
        m = pd.findtext("Month", "01")
        d = pd.findtext("Day", "01")
        if y:
            # Month might be a name like "Jan"
            month_map = {
                "jan": "01", "feb": "02", "mar": "03", "apr": "04",
                "may": "05", "jun": "06", "jul": "07", "aug": "08",
                "sep": "09", "oct": "10", "nov": "11", "dec": "12",
            }
            m = month_map.get(m.lower()[:3], m.zfill(2))
            return f"{y}-{m}-{d.zfill(2)}"

    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def fetch_all(days: int = DEFAULT_LOOKBACK_DAYS) -> list[dict]:
    """Run all PubMed queries and return deduplicated results."""
    seen_ids: set[str] = set()
    all_items: list[dict] = []

    for query in QUERIES:
        print(f"  PubMed search: '{query}'", file=sys.stderr)
        pmids = search_pubmed(query, days, MAX_RESULTS_PER_QUERY)
        print(f"    Found {len(pmids)} PMIDs", file=sys.stderr)

        # Remove duplicates from earlier queries
        new_pmids = [p for p in pmids if p not in seen_ids]
        seen_ids.update(new_pmids)

        if new_pmids:
            items = fetch_details(new_pmids)
            all_items.extend(items)
            print(f"    Parsed {len(items)} articles", file=sys.stderr)

        # Respect NCBI rate limit (max 3 requests/sec without API key)
        time.sleep(0.5)

    return all_items


def write_json(data: list[dict], path: Path) -> None:
    """Write items to JSON file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(description="Fetch PubMed healthcare-OR papers")
    parser.add_argument("--days", type=int, default=DEFAULT_LOOKBACK_DAYS,
                        help="Lookback window in days (default: 7)")
    args = parser.parse_args()

    print("=" * 60)
    print("Fetching PubMed healthcare-OR papers...")
    print("=" * 60)

    items = fetch_all(days=args.days)

    base = Path(__file__).parent
    output_path = base / "../data/pubmed.json"
    write_json(items, output_path)
    print(f"\n  {len(items)} articles written to {output_path}")

    # Also write to src/data/ if it exists
    src_data = base / "../src/data"
    if src_data.exists():
        write_json(items, src_data / "pubmed.json")
        print(f"  Also written to src/data/pubmed.json")

    print()


if __name__ == "__main__":
    main()
