#!/usr/bin/env python3
"""
Fetch academic/industry position listings from RSS feeds.

Uses feedparser to parse RSS/Atom feeds. Position type is inferred
from the title using keyword heuristics.

Usage:
    python fetch_opportunities.py
"""

from __future__ import annotations

import json
import sys
import argparse
import re
from datetime import datetime
from pathlib import Path
from typing import Optional

import feedparser
import yaml

# RSS feed URLs for job listings
FEED_URLS = [
    # INFORMS job board (primary)
    "https://www.informs.org/rss/jobs",
    # Placeholder feeds — replace with real URLs when available:
    # "https://academicjobsonline.org/ajo/feed/operations-research",
    # "https://europt.iam.metu.edu.tr/jobs/rss",
]


def load_config(config_path: str = "config.yaml") -> dict:
    """Load pipeline configuration from YAML file."""
    path = Path(__file__).parent / config_path
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def fetch_feed(url: str) -> list[dict]:
    """
    Parse a single RSS/Atom feed and return opportunity items.

    Args:
        url: RSS feed URL.

    Returns:
        List of opportunity dicts in PORID schema.
    """
    print(f"  Fetching feed: {url}", file=sys.stderr)

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

        # Infer position type and institution from title
        pos_type = classify_position_type(title)
        institution = _extract_institution(title, summary)

        tags = [pos_type] if pos_type else []
        # Add domain tags from title keywords
        domain_tags = _infer_domain_tags(title + " " + summary)
        tags.extend(domain_tags)

        items.append({
            "id": f"opp-feed-{i:04d}-{hash(title) % 10000:04d}",
            "title": title,
            "institution": institution,
            "location": "",  # RSS feeds rarely include structured location
            "deadline": "",  # RSS feeds rarely include deadline
            "url": link,
            "tags": tags,
            "type": "opportunity",
            "date": published,
        })

    print(f"    → {len(items)} positions", file=sys.stderr)
    return items


def fetch_all_feeds() -> list[dict]:
    """
    Fetch positions from all configured RSS feeds.

    Returns:
        Combined list of opportunity dicts.
    """
    all_items: list[dict] = []

    for url in FEED_URLS:
        items = fetch_feed(url)
        all_items.extend(items)

    return all_items


def classify_position_type(title: str) -> str:
    """
    Infer position type from title using keyword heuristics.

    Args:
        title: Job listing title string.

    Returns:
        One of 'postdoc', 'phd', 'faculty', 'industry', or '' if unknown.
    """
    lower = title.lower()

    # Check most specific first
    if any(kw in lower for kw in ("postdoc", "post-doc", "postdoctoral")):
        return "postdoc"
    if any(kw in lower for kw in ("phd", "ph.d", "doctoral student", "graduate research")):
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


def _extract_institution(title: str, summary: str) -> str:
    """
    Attempt to extract institution name from title or summary.

    Uses common patterns like 'at University of X' or 'University of X'.
    """
    combined = title + " " + summary

    # Pattern: "at <Institution>"
    match = re.search(r"\bat\s+((?:University|Institute|School|College|Lab)\b[^,.\n]{3,50})", combined, re.IGNORECASE)
    if match:
        return match.group(1).strip()

    # Pattern: standalone university names
    match = re.search(r"((?:University|Institute|School|College)\s+(?:of\s+)?[A-Z][^\n,]{2,40})", combined)
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


def main() -> None:
    """CLI entry point: fetch opportunities and print JSON to stdout."""
    parser = argparse.ArgumentParser(description="Fetch academic positions from RSS feeds")
    parser.add_argument("--config", default="config.yaml", help="Path to config file")
    args = parser.parse_args()

    print("Fetching opportunity feeds...", file=sys.stderr)
    items = fetch_all_feeds()
    print(f"Total: {len(items)} opportunities fetched.", file=sys.stderr)

    json.dump(items, sys.stdout, indent=2, ensure_ascii=False)
    print()


if __name__ == "__main__":
    main()
