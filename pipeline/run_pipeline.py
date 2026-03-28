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
import shutil
import sys
import argparse
import time
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
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
from validate import validate_items


# ── Constants ────────────────────────────────────────────────────────

STALE_DAYS: int = 90
"""Items older than this many days are dropped and archived."""

CHANGELOG_MAX_ENTRIES: int = 90
"""Keep at most this many entries in the incremental changelog."""


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


def read_json_dict(path: Path) -> dict:
    """Read a JSON object file, returning empty dict if missing or invalid."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


YIELD_HISTORY_RUNS: int = 7
"""Number of recent runs to keep in source yield history."""

YIELD_DEGRADED_THRESHOLD: float = 0.20
"""Flag a source as degraded if it yields less than this fraction of its rolling average."""


def check_source_yield(
    source_counts: dict[str, int],
    metadata_path: Path,
) -> tuple[dict[str, list[int]], list[str]]:
    """
    Compare per-source item counts against a rolling average.

    Reads existing yield history from metadata.json, appends current counts,
    trims to the last YIELD_HISTORY_RUNS entries, and flags any source whose
    current yield is less than YIELD_DEGRADED_THRESHOLD of its average.

    Args:
        source_counts: Dict mapping source name to item count for this run.
        metadata_path: Path to the metadata.json file.

    Returns:
        Tuple of (updated yield history dict, list of degraded source names).
    """
    existing_meta = read_json_dict(metadata_path)
    yield_history: dict[str, list[int]] = existing_meta.get("source_yield_history", {})

    degraded: list[str] = []

    for source, count in source_counts.items():
        history = yield_history.get(source, [])
        # Compute rolling average from previous runs (exclude current)
        if history:
            avg = sum(history) / len(history)
            if avg > 0 and count < avg * YIELD_DEGRADED_THRESHOLD:
                degraded.append(source)
                print(f"  WARNING: Source '{source}' yielded {count} items "
                      f"(rolling avg: {avg:.0f}) -- DEGRADED", file=sys.stderr)

        # Append current count and trim to last N runs
        history.append(count)
        yield_history[source] = history[-YIELD_HISTORY_RUNS:]

    return yield_history, degraded


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

    # ── Pipeline timing ─────────────────────────────────────────────
    timings: dict[str, float] = {}

    # ── Parallel fetching ────────────────────────────────────────────
    # All sources are independent and can be fetched concurrently.
    # We use ThreadPoolExecutor since fetchers are I/O-bound (HTTP).
    t_fetch_start = time.perf_counter()

    fetch_tasks = {
        "arXiv":               lambda: fetch_arxiv(config),
        "Crossref":            lambda: fetch_crossref(config),
        "OpenAlex":            lambda: fetch_openalex(config),
        "Semantic Scholar":    lambda: fetch_semantic_scholar(config),
        "Optimization Online": lambda: fetch_optim_online(),
        "GitHub":              lambda: fetch_software(config),
        "Conferences":         lambda: fetch_conferences(config),
        "Opportunities":       lambda: fetch_all_feeds(config),
    }

    # Category mapping: which list does each source feed into?
    pub_sources = {"arXiv", "Crossref", "OpenAlex", "Semantic Scholar", "Optimization Online"}
    results: dict[str, list[dict]] = {}

    print("=" * 60)
    print(f"Fetching from {len(fetch_tasks)} sources in parallel...")
    print("=" * 60)

    with ThreadPoolExecutor(max_workers=len(fetch_tasks)) as executor:
        future_to_name = {
            executor.submit(fn): name for name, fn in fetch_tasks.items()
        }
        for future in as_completed(future_to_name):
            name = future_to_name[future]
            try:
                items = future.result()
                results[name] = items
                if name == "Opportunities":
                    sources_checked.extend(["HigherEdJobs", "OperationsAcademia"])
                else:
                    sources_checked.append(name)
                print(f"  -> {len(items)} items from {name}")
            except Exception as e:
                errors.append(f"{name}: {e}")
                print(f"  ! {name} failed: {e}", file=sys.stderr)
                traceback.print_exc(file=sys.stderr)

    # Collect results into typed lists
    for source in pub_sources:
        publications.extend(results.get(source, []))
    software = results.get("GitHub", [])
    conferences = results.get("Conferences", [])
    opportunities = results.get("Opportunities", [])
    print()
    timings["fetch"] = time.perf_counter() - t_fetch_start

    # ── Classify ──────────────────────────────────────────────────────
    t_classify_start = time.perf_counter()
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
    timings["classify"] = time.perf_counter() - t_classify_start

    # ── Validate data quality ────────────────────────────────────────
    t_validate_start = time.perf_counter()
    print("\n" + "=" * 60)
    print("Validating data quality...")
    print("=" * 60)
    total_invalid = 0
    publications, inv = validate_items(publications)
    total_invalid += len(inv)
    software, inv = validate_items(software)
    total_invalid += len(inv)
    conferences, inv = validate_items(conferences)
    total_invalid += len(inv)
    opportunities, inv = validate_items(opportunities)
    total_invalid += len(inv)
    print(f"  Total items dropped by validation: {total_invalid}")
    timings["validate"] = time.perf_counter() - t_validate_start

    # ── Deduplicate publications ──────────────────────────────────────
    t_dedup_start = time.perf_counter()
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
    timings["dedup"] = time.perf_counter() - t_dedup_start

    # ── Incremental merge with existing data ─────────────────────────
    t_merge_start = time.perf_counter()
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
    timings["merge"] = time.perf_counter() - t_merge_start

    # ── Source yield monitor ─────────────────────────────────────────
    print("\n" + "=" * 60)
    print("Checking source yields...")
    print("=" * 60)
    source_counts: dict[str, int] = {
        name: len(items) for name, items in results.items()
    }
    metadata_path = out / "metadata.json"
    source_yield_history, degraded_sources = check_source_yield(
        source_counts, metadata_path
    )
    if not degraded_sources:
        print("  All sources within normal yield range.")

    # ── Sort ──────────────────────────────────────────────────────────
    publications.sort(key=lambda x: x.get("date", ""), reverse=True)
    software.sort(key=lambda x: x.get("date", ""), reverse=True)
    conferences.sort(key=lambda x: x.get("cfp_deadline", "9999"))
    opportunities.sort(key=lambda x: x.get("date", ""), reverse=True)

    # ── Write output ──────────────────────────────────────────────────
    t_write_start = time.perf_counter()
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

    # Copy to static fallback for offline/resilient loading
    static_dir = out / "static"
    static_dir.mkdir(parents=True, exist_ok=True)
    for fname in ("publications.json", "software.json", "conferences.json", "opportunities.json"):
        src_file = out / fname
        if src_file.exists():
            shutil.copy2(str(src_file), str(static_dir / fname))
    print("  Static fallbacks updated in data/static/")

    timings["write"] = time.perf_counter() - t_write_start

    # Print timing report
    print("\n" + "=" * 60)
    print("Pipeline timing report:")
    print("=" * 60)
    for phase, elapsed in timings.items():
        print(f"  {phase:12s}: {elapsed:6.2f}s")
    total_time = sum(timings.values())
    print(f"  {'TOTAL':12s}: {total_time:6.2f}s")

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
        "timings": {k: round(v, 3) for k, v in timings.items()},
        "source_yield_history": source_yield_history,
        "degraded_sources": degraded_sources,
    }

    write_json(metadata, out / "metadata.json")
    if src_data.exists():
        write_json(metadata, src_data / "metadata.json")

    # ── Incremental changelog ────────────────────────────────────────
    changelog_path = out / "changelog.json"
    changelog = read_json(changelog_path)

    # Collect top new paper titles (most recent first, up to 3)
    top_new_papers: list[str] = []
    if pubs_added > 0:
        existing_pub_ids = {p.get("id") for p in existing_pubs}
        new_pubs = [p for p in publications if p.get("id") not in existing_pub_ids]
        new_pubs.sort(key=lambda x: x.get("date", ""), reverse=True)
        top_new_papers = [p.get("title", "Untitled")[:120] for p in new_pubs[:3]]

    # Collect top new opportunity titles (up to 3)
    top_new_opportunities: list[str] = []
    if opps_added > 0:
        existing_opp_ids = {o.get("id") for o in existing_opps}
        new_opps = [o for o in opportunities if o.get("id") not in existing_opp_ids]
        new_opps.sort(key=lambda x: x.get("date", ""), reverse=True)
        top_new_opportunities = [o.get("title", "Untitled")[:120] for o in new_opps[:3]]

    changelog_entry = {
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "publications_added": pubs_added,
        "opportunities_added": opps_added,
        "software_added": sw_added,
        "total_dropped": total_dropped,
        "sources_checked": sources_checked,
        "errors": errors,
        "top_new_papers": top_new_papers,
        "top_new_opportunities": top_new_opportunities,
    }
    changelog.insert(0, changelog_entry)

    # Keep only the most recent entries
    changelog = changelog[:CHANGELOG_MAX_ENTRIES]
    write_json(changelog, changelog_path)
    if src_data.exists():
        write_json(changelog, src_data / "changelog.json")
    print(f"  Changelog updated ({len(changelog)} entries)")

    # ── Note: Trends, Solvers, Brief ─────────────────────────────────
    # These are run as separate steps in the GitHub Actions workflow:
    #   - python pipeline/compute_trends.py
    #   - python pipeline/fetch_solvers.py
    #   - python pipeline/build_brief.py
    # This keeps each script self-contained and independently testable.
    # Do NOT import and run them here to avoid double-execution.

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
