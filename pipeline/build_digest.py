#!/usr/bin/env python3
"""
PORID Digest Builder.

Reads all data/*.json files, selects the most relevant items for
today's digest, writes a digest JSON file, and generates an HTML
email version using a Jinja2 template.

Reads digest_config.json for customization (focus_tags, min_score,
include_* flags, etc.). Falls back to sensible defaults if the file
is missing.

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


# ── Digest config defaults ───────────────────────────────────────────

DEFAULT_DIGEST_CONFIG: dict = {
    "frequency": "daily",
    "top_publications": 10,
    "focus_tags": [],
    "include_software": True,
    "include_conferences": True,
    "include_opportunities": True,
    "deadline_horizon_days": 30,
    "min_score": 0,
}


def load_config(config_path: str = "config.yaml") -> dict:
    """Load pipeline configuration from YAML file."""
    path = Path(__file__).parent / config_path
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_digest_config(config_path: Optional[str] = None) -> dict:
    """
    Load digest configuration from digest_config.json.

    Falls back to DEFAULT_DIGEST_CONFIG if the file is missing or invalid.

    Args:
        config_path: Optional explicit path. Defaults to pipeline/digest_config.json.

    Returns:
        Dict with digest configuration values.
    """
    if config_path is None:
        config_path_obj = Path(__file__).parent / "digest_config.json"
    else:
        config_path_obj = Path(config_path)

    config = dict(DEFAULT_DIGEST_CONFIG)  # start with defaults

    try:
        with open(config_path_obj, "r", encoding="utf-8") as f:
            user_config = json.load(f)
            if isinstance(user_config, dict):
                config.update(user_config)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"  Note: digest_config.json not found or invalid ({e}), using defaults.", file=sys.stderr)

    return config


def load_json(path: Path) -> list[dict]:
    """Load a JSON array file, returning empty list on failure."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def _sort_publications(pubs: list[dict], focus_tags: list[str]) -> list[dict]:
    """
    Sort publications by relevance.

    If items have a 'score' field, sort by score descending. Otherwise,
    sort by tag count descending. Focus tags boost items: items matching
    any focus tag are sorted first.

    Args:
        pubs: List of publication dicts.
        focus_tags: List of tag names to prioritize.

    Returns:
        Sorted list of publications.
    """
    def sort_key(p: dict) -> tuple:
        # Focus tag match: 1 if matches, 0 if not (we negate for desc sort)
        has_focus = 0
        if focus_tags:
            item_tags = set(p.get("tags", []))
            has_focus = 1 if item_tags.intersection(focus_tags) else 0

        score = p.get("score", None)
        if score is not None:
            return (-has_focus, -score, p.get("date", ""))
        else:
            tag_count = len(p.get("tags", []))
            return (-has_focus, -tag_count, p.get("date", ""))

    return sorted(pubs, key=sort_key)


def select_digest_items(
    data_dir: Path,
    pub_limit: int = 10,
    cfp_window_days: int = 30,
    digest_config: Optional[dict] = None,
) -> dict:
    """
    Select items for today's digest.

    Selection criteria:
    - Publications: from last 24h, top N by score (or tag-match count).
    - Software: any release from last 7 days (if include_software).
    - Conferences: CFP deadline within cfp_window_days days (if include_conferences).
    - Opportunities: deadline within cfp_window_days days (if include_opportunities).

    Args:
        data_dir: Directory containing the JSON data files.
        pub_limit: Max number of publications to include.
        cfp_window_days: Window for upcoming deadlines.
        digest_config: Optional digest configuration dict. Falls back to defaults.

    Returns:
        Dict with keys: publications, software, conferences, opportunities, date, stats.
    """
    if digest_config is None:
        digest_config = load_digest_config()

    # Override from digest config
    pub_limit = digest_config.get("top_publications", pub_limit)
    cfp_window_days = digest_config.get("deadline_horizon_days", cfp_window_days)
    min_score = digest_config.get("min_score", 0)
    focus_tags = digest_config.get("focus_tags", [])
    include_software = digest_config.get("include_software", True)
    include_conferences = digest_config.get("include_conferences", True)
    include_opportunities = digest_config.get("include_opportunities", True)

    now = datetime.now(timezone.utc)
    today_str = now.strftime("%Y-%m-%d")
    yesterday = now - timedelta(hours=24)
    yesterday_str = yesterday.strftime("%Y-%m-%d")
    deadline_cutoff = now + timedelta(days=cfp_window_days)
    deadline_cutoff_str = deadline_cutoff.strftime("%Y-%m-%d")

    # --- Publications: last 24h, ranked by score or tag count ---
    pubs = load_json(data_dir / "publications.json")
    recent_pubs = [
        p for p in pubs
        if p.get("date", "") >= yesterday_str
    ]

    # Filter by min_score if items have scores
    if min_score > 0:
        recent_pubs = [
            p for p in recent_pubs
            if p.get("score", 100) >= min_score  # default 100 = keep items without score
        ]

    # Sort by score/tags with focus tag boosting
    recent_pubs = _sort_publications(recent_pubs, focus_tags)
    digest_pubs = recent_pubs[:pub_limit]

    # --- Software: releases from last 7 days ---
    digest_sw: list[dict] = []
    if include_software:
        sw = load_json(data_dir / "software.json")
        week_ago_str = (now - timedelta(days=7)).strftime("%Y-%m-%d")
        digest_sw = [s for s in sw if s.get("date", "") >= week_ago_str]

    # --- Conferences: CFP deadline within window ---
    digest_confs: list[dict] = []
    if include_conferences:
        confs = load_json(data_dir / "conferences.json")
        for c in confs:
            cfp = c.get("cfp_deadline", "")
            if cfp and today_str <= cfp <= deadline_cutoff_str:
                digest_confs.append(c)
        # Sort by deadline soonest first
        digest_confs.sort(key=lambda c: c.get("cfp_deadline", "9999"))

    # --- Opportunities: deadline within window ---
    digest_opps: list[dict] = []
    if include_opportunities:
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

    # Load digest configuration
    digest_config = load_digest_config()

    digest = select_digest_items(data_dir, digest_config=digest_config)
    date_str = digest["date"]

    # Write digest JSON
    digest_json_path = output_dir / f"digest-{date_str}.json"
    output_dir.mkdir(parents=True, exist_ok=True)
    with open(digest_json_path, "w", encoding="utf-8") as f:
        json.dump(digest, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"  Wrote {digest_json_path}", file=sys.stderr)

    # Also write to src/data/ if it exists
    src_data = Path(__file__).parent / "../src/data"
    if src_data.exists():
        src_digest_path = src_data / f"digest-{date_str}.json"
        with open(src_digest_path, "w", encoding="utf-8") as f:
            json.dump(digest, f, indent=2, ensure_ascii=False)
            f.write("\n")
        print(f"  Wrote {src_digest_path}", file=sys.stderr)

    # Generate HTML
    try:
        html = generate_digest_html(digest)
        html_path = output_dir / f"digest-{date_str}.html"
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"  Wrote {html_path}", file=sys.stderr)
    except Exception as e:
        print(f"  HTML generation failed: {e}", file=sys.stderr)

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
