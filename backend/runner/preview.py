"""Document preview helpers for word-web."""
from __future__ import annotations

from pathlib import Path


def find_cover_preview(project_dir: Path | None) -> Path | None:
    if not project_dir or not project_dir.exists():
        return None
    preview = project_dir / ".preview" / "page-1.png"
    if preview.is_file():
        return preview
    exports = project_dir / "exports"
    if exports.is_dir():
        docx = sorted(exports.glob("*.docx"), key=lambda p: p.stat().st_mtime, reverse=True)
        if docx:
            return docx[0]
    return None


def list_slides(project_dir: Path | None) -> list[dict]:
    """Return page descriptors — for Word we expose the docx as a single preview item."""
    if not project_dir or not project_dir.exists():
        return []
    exports = project_dir / "exports"
    if not exports.is_dir():
        return []
    docx_files = sorted(exports.glob("*.docx"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not docx_files:
        return []
    docx = docx_files[0]
    preview_dir = project_dir / ".preview"
    pages: list[dict] = []
    if preview_dir.is_dir():
        pngs = sorted(preview_dir.glob("page-*.png"))
        for i, png in enumerate(pngs, 1):
            pages.append({
                "index": i,
                "name": png.stem,
                "path": png,
                "media_type": "image/png",
                "has_notes": False,
                "notes_path": None,
            })
    if not pages:
        pages.append({
            "index": 1,
            "name": docx.stem,
            "path": docx,
            "media_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "has_notes": False,
            "notes_path": None,
        })
    return pages
