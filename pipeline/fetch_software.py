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

GITHUB_API_URL = "https://api.github.com/repos/{owner}/{repo}/releases/latest"
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


def fetch_latest_release(owner: str, repo: str, display_name: str = "") -> Optional[dict]:
    """
    Fetch the latest release for a single GitHub repository.

    Args:
        owner: Repository owner (e.g., 'google').
        repo: Repository name (e.g., 'or-tools').
        display_name: Human-readable name (e.g., 'OR-Tools').

    Returns:
        Dict in PORID software schema, or None if no release found.
    """
    url = GITHUB_API_URL.format(owner=owner, repo=repo)
    headers = get_github_headers()

    try:
        resp = requests.get(url, headers=headers, timeout=15)
        if resp.status_code == 404:
            print(f"    ✗ No releases found for {owner}/{repo}", file=sys.stderr)
            return None
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"    ✗ Error fetching {owner}/{repo}: {e}", file=sys.stderr)
        return None

    release = resp.json()

    tag = release.get("tag_name", "").lstrip("vV")
    published = release.get("published_at", "")
    body = release.get("body", "") or ""
    html_url = release.get("html_url", "")
    name = display_name or release.get("name", "") or repo

    # Parse date
    date_str = ""
    if published:
        try:
            dt = datetime.fromisoformat(published.replace("Z", "+00:00"))
            date_str = dt.strftime("%Y-%m-%d")
        except ValueError:
            date_str = published[:10]

    # Truncate changelog for storage (500 chars max)
    changelog = body.strip()
    if len(changelog) > 500:
        changelog = changelog[:500] + "\u2026"

    # Determine tag: solver vs library
    tag_label = _classify_software_tag(repo, display_name)

    return {
        "id": f"gh-{owner}-{repo}-{tag}",
        "name": name,
        "version": tag,
        "date": date_str,
        "changelog": changelog,
        "url": html_url or f"https://github.com/{owner}/{repo}/releases",
        "source": "GitHub",
        "tags": [tag_label],
        "type": "software",
    }


# Known solver repos (lowercase repo name or display name)
_SOLVER_NAMES = {"or-tools", "highs", "cbc", "clp", "scip", "pyscipopt", "cplex", "gurobi"}


def _classify_software_tag(repo: str, display_name: str) -> str:
    """
    Determine whether a repo is a 'solver' or 'library'.

    Repos whose name (or display name) contains 'solver' or matches
    a known solver list are tagged 'solver'; everything else is 'library'.

    Args:
        repo: Repository name (e.g., 'or-tools').
        display_name: Human-readable name (e.g., 'OR-Tools').

    Returns:
        Either 'solver' or 'library'.
    """
    repo_lower = repo.lower()
    name_lower = display_name.lower()
    if "solver" in repo_lower or "solver" in name_lower:
        return "solver"
    # Check against known solver names (exact repo name match)
    if repo_lower in _SOLVER_NAMES or name_lower in _SOLVER_NAMES:
        return "solver"
    return "library"


def fetch_all_repos(config: dict) -> list[dict]:
    """
    Fetch latest release for all configured repositories.

    Args:
        config: Full pipeline configuration dict.

    Returns:
        List of software item dicts.
    """
    gh_cfg = config.get("github", {})
    repos = gh_cfg.get("repos", [])

    items: list[dict] = []

    for i, repo_entry in enumerate(repos):
        owner = repo_entry["owner"]
        repo = repo_entry["repo"]
        name = repo_entry.get("name", repo)

        print(f"  Fetching GitHub: {owner}/{repo}", file=sys.stderr)
        item = fetch_latest_release(owner, repo, display_name=name)
        if item:
            items.append(item)
            print(f"    \u2192 v{item['version']} ({item['date']})", file=sys.stderr)

        if i < len(repos) - 1:
            time.sleep(RATE_LIMIT_SECONDS)

    return items


def main() -> None:
    """CLI entry point: fetch GitHub releases and print JSON to stdout."""
    parser = argparse.ArgumentParser(description="Fetch latest GitHub releases for OR software")
    parser.add_argument("--config", default="config.yaml", help="Path to config file")
    args = parser.parse_args()

    config = load_config(args.config)
    repos = config.get("github", {}).get("repos", [])

    print(f"Fetching GitHub releases for {len(repos)} repos...", file=sys.stderr)
    items = fetch_all_repos(config)
    print(f"Total: {len(items)} releases fetched.", file=sys.stderr)

    json.dump(items, sys.stdout, indent=2, ensure_ascii=False)
    print()


if __name__ == "__main__":
    main()
