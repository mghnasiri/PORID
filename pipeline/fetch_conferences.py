#!/usr/bin/env python3
"""
Fetch conference data from pipeline configuration.

Currently reads static entries from config.yaml.
Live scraping (e.g., WikiCFP RSS) is deferred as a future enhancement.

Usage:
    python fetch_conferences.py
"""

from __future__ import annotations

import json
import sys
import argparse
from pathlib import Path

import yaml


def load_config(config_path: str = "config.yaml") -> dict:
    """Load pipeline configuration from YAML file."""
    path = Path(__file__).parent / config_path
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def fetch_conferences(config: dict) -> list[dict]:
    """
    Build conference items from the static config.yaml list.

    Each item is normalized to the standard PORID schema.

    Args:
        config: Full pipeline configuration dict.

    Returns:
        List of conference dicts in PORID schema.
    """
    raw = config.get("conferences", [])
    items: list[dict] = []

    for i, conf in enumerate(raw, start=1):
        items.append({
            "id": f"conf-{i:03d}",
            "name": conf.get("name", "Unnamed Conference"),
            "dates": conf.get("dates", ""),
            "location": conf.get("location", ""),
            "cfp_deadline": conf.get("cfp_deadline", ""),
            "url": conf.get("url", ""),
            "source": "config",
            "tags": conf.get("tags", ["conference"]),
            "type": "conference",
        })

    return items


# TODO: Future enhancement — WikiCFP RSS integration
# WikiCFP provides RSS feeds per topic area:
#   http://www.wikicfp.com/cfp/rss?cat=operations+research
# feedparser can parse these directly. Each <item> has:
#   <title>, <link>, <description> (contains dates + location + deadline)
# The description field requires regex parsing to extract structured data.
# This is fragile (WikiCFP changes format occasionally), so for now
# we use the curated config.yaml list as the authoritative source.


def main() -> None:
    """CLI entry point: output conference JSON to stdout."""
    parser = argparse.ArgumentParser(description="Fetch conference data from config")
    parser.add_argument("--config", default="config.yaml", help="Path to config file")
    args = parser.parse_args()

    config = load_config(args.config)

    print("Fetching conferences from config...", file=sys.stderr)
    items = fetch_conferences(config)
    print(f"Total: {len(items)} conferences.", file=sys.stderr)

    json.dump(items, sys.stdout, indent=2, ensure_ascii=False)
    print()


if __name__ == "__main__":
    main()
