"""Template variable slots: validation, docx {{key}} injection, sync with analyze."""
from __future__ import annotations

import json
import logging
import re
import subprocess
from pathlib import Path
from typing import Any

log = logging.getLogger("backend.app.template_slots")

KEY_RE = re.compile(r"^[a-z][a-z0-9_]{0,31}$")


class SlotError(Exception):
    def __init__(self, message: str, code: str = "slot_error") -> None:
        super().__init__(message)
        self.code = code


def validate_key(key: str) -> str:
    k = (key or "").strip()
    if not KEY_RE.match(k):
        raise SlotError(
            f"变量 key 无效：{key!r}（需小写字母开头，仅 a-z0-9_，最多 32 字符）",
            code="invalid_key",
        )
    return k


def slots_from_placeholders(placeholders: list[dict]) -> list[dict]:
    slots: list[dict] = []
    for i, ph in enumerate(placeholders):
        if isinstance(ph, str):
            key = ph.strip()
            hint = key.replace("_", " ")
        elif isinstance(ph, dict):
            key = str(ph.get("key") or "").strip()
            hint = str(ph.get("hint") or key.replace("_", " ")).strip()
        else:
            continue
        if not key:
            continue
        try:
            key = validate_key(key)
        except SlotError:
            continue
        slots.append({
            "key": key,
            "label": hint or key,
            "hint": hint or None,
            "sample_text": None,
            "order": i,
            "source": "analyze",
        })
    return slots


def parse_slots_json(raw: str | None) -> list[dict]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    out: list[dict] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        key = str(item.get("key") or "").strip()
        if not key:
            continue
        out.append({
            "key": key,
            "label": str(item.get("label") or key.replace("_", " ")).strip(),
            "hint": item.get("hint"),
            "sample_text": item.get("sample_text"),
            "data_path": item.get("data_path"),
            "order": int(item.get("order") or len(out)),
            "source": str(item.get("source") or "manual"),
        })
    out.sort(key=lambda s: s.get("order", 0))
    return out


def _officecli_replace(docx: Path, find_text: str, replace_text: str) -> None:
    if not find_text or find_text == replace_text:
        return
    if shutil_which_officecli() is None:
        raise SlotError("officecli 未安装，无法写入占位符", code="officecli_missing")

    result = subprocess.run(
        [
            "officecli",
            "set",
            str(docx),
            "/",
            "--prop",
            f"find={find_text}",
            "--prop",
            f"replace={replace_text}",
        ],
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()
        raise SlotError(f"替换失败（{find_text!r}）：{detail}", code="replace_failed")


def shutil_which_officecli() -> str | None:
    import shutil
    return shutil.which("officecli")


def apply_slots_to_docx(
    docx: Path,
    *,
    previous_slots: list[dict],
    next_slots: list[dict],
) -> None:
    """Apply slot changes by find/replace in docx."""
    if not docx.is_file():
        raise SlotError("模板文件不存在", code="missing_file")

    prev_by_key = {s["key"]: s for s in previous_slots}
    next_by_key = {s["key"]: s for s in next_slots}

    for key, prev in prev_by_key.items():
        if key not in next_by_key:
            placeholder = f"{{{{{key}}}}}"
            restore = prev.get("sample_text") or prev.get("label") or f"[{key}]"
            _officecli_replace(docx, placeholder, str(restore))

    seen_keys: set[str] = set()
    for slot in next_slots:
        key = validate_key(slot["key"])
        if key in seen_keys:
            raise SlotError(f"变量 key 重复：{key}", code="duplicate_key")
        seen_keys.add(key)

        sample = (slot.get("sample_text") or "").strip()
        if not sample:
            continue
        placeholder = f"{{{{{key}}}}}"
        if sample == placeholder:
            continue
        prev = prev_by_key.get(key)
        if prev and prev.get("sample_text") and prev["sample_text"] != sample:
            old_ph = f"{{{{{key}}}}}"
            _officecli_replace(docx, old_ph, prev["sample_text"])
        _officecli_replace(docx, sample, placeholder)
        slot["sample_text"] = sample


def normalize_slot_payload(raw: dict[str, Any], order: int) -> dict[str, Any]:
    key = validate_key(str(raw.get("key") or ""))
    label = str(raw.get("label") or key.replace("_", " ")).strip() or key
    hint = raw.get("hint")
    hint_str = str(hint).strip() if hint else None
    sample = raw.get("sample_text")
    sample_str = str(sample).strip() if sample else None
    data_path = raw.get("data_path")
    data_path_str = str(data_path).strip() if data_path else None
    source = str(raw.get("source") or "manual")
    return {
        "key": key,
        "label": label,
        "hint": hint_str,
        "sample_text": sample_str,
        "data_path": data_path_str,
        "order": int(raw.get("order") if raw.get("order") is not None else order),
        "source": source,
    }


def save_template_slots(
    docx: Path,
    *,
    previous_slots: list[dict],
    slot_payloads: list[dict],
) -> tuple[list[dict], list[dict]]:
    """Validate, apply to docx, re-analyze placeholders. Returns (slots, placeholders)."""
    next_slots = [
        normalize_slot_payload(item, i)
        for i, item in enumerate(slot_payloads)
    ]
    apply_slots_to_docx(docx, previous_slots=previous_slots, next_slots=next_slots)
    from backend.app.templates_service import analyze_template_file

    meta = analyze_template_file(docx)
    placeholders = meta.get("placeholders") or []
    analyzed_keys = set()
    if placeholders and isinstance(placeholders[0], dict):
        analyzed_keys = {str(p.get("key")) for p in placeholders if p.get("key")}
    else:
        analyzed_keys = {str(p) for p in placeholders}

    for slot in next_slots:
        if slot["key"] not in analyzed_keys and slot.get("sample_text"):
            log.warning("slot %s not found in docx after inject", slot["key"])

    return next_slots, placeholders
