#!/usr/bin/env python3
"""Locate the newest .docx under exports/ or the project root."""
from __future__ import annotations

import sys
from pathlib import Path


def find_docx(root: Path) -> Path | None:
    exports = root / "exports"
    search_roots = [exports, root] if exports.is_dir() else [root]
    hits: list[Path] = []
    for base in search_roots:
        if not base.is_dir():
            continue
        hits.extend(base.rglob("*.docx"))
    if not hits:
        return None
    return max(hits, key=lambda p: p.stat().st_mtime)


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    hit = find_docx(root)
    if hit:
        print(hit)
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
