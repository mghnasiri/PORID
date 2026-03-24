#!/usr/bin/env python3
"""
PORID Pipeline Orchestrator.

Runs all fetchers in sequence, classifies items, deduplicates,
and writes output to data/*.json files for the frontend.

Supports incremental fetch: merges new items with existing data,
deduplicates by ID and DOI, and drops items older than 90 days.
Stale items are archived monthly to data/archive/YYYY-MM.json.

Sources: arXiv, Crossref, OpenAlex, Semantic Scholar, GitHub, conferences, opportunities.

Usage:
    python run_pipeline.py
    python run_pipeline.py --config config.yaml --output-dir ../data
"""

from __future__ import annotations

import json
import sys
import argparse
import traceback
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import yaml

# Local module imports
from fetch_arxiv import fetch_all_categories as fetch_arxiv
from fetch_crossref import fetch_all_journals as fetch_crossref
from fetch_openalex import fetch_all_concepts as fetch_openalex
from fetch_semantic_scholar import fetch_all_queries as fetch_semantic_scholar
from fetch_optim_online import fetch_optim_online
from fetch_software import fetch_all_repos as fetch_software
from fetch_conferences import fetch_conferences
from fetch_opportunities import fetch_all_feeds
from classify import classify_items
from deduplicate import deduplicate


# ── Constants ────────────────────────────────────────────────────────

STALE_DAYS: int = 90
"""Items older than this many days are dropped and archived."""


def load_config(config_path: str = "config.yaml") -> dict:
    """Load pipeline configuration from YAML file."""
    path = Path(__file__).parent / config_path
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def write_json(data: list | dict, path: Path) -> None:
    """Write data to a JSON file with pretty formatting."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def read_json(path: Path) -> list[dict]:
    """
    Read a JSON array file, returning empty list if missing or invalid.

    Args:
        path: Path to a JSON file containing a list.

    Returns:
        List of dicts, or empty list on any error.
    """
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def merge_items(existing: list[dict], new: list[dict]) -> tuple[list[dict], int]:
    """
    Merge new items into existing items, deduplicating by 'id' and 'doi'.

    Args:
        existing: Previously stored items.
        new: Freshly fetched items.

    Returns:
        Tuple of (merged list, count of genuinely new items added).
    """
    seen_ids: set[str] = set()
    seen_dois: set[str] = set()
    merged: list[dict] = []

    # Index existing items
    for item in existing:
        item_id = item.get("id", "")
        doi = item.get("doi", "")
        if item_id:
            seen_ids.add(item_id)
        if doi:
            seen_dois.add(doi)
        merged.append(item)

    # Add new items that are not duplicates
    added = 0
    for item in new:
        item_id = item.get("id", "")
        doi = item.get("doi", "")

        is_dup = False
        if item_id and item_id in seen_ids:
            is_dup = True
        if doi and doi in seen_dois:
            is_dup = True

        if not is_dup:
            merged.append(item)
            added += 1
            if item_id:
                seen_ids.add(item_id)
            if doi:
                seen_dois.add(doi)

    return merged, added


def drop_stale_items(
    items: list[dict],
    max_age_days: int = STALE_DAYS,
) -> tuple[list[dict], list[dict]]:
    """
    Remove items older than max_age_days.

    Args:
        items: List of items with 'date' fields.
        max_age_days: Maximum age in days.

    Returns:
        Tuple of (kept items, dropped items).
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(days=max_age_days)).strftime("%Y-%m-%d")
    kept: list[dict] = []
    dropped: list[dict] = []

    for item in items:
        item_date = item.get("date", "")
        # Keep items with no date or recent enough dates
        if not item_date or item_date >= cutoff:
            kept.append(item)
        else:
            dropped.append(item)

    return kept, dropped


def archive_dropped_items(dropped: list[dict], output_dir: Path) -> None:
    """
    Write dropped items to a monthly archive file.

    Archives are stored in data/archive/YYYY-MM.json. If the file
    already exists, new items are appended.

    Args:
        dropped: List of stale items to archive.
        output_dir: Base data output directory.
    """
    if not dropped:
        return

    archive_dir = output_dir / "archive"
    archive_dir.mkdir(parents=True, exist_ok=True)

    month_str = datetime.now(timezone.utc).strftime("%Y-%m")
    archive_path = archive_dir / f"{month_str}.json"

    # Read existing archive and append
    existing = read_json(archive_path)
    combined = existing + dropped
    write_json(combined, archive_path)
    print(f"  Archived {len(dropped)} stale items to {archive_path}")


def run_pipeline(config_path: str = "config.yaml", output_dir: str = "../data") -> dict:
    """
    Execute the full pipeline: fetch -> classify -> deduplicate -> write.

    Supports incremental fetch: reads existing data files, merges with
    new items, drops stale entries (>90 days), and archives them.

    Args:
        config_path: Path to config.yaml (relative to pipeline/ dir).
        output_dir: Output directory for JSON files (relative to pipeline/ dir).

    Returns:
        Summary dict with counts and status.
    """
    config = load_config(config_path)
    tag_keywords = config.get("tags", {})
    out = Path(__file__).parent / output_dir

    publications: list[dict] = []
    software: list[dict] = []
    conferences: list[dict] = []
    opportunities: list[dict] = []
    errors: list[str] = []
    sources_checked: list[str] = []

    # ── Load existing data for incremental merge ─────────────────────
    existing_pubs = read_json(out / "publications.json")
    existing_sw = read_json(out / "software.json")
    existing_confs = read_json(out / "conferences.json")
    existing_opps = read_json(out / "opportunities.json")

    existing_counts = {
        "publications": len(existing_pubs),
        "software": len(existing_sw),
        "conferences": len(existing_confs),
        "opportunities": len(existing_opps),
    }

    # ── 1. arXiv ──────────────────────────────────────────────────────
    print("=" * 60)
    print("[1/7] Fetching arXiv papers...")
    print("=" * 60)
    try:
        arxiv_items = fetch_arxiv(config)
        publications.extend(arxiv_items)
        sources_checked.append("arXiv")
        print(f"  -> {len(arxiv_items)} papers from arXiv\n")
    except Exception as e:
        errors.append(f"arXiv: {e}")
        print(f"  ! arXiv failed: {e}\n", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)

    # ── 2. Crossref ───────────────────────────────────────────────────
    print("=" * 60)
    print("[2/7] Fetching Crossref journal articles...")
    print("=" * 60)
    try:
        crossref_items = fetch_crossref(config)
        publications.extend(crossref_items)
        sources_checked.append("Crossref")
        print(f"  -> {len(crossref_items)} articles from Crossref\n")
    except Exception as e:
        errors.append(f"Crossref: {e}")
        print(f"  ! Crossref failed: {e}\n", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)

    # ── 3. OpenAlex ───────────────────────────────────────────────────
    print("=" * 60)
    print("[3/7] Fetching OpenAlex publications...")
    print("=" * 60)
    try:
        openalex_items = fetch_openalex(config)
        publications.extend(openalex_items)
        sources_checked.append("OpenAlex")
        print(f"  -> {len(openalex_items)} publications from OpenAlex\n")
    except Exception as e:
        errors.append(f"OpenAlex: {e}")
        print(f"  ! OpenAlex failed: {e}\n", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)

    # ── 4. Semantic Scholar ───────────────────────────────────────────
    print("=" * 60)
    print("[4/7] Fetching Semantic Scholar papers...")
    print("=" * 60)
    try:
        s2_items = fetch_semantic_scholar(config)
        publications.extend(s2_items)
        sources_checked.append("Semantic Scholar")
        print(f"  -> {len(s2_items)} papers from Semantic Scholar\n")
    except Exception as e:
        errors.append(f"Semantic Scholar: {e}")
        print(f"  ! Semantic Scholar failed: {e}\n", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)

    # ── 4b. Optimization Online ─────────────────────────────────────
    print("=" * 60)
    print("[4b/7] Fetching Optimization Online...")
    print("=" * 60)
    try:
        optim_items = fetch_optim_online()
        publications.extend(optim_items)
        sources_checked.append("Optimization Online")
        print(f"  -> {len(optim_items)} items from Optimization Online\n")
    except Exception as e:
        errors.append(f"Optimization Online: {e}")
        print(f"  ! Optimization Online failed: {e}\n", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)

    # ── 5. GitHub Software Releases ───────────────────────────────────
    print("=" * 60)
    print("[5/7] Fetching GitHub releases...")
    print("=" * 60)
    try:
        software = fetch_software(config)
        sources_checked.append("GitHub")
        print(f"  -> {len(software)} releases from GitHub\n")
    except Exception as e:
        errors.append(f"GitHub: {e}")
        print(f"  ! GitHub failed: {e}\n", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)

    # ── 6. Conferences ────────────────────────────────────────────────
    print("=" * 60)
    print("[6/7] Fetching conference data...")
    print("=" * 60)
    try:
        conferences = fetch_conferences(config)
        sources_checked.append("Conferences")
        print(f"  -> {len(conferences)} conferences from config\n")
    except Exception as e:
        errors.append(f"Conferences: {e}")
        print(f"  ! Conferences failed: {e}\n", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)

    # ── 7. Opportunities ──────────────────────────────────────────────
    print("=" * 60)
    print("[7/7] Fetching opportunity feeds...")
    print("=" * 60)
    try:
        opportunities = fetch_all_feeds(config)
        sources_checked.extend(["HigherEdJobs", "OperationsAcademia"])
        print(f"  -> {len(opportunities)} opportunities from feeds\n")
    except Exception as e:
        errors.append(f"Opportunities: {e}")
        print(f"  ! Opportunities failed: {e}\n", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)

    # ── Classify ──────────────────────────────────────────────────────
    print("=" * 60)
    print("Classifying items...")
    print("=" * 60)
    all_items = publications + software + conferences + opportunities
    classify_items(all_items, tag_keywords)

    # Re-split after classification (items are modified in-place)
    publications = [i for i in all_items if i.get("type") == "publication"]
    software = [i for i in all_items if i.get("type") == "software"]
    conferences = [i for i in all_items if i.get("type") == "conference"]
    opportunities = [i for i in all_items if i.get("type") == "opportunity"]

    # ── Deduplicate publications ──────────────────────────────────────
    print("\n" + "=" * 60)
    print("Deduplicating publications...")
    print("=" * 60)
    pub_before = len(publications)
    publications = deduplicate(publications)
    print(f"  {pub_before} -> {len(publications)} publications\n")

    # ── Filter out future-dated items (bad metadata) ────────────────
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    pub_pre = len(publications)
    publications = [p for p in publications if p.get("date", "") <= today or not p.get("date")]
    if len(publications) < pub_pre:
        print(f"  Filtered {pub_pre - len(publications)} future-dated publications", file=sys.stderr)

    # ── Incremental merge with existing data ─────────────────────────
    print("=" * 60)
    print("Merging with existing data...")
    print("=" * 60)

    publications, pubs_added = merge_items(existing_pubs, publications)
    software, sw_added = merge_items(existing_sw, software)
    # Conferences are replaced entirely (they come from config, not accumulated)
    # Opportunities are merged incrementally
    opportunities, opps_added = merge_items(existing_opps, opportunities)

    # ── Drop stale items (>90 days) ──────────────────────────────────
    all_dropped: list[dict] = []

    publications, dropped_pubs = drop_stale_items(publications)
    all_dropped.extend(dropped_pubs)

    software, dropped_sw = drop_stale_items(software)
    all_dropped.extend(dropped_sw)

    opportunities, dropped_opps = drop_stale_items(opportunities)
    all_dropped.extend(dropped_opps)

    total_dropped = len(all_dropped)

    # Archive dropped items
    if all_dropped:
        archive_dropped_items(all_dropped, out)

    # Print merge stats
    print(f"  Merged: {existing_counts['publications']} existing + {pubs_added} new = {len(publications)} total publications ({len(dropped_pubs)} dropped as stale)")
    print(f"  Merged: {existing_counts['software']} existing + {sw_added} new = {len(software)} total software ({len(dropped_sw)} dropped as stale)")
    print(f"  Conferences: {len(conferences)} (replaced from config)")
    print(f"  Merged: {existing_counts['opportunities']} existing + {opps_added} new = {len(opportunities)} total opportunities ({len(dropped_opps)} dropped as stale)")

    # ── Sort ──────────────────────────────────────────────────────────
    publications.sort(key=lambda x: x.get("date", ""), reverse=True)
    software.sort(key=lambda x: x.get("date", ""), reverse=True)
    conferences.sort(key=lambda x: x.get("cfp_deadline", "9999"))
    opportunities.sort(key=lambda x: x.get("date", ""), reverse=True)

    # ── Write output ──────────────────────────────────────────────────
    print("=" * 60)
    print("Writing output files...")
    print("=" * 60)

    write_json(publications, out / "publications.json")
    write_json(software, out / "software.json")
    write_json(conferences, out / "conferences.json")
    write_json(opportunities, out / "opportunities.json")

    # Also write to src/data/ for the frontend
    src_data = Path(__file__).parent / "../src/data"
    if src_data.exists():
        write_json(publications, src_data / "publications.json")
        write_json(software, src_data / "software.json")
        write_json(conferences, src_data / "conferences.json")
        write_json(opportunities, src_data / "opportunities.json")
        print("  Also wrote to src/data/")

    # ── Metadata ──────────────────────────────────────────────────────
    metadata = {
        "last_fetch": datetime.now(timezone.utc).isoformat(),
        "counts": {
            "publications": len(publications),
            "software": len(software),
            "conferences": len(conferences),
            "opportunities": len(opportunities),
        },
        "total": len(publications) + len(software) + len(conferences) + len(opportunities),
        "sources_checked": sources_checked,
        "errors": errors,
        "merge_stats": {
            "publications_added": pubs_added,
            "software_added": sw_added,
            "opportunities_added": opps_added,
            "total_dropped_stale": total_dropped,
        },
    }

    write_json(metadata, out / "metadata.json")
    if src_data.exists():
        write_json(metadata, src_data / "metadata.json")

    # ── Summary ───────────────────────────────────────────────────────
    print(f"\nPORID Pipeline Complete: {len(publications)} publications, "
          f"{len(software)} software, {len(conferences)} conferences, "
          f"{len(opportunities)} opportunities")
    if errors:
        print(f"Sources with errors: {errors}")
    print()

    return metadata


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(description="Run the PORID data pipeline")
    parser.add_argument("--config", default="config.yaml", help="Path to config file")
    parser.add_argument("--output-dir", default="../data", help="Output directory for JSON files")
    args = parser.parse_args()

    run_pipeline(config_path=args.config, output_dir=args.output_dir)


if __name__ == "__main__":
    main()
