"""Document preview helpers for word-web."""
from __future__ import annotations

import json
import logging
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

log = logging.getLogger("backend.runner.preview")

MAX_PREVIEW_PAGES = 20
DOCUMENT_HTML_NAME = "document.html"
DOCUMENT_OUTLINE_NAME = "document-outline.json"
_PAGE_RE = re.compile(r"^page-(\d+)\.png$", re.IGNORECASE)
_FIGURE_CAPTION_RE = re.compile(r"图\d+-\d+[：:]")
_IMAGE_MARKER_RE = re.compile(r"\[(Image|Diagram):", re.IGNORECASE)


def find_cover_preview(project_dir: Path | None) -> Path | None:
    """Return cover image path if raster preview exists."""
    if not project_dir or not project_dir.exists():
        return None
    preview_dir = project_dir / ".preview"
    for name in ("page-1.png", "page-1.svg"):
        candidate = preview_dir / name
        if candidate.is_file():
            return candidate
    return None


def list_slides(project_dir: Path | None) -> list[dict]:
    """Return page descriptors from .preview/page-*.png only."""
    if not project_dir or not project_dir.exists():
        return []
    preview_dir = project_dir / ".preview"
    if not preview_dir.is_dir():
        return []

    pngs: list[tuple[int, Path]] = []
    for png in preview_dir.glob("page-*.png"):
        m = _PAGE_RE.match(png.name)
        if m:
            pngs.append((int(m.group(1)), png))
    pngs.sort(key=lambda item: item[0])

    pages: list[dict] = []
    for index, png in pngs:
        pages.append({
            "index": index,
            "name": png.stem,
            "path": png,
            "media_type": "image/png",
            "has_notes": False,
            "notes_path": None,
        })
    return pages


def find_document_html(project_dir: Path | None) -> Path | None:
    """Return full-document HTML preview if present."""
    if not project_dir or not project_dir.exists():
        return None
    candidate = project_dir / ".preview" / DOCUMENT_HTML_NAME
    if candidate.is_file() and candidate.stat().st_size > 0:
        return candidate
    return None


def generate_docx_html(
    project_dir: Path | None,
    docx_path: Path | str | None,
) -> bool:
    """Render scrollable HTML preview via officecli. Returns True if document.html exists."""
    if not project_dir or not docx_path:
        return False

    docx = Path(docx_path)
    if not docx.is_file():
        return False

    preview_dir = Path(project_dir) / ".preview"
    html_path = preview_dir / DOCUMENT_HTML_NAME
    if html_path.is_file() and html_path.stat().st_size > 0:
        try:
            if html_path.stat().st_mtime >= docx.stat().st_mtime:
                return True
        except OSError:
            pass

    if shutil.which("officecli") is None:
        log.warning("officecli not found; skipping HTML preview for %s", docx)
        return html_path.is_file() and html_path.stat().st_size > 0

    preview_dir.mkdir(parents=True, exist_ok=True)
    try:
        result = subprocess.run(
            [
                "officecli",
                "view",
                str(docx),
                "html",
                "-o",
                str(html_path),
            ],
            capture_output=True,
            text=True,
            timeout=180,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        log.warning("HTML preview generation failed for %s: %s", docx, exc)
        return html_path.is_file() and html_path.stat().st_size > 0

    if result.returncode != 0 or not html_path.is_file() or html_path.stat().st_size == 0:
        detail = (result.stderr or result.stdout or "").strip()
        log.warning("HTML preview failed for %s: %s", docx, detail)
        return False
    return True


def find_document_outline(project_dir: Path | None) -> Path | None:
    """Return document outline JSON if present."""
    if not project_dir or not project_dir.exists():
        return None
    candidate = project_dir / ".preview" / DOCUMENT_OUTLINE_NAME
    if candidate.is_file() and candidate.stat().st_size > 0:
        return candidate
    return None


def _normalize_outline_headings(raw: Any) -> list[dict]:
    """Normalize officecli outline --json into a flat heading list."""
    if not isinstance(raw, dict):
        return []
    data = raw.get("data") if isinstance(raw.get("data"), dict) else raw
    headings = data.get("headings") if isinstance(data, dict) else None
    if not isinstance(headings, list):
        return []

    out: list[dict] = []
    for item in headings:
        if not isinstance(item, dict):
            continue
        text = str(item.get("text") or "").strip()
        if not text:
            continue
        try:
            line = int(item.get("line", 0))
        except (TypeError, ValueError):
            line = 0
        if line < 1:
            continue
        try:
            level = int(item.get("level", 1))
        except (TypeError, ValueError):
            level = 1
        style = str(item.get("style") or "").strip() or None
        out.append({
            "line": line,
            "text": text,
            "level": level,
            "style": style,
            "data_path": f"/body/p[{line}]",
        })
    return out


def load_document_outline(project_dir: Path | None) -> list[dict]:
    """Load normalized heading list from cached outline JSON."""
    path = find_document_outline(project_dir)
    if not path:
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if isinstance(raw, dict) and isinstance(raw.get("headings"), list):
        return [h for h in raw["headings"] if isinstance(h, dict) and h.get("text")]
    return _normalize_outline_headings(raw)


def generate_docx_outline(
    project_dir: Path | None,
    docx_path: Path | str | None,
) -> bool:
    """Extract heading outline via officecli. Returns True if outline JSON exists."""
    if not project_dir or not docx_path:
        return False

    docx = Path(docx_path)
    if not docx.is_file():
        return False

    preview_dir = Path(project_dir) / ".preview"
    outline_path = preview_dir / DOCUMENT_OUTLINE_NAME
    if outline_path.is_file() and outline_path.stat().st_size > 0:
        try:
            if outline_path.stat().st_mtime >= docx.stat().st_mtime:
                return True
        except OSError:
            pass

    if shutil.which("officecli") is None:
        log.warning("officecli not found; skipping outline for %s", docx)
        return outline_path.is_file() and outline_path.stat().st_size > 0

    preview_dir.mkdir(parents=True, exist_ok=True)
    try:
        result = subprocess.run(
            ["officecli", "view", str(docx), "outline", "--json"],
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        log.warning("outline generation failed for %s: %s", docx, exc)
        return outline_path.is_file() and outline_path.stat().st_size > 0

    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()
        log.warning("outline failed for %s: %s", docx, detail)
        return False

    try:
        raw = json.loads(result.stdout or "{}")
    except json.JSONDecodeError:
        log.warning("outline JSON parse failed for %s", docx)
        return False

    headings = _normalize_outline_headings(raw)
    payload = {"headings": headings}
    outline_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return True


def generate_docx_previews(
    project_dir: Path | None,
    docx_path: Path | str | None,
    *,
    max_pages: int = MAX_PREVIEW_PAGES,
) -> bool:
    """Render PNG previews via officecli screenshot. Returns True if page-1 exists."""
    if not project_dir or not docx_path:
        return False

    docx = Path(docx_path)
    if not docx.is_file():
        return False

    preview_dir = Path(project_dir) / ".preview"
    cover = preview_dir / "page-1.png"
    if cover.is_file() and cover.stat().st_size > 0:
        return True

    if shutil.which("officecli") is None:
        log.warning("officecli not found; skipping preview generation for %s", docx)
        return False

    preview_dir.mkdir(parents=True, exist_ok=True)
    generated = 0

    for page in range(1, max_pages + 1):
        out = preview_dir / f"page-{page}.png"
        try:
            result = subprocess.run(
                [
                    "officecli",
                    "view",
                    str(docx),
                    "screenshot",
                    "--page",
                    str(page),
                    "--render",
                    "html",
                    "-o",
                    str(out),
                ],
                capture_output=True,
                text=True,
                timeout=120,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            log.warning("preview generation failed on page %d for %s: %s", page, docx, exc)
            if page == 1:
                return False
            break

        if result.returncode != 0 or not out.is_file() or out.stat().st_size == 0:
            if page == 1:
                detail = (result.stderr or result.stdout or "").strip()
                log.warning("preview page 1 failed for %s: %s", docx, detail)
                return False
            out.unlink(missing_ok=True)
            break
        generated += 1

    return generated > 0


def check_figure_adjacency_warnings(docx_path: Path | str) -> list[str]:
    """Return warnings when figure captions are not followed by image/diagram."""
    docx = Path(docx_path)
    if not docx.is_file():
        return []
    if shutil.which("officecli") is None:
        return []

    try:
        result = subprocess.run(
            ["officecli", "view", str(docx), "annotated"],
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        log.warning("figure adjacency check failed for %s: %s", docx, exc)
        return []

    if result.returncode != 0:
        return []

    lines = (result.stdout or "").splitlines()
    warnings: list[str] = []
    for i, line in enumerate(lines):
        if not _FIGURE_CAPTION_RE.search(line):
            continue
        found = False
        for j in range(i + 1, min(i + 3, len(lines))):
            if _IMAGE_MARKER_RE.search(lines[j]):
                found = True
                break
        if not found:
            snippet = line.strip()[:80]
            warnings.append(f"图题与图片未相邻：{snippet}")
    return warnings
