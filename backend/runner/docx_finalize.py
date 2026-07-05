"""Post-agent .docx finalization: TOC refresh, figure validation, quality gate."""
from __future__ import annotations

import json
import logging
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

from backend.api.schemas.job_options import JobOptions
from backend.runner.preview import (
    check_caption_alignment_warnings,
    check_list_format_warnings,
    check_figure_adjacency_warnings,
    check_figure_layout_blocking,
    check_figure_layout_warnings,
    check_heading_hierarchy_warnings,
    doc_has_figures,
    _diagram_extreme_aspect,
    _extract_para_id,
    _fetch_annotated_text,
    _FIGURE_CAPTION_LABEL_RE,
    _FIGURE_CAPTION_RE,
    _GROUP_PATH_RE,
    _is_diagram_annotated_line,
    _HEADING1_ANNOTATED_RE,
    _length_value_to_cm,
    _MAX_DIAGRAM_HEIGHT_CM,
)

log = logging.getLogger("backend.runner.docx_finalize")

VALIDATION_REPORT_NAME = "validation_report.json"

_TOC_MARKERS_RE = re.compile(
    r"update field to see table of contents|fieldType=toc|\bstyle=TOC\b|\[TOC\]",
    re.IGNORECASE,
)
_TOKEN_LEAK_RE = re.compile(
    r"(\$[A-Za-z_]+\$|\{\{[^}]+\}\}|<TODO>|xxxx|lorem|Update field to see|\\[\$tn])",
    re.IGNORECASE,
)
_PARA_ID_RE = re.compile(r"paraId=([0-9A-Fa-f]{8})")
_BODY_P_PATH_RE = re.compile(r"(/body/p\[\d+\])")
_ANNOTATED_STYLE_RE = re.compile(r"style=(\w+)", re.IGNORECASE)
_H1_CHAPTER_RE = re.compile(r"^第[一二三四五六七八九十\d]+[章节部分篇]\s*\S")
_H1_CHAPTER_SHORT_RE = re.compile(r"^第[一二三四五六七八九十\d]+章")
_H2_NUMBERED_RE = re.compile(r"^\d+\.\d+\s+\S")
_H1_NUMBERED_RE = re.compile(r"^\d+\s+\S{2,40}$")


@dataclass
class FinalizeResult:
    """Outcome of post-agent docx finalization."""

    warnings: list[str] = field(default_factory=list)
    blocking: list[str] = field(default_factory=list)
    fixes: list[str] = field(default_factory=list)
    quality_status: str = "passed"  # passed | warnings | failed

    @property
    def job_status(self) -> str:
        """Docx exists after finalize — always mark job done; quality issues are logged only."""
        return "done"


def _officecli(args: list[str], *, timeout: int = 120) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )


def _annotated_text(docx: Path) -> str:
    if shutil.which("officecli") is None:
        return ""
    result = _officecli(["officecli", "view", str(docx), "annotated"])
    if result.returncode != 0:
        log.warning("annotated view failed for %s: %s", docx, (result.stderr or result.stdout).strip())
        return ""
    return result.stdout or ""


def toc_has_placeholder(docx: Path) -> bool:
    return bool(_TOC_MARKERS_RE.search(_annotated_text(docx)))


def doc_has_toc(docx: Path) -> bool:
    """True when document contains a TOC field or placeholder."""
    text = _annotated_text(docx)
    if not text:
        return False
    if _TOC_MARKERS_RE.search(text):
        return True
    return "目录" in text and re.search(r"\bfield\b|fldChar", text, re.IGNORECASE) is not None


def _find_title_para_id(docx: Path) -> str | None:
    text = _annotated_text(docx)
    if not text:
        return None
    for line in text.splitlines():
        if re.search(r"\bstyle=Title\b", line, re.IGNORECASE) or " Title]" in line:
            match = _PARA_ID_RE.search(line)
            if match:
                return match.group(1)
    match = _PARA_ID_RE.search(text)
    return match.group(1) if match else None


def _try_set_toc_prerender(docx: Path) -> bool:
    for path in ("/toc", "/tableofcontents"):
        for prop in ("pre-render", "prerender", "preRender"):
            result = _officecli(
                ["officecli", "set", str(docx), path, f"--prop={prop}=true"],
            )
            if result.returncode == 0:
                log.info("set %s %s=true on %s", path, prop, docx.name)
                return True
    return False


def _try_refresh(docx: Path) -> bool:
    result = _officecli(["officecli", "refresh", str(docx)])
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()
        log.info("officecli refresh failed for %s: %s", docx.name, detail)
        return False
    return True


def _try_reinsert_toc(docx: Path) -> bool:
    title_id = _find_title_para_id(docx)
    if not title_id:
        log.warning("cannot reinsert TOC: Title paraId not found in %s", docx.name)
        return False

    _officecli(["officecli", "remove", str(docx), "/toc"])
    _officecli(["officecli", "remove", str(docx), "/tableofcontents"])

    props = [
        "--prop=title=目录",
        "--prop=levels=1-3",
        "--prop=hyperlinks=true",
        "--prop=pre-render=true",
    ]
    args = [
        "officecli",
        "add",
        str(docx),
        "/body",
        "--type",
        "toc",
        "--after",
        f"/body/p[@paraId={title_id}]",
        *props,
    ]
    result = _officecli(args)
    if result.returncode != 0:
        args_no_prerender = [a for a in args if "pre-render" not in a]
        result = _officecli(args_no_prerender)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()
        log.warning("TOC reinsert failed for %s: %s", docx.name, detail)
        return False
    return True


def _try_libreoffice_refresh(docx: Path) -> bool:
    """Refresh fields via LibreOffice headless UNO script (Linux fallback)."""
    lo = shutil.which("soffice") or shutil.which("libreoffice")
    if lo is None:
        return False

    script = Path(__file__).resolve().parent / "libreoffice_refresh_fields.py"
    if not script.is_file():
        return False

    with tempfile.TemporaryDirectory(prefix="docx-finalize-") as tmp:
        out_dir = Path(tmp)
        result = subprocess.run(
            [lo, "--headless", "--invisible", "--python", str(script), str(docx), str(out_dir)],
            capture_output=True,
            text=True,
            timeout=180,
            check=False,
        )
        if result.returncode != 0:
            detail = (result.stderr or result.stdout or "").strip()
            log.info("LibreOffice field refresh failed for %s: %s", docx.name, detail)
            return False

        refreshed = out_dir / docx.name
        if refreshed.is_file() and refreshed.stat().st_size > 0:
            shutil.copy2(refreshed, docx)
            return True
    return False


def ensure_toc_rendered(docx: Path) -> list[str]:
    """Attempt to populate TOC field entries. Returns user-facing warnings."""
    if shutil.which("officecli") is None:
        return ["officecli 不可用，无法刷新目录"]

    if not toc_has_placeholder(docx):
        return []

    warnings: list[str] = []
    steps = (
        ("pre-render", lambda: _try_set_toc_prerender(docx) and _try_refresh(docx)),
        ("refresh", lambda: _try_refresh(docx)),
        ("reinsert", lambda: _try_reinsert_toc(docx) and _try_refresh(docx)),
        ("libreoffice", lambda: _try_libreoffice_refresh(docx)),
    )

    for name, step in steps:
        try:
            if step() and not toc_has_placeholder(docx):
                log.info("TOC rendered via %s for %s", name, docx.name)
                return warnings
        except (OSError, subprocess.TimeoutExpired) as exc:
            log.warning("TOC step %s failed for %s: %s", name, docx.name, exc)

    if toc_has_placeholder(docx):
        warnings.append(
            "目录域未能自动刷新；下载后在 Word/WPS 中按 Ctrl+A → F9 更新域，"
            "或右键目录选择「更新域」。"
        )
    return warnings


def run_officecli_validate(docx: Path) -> list[str]:
    """Run officecli validate --json; return blocking error messages."""
    if shutil.which("officecli") is None or not docx.is_file():
        return []

    result = _officecli(["officecli", "validate", str(docx), "--json"], timeout=180)
    if result.returncode == 0:
        return []

    errors: list[str] = []
    raw = (result.stdout or result.stderr or "").strip()
    if raw:
        try:
            payload = json.loads(raw)
            if isinstance(payload, dict):
                for key in ("errors", "issues", "messages"):
                    items = payload.get(key)
                    if not isinstance(items, list):
                        continue
                    for item in items:
                        if isinstance(item, str):
                            errors.append(item)
                        elif isinstance(item, dict):
                            level = str(item.get("level", item.get("severity", ""))).lower()
                            msg = item.get("message") or item.get("text") or str(item)
                            if level in ("error", "fatal", "") or not level:
                                errors.append(str(msg))
                if not errors and payload.get("valid") is False:
                    errors.append("OpenXML validate 未通过")
            elif isinstance(payload, list):
                errors.extend(str(x) for x in payload)
        except json.JSONDecodeError:
            errors.append(raw[:500])

    if not errors:
        errors.append("OpenXML validate 失败（officecli validate 非零退出）")
    return errors


def _fetch_plain_text(docx: Path) -> str:
    if shutil.which("officecli") is None or not docx.is_file():
        return ""
    result = _officecli(["officecli", "view", str(docx), "text"], timeout=120)
    if result.returncode != 0:
        return ""
    return result.stdout or ""


def check_delivery_gate_token_leaks(docx: Path) -> list[str]:
    """Gate 2 — placeholder tokens and shell-escape literals (officecli-docx Delivery Gate)."""
    text = _fetch_plain_text(docx)
    if not text:
        return []
    leaks: list[str] = []
    for i, line in enumerate(text.splitlines(), start=1):
        if _TOKEN_LEAK_RE.search(line):
            leaks.append(f"Gate2 文本泄漏（第 {i} 行）：{line.strip()[:80]}")
    return leaks


def _heading_count(docx: Path) -> int:
    if shutil.which("officecli") is None or not docx.is_file():
        return 0
    result = _officecli(["officecli", "view", str(docx), "outline", "--json"], timeout=60)
    if result.returncode != 0:
        return 0
    try:
        raw = json.loads(result.stdout or "{}")
    except json.JSONDecodeError:
        return 0
    headings = raw.get("headings") or raw.get("data", {}).get("headings") or []
    if isinstance(headings, list):
        return sum(
            1 for h in headings
            if isinstance(h, dict) and str(h.get("style", "")).lower().startswith("heading")
        )
    return 0


def check_delivery_gate_page_field(docx: Path) -> list[str]:
    """Gate 3 — live PAGE field when document has 3+ headings (multi-page reports)."""
    if _heading_count(docx) < 3:
        return []
    if shutil.which("officecli") is None:
        return []
    result = _officecli(
        ["officecli", "query", str(docx), "field[fieldType=page]", "--json"],
        timeout=60,
    )
    if result.returncode != 0:
        return ["Gate3 未检测到 live PAGE 域（query 失败）"]
    try:
        payload = json.loads(result.stdout or "{}")
        results = payload.get("data", {}).get("results", payload.get("results", []))
        if isinstance(results, list) and len(results) >= 1:
            return []
    except (json.JSONDecodeError, AttributeError):
        pass
    return ["Gate3 未检测到 live PAGE 域（多页文档需页脚页码 field=page）"]


def validate_figure_layout(docx: Path, options: JobOptions) -> list[str]:
    if not doc_has_figures(docx):
        return []
    return check_figure_layout_warnings(docx, options)



def _parse_annotated_paragraphs(text: str) -> list[dict[str, str]]:
    """Parse officecli annotated lines into paragraph metadata."""
    paragraphs: list[dict[str, str]] = []
    for line in text.splitlines():
        path_match = _BODY_P_PATH_RE.search(line)
        style_match = _ANNOTATED_STYLE_RE.search(line)
        if not path_match or not style_match:
            continue
        style = style_match.group(1)
        if re.search(r"listStyle=", line, re.IGNORECASE):
            continue
        text_start = style_match.end()
        para_text = line[text_start:].strip()
        para_text = re.sub(r"^←\s*\S+\s*", "", para_text).strip()
        paragraphs.append({
            "path": path_match.group(1),
            "style": style,
            "text": para_text,
            "para_id": _extract_para_id(line) or "",
            "line": line,
        })
    return paragraphs


def _normalize_outline_key(text: str) -> str:
    s = re.sub(r"^\d+[\.\)、]\s*", "", text.strip())
    s = re.sub(r"^第[一二三四五六七八九十\d]+[章节部分篇]\s*", "", s)
    return s.strip().lower()


def _caption_paths_from_query(docx: Path) -> list[tuple[str, str | None]]:
    """Return (path, align) for Caption paragraphs via officecli query."""
    result = _officecli(
        ["officecli", "query", str(docx), "paragraph[style=Caption]", "--json"],
        timeout=60,
    )
    if result.returncode != 0:
        return []
    try:
        payload = json.loads(result.stdout or "{}")
    except json.JSONDecodeError:
        return []
    results = payload.get("data", {}).get("results", payload.get("results", []))
    if not isinstance(results, list):
        return []
    out: list[tuple[str, str | None]] = []
    for item in results:
        if not isinstance(item, dict):
            continue
        path = str(item.get("path") or item.get("dataPath") or "").strip()
        if not path.startswith("/body/p"):
            continue
        fmt = item.get("format") or item.get("props") or {}
        align = str(fmt.get("align") or fmt.get("alignment") or "").strip().lower() or None
        out.append((path, align))
    return out


def _first_chapter_start(docx: Path) -> tuple[str | None, str | None]:
    """Return (body path, para_id) for the first chapter heading after TOC."""
    from backend.runner.preview import _load_outline_from_docx

    for h in _load_outline_from_docx(docx):
        if h.get("style") == "Heading1":
            path = h.get("data_path") or f"/body/p[{h.get('line', 0)}]"
            return path, None

    text = _fetch_annotated_text(docx)
    for line in text.splitlines():
        path_match = _BODY_P_PATH_RE.search(line)
        if not path_match:
            continue
        style_match = _ANNOTATED_STYLE_RE.search(line)
        if not style_match:
            continue
        para_text = line[style_match.end() :].strip()
        para_text = re.sub(r"^←\s*\S+\s*", "", para_text).strip()
        style = style_match.group(1)
        is_h1 = style.lower() == "heading1" or bool(_HEADING1_ANNOTATED_RE.search(line))
        if is_h1 or (style.lower() == "normal" and (
            _H1_CHAPTER_RE.match(para_text) or _H1_CHAPTER_SHORT_RE.match(para_text)
        )):
            return path_match.group(1), _extract_para_id(line)
    return None, None


def _paragraph_before_path(docx: Path, target_path: str) -> str | None:
    """Find annotated paraId of the paragraph immediately before target_path."""
    text = _fetch_annotated_text(docx)
    prev_para_id: str | None = None
    for line in text.splitlines():
        path_match = _BODY_P_PATH_RE.search(line)
        if path_match and path_match.group(1) == target_path:
            return prev_para_id
        pid = _extract_para_id(line)
        if pid:
            prev_para_id = pid
    return None


def ensure_toc_page_break(docx: Path) -> list[str]:
    """Insert page break before first chapter when document has a TOC."""
    if shutil.which("officecli") is None or not docx.is_file() or not doc_has_toc(docx):
        return []

    notes: list[str] = []
    h1_path, h1_para_id = _first_chapter_start(docx)

    if h1_path:
        prev_id = _paragraph_before_path(docx, h1_path)
        if prev_id:
            pb = _officecli([
                "officecli", "add", str(docx), "/body",
                "--type", "pagebreak",
                "--after", f"/body/p[@paraId={prev_id}]",
            ])
            if pb.returncode == 0:
                notes.append(f"已在首章前插入 pagebreak（after paraId={prev_id}）")
        result = _officecli([
            "officecli", "set", str(docx), h1_path, "--prop", "pageBreakBefore=true",
        ])
        if result.returncode == 0:
            notes.append(f"已设置首章分页 {h1_path}")
        return notes

    last_id = None
    text = _fetch_annotated_text(docx)
    for line in text.splitlines():
        pid = _extract_para_id(line)
        if pid:
            last_id = pid
    if last_id:
        inserted = _officecli([
            "officecli", "add", str(docx), "/body",
            "--type", "paragraph",
            "--prop", "text=",
            "--prop", "style=Normal",
            "--prop", "pageBreakBefore=true",
            "--after", f"/body/p[@paraId={last_id}]",
        ])
        if inserted.returncode == 0:
            notes.append("已在文档末尾插入 TOC 后分页段落")
    return notes


def normalize_caption_alignment(docx: Path) -> list[str]:
    """Center-align Caption paragraphs."""
    if shutil.which("officecli") is None or not docx.is_file():
        return []

    notes: list[str] = []
    captions = _caption_paths_from_query(docx)
    if not captions:
        text = _fetch_annotated_text(docx)
        for para in _parse_annotated_paragraphs(text):
            if para["style"].lower() != "caption":
                continue
            captions.append((para["path"], None))

    for path, align in captions:
        if align == "center":
            continue
        result = _officecli([
            "officecli", "set", str(docx), path, "--prop", "align=center",
        ])
        if result.returncode == 0:
            notes.append(f"已居中图题 {path}")

    return notes


def normalize_heading_styles(docx: Path, options: JobOptions) -> list[str]:
    """Promote high-confidence Normal paragraphs to Heading1/Heading2."""
    if shutil.which("officecli") is None or not docx.is_file():
        return []

    text = _fetch_annotated_text(docx)
    if not text:
        return []

    paragraphs = _parse_annotated_paragraphs(text)
    notes: list[str] = []
    upgraded: set[str] = set()

    outline_keys: list[str] = []
    if options.outline:
        outline_keys = [_normalize_outline_key(item) for item in options.outline if item]

    for para in paragraphs:
        path = para["path"]
        if path in upgraded:
            continue
        style = para["style"]
        if style.lower() not in ("normal",):
            continue
        para_text = para["text"]
        if not para_text or len(para_text) > 80:
            continue
        if re.search(r"\bCaption\b", para["line"], re.IGNORECASE):
            continue

        target_style: str | None = None

        norm_text = _normalize_outline_key(para_text)
        if outline_keys and norm_text in outline_keys:
            target_style = "Heading1"
        elif _H2_NUMBERED_RE.match(para_text):
            target_style = "Heading2"
        elif _H1_CHAPTER_RE.match(para_text) or _H1_CHAPTER_SHORT_RE.match(para_text):
            target_style = "Heading1"
        elif _H1_NUMBERED_RE.match(para_text):
            target_style = "Heading1"

        if not target_style:
            continue

        result = _officecli([
            "officecli", "set", str(docx), path, "--prop", f"style={target_style}",
        ])
        if result.returncode == 0:
            upgraded.add(path)
            notes.append(f"已将 {path} 升级为 {target_style}：{para_text[:40]}")

    if not notes:
        from backend.runner.preview import _load_outline_from_docx, filter_nav_headings

        headings = filter_nav_headings(_load_outline_from_docx(docx))
        if not headings:
            log.warning("normalize_heading_styles: still no Heading1/Heading2 in %s", docx.name)

    return notes


def _parse_all_annotated_paragraphs(text: str) -> list[dict[str, str]]:
    """Parse annotated lines including listStyle paragraphs."""
    paragraphs: list[dict[str, str]] = []
    for line in text.splitlines():
        path_match = _BODY_P_PATH_RE.search(line)
        style_match = _ANNOTATED_STYLE_RE.search(line)
        if not path_match or not style_match:
            continue
        style = style_match.group(1)
        list_match = re.search(r"listStyle=(ordered|bullet)", line, re.IGNORECASE)
        text_start = style_match.end()
        para_text = line[text_start:].strip()
        para_text = re.sub(r"^←\s*\S+\s*", "", para_text).strip()
        para_text = re.sub(r"listStyle=\w+\s*", "", para_text).strip()
        paragraphs.append({
            "path": path_match.group(1),
            "style": style,
            "text": para_text,
            "list_style": list_match.group(1).lower() if list_match else "",
            "line": line,
        })
    return paragraphs


_NON_BODY_STYLES = frozenset(
    {"heading1", "heading2", "heading3", "title", "subtitle", "caption", "toc"}
)


def normalize_body_and_list_indent(docx: Path) -> list[str]:
    """Fix body first-line indent and list hanging indent for natural Chinese layout."""
    if shutil.which("officecli") is None or not docx.is_file():
        return []

    text = _fetch_annotated_text(docx)
    if not text:
        return []

    notes: list[str] = []
    for para in _parse_all_annotated_paragraphs(text):
        path = para["path"]
        style_lower = para["style"].lower()
        if style_lower in _NON_BODY_STYLES:
            continue
        if para["list_style"]:
            result = _officecli([
                "officecli", "set", str(docx), path,
                "--prop", "firstLineIndent=0",
                "--prop", "indent=0",
                "--prop", "hangingIndent=360",
            ])
            if result.returncode == 0:
                notes.append(f"已调整列表缩进 {path}")
        elif style_lower == "normal":
            result = _officecli([
                "officecli", "set", str(docx), path,
                "--prop", "firstLineIndent=420",
                "--prop", "indent=0",
            ])
            if result.returncode == 0:
                notes.append(f"已调整正文首行缩进 {path}")

    return notes


def normalize_diagram_layout(docx: Path) -> list[str]:
    """Resize extreme diagram groups and insert spacer paragraphs after diagrams."""
    if shutil.which("officecli") is None or not docx.is_file():
        return []

    notes: list[str] = []

    for idx in range(1, 25):
        result = _officecli(["officecli", "get", str(docx), f"/body/group[{idx}]", "--json"])
        if result.returncode != 0:
            break
        try:
            payload = json.loads(result.stdout or "{}")
            results = payload.get("data", {}).get("results", [])
            if not results:
                break
            fmt = results[0].get("format", {})
            width_cm = _length_value_to_cm(str(fmt.get("width", "")))
            height_cm = _length_value_to_cm(str(fmt.get("height", "")))
            if width_cm is None or height_cm is None:
                continue
            if height_cm > _MAX_DIAGRAM_HEIGHT_CM or _diagram_extreme_aspect(width_cm, height_cm):
                resized = _officecli([
                    "officecli",
                    "set",
                    str(docx),
                    f"/body/group[{idx}]",
                    "--prop",
                    "width=14cm",
                    "--prop",
                    "height=10cm",
                ])
                if resized.returncode == 0:
                    notes.append(f"已调整图表 group[{idx}] 为 14×10cm")
        except (json.JSONDecodeError, KeyError, TypeError):
            break

    text = _fetch_annotated_text(docx)
    if not text:
        return notes

    lines = text.splitlines()
    spacer_para_ids: list[str] = []
    for i, line in enumerate(lines):
        if not _is_diagram_annotated_line(line):
            continue
        if i + 1 < len(lines) and _HEADING1_ANNOTATED_RE.search(lines[i + 1]):
            para_id = _extract_para_id(line)
            if para_id:
                spacer_para_ids.append(para_id)

    for para_id in reversed(spacer_para_ids):
        inserted = _officecli([
            "officecli",
            "add",
            str(docx),
            "/body",
            "--type",
            "paragraph",
            "--prop",
            "text=",
            "--prop",
            "style=Normal",
            "--prop",
            "spaceAfter=24pt",
            "--after",
            f"/body/p[@paraId={para_id}]",
        ])
        if inserted.returncode == 0:
            notes.append(f"已在图表后插入 spacer（paraId={para_id}）")

    return notes


def _extract_figure_key(line: str) -> tuple[int, int] | None:
    match = _FIGURE_CAPTION_RE.search(line)
    if not match:
        return None
    return int(match.group(1)), int(match.group(2))


def _extract_group_index(line: str) -> int | None:
    match = _GROUP_PATH_RE.search(line)
    if match:
        return int(match.group(1))
    return None


def reposition_misplaced_diagrams(docx: Path) -> list[str]:
    """Move floating diagram groups immediately after their caption paragraph."""
    if shutil.which("officecli") is None or not docx.is_file():
        return []

    text = _fetch_annotated_text(docx)
    if not text:
        return []

    lines = text.splitlines()
    notes: list[str] = []

    captions: list[tuple[int, str, tuple[int, int] | None]] = []
    diagrams: list[tuple[int, str, int | None]] = []

    for i, line in enumerate(lines):
        if _FIGURE_CAPTION_LABEL_RE.search(line):
            para_id = _extract_para_id(line)
            if para_id:
                captions.append((i, para_id, _extract_figure_key(line)))
        if _is_diagram_annotated_line(line) or _GROUP_PATH_RE.search(line):
            para_id = _extract_para_id(line)
            group_idx = _extract_group_index(line)
            if para_id or group_idx is not None:
                diagrams.append((i, para_id or "", group_idx))

    for cap_line_idx, cap_para_id, cap_key in captions:
        adjacent = False
        for dia_line_idx, _, _ in diagrams:
            if cap_line_idx < dia_line_idx <= cap_line_idx + 2:
                adjacent = True
                break
        if adjacent:
            continue

        target_group: int | None = None
        if cap_key:
            for dia_line_idx, _, group_idx in diagrams:
                if group_idx is None:
                    continue
                if dia_line_idx <= cap_line_idx:
                    continue
                if cap_line_idx < dia_line_idx <= cap_line_idx + 15:
                    target_group = group_idx
                    break
        if target_group is None:
            for _, _, group_idx in diagrams:
                if group_idx is not None:
                    target_group = group_idx
                    break
        if target_group is None:
            continue

        moved = _officecli([
            "officecli",
            "move",
            str(docx),
            f"/body/group[{target_group}]",
            "--after",
            f"/body/p[@paraId={cap_para_id}]",
        ])
        if moved.returncode == 0:
            notes.append(
                f"已将 group[{target_group}] 移至图题后（paraId={cap_para_id}）"
            )
            text = _fetch_annotated_text(docx)
            if text:
                lines = text.splitlines()

    return notes



def write_validation_report(project_dir: Path | None, result: FinalizeResult) -> None:
    if not project_dir:
        return
    path = Path(project_dir) / VALIDATION_REPORT_NAME
    payload = {
        "quality_status": result.quality_status,
        "job_status": result.job_status,
        "warnings": result.warnings,
        "blocking": result.blocking,
        "fixes": result.fixes,
    }
    try:
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError as exc:
        log.warning("failed to write validation report: %s", exc)


def load_validation_report(project_dir: Path | None) -> dict | None:
    if not project_dir:
        return None
    path = Path(project_dir) / VALIDATION_REPORT_NAME
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def finalize_docx(
    docx: Path,
    options: JobOptions,
    *,
    project_dir: Path | None = None,
) -> FinalizeResult:
    """Run post-agent finalization with hard quality gate."""
    result = FinalizeResult()
    warnings: list[str] = []

    if doc_has_toc(docx):
        warnings.extend(ensure_toc_rendered(docx))
        if toc_has_placeholder(docx):
            result.blocking.append("目录仍为 placeholder，未能自动刷新")

    result.fixes.extend(normalize_heading_styles(docx, options))
    if doc_has_toc(docx):
        result.fixes.extend(ensure_toc_page_break(docx))
    result.fixes.extend(normalize_caption_alignment(docx))
    result.fixes.extend(normalize_body_and_list_indent(docx))

    if doc_has_figures(docx):
        result.fixes.extend(normalize_diagram_layout(docx))
        result.fixes.extend(reposition_misplaced_diagrams(docx))
        warnings.extend(validate_figure_layout(docx, options))
        adjacency = check_figure_adjacency_warnings(docx)
        warnings.extend(adjacency)
        result.blocking.extend(check_figure_layout_blocking(docx, options))
        for msg in adjacency:
            if "未相邻" in msg or "间隔过大" in msg:
                if msg not in result.blocking:
                    result.blocking.append(msg)
        warnings.extend(check_caption_alignment_warnings(docx))

    warnings.extend(check_list_format_warnings(docx))
    heading_warnings = check_heading_hierarchy_warnings(docx, options)
    warnings.extend(heading_warnings)

    validate_errors = run_officecli_validate(docx)
    for err in validate_errors:
        result.blocking.append(f"OpenXML 校验：{err}")

    for leak in check_delivery_gate_token_leaks(docx):
        result.blocking.append(leak)
    for page_err in check_delivery_gate_page_field(docx):
        result.blocking.append(page_err)

    seen_blocking = set(result.blocking)
    for w in warnings:
        if w in seen_blocking:
            continue
        result.warnings.append(w)

    if result.blocking:
        result.quality_status = "failed"
    elif result.warnings:
        result.quality_status = "warnings"
    else:
        result.quality_status = "passed"

    write_validation_report(project_dir, result)
    return result


def finalize_docx_legacy(docx: Path, options: JobOptions) -> list[str]:
    """Backward-compatible wrapper returning flat warning list."""
    result = finalize_docx(docx, options)
    return result.blocking + result.warnings
