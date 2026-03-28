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
import re
import shutil
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
    {"id": "cvxpy", "repo": "cvxpy/cvxpy"},
    {"id": "ipopt", "repo": "coin-or/Ipopt"},
    {"id": "optaplanner", "repo": "TimefoldAI/timefold-solver"},
]

PYPI_PACKAGES = [
    {"id": "gurobi", "package": "gurobipy"},
    {"id": "highs", "package": "highspy"},
    {"id": "or-tools", "package": "ortools"},
    {"id": "pyomo", "package": "pyomo"},
    {"id": "scip", "package": "pyscipopt"},
    {"id": "cvxpy", "package": "cvxpy"},
    {"id": "mosek", "package": "Mosek"},
    {"id": "cplex", "package": "cplex"},
]

GITHUB_API = "https://api.github.com/repos/{repo}/releases/latest"
GITHUB_REPO_API = "https://api.github.com/repos/{repo}"
GITHUB_PRS_API = "https://api.github.com/repos/{repo}/pulls"
PYPI_API = "https://pypi.org/pypi/{package}/json"

HEADERS = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "PORID-Pipeline/2.0",
}


def clean_version(tag):
    """Strip common prefixes from GitHub release tag names."""
    return re.sub(r'^(releases/|vreleases/|release-|v(?=\d))', '', tag)


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
            "version": clean_version(data.get("tag_name", "")),
            "release_date": (data.get("published_at", "") or "")[:10],
            "changelog": (data.get("body", "") or "")[:500],
            "url": data.get("html_url", ""),
        }
    except Exception as e:
        print(f"    GitHub {repo}: {e}")
        return None


def fetch_github_repo_info(repo: str) -> dict | None:
    """Fetch repository metadata (stars, open issues) from GitHub API."""
    url = GITHUB_REPO_API.format(repo=repo)
    token = os.environ.get("GITHUB_TOKEN", "")
    headers = {**HEADERS}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        resp = requests.get(url, headers=headers, timeout=15)
        if resp.status_code != 200:
            print(f"    GitHub repo {repo}: HTTP {resp.status_code}")
            return None
        data = resp.json()
        return {
            "github_stars": data.get("stargazers_count", 0),
            "github_open_issues": data.get("open_issues_count", 0),
        }
    except Exception as e:
        print(f"    GitHub repo {repo}: {e}")
        return None


def fetch_github_recent_prs(repo: str, count: int = 5) -> list[str]:
    """Fetch the titles of the most recent PRs from GitHub API."""
    url = GITHUB_PRS_API.format(repo=repo)
    token = os.environ.get("GITHUB_TOKEN", "")
    headers = {**HEADERS}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    params = {
        "state": "all",
        "sort": "created",
        "direction": "desc",
        "per_page": count,
    }
    try:
        resp = requests.get(url, headers=headers, params=params, timeout=15)
        if resp.status_code != 200:
            print(f"    GitHub PRs {repo}: HTTP {resp.status_code}")
            return []
        data = resp.json()
        return [pr.get("title", "") for pr in data[:count] if pr.get("title")]
    except Exception as e:
        print(f"    GitHub PRs {repo}: {e}")
        return []


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


def merge_solvers(
    manual: list[dict],
    github_data: dict,
    pypi_data: dict,
    github_activity: dict | None = None,
) -> list[dict]:
    """Merge manual data with auto-fetched GitHub and PyPI data."""
    if github_activity is None:
        github_activity = {}

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

        # Add GitHub activity data (stars, open issues, recent PRs)
        activity = github_activity.get(sid)
        if activity:
            solver["github_stars"] = activity.get("github_stars", 0)
            solver["github_open_issues"] = activity.get("github_open_issues", 0)
            solver["github_recent_prs"] = activity.get("github_recent_prs", [])

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

    # 3. Fetch GitHub activity (stars, open issues, recent PRs)
    print("\n  Fetching GitHub activity...")
    github_activity = {}
    for entry in GITHUB_SOLVERS:
        print(f"    {entry['repo']}...")
        repo_info = fetch_github_repo_info(entry["repo"])
        recent_prs = fetch_github_recent_prs(entry["repo"])
        if repo_info or recent_prs:
            activity = repo_info or {}
            activity["github_recent_prs"] = recent_prs
            github_activity[entry["id"]] = activity
            stars = activity.get("github_stars", "?")
            issues = activity.get("github_open_issues", "?")
            print(f"    ✓ {stars} stars, {issues} open issues, {len(recent_prs)} recent PRs")

    # 4. Fetch from PyPI
    print("\n  Fetching PyPI info...")
    pypi_data = {}
    for entry in PYPI_PACKAGES:
        print(f"    {entry['package']}...")
        result = fetch_pypi_info(entry["package"])
        if result:
            pypi_data[entry["id"]] = result
            print(f"    ✓ v{result['version']}")

    # 5. Merge
    if manual_solvers:
        solvers = merge_solvers(manual_solvers, github_data, pypi_data, github_activity)
    else:
        # Build minimal entries from GitHub data
        solvers = []
        for entry in GITHUB_SOLVERS:
            gh = github_data.get(entry["id"], {})
            activity = github_activity.get(entry["id"], {})
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
                "github_stars": activity.get("github_stars", 0),
                "github_open_issues": activity.get("github_open_issues", 0),
                "github_recent_prs": activity.get("github_recent_prs", []),
            })

    # 6. Build output
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

    # Copy to static fallback for offline/resilient loading
    static_dir = base / "../data/static"
    static_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(str(output_path), str(static_dir / "solvers.json"))
    print(f"  ✓ Static fallback updated: data/static/solvers.json")

    print()


if __name__ == "__main__":
    main()
