#!/usr/bin/env python3
"""
PORID RSS Feed Generator.

Generates an RSS 2.0 XML feed from data/publications.json, suitable for
feed readers like Feedly, Inoreader, etc. Output is written to data/feed.xml.

Usage:
    python build_rss.py
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from xml.etree.ElementTree import Element, SubElement, tostring
from xml.dom.minidom import parseString


def load_json(path: Path) -> list[dict]:
    """Load a JSON array file."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def build_rss(data_dir: Path, max_items: int = 50) -> str:
    """
    Build an RSS 2.0 XML string from publications data.

    Args:
        data_dir: Directory containing publications.json.
        max_items: Maximum items in the feed.

    Returns:
        RSS XML string.
    """
    pubs = load_json(data_dir / "publications.json")

    # Sort by date descending, take top N
    pubs.sort(key=lambda p: p.get("date", ""), reverse=True)
    pubs = pubs[:max_items]

    now = datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S +0000")

    rss = Element("rss", version="2.0")
    rss.set("xmlns:atom", "http://www.w3.org/2005/Atom")

    channel = SubElement(rss, "channel")
    SubElement(channel, "title").text = "PORID — OR Intelligence Feed"
    SubElement(channel, "link").text = "https://mghnasiri.github.io/PORID/"
    SubElement(channel, "description").text = (
        "Latest publications in Operations Research — aggregated from "
        "arXiv, Crossref, OpenAlex, and Semantic Scholar."
    )
    SubElement(channel, "language").text = "en-us"
    SubElement(channel, "lastBuildDate").text = now
    SubElement(channel, "generator").text = "PORID Pipeline"

    # Self-referencing atom link
    atom_link = SubElement(channel, "atom:link")
    atom_link.set("href", "https://mghnasiri.github.io/PORID/data/feed.xml")
    atom_link.set("rel", "self")
    atom_link.set("type", "application/rss+xml")

    for pub in pubs:
        item = SubElement(channel, "item")
        SubElement(item, "title").text = pub.get("title", "Untitled")

        url = pub.get("url", "")
        if url:
            SubElement(item, "link").text = url
            SubElement(item, "guid", isPermaLink="true").text = url
        else:
            SubElement(item, "guid", isPermaLink="false").text = pub.get("id", "")

        # Description: authors + abstract snippet
        authors = pub.get("authors", [])
        abstract = pub.get("abstract", "")
        desc_parts = []
        if authors:
            desc_parts.append(", ".join(authors[:5]))
            if len(authors) > 5:
                desc_parts[-1] += " et al."
        if abstract:
            desc_parts.append(abstract[:500])
        SubElement(item, "description").text = "\n\n".join(desc_parts) if desc_parts else ""

        # Date
        if pub.get("date"):
            try:
                dt = datetime.fromisoformat(pub["date"].replace("Z", "+00:00"))
                SubElement(item, "pubDate").text = dt.strftime("%a, %d %b %Y %H:%M:%S +0000")
            except (ValueError, TypeError):
                pass

        # Tags as categories
        for tag in pub.get("tags", []):
            SubElement(item, "category").text = tag

        # Source
        if pub.get("source"):
            SubElement(item, "source", url=url).text = pub["source"]

    # Pretty-print
    raw = tostring(rss, encoding="unicode", xml_declaration=False)
    dom = parseString(f'<?xml version="1.0" encoding="UTF-8"?>\n{raw}')
    return dom.toprettyxml(indent="  ", encoding=None)


def main() -> None:
    """Generate RSS feed and write to data/feed.xml."""
    data_dir = Path(__file__).parent / "../data"
    output = data_dir / "feed.xml"

    xml = build_rss(data_dir)

    output.parent.mkdir(parents=True, exist_ok=True)
    with open(output, "w", encoding="utf-8") as f:
        f.write(xml)

    print(f"  ✓ RSS feed written to {output}", file=sys.stderr)

    # Also write to src/data for deployment
    src_output = Path(__file__).parent / "../src/data/feed.xml"
    if src_output.parent.exists():
        with open(src_output, "w", encoding="utf-8") as f:
            f.write(xml)
        print(f"  ✓ RSS feed written to {src_output}", file=sys.stderr)


if __name__ == "__main__":
    main()
