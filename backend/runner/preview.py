"""Document preview helpers for word-web."""
from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

log = logging.getLogger("backend.runner.preview")

MAX_PREVIEW_PAGES = 20
PREVIEW_COVER_PAGES = int(os.environ.get("PREVIEW_SYNC_PAGES", "1"))
# A4 portrait ratio for Word cover thumbnails (210:297).
PREVIEW_SCREENSHOT_WIDTH = 840
PREVIEW_SCREENSHOT_HEIGHT = 1188
DOCUMENT_HTML_NAME = "document.html"
DOCUMENT_OUTLINE_NAME = "document-outline.json"
EMBED_MARKER = "<!-- word-web-embed-v2 -->"
EMBED_STYLE = """
/* word-web: iframe embed + complex layout (resume/table) fixes */
html, body { min-height: 100%; }
body { padding: 12px !important; background: #e8e8e8 !important; }
.page-wrapper { max-width: 100%; overflow: visible !important; }
.page { overflow: visible !important; max-width: 100%; }
.page-body { overflow: visible !important; }
.wg {
  display: block !important;
  clear: both;
  margin: 12pt auto 18pt !important;
  max-width: 100%;
}
div[data-path] > .wg {
  margin-bottom: 18pt !important;
}
"""
EMBED_SCRIPT = """
<script>
(function () {
  function reflow() {
    try { window.dispatchEvent(new Event('resize')); } catch (e) {}
  }
  function scheduleReflows() {
    [150, 500, 1200, 2500].forEach(function (ms) {
      setTimeout(reflow, ms);
    });
  }
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('.toc a[href^="#"]');
    if (!a) return;
    e.preventDefault();
    var id = a.getAttribute('href').slice(1);
    var target = document.getElementById(id);
    if (!target) {
      target = document.querySelector('a[id="' + id.replace(/"/g, '') + '"]');
    }
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, true);
  if (window.parent !== window) {
    if (document.readyState === 'complete') {
      scheduleReflows();
    } else {
      window.addEventListener('load', scheduleReflows);
    }
  }
})();
</script>
"""
_PAGE_RE = re.compile(r"^page-(\d+)\.png$", re.IGNORECASE)
_FIGURE_CAPTION_RE = re.compile(r"图(\d+)-(\d+)[：:]")
_FIGURE_CAPTION_LABEL_RE = re.compile(r"图\d+-\d+[：:]")
_LIST_STYLE_ANNOTATED_RE = re.compile(r"listStyle=(ordered|bullet)", re.IGNORECASE)
_GROUP_PATH_RE = re.compile(r"/body/group\[(\d+)\]")
_IMAGE_MARKER_RE = re.compile(r"\[(Image|Diagram):", re.IGNORECASE)
_HEADING1_STYLE_RE = re.compile(r"\bHeading1\b", re.IGNORECASE)
_HEADING2_STYLE_RE = re.compile(r"\bHeading2\b", re.IGNORECASE)
_NORMAL_STYLE_RE = re.compile(r"\bNormal\b|style=Normal", re.IGNORECASE)
_LIST_ORDERED_RE = re.compile(r"listStyle=ordered", re.IGNORECASE)
_LIST_BULLET_RE = re.compile(r"listStyle=bullet", re.IGNORECASE)
_DIAGRAM_MARKER_RE = re.compile(r"\[Diagram:", re.IGNORECASE)
_RASTER_IMAGE_RE = re.compile(r"\[Image:", re.IGNORECASE)
_DIAGRAM_ANNOTATED_RE = re.compile(
    r"\[(?:Diagram|Image):\s*name=\"Diagram[^\"]*\",\s*([\d.]+)cm×([\d.]+)cm\]",
    re.IGNORECASE,
)
_HEADING1_ANNOTATED_RE = re.compile(r"←\s*heading\s*1\b", re.IGNORECASE)
_CAPTION_STYLE_RE = re.compile(r"\bCaption\b|style=Caption", re.IGNORECASE)
_PARA_ID_LINE_RE = re.compile(r"paraId=([0-9A-Fa-f]{8})")
_EMU_PER_CM = 360_000.0
_MAX_DIAGRAM_HEIGHT_CM = 12.0
_MAX_DIAGRAM_ASPECT = 4.0


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


def enhance_document_html_for_embed(html: str) -> str:
    """Patch officecli HTML for iframe preview: overflow + resize reflow."""
    if EMBED_MARKER in html:
        return html
    out = html
    if "</head>" in out:
        out = out.replace(
            "</head>",
            f'<style id="word-web-embed">{EMBED_STYLE}</style>{EMBED_MARKER}\n</head>',
            1,
        )
    else:
        out = EMBED_MARKER + out
    if "</body>" in out:
        out = out.replace("</body>", f"{EMBED_SCRIPT}\n</body>", 1)
    else:
        out = out + EMBED_SCRIPT
    return out


def read_document_html_content(path: Path) -> str:
    """Read document.html with embed enhancements applied."""
    return enhance_document_html_for_embed(path.read_text(encoding="utf-8"))


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

    try:
        raw_html = html_path.read_text(encoding="utf-8")
        html_path.write_text(enhance_document_html_for_embed(raw_html), encoding="utf-8")
    except OSError as exc:
        log.warning("failed to persist embed CSS for %s: %s", docx, exc)
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


_NAV_EXCLUDED_STYLES = frozenset({"title", "subtitle", "caption"})


def filter_nav_headings(headings: list[dict]) -> list[dict]:
    """Keep Heading1/Heading2 only — exclude cover Title/Subtitle from sidebar nav."""
    out: list[dict] = []
    for item in headings:
        style = str(item.get("style") or "").strip()
        if style and style.lower() in _NAV_EXCLUDED_STYLES:
            continue
        if style and style not in ("Heading1", "Heading2"):
            continue
        if not style:
            level = item.get("level")
            if isinstance(level, int) and level not in (1, 2):
                continue
        out.append(item)
    return out


def load_document_outline(project_dir: Path | None, *, nav_only: bool = False) -> list[dict]:
    """Load normalized heading list from cached outline JSON."""
    path = find_document_outline(project_dir)
    if not path:
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if isinstance(raw, dict) and isinstance(raw.get("headings"), list):
        headings = [h for h in raw["headings"] if isinstance(h, dict) and h.get("text")]
    else:
        headings = _normalize_outline_headings(raw)
    if nav_only:
        return filter_nav_headings(headings)
    return headings


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
    max_pages: int = PREVIEW_COVER_PAGES,
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
        try:
            if cover.stat().st_mtime >= docx.stat().st_mtime:
                return True
        except OSError:
            pass

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
                    "--screenshot-width",
                    str(PREVIEW_SCREENSHOT_WIDTH),
                    "--screenshot-height",
                    str(PREVIEW_SCREENSHOT_HEIGHT),
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


def _annotated_heading1_indices(lines: list[str]) -> list[int]:
    indices: list[int] = []
    for i, line in enumerate(lines):
        if _HEADING1_ANNOTATED_RE.search(line) or _HEADING1_STYLE_RE.search(line):
            indices.append(i)
    return indices


def _heading1_section_index(h1_indices: list[int], line_idx: int) -> int:
    section = 0
    for h_idx in h1_indices:
        if h_idx <= line_idx:
            section += 1
    return section


def _is_list_item_line(line: str) -> bool:
    return bool(_LIST_STYLE_ANNOTATED_RE.search(line))


def check_figure_adjacency_warnings(docx_path: Path | str) -> list[str]:
    """Return warnings when figure captions are not followed by image/diagram."""
    text = _fetch_annotated_text(Path(docx_path))
    if not text:
        return []

    lines = text.splitlines()
    warnings: list[str] = []
    for i, line in enumerate(lines):
        if not _FIGURE_CAPTION_LABEL_RE.search(line):
            continue
        found = False
        gap = 0
        for j in range(i + 1, min(i + 4, len(lines))):
            if _IMAGE_MARKER_RE.search(lines[j]) or _is_diagram_annotated_line(lines[j]):
                found = True
                gap = j - i
                break
        if not found:
            snippet = line.strip()[:80]
            warnings.append(f"图题与图片未相邻：{snippet}")
        elif gap > 2:
            snippet = line.strip()[:80]
            warnings.append(f"图题与图表间隔过大（{gap} 行）：{snippet}")
    return warnings


def _count_heading1_in_annotated(text: str) -> int:
    count = 0
    for line in text.splitlines():
        if _HEADING1_STYLE_RE.search(line):
            count += 1
    return count


def _count_figure_markers(text: str) -> int:
    return len(_IMAGE_MARKER_RE.findall(text))


def doc_has_figures(docx_path: Path | str) -> bool:
    """True when annotated view shows diagrams or figure images."""
    text = _fetch_annotated_text(Path(docx_path))
    if not text:
        return False
    if _count_figure_markers(text) > 0:
        return True
    return any(_is_diagram_annotated_line(line) for line in text.splitlines())


def check_figure_richness_warnings(
    docx_path: Path | str,
    options: Any,
) -> list[str]:
    """Deprecated — figure density is no longer enforced via job options."""
    del docx_path, options
    return []


def _fetch_annotated_text(docx: Path) -> str:
    if not docx.is_file() or shutil.which("officecli") is None:
        return ""
    try:
        result = subprocess.run(
            ["officecli", "view", str(docx), "annotated"],
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        log.warning("annotated view failed for %s: %s", docx, exc)
        return ""
    if result.returncode != 0:
        return ""
    return result.stdout or ""


def _analyze_h1_body_sections(text: str) -> list[dict[str, int | str]]:
    """Split annotated output into per-Heading1 body stats."""
    sections: list[dict[str, int | str]] = []
    current: dict[str, int | str] | None = None

    for line in text.splitlines():
        if _HEADING1_STYLE_RE.search(line):
            if current is not None:
                sections.append(current)
            current = {"title": line.strip()[:80], "normal": 0, "ordered": 0, "bullet": 0}
            continue
        if current is None:
            continue
        if _HEADING2_STYLE_RE.search(line):
            continue
        if re.search(r"\bCaption\b|style=Caption", line, re.IGNORECASE):
            continue
        if _LIST_ORDERED_RE.search(line):
            current["ordered"] = int(current["ordered"]) + 1
            current["normal"] = int(current["normal"]) + 1
        elif _LIST_BULLET_RE.search(line):
            current["bullet"] = int(current["bullet"]) + 1
            current["normal"] = int(current["normal"]) + 1
        elif _NORMAL_STYLE_RE.search(line):
            current["normal"] = int(current["normal"]) + 1

    if current is not None:
        sections.append(current)
    return sections


def _count_raster_figures_after_captions(text: str) -> int:
    """Count figure captions followed by [Image:] rather than [Diagram:]."""
    lines = text.splitlines()
    count = 0
    for i, line in enumerate(lines):
        if not _FIGURE_CAPTION_RE.search(line):
            continue
        for j in range(i + 1, min(i + 4, len(lines))):
            if _DIAGRAM_MARKER_RE.search(lines[j]):
                break
            if _RASTER_IMAGE_RE.search(lines[j]):
                count += 1
                break
    return count


def check_figure_render_warnings(
    docx_path: Path | str,
    options: Any,
) -> list[str]:
    """Deprecated — figure render mode is no longer configured via job options."""
    del docx_path, options
    return []


def _length_value_to_cm(raw: str) -> float | None:
    text = raw.strip()
    if text.endswith("cm"):
        try:
            return float(text[:-2])
        except ValueError:
            return None
    try:
        return float(text) / _EMU_PER_CM
    except ValueError:
        return None


def _is_diagram_annotated_line(line: str) -> bool:
    return "Diagram" in line and bool(_DIAGRAM_ANNOTATED_RE.search(line) or _DIAGRAM_MARKER_RE.search(line))


def _extract_para_id(line: str) -> str | None:
    match = _PARA_ID_LINE_RE.search(line)
    return match.group(1) if match else None


def _diagram_extreme_aspect(width_cm: float, height_cm: float) -> bool:
    if height_cm <= 0 or width_cm <= 0:
        return False
    ratio = width_cm / height_cm
    return ratio > _MAX_DIAGRAM_ASPECT or ratio < (1.0 / _MAX_DIAGRAM_ASPECT)


def check_figure_layout_warnings(
    docx_path: Path | str,
    options: Any,
) -> list[str]:
    """Warn on missing captions, missing spacers, list-middle diagrams, or extreme dimensions."""
    del options
    if not doc_has_figures(docx_path):
        return []

    docx = Path(docx_path)
    text = _fetch_annotated_text(docx)
    if not text:
        return []

    lines = text.splitlines()
    warnings: list[str] = []
    h1_indices = _annotated_heading1_indices(lines)

    for i, line in enumerate(lines):
        if not _is_diagram_annotated_line(line):
            continue

        caption_idx: int | None = None
        caption_style_ok = False
        for j in range(max(0, i - 3), i):
            if _FIGURE_CAPTION_LABEL_RE.search(lines[j]):
                caption_idx = j
                caption_style_ok = bool(_CAPTION_STYLE_RE.search(lines[j]))
                break
        if caption_idx is None:
            snippet = line.strip()[:72]
            warnings.append(f"图表缺少图题（Caption 图X-X）：{snippet}")
        else:
            if not caption_style_ok:
                warnings.append(
                    "图题未使用 Caption 样式（Normal+粗体会导致导航/校验混乱）："
                    f"{lines[caption_idx].strip()[:72]}"
                )
            if i - caption_idx > 2:
                warnings.append(
                    f"图题与图表不相邻（间隔 {i - caption_idx} 行）：{lines[caption_idx].strip()[:72]}"
                )
            cap_section = _heading1_section_index(h1_indices, caption_idx)
            dia_section = _heading1_section_index(h1_indices, i)
            if cap_section and dia_section and cap_section != dia_section:
                warnings.append(
                    f"图题与图表跨章节错位（图题在第 {cap_section} 节、图表在第 {dia_section} 节）"
                )

        prev_is_list = i > 0 and _is_list_item_line(lines[i - 1])
        next_is_list = i + 1 < len(lines) and _is_list_item_line(lines[i + 1])
        if prev_is_list or next_is_list:
            warnings.append("图表插入在列表项之间，会打断列表结构")

        if i + 1 < len(lines) and _HEADING1_ANNOTATED_RE.search(lines[i + 1]):
            warnings.append("图表后紧跟一级标题，缺少 spacer 空段（spaceAfter=24pt），可能导致与正文叠加")

        dim = _DIAGRAM_ANNOTATED_RE.search(line)
        if dim:
            width_cm = float(dim.group(1))
            height_cm = float(dim.group(2))
            if height_cm > _MAX_DIAGRAM_HEIGHT_CM:
                warnings.append(
                    f"图表过高（{height_cm:.1f}cm），建议 --prop height=10cm 或简化 Mermaid 节点"
                )
            elif _diagram_extreme_aspect(width_cm, height_cm):
                warnings.append(
                    f"图表宽高比异常（{width_cm:.1f}×{height_cm:.1f}cm），"
                    "建议分层 subgraph 并限制 width=14cm height=10cm"
                )

    return warnings


def check_figure_layout_blocking(docx_path: Path | str, options: Any) -> list[str]:
    """Subset of layout warnings that should block job completion."""
    blocking_prefixes = (
        "图表缺少图题",
        "图题与图表跨章节",
        "图表插入在列表项之间",
        "图题未使用 Caption 样式",
    )
    return [
        w for w in check_figure_layout_warnings(docx_path, options)
        if any(w.startswith(p) for p in blocking_prefixes)
        or "图题与图表不相邻" in w
        or "图题与图片未相邻" in w
    ]


def _load_outline_from_docx(docx: Path) -> list[dict]:
    if shutil.which("officecli") is None or not docx.is_file():
        return []
    try:
        result = subprocess.run(
            ["officecli", "view", str(docx), "outline", "--json"],
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return []
    if result.returncode != 0:
        return []
    try:
        raw = json.loads(result.stdout or "{}")
    except json.JSONDecodeError:
        return []
    return _normalize_outline_headings(raw)


def check_heading_hierarchy_warnings(
    docx_path: Path | str,
    options: Any,
) -> list[str]:
    """Return warnings when Heading1/Heading2 are missing for revision navigation."""
    docx = Path(docx_path)
    if not docx.is_file():
        return []

    headings = _load_outline_from_docx(docx)
    nav_headings = filter_nav_headings(headings)
    if not nav_headings:
        return ["文档缺少 Heading1/Heading2 标题样式，修订页左侧导航将不可用"]
    return []


def check_caption_alignment_warnings(docx_path: Path | str) -> list[str]:
    """Return warnings when Caption paragraphs are not center-aligned."""
    docx = Path(docx_path)
    if not docx.is_file() or shutil.which("officecli") is None:
        return []

    result = subprocess.run(
        ["officecli", "query", str(docx), "paragraph[style=Caption]", "--json"],
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    if result.returncode != 0:
        text = _fetch_annotated_text(docx)
        warnings: list[str] = []
        for line in text.splitlines():
            if not _CAPTION_STYLE_RE.search(line):
                continue
            if re.search(r"align=center", line, re.IGNORECASE):
                continue
            snippet = line.strip()[:72]
            warnings.append(f"图题未居中：{snippet}")
        return warnings

    try:
        payload = json.loads(result.stdout or "{}")
    except json.JSONDecodeError:
        return []

    results = payload.get("data", {}).get("results", payload.get("results", []))
    if not isinstance(results, list):
        return []

    warnings: list[str] = []
    for item in results:
        if not isinstance(item, dict):
            continue
        fmt = item.get("format") or item.get("props") or {}
        align = str(fmt.get("align") or fmt.get("alignment") or "").strip().lower()
        if align and align != "center":
            path = item.get("path") or item.get("dataPath") or "Caption"
            warnings.append(f"图题未居中（{path}，align={align}）")
        elif not align:
            path = item.get("path") or item.get("dataPath") or "Caption"
            warnings.append(f"图题未居中（{path}，未设置 align）")
    return warnings


def check_list_format_warnings(docx_path: Path | str) -> list[str]:
    """Warn when list lead-in sentences are formatted as list items."""
    text = _fetch_annotated_text(Path(docx_path))
    if not text:
        return []

    warnings: list[str] = []
    in_list = False
    for line in text.splitlines():
        list_match = _LIST_STYLE_ANNOTATED_RE.search(line)
        if not list_match:
            in_list = False
            continue
        content = line.rsplit("]", 1)[-1].strip()
        content = re.sub(r"^style=\w+\s*", "", content).strip()
        content = re.sub(r"listStyle=\w+\s*", "", content).strip()
        if not in_list and (content.endswith("：") or content.endswith(":")):
            snippet = content[:60]
            warnings.append(f"列表引导句应使用 Normal 而非 listStyle：{snippet}")
        in_list = True
    return warnings
