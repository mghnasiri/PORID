"""Tests for utils.redact_secrets."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from utils import redact_secrets

# Fake token with the real Telegram shape (digits:35 chars).
FAKE_TG = "1234567890:" + "A" * 35


def test_redacts_telegram_token_in_url():
    text = f"GET https://api.telegram.org/bot{FAKE_TG}/getMe 200 OK"
    out = redact_secrets(text)
    assert FAKE_TG not in out
    assert "bot[REDACTED]/getMe" in out


def test_recurses_into_items():
    items = [{"title": "x", "abstract": f"token {FAKE_TG}", "authors": [FAKE_TG], "n": 3}]
    out = redact_secrets(items)
    assert out[0]["abstract"] == "token [REDACTED]"
    assert out[0]["authors"] == ["[REDACTED]"]
    assert out[0]["n"] == 3


def test_leaves_normal_text_alone():
    text = "A 2-approximation for VRP, DOI 10.1016/j.ejor.2024.01.001, ratio 3:2"
    assert redact_secrets(text) == text
