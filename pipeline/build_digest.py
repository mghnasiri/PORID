#!/usr/bin/env python3
"""
PORID Digest Builder.

Reads all data/*.json files, selects the most relevant items for
today's digest, writes a digest JSON file, and generates an HTML
email version using a Jinja2 template.

Usage:
    python build_digest.py
    python build_digest.py --data-dir ../data --output-dir ../data
"""

from __future__ import annotations

import json
import sys
import argparse
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import yaml
from jinja2 import Environment, FileSystemLoader


def load_config(config_path: str = "config.yaml") -> dict:
    """Load pipeline configuration from YAML file."""
    path = Path(__file__).parent / config_path
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_json(path: Path) -> list[dict]:
    """Load a JSON array file, returning empty list on failure."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def select_digest_items(
    data_dir: Path,
    pub_limit: int = 10,
    cfp_window_days: int = 30,
) -> dict:
    """
    Select items for today's digest.

    Selection criteria:
    - Publications: from last 24h, top N by tag-match count.
    - Software: any release from last 7 days.
    - Conferences: CFP deadline within cfp_window_days days.
    - Opportunities: deadline within cfp_window_days days.

    Args:
        data_dir: Directory containing the JSON data files.
        pub_limit: Max number of publications to include.
        cfp_window_days: Window for upcoming deadlines.

    Returns:
        Dict with keys: publications, software, conferences, opportunities, date, stats.
    """
    now = datetime.now(timezone.utc)
    today_str = now.strftime("%Y-%m-%d")
    yesterday = now - timedelta(hours=24)
    yesterday_str = yesterday.strftime("%Y-%m-%d")
    deadline_cutoff = now + timedelta(days=cfp_window_days)
    deadline_cutoff_str = deadline_cutoff.strftime("%Y-%m-%d")

    # --- Publications: last 24h, ranked by tag count ---
    pubs = load_json(data_dir / "publications.json")
    recent_pubs = [
        p for p in pubs
        if p.get("date", "") >= yesterday_str
    ]
    # Sort by number of tags (more tags = more relevant), then by date
    recent_pubs.sort(key=lambda p: (-len(p.get("tags", [])), p.get("date", "")), reverse=False)
    # Re-sort: most tags first
    recent_pubs.sort(key=lambda p: len(p.get("tags", [])), reverse=True)
    digest_pubs = recent_pubs[:pub_limit]

    # --- Software: releases from last 7 days ---
    sw = load_json(data_dir / "software.json")
    week_ago_str = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    digest_sw = [s for s in sw if s.get("date", "") >= week_ago_str]

    # --- Conferences: CFP deadline within window ---
    confs = load_json(data_dir / "conferences.json")
    digest_confs = []
    for c in confs:
        cfp = c.get("cfp_deadline", "")
        if cfp and today_str <= cfp <= deadline_cutoff_str:
            digest_confs.append(c)
    # Sort by deadline soonest first
    digest_confs.sort(key=lambda c: c.get("cfp_deadline", "9999"))

    # --- Opportunities: deadline within window ---
    opps = load_json(data_dir / "opportunities.json")
    digest_opps = []
    for o in opps:
        deadline = o.get("deadline", "")
        if deadline and today_str <= deadline <= deadline_cutoff_str:
            digest_opps.append(o)
    digest_opps.sort(key=lambda o: o.get("deadline", "9999"))

    total = len(digest_pubs) + len(digest_sw) + len(digest_confs) + len(digest_opps)

    return {
        "date": today_str,
        "generated_at": now.isoformat(),
        "publications": digest_pubs,
        "software": digest_sw,
        "deadlines": digest_confs + digest_opps,
        "conferences": digest_confs,
        "opportunities": digest_opps,
        "stats": {
            "publications": len(digest_pubs),
            "software": len(digest_sw),
            "deadlines": len(digest_confs) + len(digest_opps),
            "conferences": len(digest_confs),
            "opportunities": len(digest_opps),
            "total": total,
        },
    }


def generate_digest_html(digest: dict) -> str:
    """
    Render digest data into an HTML email using a Jinja2 template.

    Args:
        digest: Digest data dict from select_digest_items().

    Returns:
        Rendered HTML string.
    """
    template_dir = Path(__file__).parent / "templates"
    env = Environment(
        loader=FileSystemLoader(str(template_dir)),
        autoescape=True,
    )
    template = env.get_template("digest_email.html")
    return template.render(**digest)


def main() -> None:
    """CLI entry point: build digest JSON and HTML."""
    parser = argparse.ArgumentParser(description="Build PORID daily digest")
    parser.add_argument("--data-dir", default="../data", help="Data directory")
    parser.add_argument("--output-dir", default="../data", help="Output directory for digest files")
    args = parser.parse_args()

    data_dir = Path(__file__).parent / args.data_dir
    output_dir = Path(__file__).parent / args.output_dir

    print("Building daily digest...", file=sys.stderr)

    digest = select_digest_items(data_dir)
    date_str = digest["date"]

    # Write digest JSON
    digest_json_path = output_dir / f"digest-{date_str}.json"
    output_dir.mkdir(parents=True, exist_ok=True)
    with open(digest_json_path, "w", encoding="utf-8") as f:
        json.dump(digest, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"  ✓ Wrote {digest_json_path}", file=sys.stderr)

    # Also write to src/data/ if it exists
    src_data = Path(__file__).parent / "../src/data"
    if src_data.exists():
        src_digest_path = src_data / f"digest-{date_str}.json"
        with open(src_digest_path, "w", encoding="utf-8") as f:
            json.dump(digest, f, indent=2, ensure_ascii=False)
            f.write("\n")
        print(f"  ✓ Wrote {src_digest_path}", file=sys.stderr)

    # Generate HTML
    try:
        html = generate_digest_html(digest)
        html_path = output_dir / f"digest-{date_str}.html"
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"  ✓ Wrote {html_path}", file=sys.stderr)
    except Exception as e:
        print(f"  ✗ HTML generation failed: {e}", file=sys.stderr)

    # Summary
    s = digest["stats"]
    print(f"\nDigest for {date_str}:", file=sys.stderr)
    print(f"  Publications:  {s['publications']}", file=sys.stderr)
    print(f"  Software:      {s['software']}", file=sys.stderr)
    print(f"  Conferences:   {s['conferences']}", file=sys.stderr)
    print(f"  Opportunities: {s['opportunities']}", file=sys.stderr)
    print(f"  Total:         {s['total']}", file=sys.stderr)


if __name__ == "__main__":
    main()
