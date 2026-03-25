#!/usr/bin/env python3
"""
PORID — Fetch conference data.

Sources (in priority order):
1. Static config.yaml entries (curated, authoritative)
2. WikiCFP RSS feeds (live CFP data, supplementary)

The config.yaml entries are always used. WikiCFP entries are merged in
only if they don't duplicate existing conferences (matched by name).

Usage:
    python fetch_conferences.py
    python fetch_conferences.py --test
"""

from __future__ import annotations

import json
import re
import sys
import argparse
from datetime import datetime
from pathlib import Path
from typing import Optional

import yaml
import feedparser
import requests


def load_config(config_path: str = "config.yaml") -> dict:
    """Load pipeline configuration from YAML file."""
    path = Path(__file__).parent / config_path
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


# ── WikiCFP RSS feeds for OR-related topics ──────────────────────────

WIKICFP_FEEDS = [
    {
        "url": "http://www.wikicfp.com/cfp/rss?cat=operations+research",
        "topic": "operations-research",
    },
    {
        "url": "http://www.wikicfp.com/cfp/rss?cat=optimization",
        "topic": "optimization",
    },
    {
        "url": "http://www.wikicfp.com/cfp/rss?cat=combinatorial+optimization",
        "topic": "combinatorial-optimization",
    },
    {
        "url": "http://www.wikicfp.com/cfp/rss?cat=mathematical+programming",
        "topic": "mathematical-programming",
    },
]


def fetch_wikicfp_conferences() -> list[dict]:
    """
    Fetch conference CFPs from WikiCFP RSS feeds.

    WikiCFP RSS entries have this structure:
    <title>CONF 2026 : Full Conference Name</title>
    <link>http://www.wikicfp.com/cfp/servlet/event.showcfp?eventid=...</link>
    <description>
      When: Jul 15-18, 2026
      Where: Berlin, Germany
      Submission Deadline: Mar 31, 2026
      Notification Due: May 15, 2026
      ...
    </description>

    Returns:
        List of conference dicts in PORID schema.
    """
    all_items: list[dict] = []
    seen_names: set[str] = set()

    for feed_cfg in WIKICFP_FEEDS:
        url = feed_cfg["url"]
        topic = feed_cfg["topic"]

        print(f"    WikiCFP: {topic}...", file=sys.stderr)

        try:
            resp = requests.get(url, timeout=15, headers={
                "User-Agent": "PORID-Pipeline/2.0 (https://mghnasiri.github.io/PORID)",
            })
            if resp.status_code != 200:
                print(f"      ! HTTP {resp.status_code}", file=sys.stderr)
                continue

            feed = feedparser.parse(resp.content)

            if feed.bozo and not feed.entries:
                print(f"      ! Feed parse error", file=sys.stderr)
                continue

            count = 0
            for entry in feed.entries:
                parsed = _parse_wikicfp_entry(entry)
                if not parsed:
                    continue

                # Filter: only include conferences from 2025 onwards
                dates_str = parsed.get("dates", "") + parsed.get("name", "")
                year_match = re.search(r"20(\d{2})", dates_str)
                if year_match:
                    year = int("20" + year_match.group(1))
                    if year < 2025:
                        continue

                # Deduplicate by normalized name
                name_key = parsed["name"].lower().strip()
                if name_key in seen_names:
                    continue
                seen_names.add(name_key)

                parsed["tags"] = ["conference", topic]
                # Assign conference quality tier
                tier = _assign_tier(parsed["name"])
                if tier:
                    parsed["tier"] = tier
                all_items.append(parsed)
                count += 1

            print(f"      -> {count} conferences", file=sys.stderr)

        except requests.RequestException as e:
            print(f"      ! Request error: {e}", file=sys.stderr)
        except Exception as e:
            print(f"      ! Error: {e}", file=sys.stderr)

    return all_items


def _parse_wikicfp_entry(entry: dict) -> Optional[dict]:
    """
    Parse a single WikiCFP RSS entry into a conference dict.

    WikiCFP RSS format (as of 2026):
      Title: "CONF 2026 : Full Conference Name"
      Summary: "Full Name [Location] [DateStart - DateEnd]"

    Args:
        entry: feedparser entry dict.

    Returns:
        Conference dict or None if parsing fails.
    """
    title = entry.get("title", "").strip()
    link = entry.get("link", "")
    description = entry.get("summary", entry.get("description", "")).strip()

    if not title:
        return None

    name = title

    # Current WikiCFP format: "Full Name [Location] [Date - Date]"
    location = ""
    dates = ""

    # Extract bracketed fields
    brackets = re.findall(r"\[([^\]]+)\]", description)
    if len(brackets) >= 2:
        location = brackets[-2].strip()  # Second-to-last bracket is location
        dates = brackets[-1].strip()     # Last bracket is date range
    elif len(brackets) == 1:
        # Could be location or dates — check if it contains month names
        content = brackets[0]
        if re.search(r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)", content):
            dates = content.strip()
        else:
            location = content.strip()

    # Also try legacy format (When: / Where: / Submission Deadline:)
    if not location:
        location = _extract_field(description, r"Where\s*:\s*(.+)") or ""
    if not dates:
        dates = _extract_field(description, r"When\s*:\s*(.+)") or ""

    deadline = _extract_field(description, r"Submission\s+Deadline\s*:\s*(.+)")
    cfp_deadline = _parse_wikicfp_date(deadline) if deadline else ""

    return {
        "id": f"wikicfp-{hash(title) % 100000:05d}",
        "name": name,
        "dates": dates,
        "location": location,
        "cfp_deadline": cfp_deadline,
        "url": link,
        "source": "WikiCFP",
        "type": "conference",
    }


def _extract_field(text: str, pattern: str) -> str:
    """Extract a field from WikiCFP description using regex."""
    match = re.search(pattern, text, re.IGNORECASE)
    return match.group(1).strip() if match else ""


def _parse_wikicfp_date(date_str: str) -> str:
    """
    Parse WikiCFP date formats to ISO YYYY-MM-DD.

    Common formats: "Mar 31, 2026", "March 31, 2026", "2026-03-31"
    """
    if not date_str:
        return ""

    # Already ISO
    if re.match(r"\d{4}-\d{2}-\d{2}", date_str):
        return date_str[:10]

    # Try common formats
    for fmt in ("%b %d, %Y", "%B %d, %Y", "%b %d %Y", "%B %d %Y", "%d %b %Y", "%d %B %Y"):
        try:
            return datetime.strptime(date_str.strip(), fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue

    # Try to extract just the date part (WikiCFP sometimes has "(Ext: ...)" suffix)
    cleaned = re.sub(r"\(.*?\)", "", date_str).strip()
    for fmt in ("%b %d, %Y", "%B %d, %Y"):
        try:
            return datetime.strptime(cleaned, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue

    return ""


# ── Conference tier rankings ──────────────────────────────────────────
# Hardcoded mapping of conference name substrings to quality tiers.
# Matching is case-insensitive substring on the conference name.

CONFERENCE_TIERS: dict[str, str] = {
    # A* tier
    "IPCO": "A*",
    "CPAIOR": "A*",
    " CP ": "A*",
    "CP 20": "A*",
    "Constraint Programming": "A*",
    # A tier
    "INFORMS Annual": "A",
    "EURO ": "A",
    "EURO-": "A",
    "CORS": "A",
    "Winter Simulation": "A",
    "WSC ": "A",
    # B tier
    "MIP Workshop": "B",
    "META": "B",
    "ROADEF": "B",
    "MISTA": "B",
    "IFORS": "B",
    "GECCO": "B",
    "LION": "B",
}


def _assign_tier(name: str) -> str:
    """
    Assign a quality tier to a conference based on its name.

    Args:
        name: Conference name.

    Returns:
        Tier string ("A*", "A", "B", "C") or empty string if unknown.
    """
    name_check = f" {name} "  # pad with spaces for boundary matching
    for pattern, tier in CONFERENCE_TIERS.items():
        if pattern.lower() in name_check.lower():
            return tier
    return ""


# ── Config-based conferences (curated) ───────────────────────────────

def fetch_config_conferences(config: dict) -> list[dict]:
    """
    Build conference items from the static config.yaml list.

    These are always included and take priority over WikiCFP.

    Args:
        config: Full pipeline configuration dict.

    Returns:
        List of conference dicts in PORID schema.
    """
    raw = config.get("conferences", [])
    items: list[dict] = []

    for i, conf in enumerate(raw, start=1):
        item: dict = {
            "id": f"conf-{i:03d}",
            "name": conf.get("name", "Unnamed Conference"),
            "dates": conf.get("dates", ""),
            "location": conf.get("location", ""),
            "cfp_deadline": conf.get("cfp_deadline", ""),
            "url": conf.get("url", ""),
            "source": "config",
            "tags": conf.get("tags", ["conference"]),
            "type": "conference",
        }
        if conf.get("format"):
            item["format"] = conf["format"]
        # Assign conference quality tier
        tier = _assign_tier(item["name"])
        if tier:
            item["tier"] = tier
        items.append(item)

    return items


# ── Combined fetcher ─────────────────────────────────────────────────

def fetch_conferences(config: dict) -> list[dict]:
    """
    Fetch conferences from config + WikiCFP, deduplicated.

    Config entries are authoritative. WikiCFP entries are added only
    if they don't match any existing conference by name.

    Args:
        config: Full pipeline configuration dict.

    Returns:
        Combined list of conference dicts.
    """
    # 1. Config conferences (always included)
    config_items = fetch_config_conferences(config)
    print(f"    -> {len(config_items)} conferences from config", file=sys.stderr)

    # 2. WikiCFP conferences (supplementary)
    wikicfp_items = []
    try:
        wikicfp_items = fetch_wikicfp_conferences()
    except Exception as e:
        print(f"    ! WikiCFP fetch failed: {e}", file=sys.stderr)

    # 3. Merge: deduplicate WikiCFP against config by name similarity
    config_names = {c["name"].lower().split("2")[0].strip() for c in config_items}

    added = 0
    for item in wikicfp_items:
        # Check if this conference is already in config (fuzzy match on name prefix)
        item_prefix = item["name"].lower().split("2")[0].strip()
        item_words = set(item_prefix.split())

        is_duplicate = False
        for cn in config_names:
            cn_words = set(cn.split())
            # If >50% of words overlap, consider it a duplicate
            if len(item_words & cn_words) > max(1, len(item_words) * 0.5):
                is_duplicate = True
                break

        if not is_duplicate:
            config_items.append(item)
            added += 1

    if added:
        print(f"    -> {added} new conferences from WikiCFP", file=sys.stderr)

    return config_items


def main() -> None:
    """CLI entry point: output conference JSON to stdout."""
    parser = argparse.ArgumentParser(description="Fetch conference data")
    parser.add_argument("--config", default="config.yaml", help="Path to config file")
    parser.add_argument("--test", action="store_true", help="Test WikiCFP feeds")
    args = parser.parse_args()

    config = load_config(args.config)

    if args.test:
        print("Testing WikiCFP feeds...\n", file=sys.stderr)
        items = fetch_wikicfp_conferences()
        for item in items[:10]:
            print(f"  {item['name']}")
            print(f"    Dates: {item['dates']}")
            print(f"    Location: {item['location']}")
            print(f"    CFP: {item['cfp_deadline']}")
            print(f"    URL: {item['url']}")
            print()
        return

    print("Fetching conferences...", file=sys.stderr)
    items = fetch_conferences(config)
    print(f"Total: {len(items)} conferences.", file=sys.stderr)

    json.dump(items, sys.stdout, indent=2, ensure_ascii=False)
    print()


if __name__ == "__main__":
    main()
