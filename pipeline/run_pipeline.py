#!/usr/bin/env python3
"""
PORID Pipeline Orchestrator.

Runs all fetchers in sequence, classifies items, deduplicates,
and writes output to data/*.json files for the frontend.

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
from datetime import datetime, timezone
from pathlib import Path

import yaml

# Local module imports
from fetch_arxiv import fetch_all_categories as fetch_arxiv
from fetch_crossref import fetch_all_journals as fetch_crossref
from fetch_openalex import fetch_all_concepts as fetch_openalex
from fetch_semantic_scholar import fetch_all_queries as fetch_semantic_scholar
from fetch_software import fetch_all_repos as fetch_software
from fetch_conferences import fetch_conferences
from fetch_opportunities import fetch_all_feeds
from classify import classify_items
from deduplicate import deduplicate


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


def run_pipeline(config_path: str = "config.yaml", output_dir: str = "../data") -> dict:
    """
    Execute the full pipeline: fetch → classify → deduplicate → write.

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
    sources_checked = 0

    # ── 1. arXiv ──────────────────────────────────────────────────────
    print("=" * 60)
    print("[1/7] Fetching arXiv papers...")
    print("=" * 60)
    try:
        arxiv_items = fetch_arxiv(config)
        publications.extend(arxiv_items)
        sources_checked += len(config.get("arxiv", {}).get("categories", []))
        print(f"  ✓ {len(arxiv_items)} papers from arXiv\n")
    except Exception as e:
        errors.append(f"arXiv: {e}")
        print(f"  ✗ arXiv failed: {e}\n", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)

    # ── 2. Crossref ───────────────────────────────────────────────────
    print("=" * 60)
    print("[2/7] Fetching Crossref journal articles...")
    print("=" * 60)
    try:
        crossref_items = fetch_crossref(config)
        publications.extend(crossref_items)
        sources_checked += len(config.get("crossref", {}).get("journals", []))
        print(f"  ✓ {len(crossref_items)} articles from Crossref\n")
    except Exception as e:
        errors.append(f"Crossref: {e}")
        print(f"  ✗ Crossref failed: {e}\n", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)

    # ── 3. OpenAlex ───────────────────────────────────────────────────
    print("=" * 60)
    print("[3/7] Fetching OpenAlex publications...")
    print("=" * 60)
    try:
        openalex_items = fetch_openalex(config)
        publications.extend(openalex_items)
        sources_checked += len(config.get("openalex", {}).get("concepts", []))
        print(f"  ✓ {len(openalex_items)} publications from OpenAlex\n")
    except Exception as e:
        errors.append(f"OpenAlex: {e}")
        print(f"  ✗ OpenAlex failed: {e}\n", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)

    # ── 4. Semantic Scholar ───────────────────────────────────────────
    print("=" * 60)
    print("[4/7] Fetching Semantic Scholar papers...")
    print("=" * 60)
    try:
        s2_items = fetch_semantic_scholar(config)
        publications.extend(s2_items)
        sources_checked += len(config.get("semantic_scholar", {}).get("queries", []))
        print(f"  ✓ {len(s2_items)} papers from Semantic Scholar\n")
    except Exception as e:
        errors.append(f"Semantic Scholar: {e}")
        print(f"  ✗ Semantic Scholar failed: {e}\n", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)

    # ── 5. GitHub Software Releases ───────────────────────────────────
    print("=" * 60)
    print("[5/7] Fetching GitHub releases...")
    print("=" * 60)
    try:
        software = fetch_software(config)
        sources_checked += len(config.get("github", {}).get("repos", []))
        print(f"  ✓ {len(software)} releases from GitHub\n")
    except Exception as e:
        errors.append(f"GitHub: {e}")
        print(f"  ✗ GitHub failed: {e}\n", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)

    # ── 6. Conferences ────────────────────────────────────────────────
    print("=" * 60)
    print("[6/7] Fetching conference data...")
    print("=" * 60)
    try:
        conferences = fetch_conferences(config)
        sources_checked += 1
        print(f"  ✓ {len(conferences)} conferences from config\n")
    except Exception as e:
        errors.append(f"Conferences: {e}")
        print(f"  ✗ Conferences failed: {e}\n", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)

    # ── 7. Opportunities ──────────────────────────────────────────────
    print("=" * 60)
    print("[7/7] Fetching opportunity feeds...")
    print("=" * 60)
    try:
        opportunities = fetch_all_feeds()
        sources_checked += 1
        print(f"  ✓ {len(opportunities)} opportunities from RSS\n")
    except Exception as e:
        errors.append(f"Opportunities: {e}")
        print(f"  ✗ Opportunities failed: {e}\n", file=sys.stderr)
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
    print(f"  {pub_before} → {len(publications)} publications\n")

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
        print("  ✓ Also wrote to src/data/")

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
    }

    write_json(metadata, out / "metadata.json")
    if src_data.exists():
        write_json(metadata, src_data / "metadata.json")

    # ── Summary ───────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("PIPELINE COMPLETE")
    print("=" * 60)
    print(f"  Publications:  {len(publications)}")
    print(f"  Software:      {len(software)}")
    print(f"  Conferences:   {len(conferences)}")
    print(f"  Opportunities: {len(opportunities)}")
    print(f"  Total items:   {metadata['total']}")
    print(f"  Sources:       {sources_checked}")
    if errors:
        print(f"  Errors:        {len(errors)}")
        for err in errors:
            print(f"    - {err}")
    print(f"  Timestamp:     {metadata['last_fetch']}")
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
