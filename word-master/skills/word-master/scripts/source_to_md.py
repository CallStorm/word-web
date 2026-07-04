#!/usr/bin/env python3
"""Convert uploaded sources (PDF, TXT, MD, DOCX) to a Markdown summary."""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

SUPPORTED_TEXT = {".txt", ".md", ".markdown", ".html", ".htm", ".csv"}


def read_pdf(path: Path) -> str:
    try:
        from pypdf import PdfReader  # type: ignore
    except ImportError:
        return f"[PDF: install pypdf to extract — {path.name}]"
    reader = PdfReader(str(path))
    parts = []
    for i, page in enumerate(reader.pages, 1):
        text = page.extract_text() or ""
        if text.strip():
            parts.append(f"## Page {i}\n\n{text.strip()}")
    return "\n\n".join(parts) if parts else f"[PDF empty: {path.name}]"


def read_docx(path: Path) -> str:
    result = subprocess.run(
        ["officecli", "view", str(path), "text"],
        capture_output=True,
        text=True,
        check=False,
    )
    return result.stdout.strip() or f"[DOCX empty: {path.name}]"


def convert_file(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return read_pdf(path)
    if suffix == ".docx":
        return read_docx(path)
    if suffix in SUPPORTED_TEXT:
        return path.read_text(encoding="utf-8", errors="replace")
    return f"[Unsupported format: {path.name}]"


def main() -> int:
    ap = argparse.ArgumentParser(description="Convert sources to Markdown summary")
    ap.add_argument("sources_dir", type=Path)
    ap.add_argument("-o", "--output", type=Path, required=True)
    args = ap.parse_args()

    sections: list[str] = ["# Source Summary\n"]
    if not args.sources_dir.is_dir():
        args.output.write_text("# Source Summary\n\nNo sources directory.\n", encoding="utf-8")
        return 0

    files = sorted(p for p in args.sources_dir.iterdir() if p.is_file())
    if not files:
        sections.append("No source files provided.\n")
    else:
        for f in files:
            sections.append(f"## {f.name}\n")
            sections.append(convert_file(f))
            sections.append("")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text("\n".join(sections), encoding="utf-8")
    print(f"Wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
