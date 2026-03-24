#!/usr/bin/env python3
"""
PORID iCal Feed Generator.

Generates an iCalendar (.ics) file from data/conferences.json, suitable for
importing into Google Calendar, Apple Calendar, Outlook, etc.

Usage:
    python build_ical.py
"""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from hashlib import md5


def load_json(path: Path) -> list[dict]:
    """Load a JSON array file."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def parse_date_from_text(date_text: str) -> str | None:
    """
    Attempt to extract a YYYYMMDD date from a human-readable date string.

    Handles formats like:
      - "June 2026" -> 20260601
      - "June-July 2026" -> 20260601
      - "October 2026" -> 20261001
      - "2026-06-15" -> 20260615

    Returns None for "TBA" or unparsable dates.
    """
    if not date_text or date_text.strip().upper() in ("TBA", "TBD", ""):
        return None

    # Try ISO date first: YYYY-MM-DD
    iso_match = re.match(r"(\d{4})-(\d{2})-(\d{2})", date_text)
    if iso_match:
        return iso_match.group(1) + iso_match.group(2) + iso_match.group(3)

    # Month Year pattern (take first month mentioned)
    months = {
        "january": "01", "february": "02", "march": "03", "april": "04",
        "may": "05", "june": "06", "july": "07", "august": "08",
        "september": "09", "october": "10", "november": "11", "december": "12",
    }
    text_lower = date_text.lower()
    for month_name, month_num in months.items():
        if month_name in text_lower:
            # Find year
            year_match = re.search(r"(\d{4})", date_text)
            if year_match:
                return year_match.group(1) + month_num + "01"

    return None


def escape_ical(text: str) -> str:
    """Escape special characters for iCal text fields."""
    if not text:
        return ""
    text = text.replace("\\", "\\\\")
    text = text.replace(";", "\\;")
    text = text.replace(",", "\\,")
    text = text.replace("\n", "\\n")
    return text


def build_ical(data_dir: Path) -> str:
    """
    Build an iCalendar string from conferences data.

    Args:
        data_dir: Directory containing conferences.json.

    Returns:
        iCalendar format string.
    """
    conferences = load_json(data_dir / "conferences.json")

    now = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//PORID//Conference Calendar//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:PORID Conference Calendar",
    ]

    event_count = 0

    for conf in conferences:
        dates_text = conf.get("dates", "")
        dt_start = parse_date_from_text(dates_text)

        # Also try cfp_deadline as a date
        cfp_text = conf.get("cfp_deadline", "")
        cfp_date = parse_date_from_text(cfp_text) if cfp_text else None

        # Skip events with no parseable date at all
        if not dt_start:
            continue

        uid = md5(conf.get("id", "").encode()).hexdigest() + "@porid"

        lines.append("BEGIN:VEVENT")
        lines.append(f"UID:{uid}")
        lines.append(f"DTSTAMP:{now}")
        lines.append(f"DTSTART;VALUE=DATE:{dt_start}")
        lines.append(f"SUMMARY:{escape_ical(conf.get('name', 'OR Conference'))}")

        location = conf.get("location", "")
        if location and location.upper() != "TBA":
            lines.append(f"LOCATION:{escape_ical(location)}")

        url = conf.get("url", "")
        if url:
            lines.append(f"URL:{url}")

        # Build description
        desc_parts = []
        if dates_text:
            desc_parts.append(f"Dates: {dates_text}")
        if cfp_text and cfp_text.upper() not in ("TBA", "TBD", ""):
            desc_parts.append(f"CFP Deadline: {cfp_text}")
        tags = conf.get("tags", [])
        if tags:
            desc_parts.append(f"Tags: {', '.join(tags)}")
        if url:
            desc_parts.append(f"More info: {url}")

        if desc_parts:
            lines.append(f"DESCRIPTION:{escape_ical(chr(10).join(desc_parts))}")

        lines.append("END:VEVENT")
        event_count += 1

        # Also add CFP deadline as a separate reminder event
        if cfp_date:
            cfp_uid = md5((conf.get("id", "") + "-cfp").encode()).hexdigest() + "@porid"
            lines.append("BEGIN:VEVENT")
            lines.append(f"UID:{cfp_uid}")
            lines.append(f"DTSTAMP:{now}")
            lines.append(f"DTSTART;VALUE=DATE:{cfp_date}")
            lines.append(f"SUMMARY:CFP Deadline: {escape_ical(conf.get('name', ''))}")
            if url:
                lines.append(f"URL:{url}")
            lines.append(f"DESCRIPTION:{escape_ical('Paper submission deadline for ' + conf.get('name', ''))}")
            lines.append("END:VEVENT")
            event_count += 1

    lines.append("END:VCALENDAR")

    print(f"  Generated {event_count} iCal events from {len(conferences)} conferences", file=sys.stderr)
    return "\r\n".join(lines) + "\r\n"


def main() -> None:
    """Generate iCal feed and write to data/conferences.ics."""
    data_dir = Path(__file__).parent / "../data"
    output = data_dir / "conferences.ics"

    ical = build_ical(data_dir)

    output.parent.mkdir(parents=True, exist_ok=True)
    with open(output, "w", encoding="utf-8") as f:
        f.write(ical)

    print(f"  \u2713 iCal feed written to {output}", file=sys.stderr)

    # Also write to src/data for deployment
    src_output = Path(__file__).parent / "../src/data/conferences.ics"
    if src_output.parent.exists():
        with open(src_output, "w", encoding="utf-8") as f:
            f.write(ical)
        print(f"  \u2713 iCal feed written to {src_output}", file=sys.stderr)


if __name__ == "__main__":
    main()
