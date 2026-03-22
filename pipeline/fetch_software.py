#!/usr/bin/env python3
"""
Fetch latest GitHub releases for configured OR software repos.

Uses the GitHub REST API (unauthenticated — 60 req/hr limit).
For higher limits, set GITHUB_TOKEN environment variable.

Usage:
    python fetch_software.py
"""

from __future__ import annotations

import json
import os
import sys
import time
import argparse
from datetime import datetime
from pathlib import Path
from typing import Optional

import requests
import yaml

GITHUB_API_URL = "https://api.github.com/repos/{repo}/releases/latest"
RATE_LIMIT_SECONDS = 1


def load_config(config_path: str = "config.yaml") -> dict:
    """Load pipeline configuration from YAML file."""
    path = Path(__file__).parent / config_path
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def get_github_headers() -> dict[str, str]:
    """
    Build HTTP headers for GitHub API.

    Uses GITHUB_TOKEN env var if available for higher rate limits.
    """
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "PORID/1.0",
    }
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def fetch_latest_release(repo: str) -> Optional[dict]:
    """
    Fetch the latest release for a single GitHub repository.

    Args:
        repo: Repository in 'owner/name' format, e.g. 'google/or-tools'.

    Returns:
        Dict in PORID software schema, or None if no release found.
    """
    url = GITHUB_API_URL.format(repo=repo)
    headers = get_github_headers()

    try:
        resp = requests.get(url, headers=headers, timeout=15)
        if resp.status_code == 404:
            print(f"    ✗ No releases found for {repo}", file=sys.stderr)
            return None
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"    ✗ Error fetching {repo}: {e}", file=sys.stderr)
        return None

    release = resp.json()

    tag = release.get("tag_name", "").lstrip("vV")
    published = release.get("published_at", "")
    body = release.get("body", "") or ""
    html_url = release.get("html_url", "")
    name = release.get("name", "") or repo.split("/")[-1]

    # Parse date
    date_str = ""
    if published:
        try:
            dt = datetime.fromisoformat(published.replace("Z", "+00:00"))
            date_str = dt.strftime("%Y-%m-%d")
        except ValueError:
            date_str = published[:10]

    # Truncate changelog for storage
    changelog = body.strip()
    if len(changelog) > 1000:
        changelog = changelog[:1000] + "…"

    return {
        "id": f"gh-{repo.replace('/', '-')}-{tag}",
        "name": _pretty_name(repo),
        "version": tag,
        "date": date_str,
        "changelog": changelog,
        "url": html_url or f"https://github.com/{repo}/releases",
        "tags": ["solver"],  # default tag; classify.py can refine
        "type": "software",
    }


def fetch_all_repos(repos: list[str]) -> list[dict]:
    """
    Fetch latest release for all configured repositories.

    Args:
        repos: List of 'owner/name' strings.

    Returns:
        List of software item dicts.
    """
    items: list[dict] = []

    for i, repo in enumerate(repos):
        print(f"  Fetching GitHub: {repo}", file=sys.stderr)
        item = fetch_latest_release(repo)
        if item:
            items.append(item)
            print(f"    → v{item['version']} ({item['date']})", file=sys.stderr)

        if i < len(repos) - 1:
            time.sleep(RATE_LIMIT_SECONDS)

    return items


def _pretty_name(repo: str) -> str:
    """Convert 'owner/repo-name' to a human-readable name."""
    name = repo.split("/")[-1]
    # Common capitalizations
    overrides = {
        "or-tools": "Google OR-Tools",
        "Cbc": "COIN-OR Cbc",
        "JuMP.jl": "JuMP.jl",
        "pyomo": "Pyomo",
        "scipy": "SciPy",
        "cvxpy": "CVXPY",
        "gurobipy": "Gurobi Python",
    }
    return overrides.get(name, name)


def main() -> None:
    """CLI entry point: fetch GitHub releases and print JSON to stdout."""
    parser = argparse.ArgumentParser(description="Fetch latest GitHub releases for OR software")
    parser.add_argument("--config", default="config.yaml", help="Path to config file")
    args = parser.parse_args()

    config = load_config(args.config)
    repos = config.get("github_repos", [])

    print(f"Fetching GitHub releases for {len(repos)} repos...", file=sys.stderr)
    items = fetch_all_repos(repos)
    print(f"Total: {len(items)} releases fetched.", file=sys.stderr)

    json.dump(items, sys.stdout, indent=2, ensure_ascii=False)
    print()


if __name__ == "__main__":
    main()
