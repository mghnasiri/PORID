"""
PORID pipeline utilities.

Shared helpers used across fetcher modules.
"""

from __future__ import annotations

import re
import sys
import time

import requests


def fetch_with_retry(
    url: str,
    *,
    retries: int = 3,
    backoff: float = 2,
    timeout: int = 15,
    headers: dict | None = None,
    params: dict | None = None,
) -> requests.Response | None:
    """
    GET *url* with exponential-backoff retry logic.

    Args:
        url: The URL to fetch.
        retries: Maximum number of attempts (default 3).
        backoff: Base delay in seconds; doubles after each failure.
        timeout: Per-request timeout in seconds.
        headers: Optional HTTP headers.
        params: Optional query parameters.

    Returns:
        A ``requests.Response`` on success, or ``None`` after all retries
        have been exhausted.
    """
    delay = backoff
    last_error: Exception | None = None

    for attempt in range(1, retries + 1):
        try:
            resp = requests.get(url, params=params, headers=headers, timeout=timeout)
            resp.raise_for_status()
            return resp
        except requests.RequestException as exc:
            last_error = exc
            if attempt < retries:
                print(
                    f"      ! Attempt {attempt}/{retries} failed ({exc}), "
                    f"retrying in {delay:.1f}s...",
                    file=sys.stderr,
                )
                time.sleep(delay)
                delay *= 2
            else:
                print(
                    f"      ! All {retries} attempts failed for {url}: {exc}",
                    file=sys.stderr,
                )

    return None


# Credentials that third-party records sometimes carry in their text
# (e.g. a server log uploaded to Zenodo and indexed by OpenAlex).
# The site is public, so never republish them.
_SECRET_PATTERNS = [
    re.compile(r"(?<!\d)\d{8,10}:[A-Za-z0-9_-]{35}(?![A-Za-z0-9_-])"),  # Telegram bot token (often after "bot")
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{36,}\b"),            # GitHub token
    re.compile(r"\bgithub_pat_[A-Za-z0-9_]{60,}\b"),          # GitHub fine-grained PAT
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),                      # AWS access key id
    re.compile(r"\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}\b"),  # OpenAI / Anthropic keys
    re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b"),                 # Google API key
    re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}\b"),          # Slack token
]


def redact_secrets(value):
    """Recursively replace credential-looking substrings with ``[REDACTED]``."""
    if isinstance(value, str):
        for pat in _SECRET_PATTERNS:
            value = pat.sub("[REDACTED]", value)
        return value
    if isinstance(value, list):
        return [redact_secrets(v) for v in value]
    if isinstance(value, dict):
        return {k: redact_secrets(v) for k, v in value.items()}
    return value
