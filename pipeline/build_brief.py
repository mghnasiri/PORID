#!/usr/bin/env python3
"""
PORID — Build Weekly Brief.

Generates a structured "This Week in OR" summary from:
- Trend data (trends.json)
- Opportunity/conference deadlines
- Solver updates (solvers.json)

Output: data/brief-YYYY-MM-DD.json

All headlines are template-generated from data, not AI-generated.

Usage:
    python build_brief.py
"""

from __future__ import annotations

import json
from datetime import datetime, timezone, timedelta
from pathlib import Path


def load_json(path: Path) -> dict | list | None:
    """Load JSON file, return None if not found."""
    if not path.exists():
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def write_json(data: dict, path: Path) -> None:
    """Write JSON file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def build_trends_section(trends: dict | None) -> dict | None:
    """Build trends section from trends.json."""
    if not trends or not trends.get("subdomains"):
        return None

    subdomains = trends["subdomains"]
    accelerating = [s for s in subdomains if s["velocity_label"] == "accelerating"]
    declining = [s for s in subdomains if s["velocity_label"] == "declining"]

    total_current = sum(s["current_quarter_count"] for s in subdomains)

    # Generate headline
    headline = f"{total_current} papers tracked this quarter"
    if accelerating:
        top = accelerating[0]
        pct = round(top["velocity"] * 100)
        headline = f"{top['display_name']} surges with {top['current_quarter_count']} papers (+{pct}%)"

    return {
        "headline": headline,
        "accelerating": [
            {"tag": s["display_name"], "count": s["current_quarter_count"],
             "velocity": f"+{round(s['velocity'] * 100)}%"}
            for s in accelerating[:3]
        ],
        "declining": [
            {"tag": s["display_name"], "count": s["current_quarter_count"],
             "velocity": f"{round(s['velocity'] * 100)}%"}
            for s in declining[:3]
        ],
        "new_this_week": total_current,
    }


def build_opportunities_section(opportunities: list, conferences: list) -> dict | None:
    """Build opportunities section from deadlines."""
    now = datetime.now(timezone.utc)
    week_end = now + timedelta(days=7)

    all_items = []
    for opp in (opportunities or []):
        dl = opp.get("deadline")
        if dl:
            all_items.append({"title": opp.get("title", ""), "deadline": dl, "type": "position"})
    for conf in (conferences or []):
        dl = conf.get("cfp_deadline")
        if dl:
            all_items.append({"title": conf.get("name", ""), "deadline": dl, "type": "conference"})

    closing_soon = []
    for item in all_items:
        try:
            dl_date = datetime.fromisoformat(item["deadline"]).replace(tzinfo=timezone.utc)
            if now <= dl_date <= week_end:
                closing_soon.append(item)
        except (ValueError, TypeError):
            continue

    closing_count = len(closing_soon)
    headline_parts = []
    if closing_count > 0:
        headline_parts.append(
            f"{closing_count} deadline{'s' if closing_count != 1 else ''} closing this week"
        )

    return {
        "headline": ", ".join(headline_parts) if headline_parts else "No imminent deadlines",
        "closing_soon": closing_soon[:5],
        "newly_added": [],
    }


def build_solvers_section(solvers: dict | None) -> dict | None:
    """Build solver updates section."""
    if not solvers or not solvers.get("solvers"):
        return None

    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)

    updates = []
    for s in solvers["solvers"]:
        rd = s.get("release_date", "")
        if not rd:
            continue
        try:
            release_date = datetime.fromisoformat(rd).replace(tzinfo=timezone.utc)
            if release_date >= week_ago:
                updates.append({
                    "solver": s.get("name", ""),
                    "new_version": s.get("current_version", ""),
                    "date": rd,
                    "notes": s.get("recent_changes", "")[:100],
                })
        except (ValueError, TypeError):
            continue

    if updates:
        top = updates[0]
        headline = f"{top['solver']} {top['new_version']} released"
    else:
        headline = "No solver updates this week"

    return {
        "headline": headline,
        "updates": updates,
    }


def build_conferences_section(conferences: list) -> dict | None:
    """Build upcoming conference deadlines section."""
    now = datetime.now(timezone.utc)
    month_end = now + timedelta(days=30)

    upcoming = []
    for conf in (conferences or []):
        dl = conf.get("cfp_deadline")
        if not dl:
            continue
        try:
            dl_date = datetime.fromisoformat(dl).replace(tzinfo=timezone.utc)
            if now <= dl_date <= month_end:
                days = (dl_date - now).days
                upcoming.append({
                    "name": conf.get("name", ""),
                    "deadline": dl,
                    "type": "submission",
                    "days_left": days,
                })
        except (ValueError, TypeError):
            continue

    upcoming.sort(key=lambda x: x.get("days_left", 999))

    if upcoming:
        top = upcoming[0]
        headline = f"{top['name']} deadline in {top['days_left']} days"
    else:
        headline = "No upcoming conference deadlines"

    return {
        "headline": headline,
        "upcoming_deadlines": upcoming[:5],
    }


def main() -> None:
    """CLI entry point."""
    base = Path(__file__).parent
    data_dir = base / "../data"

    print("=" * 60)
    print("Building weekly brief...")
    print("=" * 60)

    # Load data
    trends = load_json(data_dir / "trends.json")
    opportunities = load_json(data_dir / "opportunities.json") or []
    conferences = load_json(data_dir / "conferences.json") or []
    solvers = load_json(data_dir / "solvers.json")

    # Build sections
    now = datetime.now(timezone.utc)
    # Week start = most recent Monday
    week_start = now - timedelta(days=now.weekday())

    brief = {
        "generated_at": now.isoformat(),
        "week_of": week_start.strftime("%Y-%m-%d"),
        "sections": {},
    }

    trends_section = build_trends_section(trends)
    if trends_section:
        brief["sections"]["trends"] = trends_section

    opps_section = build_opportunities_section(opportunities, conferences)
    if opps_section:
        brief["sections"]["opportunities"] = opps_section

    solvers_section = build_solvers_section(solvers)
    if solvers_section:
        brief["sections"]["solvers"] = solvers_section

    confs_section = build_conferences_section(conferences)
    if confs_section:
        brief["sections"]["conferences"] = confs_section

    # Write output
    date_str = now.strftime("%Y-%m-%d")
    output_path = data_dir / f"brief-{date_str}.json"
    write_json(brief, output_path)
    print(f"  ✓ Brief written to {output_path}")

    # Also write to src/data/
    src_data = base / "../src/data"
    if src_data.exists():
        write_json(brief, src_data / f"brief-{date_str}.json")
        print(f"  ✓ Also written to src/data/")

    print()


if __name__ == "__main__":
    main()
