#!/usr/bin/env python3
"""
Fetch academic/industry position listings from RSS feeds and HTML scraping.

Source A: RSS feeds (HigherEdJobs, etc.) via feedparser
Source B: OperationsAcademia.org via requests + BeautifulSoup (HTML table)
Source C: Fallback static job board links when all feeds fail

Position type is inferred from the title using keyword heuristics.

Usage:
    python fetch_opportunities.py
    python fetch_opportunities.py --test
"""

from __future__ import annotations

import json
import re
import sys
import argparse
from datetime import datetime
from pathlib import Path
from typing import Optional

import feedparser
import requests
import yaml

try:
    from bs4 import BeautifulSoup
    HAS_BS4 = True
except ImportError:
    HAS_BS4 = False


# ── Static fallback data ─────────────────────────────────────────────

FALLBACK_JOB_BOARDS: list[dict] = [
    {
        "title": "INFORMS Job Board — Operations Research Positions",
        "institution": "INFORMS",
        "url": "https://www.informs.org/Find-a-Job",
        "source": "INFORMS",
    },
    {
        "title": "HigherEdJobs — Operations Research Faculty & Staff",
        "institution": "HigherEdJobs",
        "url": "https://www.higheredjobs.com/search/default.cfm?JobCat=100",
        "source": "HigherEdJobs",
    },
    {
        "title": "OperationsAcademia.org — OR Academic Positions",
        "institution": "OperationsAcademia",
        "url": "https://www.operationsacademia.org/jobs",
        "source": "OperationsAcademia",
    },
    {
        "title": "EURO — European OR Job Opportunities",
        "institution": "EURO",
        "url": "https://www.euro-online.org/web/pages/301/jobs",
        "source": "EURO",
    },
]

REFERENCE_SITES: list[dict] = [
    {"name": "INFORMS Career Center", "url": "https://www.informs.org/Find-a-Job"},
    {"name": "ORSC Job Board", "url": "https://www.sciopt.cn/"},
    {"name": "HigherEdJobs OR", "url": "https://www.higheredjobs.com/search/default.cfm?JobCat=100"},
    {"name": "OperationsAcademia", "url": "https://www.operationsacademia.org/jobs"},
    {"name": "AcademicJobsOnline", "url": "https://academicjobsonline.org/ajo/jobs"},
    {"name": "MathJobs.org", "url": "https://www.mathjobs.org/jobs"},
]

# Additional RSS feeds to try
# Note: HigherEdJobs, Jobs.ac.uk, and MathJobs RSS feeds are all dead as of 2026.
# We rely on NSF API + manual curation + scraping instead.
ADDITIONAL_RSS_FEEDS: list[dict] = []


def load_config(config_path: str = "config.yaml") -> dict:
    """Load pipeline configuration from YAML file."""
    path = Path(__file__).parent / config_path
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


# ── Source A: RSS Feeds ──────────────────────────────────────────────

def fetch_rss_feed(url: str, source_name: str = "RSS") -> list[dict]:
    """
    Parse a single RSS/Atom feed and return opportunity items.

    Args:
        url: RSS feed URL.
        source_name: Human-readable source name for the 'source' field.

    Returns:
        List of opportunity dicts in PORID schema.
    """
    print(f"  Fetching RSS: {source_name} ({url})", file=sys.stderr)

    try:
        # Use requests first for better error handling and timeout
        resp = requests.get(url, timeout=15, headers={
            "User-Agent": "PORID/1.0 (https://mghnasiri.github.io/PORID)"
        })
        resp.raise_for_status()
        feed = feedparser.parse(resp.content)
    except requests.RequestException as e:
        print(f"    ! HTTP error fetching {source_name}: {e}", file=sys.stderr)
        # Fallback: try feedparser directly (it handles some edge cases)
        try:
            feed = feedparser.parse(url)
        except Exception as e2:
            print(f"    ! Feedparser fallback also failed: {e2}", file=sys.stderr)
            return []
    except Exception as e:
        print(f"    ! Error parsing {url}: {e}", file=sys.stderr)
        return []

    if feed.bozo and not feed.entries:
        bozo_msg = str(getattr(feed, "bozo_exception", "unknown error"))
        print(f"    ! Feed error ({source_name}): {bozo_msg}", file=sys.stderr)
        return []

    items: list[dict] = []

    for i, entry in enumerate(feed.entries):
        title = entry.get("title", "").strip()
        if not title:
            continue

        link = entry.get("link", "")
        published = _parse_feed_date(entry)
        summary = entry.get("summary", entry.get("description", "")).strip()

        pos_type = classify_position_type(title)
        institution = _extract_institution(title, summary)

        tags = [pos_type] if pos_type else []
        domain_tags = _infer_domain_tags(title + " " + summary)
        tags.extend(domain_tags)

        items.append({
            "id": f"opp-rss-{i:04d}-{hash(title) % 10000:04d}",
            "title": title,
            "institution": institution,
            "location": "",
            "deadline": "",
            "url": link,
            "source": source_name,
            "tags": tags,
            "type": "opportunity",
            "date": published,
        })

    print(f"    -> {len(items)} positions", file=sys.stderr)
    return items


# ── Source B: OperationsAcademia.org HTML Scraping ───────────────────

def fetch_operations_academia(url: str) -> list[dict]:
    """
    Scrape job listings from OperationsAcademia.org HTML table.

    Args:
        url: URL of the jobs page.

    Returns:
        List of opportunity dicts in PORID schema.
    """
    if not HAS_BS4:
        print("    ! BeautifulSoup not installed, skipping OperationsAcademia", file=sys.stderr)
        return []

    print(f"  Scraping OperationsAcademia: {url}", file=sys.stderr)

    try:
        resp = requests.get(url, timeout=15, headers={
            "User-Agent": "PORID/1.0 (https://mghnasiri.github.io/PORID)"
        })
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"    ! Error fetching {url}: {e}", file=sys.stderr)
        return []

    soup = BeautifulSoup(resp.text, "html.parser")
    items: list[dict] = []

    # Look for table rows or common job listing patterns
    # OperationsAcademia uses various layouts; try common selectors
    rows = soup.select("table tr") or soup.select(".job-listing, .job-row, article")

    for i, row in enumerate(rows):
        # Try to extract from table cells
        cells = row.find_all("td")
        if cells and len(cells) >= 2:
            title = cells[0].get_text(strip=True)
            institution = cells[1].get_text(strip=True) if len(cells) > 1 else ""
            location = cells[2].get_text(strip=True) if len(cells) > 2 else ""
            link_el = cells[0].find("a")
            link = link_el["href"] if link_el and link_el.get("href") else ""
            date_text = cells[-1].get_text(strip=True) if len(cells) > 3 else ""
        else:
            # Fallback: try link-based extraction
            link_el = row.find("a")
            if not link_el:
                continue
            title = link_el.get_text(strip=True)
            link = link_el.get("href", "")
            institution = ""
            location = ""
            date_text = ""

        if not title or len(title) < 5:
            continue

        # Make relative URLs absolute
        if link and not link.startswith("http"):
            link = f"https://www.operationsacademia.org{link}"

        pos_type = classify_position_type(title)
        tags = [pos_type] if pos_type else []

        items.append({
            "id": f"opp-oa-{i:04d}-{hash(title) % 10000:04d}",
            "title": title,
            "institution": institution,
            "location": location,
            "deadline": "",
            "url": link,
            "source": "OperationsAcademia",
            "tags": tags,
            "type": "opportunity",
            "date": _parse_date_text(date_text),
        })

    print(f"    -> {len(items)} positions", file=sys.stderr)
    return items


# ── Fallback: Static featured positions ──────────────────────────────

def generate_fallback_positions() -> list[dict]:
    """
    Generate static 'featured positions' entries that point to major job
    boards. Used when ALL live feeds fail so the Opportunities tab is
    never empty.

    Returns:
        List of opportunity dicts pointing to major OR job boards.
    """
    today = datetime.now().strftime("%Y-%m-%d")
    items: list[dict] = []
    for i, board in enumerate(FALLBACK_JOB_BOARDS):
        items.append({
            "id": f"opp-fallback-{i:04d}",
            "title": board["title"],
            "institution": board["institution"],
            "location": "",
            "deadline": "",
            "url": board["url"],
            "source": board["source"],
            "tags": ["job-board"],
            "type": "opportunity",
            "date": today,
        })
    return items


# ── Combined Fetcher ─────────────────────────────────────────────────

def load_manual_opportunities() -> list[dict]:
    """Load manually curated opportunities from data/opportunities_manual.json."""
    path = Path(__file__).parent / "../data/opportunities_manual.json"
    if not path.exists():
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, IOError):
        return []


def fetch_nsf_awards_for_opps() -> list[dict]:
    """Fetch NSF awards and include them as funding opportunities."""
    try:
        from fetch_nsf import fetch_nsf_awards
        return fetch_nsf_awards(lookback_days=180, max_per_query=10)
    except ImportError:
        print("    ! fetch_nsf module not available", file=sys.stderr)
        return []
    except Exception as e:
        print(f"    ! NSF fetch failed: {e}", file=sys.stderr)
        return []


def fetch_all_feeds(config: dict) -> list[dict]:
    """
    Fetch opportunities from all configured sources.

    Sources (in order):
    1. Manual curation file (data/opportunities_manual.json)
    2. NSF Awards API
    3. RSS feeds (HigherEdJobs, etc.)
    4. HTML scraping (OperationsAcademia.org)
    5. Fallback job board links (only if everything else returns 0)

    Args:
        config: Full pipeline configuration dict.

    Returns:
        Combined list of opportunity dicts.
    """
    opp_cfg = config.get("opportunities", {})
    all_items: list[dict] = []

    # Source 0: Manual curation (high-value items like MSCA, ERC)
    manual = load_manual_opportunities()
    if manual:
        print(f"    -> {len(manual)} manually curated opportunities", file=sys.stderr)
        all_items.extend(manual)

    # Source 1: NSF Awards API (free, no auth)
    print("  Fetching NSF awards...", file=sys.stderr)
    try:
        nsf_items = fetch_nsf_awards_for_opps()
        if nsf_items:
            print(f"    -> {len(nsf_items)} NSF awards", file=sys.stderr)
            all_items.extend(nsf_items)
    except Exception as e:
        print(f"    ! NSF failed: {e}", file=sys.stderr)

    # Source 2: RSS feeds from config
    rss_feeds = opp_cfg.get("rss", [])
    for feed in rss_feeds:
        url = feed.get("url", "")
        name = feed.get("name", "RSS")
        if url:
            try:
                items = fetch_rss_feed(url, source_name=name)
                all_items.extend(items)
            except Exception as e:
                print(f"    ! RSS feed {name} failed: {e}", file=sys.stderr)

    # Source 2b: Additional RSS feeds
    for feed in ADDITIONAL_RSS_FEEDS:
        try:
            items = fetch_rss_feed(feed["url"], source_name=feed["name"])
            all_items.extend(items)
        except Exception as e:
            print(f"    ! Additional RSS feed {feed['name']} failed: {e}", file=sys.stderr)

    # Source 3: HTML scraping
    scrape_sources = opp_cfg.get("scrape", [])
    for source in scrape_sources:
        url = source.get("url", "")
        if url:
            try:
                items = fetch_operations_academia(url)
                all_items.extend(items)
            except Exception as e:
                print(f"    ! Scraping failed for {url}: {e}", file=sys.stderr)

    # Fallback: if ALL feeds returned 0 items, add static job board links
    if len(all_items) == 0:
        print("    ! All sources returned 0 items. Adding fallback job board links.", file=sys.stderr)
        all_items = generate_fallback_positions()

    return all_items


# ── Feed Validation (--test mode) ────────────────────────────────────

def validate_feeds(config: dict) -> None:
    """
    Validate each configured feed URL with a HEAD request.

    Prints status for each URL (reachable / unreachable).

    Args:
        config: Full pipeline configuration dict.
    """
    opp_cfg = config.get("opportunities", {})
    urls_to_check: list[tuple[str, str]] = []

    for feed in opp_cfg.get("rss", []):
        urls_to_check.append((feed.get("name", "RSS"), feed.get("url", "")))

    for feed in ADDITIONAL_RSS_FEEDS:
        urls_to_check.append((feed["name"], feed["url"]))

    for source in opp_cfg.get("scrape", []):
        urls_to_check.append((source.get("name", "Scrape"), source.get("url", "")))

    print(f"Validating {len(urls_to_check)} feed URLs...\n", file=sys.stderr)

    for name, url in urls_to_check:
        if not url:
            print(f"  SKIP  {name}: no URL configured", file=sys.stderr)
            continue
        try:
            resp = requests.head(url, timeout=10, allow_redirects=True, headers={
                "User-Agent": "PORID/1.0"
            })
            status = resp.status_code
            if status < 400:
                print(f"  OK    {name}: {url} (HTTP {status})", file=sys.stderr)
            else:
                print(f"  WARN  {name}: {url} (HTTP {status})", file=sys.stderr)
        except requests.RequestException as e:
            print(f"  FAIL  {name}: {url} ({e})", file=sys.stderr)

    print(f"\nReference job search sites:", file=sys.stderr)
    for site in REFERENCE_SITES:
        print(f"  - {site['name']}: {site['url']}", file=sys.stderr)


# ── Position Type Classification ─────────────────────────────────────

def classify_position_type(title: str) -> str:
    """
    Infer position type from title using keyword heuristics.

    Args:
        title: Job listing title string.

    Returns:
        One of 'postdoc', 'phd', 'faculty', 'industry', 'research', or '' if unknown.
    """
    if not title:
        return ""

    lower = title.lower()

    if any(kw in lower for kw in ("postdoc", "post-doc", "postdoctoral", "post doctoral")):
        return "postdoc"
    if any(kw in lower for kw in ("phd", "ph.d", "doctoral student", "doctoral candidate", "doctoral", "graduate research")):
        return "phd"
    if any(kw in lower for kw in (
        "professor", "assistant prof", "associate prof", "full prof",
        "tenure", "tenured", "tenure-track", "lecturer", "faculty",
        "chair ", "endowed chair", "visiting professor",
    )):
        return "faculty"
    if any(kw in lower for kw in (
        "research scientist", "research fellow", "researcher", "research associate",
    )):
        return "research"
    if any(kw in lower for kw in (
        "engineer", "scientist", "developer", "analyst",
        "manager", "lead", "senior", "staff", "consultant",
        "data scientist", "quantitative",
    )):
        return "industry"

    return ""


# ── Helpers ──────────────────────────────────────────────────────────

def _extract_institution(title: str, summary: str) -> str:
    """Attempt to extract institution name from title or summary."""
    combined = title + " " + summary

    match = re.search(
        r"\bat\s+((?:University|Institute|School|College|Lab)\b[^,.\n]{3,50})",
        combined, re.IGNORECASE,
    )
    if match:
        return match.group(1).strip()

    match = re.search(
        r"((?:University|Institute|School|College)\s+(?:of\s+)?[A-Z][^\n,]{2,40})",
        combined,
    )
    if match:
        return match.group(1).strip()

    return ""


def _infer_domain_tags(text: str) -> list[str]:
    """Infer OR domain tags from text using simple keyword matching."""
    lower = text.lower()
    tags: list[str] = []

    domain_keywords = {
        "healthcare-or": ["healthcare", "hospital", "clinical", "medical"],
        "vehicle-routing": ["routing", "logistics", "transportation", "fleet"],
        "scheduling": ["scheduling", "planning", "timetabling"],
        "integer-programming": ["optimization", "integer programming", "combinatorial"],
        "ml-for-or": ["machine learning", "data science", "ai ", "artificial intelligence"],
        "stochastic": ["stochastic", "uncertainty", "robust"],
    }

    for tag, keywords in domain_keywords.items():
        if any(kw in lower for kw in keywords):
            tags.append(tag)

    return tags


def _parse_feed_date(entry: dict) -> str:
    """Extract and format a date from a feedparser entry."""
    published = entry.get("published_parsed") or entry.get("updated_parsed")
    if published:
        try:
            dt = datetime(*published[:6])
            return dt.strftime("%Y-%m-%d")
        except (ValueError, TypeError):
            pass
    return datetime.now().strftime("%Y-%m-%d")


def _parse_date_text(text: str) -> str:
    """Try to parse a human-readable date string into YYYY-MM-DD."""
    if not text:
        return datetime.now().strftime("%Y-%m-%d")
    # Try common date formats
    for fmt in ("%Y-%m-%d", "%B %d, %Y", "%b %d, %Y", "%d/%m/%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(text.strip(), fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return datetime.now().strftime("%Y-%m-%d")


def main() -> None:
    """CLI entry point: fetch opportunities and print JSON to stdout."""
    parser = argparse.ArgumentParser(description="Fetch academic positions from RSS + HTML")
    parser.add_argument("--config", default="config.yaml", help="Path to config file")
    parser.add_argument("--test", action="store_true", help="Validate each feed URL (HEAD request) without full fetch")
    args = parser.parse_args()

    config = load_config(args.config)

    if args.test:
        validate_feeds(config)
        return

    print("Fetching opportunity feeds...", file=sys.stderr)
    items = fetch_all_feeds(config)
    print(f"Total: {len(items)} opportunities fetched.", file=sys.stderr)

    json.dump(items, sys.stdout, indent=2, ensure_ascii=False)
    print()


if __name__ == "__main__":
    main()
