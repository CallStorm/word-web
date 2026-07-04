#!/usr/bin/env python3
"""Scan a .docx template for {{key}} placeholders and emit JSON metadata."""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

PLACEHOLDER_RE = re.compile(r"\{\{([^}]+)\}\}")


def extract_placeholders(template: Path) -> list[str]:
    result = subprocess.run(
        ["officecli", "view", str(template), "annotated"],
        capture_output=True,
        text=True,
        check=False,
    )
    text = result.stdout + result.stderr
    keys = sorted(set(PLACEHOLDER_RE.findall(text)))
    return keys


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: analyze_template.py <template.docx>", file=sys.stderr)
        return 1
    template = Path(sys.argv[1])
    if not template.is_file():
        print(f"Not found: {template}", file=sys.stderr)
        return 1
    keys = extract_placeholders(template)
    meta = {
        "template": str(template),
        "placeholder_count": len(keys),
        "placeholders": [{"key": k, "hint": k.replace("_", " ")} for k in keys],
    }
    print(json.dumps(meta, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
