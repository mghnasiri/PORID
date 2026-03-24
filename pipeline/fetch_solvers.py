#!/usr/bin/env python3
"""
PORID — Fetch Solver Version Data.

Auto-fetches solver version info from:
1. GitHub Releases API (open-source solvers)
2. PyPI JSON API (Python packages)
3. Manual JSON file (commercial solvers)

Merges into a unified data/solvers.json.

Usage:
    python fetch_solvers.py
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

import requests

# --- Configuration ---

GITHUB_SOLVERS = [
    {"id": "highs", "repo": "ERGO-Code/HiGHS"},
    {"id": "scip", "repo": "scipopt/scip"},
    {"id": "or-tools", "repo": "google/or-tools"},
    {"id": "cbc", "repo": "coin-or/Cbc"},
    {"id": "pyomo", "repo": "Pyomo/pyomo"},
    {"id": "jump", "repo": "jump-dev/JuMP.jl"},
]

PYPI_PACKAGES = [
    {"id": "gurobi", "package": "gurobipy"},
    {"id": "highs", "package": "highspy"},
    {"id": "or-tools", "package": "ortools"},
    {"id": "pyomo", "package": "pyomo"},
    {"id": "scip", "package": "pyscipopt"},
]

GITHUB_API = "https://api.github.com/repos/{repo}/releases/latest"
PYPI_API = "https://pypi.org/pypi/{package}/json"

HEADERS = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "PORID-Pipeline/2.0",
}


def fetch_github_release(repo: str) -> dict | None:
    """Fetch latest release from GitHub API."""
    url = GITHUB_API.format(repo=repo)
    token = os.environ.get("GITHUB_TOKEN", "")
    headers = {**HEADERS}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        resp = requests.get(url, headers=headers, timeout=15)
        if resp.status_code != 200:
            print(f"    GitHub {repo}: HTTP {resp.status_code}")
            return None
        data = resp.json()
        return {
            "version": data.get("tag_name", "").lstrip("v"),
            "release_date": (data.get("published_at", "") or "")[:10],
            "changelog": (data.get("body", "") or "")[:500],
            "url": data.get("html_url", ""),
        }
    except Exception as e:
        print(f"    GitHub {repo}: {e}")
        return None


def fetch_pypi_info(package: str) -> dict | None:
    """Fetch package info from PyPI JSON API."""
    url = PYPI_API.format(package=package)
    try:
        resp = requests.get(url, timeout=15)
        if resp.status_code != 200:
            print(f"    PyPI {package}: HTTP {resp.status_code}")
            return None
        data = resp.json()
        info = data.get("info", {})
        # Get download stats (approximate from recent releases)
        releases = data.get("releases", {})
        latest_version = info.get("version", "")
        latest_files = releases.get(latest_version, [])
        downloads = sum(f.get("downloads", 0) for f in latest_files)

        return {
            "version": latest_version,
            "summary": info.get("summary", ""),
            "downloads": downloads,
            "pypi_url": info.get("package_url", ""),
        }
    except Exception as e:
        print(f"    PyPI {package}: {e}")
        return None


def load_manual_solvers(path: Path) -> list[dict]:
    """Load manually maintained solver data."""
    if not path.exists():
        print(f"  ! Manual solvers file not found: {path}")
        return []
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("solvers", data) if isinstance(data, dict) else data


def merge_solvers(manual: list[dict], github_data: dict, pypi_data: dict) -> list[dict]:
    """Merge manual data with auto-fetched GitHub and PyPI data."""
    merged = []
    for solver in manual:
        sid = solver.get("id", "")

        # Override with GitHub release data if available
        gh = github_data.get(sid)
        if gh:
            if gh.get("version"):
                solver["current_version"] = gh["version"]
            if gh.get("release_date"):
                solver["release_date"] = gh["release_date"]
            if gh.get("changelog"):
                solver["recent_changes"] = gh["changelog"][:200]

        # Add PyPI download stats
        pypi = pypi_data.get(sid)
        if pypi and pypi.get("downloads"):
            solver["pypi_monthly_downloads"] = pypi["downloads"]

        merged.append(solver)

    return merged


def write_json(data: dict, path: Path) -> None:
    """Write data to JSON file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def main() -> None:
    """CLI entry point."""
    base = Path(__file__).parent
    manual_path = base / "../data/solvers_manual.json"
    output_path = base / "../data/solvers.json"

    print("=" * 60)
    print("Fetching solver data...")
    print("=" * 60)

    # 1. Load manual solver entries
    manual_solvers = load_manual_solvers(manual_path)
    if not manual_solvers:
        print("  ! No manual solver data found. Creating from GitHub data only.")
        manual_solvers = []

    # 2. Fetch from GitHub
    print("\n  Fetching GitHub releases...")
    github_data = {}
    for entry in GITHUB_SOLVERS:
        print(f"    {entry['repo']}...")
        result = fetch_github_release(entry["repo"])
        if result:
            github_data[entry["id"]] = result
            print(f"    ✓ v{result['version']}")

    # 3. Fetch from PyPI
    print("\n  Fetching PyPI info...")
    pypi_data = {}
    for entry in PYPI_PACKAGES:
        print(f"    {entry['package']}...")
        result = fetch_pypi_info(entry["package"])
        if result:
            pypi_data[entry["id"]] = result
            print(f"    ✓ v{result['version']}")

    # 4. Merge
    if manual_solvers:
        solvers = merge_solvers(manual_solvers, github_data, pypi_data)
    else:
        # Build minimal entries from GitHub data
        solvers = []
        for entry in GITHUB_SOLVERS:
            gh = github_data.get(entry["id"], {})
            solvers.append({
                "id": entry["id"],
                "name": entry["repo"].split("/")[-1],
                "vendor": entry["repo"].split("/")[0],
                "website": f"https://github.com/{entry['repo']}",
                "current_version": gh.get("version", "unknown"),
                "release_date": gh.get("release_date", ""),
                "open_source": True,
                "github": entry["repo"],
                "update_source": "github_api",
                "tags": ["open-source"],
            })

    # 5. Build output
    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "solvers": solvers,
        "problem_type_legend": {
            "LP": "Linear Programming",
            "MIP": "Mixed-Integer Programming",
            "QP": "Quadratic Programming",
            "QCP": "Quadratically Constrained Programming",
            "MIQP": "Mixed-Integer Quadratic Programming",
            "MIQCP": "Mixed-Integer Quadratically Constrained Programming",
            "SOCP": "Second-Order Cone Programming",
            "MINLP": "Mixed-Integer Nonlinear Programming",
            "CP": "Constraint Programming",
            "SDP": "Semidefinite Programming",
        },
    }

    write_json(output, output_path)
    print(f"\n  ✓ {len(solvers)} solvers written to {output_path}")

    # Also write to src/data/
    src_data = base / "../src/data"
    if src_data.exists():
        write_json(output, src_data / "solvers.json")
        print(f"  ✓ Also written to src/data/solvers.json")

    print()


if __name__ == "__main__":
    main()
