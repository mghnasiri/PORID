#!/usr/bin/env python3
"""
Fetch academic/industry position listings from RSS feeds and HTML scraping.

Source A: RSS feeds (HigherEdJobs, etc.) via feedparser
Source B: OperationsAcademia.org via requests + BeautifulSoup (HTML table)

Position type is inferred from the title using keyword heuristics.

Usage:
    python fetch_opportunities.py
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
        feed = feedparser.parse(url)
    except Exception as e:
        print(f"    ✗ Error parsing {url}: {e}", file=sys.stderr)
        return []

    if feed.bozo and not feed.entries:
        print(f"    ✗ Feed error: {feed.bozo_exception}", file=sys.stderr)
        return []

    items: list[dict] = []

    for i, entry in enumerate(feed.entries):
        title = entry.get("title", "").strip()
        if not title:
            continue

        link = entry.get("link", "")
        published = _parse_feed_date(entry)
        summary = entry.get("summary", "").strip()

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

    print(f"    → {len(items)} positions", file=sys.stderr)
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
        print("    ⚠ BeautifulSoup not installed, skipping OperationsAcademia", file=sys.stderr)
        return []

    print(f"  Scraping OperationsAcademia: {url}", file=sys.stderr)

    try:
        resp = requests.get(url, timeout=15, headers={
            "User-Agent": "PORID/1.0 (https://mghnasiri.github.io/PORID)"
        })
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"    ✗ Error fetching {url}: {e}", file=sys.stderr)
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

    print(f"    → {len(items)} positions", file=sys.stderr)
    return items


# ── Combined Fetcher ─────────────────────────────────────────────────

def fetch_all_feeds(config: dict) -> list[dict]:
    """
    Fetch opportunities from all configured sources (RSS + scraping).

    Args:
        config: Full pipeline configuration dict.

    Returns:
        Combined list of opportunity dicts.
    """
    opp_cfg = config.get("opportunities", {})
    all_items: list[dict] = []

    # Source A: RSS feeds
    rss_feeds = opp_cfg.get("rss", [])
    for feed in rss_feeds:
        url = feed.get("url", "")
        name = feed.get("name", "RSS")
        if url:
            items = fetch_rss_feed(url, source_name=name)
            all_items.extend(items)

    # Source B: HTML scraping
    scrape_sources = opp_cfg.get("scrape", [])
    for source in scrape_sources:
        url = source.get("url", "")
        if url:
            try:
                items = fetch_operations_academia(url)
                all_items.extend(items)
            except Exception as e:
                print(f"    ✗ Scraping failed for {url}: {e}", file=sys.stderr)
                print("    Continuing with other sources...", file=sys.stderr)

    return all_items


# ── Position Type Classification ─────────────────────────────────────

def classify_position_type(title: str) -> str:
    """
    Infer position type from title using keyword heuristics.

    Args:
        title: Job listing title string.

    Returns:
        One of 'postdoc', 'phd', 'faculty', 'industry', or '' if unknown.
    """
    lower = title.lower()

    if any(kw in lower for kw in ("postdoc", "post-doc", "postdoctoral")):
        return "postdoc"
    if any(kw in lower for kw in ("phd", "ph.d", "doctoral student", "doctoral", "graduate research")):
        return "phd"
    if any(kw in lower for kw in (
        "professor", "assistant prof", "associate prof", "full prof",
        "tenure", "lecturer", "faculty",
    )):
        return "faculty"
    if any(kw in lower for kw in (
        "engineer", "scientist", "developer", "analyst",
        "manager", "lead", "senior", "staff",
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
    args = parser.parse_args()

    config = load_config(args.config)

    print("Fetching opportunity feeds...", file=sys.stderr)
    items = fetch_all_feeds(config)
    print(f"Total: {len(items)} opportunities fetched.", file=sys.stderr)

    json.dump(items, sys.stdout, indent=2, ensure_ascii=False)
    print()


if __name__ == "__main__":
    main()
