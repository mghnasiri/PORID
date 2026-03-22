#!/usr/bin/env python3
"""
PORID Digest Email Sender.

Sends the daily digest HTML email via Gmail SMTP.
Credentials are read from environment variables.

Usage:
    python send_email.py
    python send_email.py --date 2025-03-20

Environment variables:
    SMTP_USER      — Gmail address (e.g., your-email@gmail.com)
    SMTP_PASSWORD  — Gmail App Password (not your regular password)
"""

from __future__ import annotations

import json
import os
import sys
import argparse
import smtplib
from datetime import datetime, timezone
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path

import yaml


SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587


def load_config(config_path: str = "config.yaml") -> dict:
    """Load pipeline configuration from YAML file."""
    path = Path(__file__).parent / config_path
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def find_digest_files(data_dir: Path, date_str: str | None = None) -> tuple[Path | None, Path | None]:
    """
    Locate the digest JSON and HTML files for a given date.

    Args:
        data_dir: Directory containing digest files.
        date_str: Date string (YYYY-MM-DD). If None, uses today.

    Returns:
        Tuple of (json_path, html_path), either may be None if not found.
    """
    if date_str is None:
        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    json_path = data_dir / f"digest-{date_str}.json"
    html_path = data_dir / f"digest-{date_str}.html"

    return (
        json_path if json_path.exists() else None,
        html_path if html_path.exists() else None,
    )


def send_digest_email(
    html_content: str,
    subject: str,
    recipient: str,
    smtp_user: str,
    smtp_password: str,
) -> None:
    """
    Send an HTML email via Gmail SMTP.

    Args:
        html_content: Rendered HTML email body.
        subject: Email subject line.
        recipient: Recipient email address.
        smtp_user: Gmail address for authentication.
        smtp_password: Gmail App Password.
    """
    msg = MIMEMultipart("alternative")
    msg["From"] = smtp_user
    msg["To"] = recipient
    msg["Subject"] = subject

    # Plain-text fallback
    plain = "Your PORID daily digest is ready. View it in an HTML-capable email client."
    msg.attach(MIMEText(plain, "plain", "utf-8"))
    msg.attach(MIMEText(html_content, "html", "utf-8"))

    print(f"  Connecting to {SMTP_HOST}:{SMTP_PORT}...", file=sys.stderr)
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as server:
        server.starttls()
        server.login(smtp_user, smtp_password)
        server.send_message(msg)

    print(f"  ✓ Email sent to {recipient}", file=sys.stderr)


def main() -> None:
    """CLI entry point: send today's digest email."""
    parser = argparse.ArgumentParser(description="Send PORID digest email")
    parser.add_argument("--date", default=None, help="Digest date (YYYY-MM-DD), defaults to today")
    parser.add_argument("--data-dir", default="../data", help="Data directory")
    parser.add_argument("--config", default="config.yaml", help="Path to config file")
    parser.add_argument("--dry-run", action="store_true", help="Print email details without sending")
    args = parser.parse_args()

    config = load_config(args.config)
    data_dir = Path(__file__).parent / args.data_dir

    # Resolve date
    date_str = args.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Find digest files
    json_path, html_path = find_digest_files(data_dir, date_str)

    if not html_path:
        print(f"  ✗ No digest HTML found for {date_str}. Run build_digest.py first.", file=sys.stderr)
        sys.exit(1)

    # Load digest stats for subject line
    total_items = 0
    if json_path:
        with open(json_path, "r", encoding="utf-8") as f:
            digest_data = json.load(f)
            total_items = digest_data.get("stats", {}).get("total", 0)

    # Read HTML
    with open(html_path, "r", encoding="utf-8") as f:
        html_content = f.read()

    subject = f"PORID Digest \u2014 {date_str} \u00B7 {total_items} new item{'s' if total_items != 1 else ''}"
    email_cfg = config.get("email", {})
    recipient = email_cfg.get("recipient", config.get("email_recipient", ""))

    if not recipient or recipient == "your-email@example.com":
        print("  ✗ No recipient configured in config.yaml (email.recipient).", file=sys.stderr)
        print("    Set a real email address to enable digest delivery.", file=sys.stderr)
        sys.exit(1)

    # Get SMTP credentials
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_password = os.environ.get("SMTP_PASSWORD", "")

    if not smtp_user or not smtp_password:
        print("  ✗ SMTP credentials not set.", file=sys.stderr)
        print("    Set SMTP_USER and SMTP_PASSWORD environment variables.", file=sys.stderr)
        print("    For Gmail, use an App Password (not your regular password).", file=sys.stderr)
        sys.exit(1)

    print(f"Sending digest for {date_str}...", file=sys.stderr)
    print(f"  Subject: {subject}", file=sys.stderr)
    print(f"  To: {recipient}", file=sys.stderr)
    print(f"  Items: {total_items}", file=sys.stderr)

    if args.dry_run:
        print("\n  [DRY RUN] Email not sent. HTML content:", file=sys.stderr)
        print(f"  HTML length: {len(html_content)} chars", file=sys.stderr)
        return

    send_digest_email(html_content, subject, recipient, smtp_user, smtp_password)
    print("\nDone.", file=sys.stderr)


if __name__ == "__main__":
    main()
