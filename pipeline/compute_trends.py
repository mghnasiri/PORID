#!/usr/bin/env python3
"""
PORID — Compute Topic Velocity Trends.

Reads data/publications.json and computes trend metrics per subdomain tag:
- Current vs previous quarter publication counts
- Velocity (growth rate)
- Monthly sparkline data
- Top co-occurring keywords
- Sample recent papers

Output: data/trends.json

Usage:
    python compute_trends.py
    python compute_trends.py --input ../data/publications.json --output ../data/trends.json
"""

from __future__ import annotations

import json
import math
import argparse
from datetime import datetime, timezone, timedelta
from pathlib import Path
from collections import Counter, defaultdict


def load_publications(path: str) -> list[dict]:
    """Load publications from JSON file."""
    p = Path(path)
    if not p.exists():
        print(f"  ! Publications file not found: {path}")
        return []
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)


def compute_velocity(current: int, previous: int) -> float:
    """Compute growth rate between two periods."""
    if previous == 0:
        return 1.0 if current > 0 else 0.0
    return (current - previous) / previous


def classify_velocity(v: float) -> str:
    """Classify velocity into human-readable label."""
    if v > 0.15:
        return "accelerating"
    elif v < -0.15:
        return "declining"
    else:
        return "stable"


# Proper display names for OR subdomain tags
TAG_DISPLAY_NAMES: dict[str, str] = {
    "linear-programming": "Linear Programming",
    "integer-programming": "Integer Programming",
    "metaheuristics": "Metaheuristics",
    "network-optimization": "Network Optimization",
    "scheduling": "Scheduling",
    "vehicle-routing": "Vehicle Routing",
    "stochastic": "Stochastic Optimization",
    "ml-for-or": "ML for Optimization",
    "healthcare-or": "Healthcare OR",
    "supply-chain": "Supply Chain",
    "facility-location": "Facility Location",
    "multi-objective": "Multi-Objective Optimization",
    "decomposition": "Decomposition Methods",
    "constraint-programming": "Constraint Programming",
    "game-theory": "Game Theory",
    "survey": "Surveys & Reviews",
    "general-or": "General OR",
    # arXiv category codes
    "math.OC": "Mathematical Optimization",
    "cs.AI": "Artificial Intelligence",
    "cs.DS": "Data Structures & Algorithms",
    "stat.ML": "Statistical ML",
    "cs.LG": "Machine Learning",
    "eess.SY": "Systems & Control",
    "cs.DM": "Discrete Mathematics",
}

# Tags to exclude from trend analysis (too generic or just a catch-all)
EXCLUDED_TAGS: set[str] = {
    "general-or",       # Catch-all tag, adds noise
    "survey",           # Meta-category, not a subdomain
}


def format_tag_display(tag: str) -> str:
    """Convert tag slug to human-readable display name."""
    if tag in TAG_DISPLAY_NAMES:
        return TAG_DISPLAY_NAMES[tag]
    return tag.replace("-", " ").replace("_", " ").title()


def compute_trends(publications: list[dict], window_days: int = 90, min_papers: int = 5) -> dict:
    """
    Compute trend metrics for each subdomain tag.

    Args:
        publications: List of publication dicts with 'tags' and 'date' fields.
        window_days: Size of each time window in days (default: 90 = quarterly).
        min_papers: Minimum total papers to include a tag (filters noise).

    Returns:
        Trends data dict ready for JSON serialization.
    """
    now = datetime.now(timezone.utc)
    current_start = now - timedelta(days=window_days)
    previous_start = now - timedelta(days=window_days * 2)

    # Parse dates once
    dated_pubs = []
    for pub in publications:
        date_str = pub.get("date", "")
        if not date_str:
            continue
        try:
            # Handle YYYY-MM-DD format
            pub_date = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            if pub_date.tzinfo is None:
                pub_date = pub_date.replace(tzinfo=timezone.utc)
            dated_pubs.append((pub, pub_date))
        except (ValueError, TypeError):
            continue

    # Collect per-tag stats
    tag_stats: dict[str, dict] = defaultdict(lambda: {
        "current": [],
        "previous": [],
        "all": [],
        "monthly": defaultdict(int),
        "keywords": Counter(),
    })

    for pub, pub_date in dated_pubs:
        tags = pub.get("tags", [])
        # Monthly bucket key: YYYY-MM
        month_key = pub_date.strftime("%Y-%m")

        for tag in tags:
            stats = tag_stats[tag]
            stats["all"].append(pub)
            stats["monthly"][month_key] += 1

            if pub_date >= current_start:
                stats["current"].append(pub)
            elif pub_date >= previous_start:
                stats["previous"].append(pub)

            # Collect co-occurring keywords (other tags)
            for other_tag in tags:
                if other_tag != tag:
                    stats["keywords"][other_tag] += 1

            # Also check title words for keyword extraction
            title = pub.get("title", "").lower()
            for word in title.split():
                if len(word) > 4 and word.isalpha():
                    stats["keywords"][word] += 1

    # Build output
    subdomains = []
    for tag, stats in tag_stats.items():
        # Skip excluded tags (too generic or catch-all)
        if tag in EXCLUDED_TAGS:
            continue

        total = len(stats["all"])
        if total < min_papers:
            continue

        current_count = len(stats["current"])
        previous_count = len(stats["previous"])
        velocity = compute_velocity(current_count, previous_count)
        velocity_label = classify_velocity(velocity)

        # Sparkline: monthly counts for last 12 months
        sparkline = []
        for i in range(11, -1, -1):
            month_date = now - timedelta(days=30 * i)
            month_key = month_date.strftime("%Y-%m")
            sparkline.append(stats["monthly"].get(month_key, 0))

        # Top keywords (exclude common OR terms to keep it interesting)
        common_terms = {"optimization", "algorithm", "problem", "model", "method",
                       "based", "approach", "using", "analysis", "paper", "study",
                       "results", "proposed", "solution", "programming", "research"}
        top_keywords = [
            word for word, _ in stats["keywords"].most_common(20)
            if word not in common_terms and word != tag
        ][:5]

        # Sample recent papers (up to 3)
        recent = sorted(stats["current"], key=lambda p: p.get("date", ""), reverse=True)[:3]
        sample_papers = [
            {
                "title": p.get("title", ""),
                "authors": ", ".join((p.get("authors", []) or [])[:3]),
                "url": p.get("url", ""),
                "date": p.get("date", ""),
            }
            for p in recent
        ]

        subdomains.append({
            "tag": tag,
            "display_name": format_tag_display(tag),
            "current_quarter_count": current_count,
            "previous_quarter_count": previous_count,
            "velocity": round(velocity, 3),
            "velocity_label": velocity_label,
            "total_count": total,
            "sparkline": sparkline,
            "top_keywords": top_keywords,
            "sample_papers": sample_papers,
        })

    # Sort by current quarter count descending
    subdomains.sort(key=lambda x: x["current_quarter_count"], reverse=True)

    total_analyzed = len(dated_pubs)
    unique_tags = len([s for s in subdomains])

    return {
        "generated_at": now.isoformat(),
        "period": f"{now.year}-Q{(now.month - 1) // 3 + 1}",
        "subdomains": subdomains,
        "meta": {
            "total_papers_analyzed": total_analyzed,
            "time_window_days": window_days,
            "min_paper_threshold": min_papers,
            "unique_tags": unique_tags,
        },
    }


def write_json(data: dict, path: Path) -> None:
    """Write data to JSON file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(description="Compute topic velocity trends")
    parser.add_argument("--input", default="../data/publications.json",
                       help="Path to publications.json")
    parser.add_argument("--output", default="../data/trends.json",
                       help="Output path for trends.json")
    args = parser.parse_args()

    base = Path(__file__).parent
    input_path = base / args.input
    output_path = base / args.output

    print("=" * 60)
    print("Computing topic velocity trends...")
    print("=" * 60)

    publications = load_publications(str(input_path))
    if not publications:
        print("  ! No publications found. Creating empty trends file.")
        trends = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "period": "",
            "subdomains": [],
            "meta": {
                "total_papers_analyzed": 0,
                "time_window_days": 90,
                "min_paper_threshold": 5,
                "unique_tags": 0,
            },
        }
    else:
        trends = compute_trends(publications)

    write_json(trends, output_path)
    print(f"  ✓ {len(trends['subdomains'])} subdomains analyzed")
    print(f"  ✓ {trends['meta']['total_papers_analyzed']} papers processed")
    print(f"  ✓ Written to {output_path}")

    # Also write to src/data/ if it exists
    src_data = base / "../src/data"
    if src_data.exists():
        write_json(trends, src_data / "trends.json")
        print(f"  ✓ Also written to src/data/trends.json")

    print()


if __name__ == "__main__":
    main()
