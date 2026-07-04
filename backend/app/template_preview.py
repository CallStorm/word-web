"""Generate HTML + PNG previews for template docx files."""
from __future__ import annotations

import logging
from pathlib import Path

from backend.runner.preview import (
    find_cover_preview,
    find_document_html,
    generate_docx_html,
    generate_docx_outline,
    generate_docx_previews,
    list_slides,
)

log = logging.getLogger("backend.app.template_preview")


def template_storage_dir(file_path: str | Path) -> Path:
    return Path(file_path).resolve().parent


def sync_template_previews(docx_path: Path) -> tuple[str | None, str | None]:
    """Generate .preview assets next to template.docx. Returns (cover_path, html_path)."""
    if not docx_path.is_file():
        return None, None
    root = template_storage_dir(docx_path)
    generate_docx_html(root, docx_path)
    generate_docx_previews(root, docx_path, max_pages=1)
    generate_docx_outline(root, docx_path)
    cover = find_cover_preview(root)
    html = find_document_html(root)
    return (str(cover) if cover else None, str(html) if html else None)
