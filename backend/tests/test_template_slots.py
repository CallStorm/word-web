"""Tests for template slot validation and parsing."""
from __future__ import annotations

import pytest

from backend.app.template_slots import (
    SlotError,
    normalize_slot_payload,
    parse_slots_json,
    slots_from_placeholders,
    validate_key,
)


def test_validate_key_accepts_snake_case():
    assert validate_key("candidate_name") == "candidate_name"
    assert validate_key("a1") == "a1"


def test_validate_key_rejects_invalid():
    with pytest.raises(SlotError):
        validate_key("Candidate")
    with pytest.raises(SlotError):
        validate_key("1bad")


def test_slots_from_placeholders_strings():
    slots = slots_from_placeholders(["title", "author"])
    assert len(slots) == 2
    assert slots[0]["key"] == "title"
    assert slots[0]["label"] == "title"
    assert slots[0]["source"] == "analyze"


def test_slots_from_placeholders_dicts():
    slots = slots_from_placeholders([{"key": "party_a", "hint": "甲方"}])
    assert slots[0]["key"] == "party_a"
    assert slots[0]["label"] == "甲方"


def test_parse_slots_json_roundtrip():
    raw = '[{"key":"title","label":"标题","sample_text":"报告","order":0}]'
    slots = parse_slots_json(raw)
    assert len(slots) == 1
    assert slots[0]["key"] == "title"
    assert slots[0]["sample_text"] == "报告"


def test_normalize_slot_payload():
    slot = normalize_slot_payload(
        {"key": "date", "label": "日期", "sample_text": "2026-01-01"},
        3,
    )
    assert slot["key"] == "date"
    assert slot["order"] == 3
    assert slot["source"] == "manual"
