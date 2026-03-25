"""
PORID pipeline utilities.

Shared helpers used across fetcher modules.
"""

from __future__ import annotations

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
