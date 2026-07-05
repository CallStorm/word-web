"""Pipeline stage classification and project path helpers."""
from __future__ import annotations

import json
import re
from pathlib import Path

STAGE_RULES: list[tuple[callable, str]] = [
    (lambda c, f, w: "source_to_md" in c or ("officecli" in c and "view" in c and "text" in c), "1 解析素材"),
    (lambda c, f, w: "outline.md" in f or "load_skill" in c, "2 规划大纲"),
    (lambda c, f, w: "view" in c and "outline" in c, "3 分析结构"),
    (lambda c, f, w: "officecli add" in c or "officecli set" in c or "officecli batch" in c or "officecli create" in c, "4 文档构建"),
    (lambda c, f, w: "view" in c and "issues" in c or "validate" in c, "5 质量检查"),
    (lambda c, f, w: "exports/" in f and ".docx" in f or "officecli close" in c, "6 导出完成"),
]

OUTLINE_RE = re.compile(r"outline\.md$", re.IGNORECASE)
SPEC_RE = OUTLINE_RE
SECTION_RE = re.compile(r"Heading1|章节|第.章", re.IGNORECASE)


def classify_stage(command: str, file_path: str, *, write: bool | None = None) -> str | None:
    for match, stage in STAGE_RULES:
        try:
            if match(command, file_path, write):
                return stage
        except Exception:
            continue
    return None


def resolve_project_dir(project_name: str, root: Path) -> Path | None:
    hits: list[Path] = []
    for base in (root / "projects", root):
        if not base.is_dir():
            continue
        hits.extend(
            p for p in base.iterdir()
            if p.is_dir() and p.name.startswith(project_name)
        )
    if not hits:
        return root if root.is_dir() else None
    return max(hits, key=lambda p: p.stat().st_mtime)


def find_docx(root: Path) -> Path | None:
    if not root or not root.exists():
        return None
    exports = root / "exports"
    search = [exports, root] if exports.is_dir() else [root]
    hits: list[Path] = []
    for base in search:
        hits.extend(base.rglob("*.docx"))
    if not hits:
        return None
    return max(hits, key=lambda p: p.stat().st_mtime)


# Backward compat alias
find_pptx = find_docx


def _project_snapshot(root: Path) -> tuple:
    if not root or not root.exists():
        return (0, 0, 0.0, ())
    files = [p for p in root.rglob("*") if p.is_file()]
    total_size = 0
    max_mtime = 0.0
    names = []
    for p in files:
        try:
            st = p.stat()
            total_size += st.st_size
            if st.st_mtime > max_mtime:
                max_mtime = st.st_mtime
            names.append(str(p.relative_to(root)))
        except OSError:
            pass
    return (len(files), total_size, max_mtime, tuple(sorted(names)))


def build_initial_prompt(
    prompt: str,
    project_name: str,
    project_root: Path,
    upload_paths: list[str] | None = None,
    *,
    mount_path: str | None = None,
    host_prefix: str | None = None,
    options=None,
    template_path: str | None = None,
    job_id: str | None = None,
) -> str:
    if mount_path and host_prefix:
        project_root_str = str(project_root).replace(host_prefix, mount_path, 1)
        if upload_paths:
            upload_paths = [p.replace(host_prefix, mount_path) for p in upload_paths]
    else:
        project_root_str = str(project_root)

    parts = [
        "请加载 skills/word-master/SKILL.md，按其中 pipeline 生成 Word 文档（.docx）。",
        "构建标准以 skills/officecli-docx/SKILL.md 为准，必须完成 Delivery Gate。",
        "scenario=academic 时执行 officecli load_skill academic-paper，否则 officecli load_skill word。",
        "",
        "## 运行模式",
        "web（路径约定见 skills/word-master/references/web-mode.md）",
        "",
        f"项目目录名: {project_name}",
        f"WORK_ROOT: {project_root_str}",
    ]
    if job_id:
        parts.append(f"JOB_ID: {job_id}")
    parts.extend([
        "",
        "交付契约：",
        "- 产物写入 WORK_ROOT；最终 .docx 在 exports/",
        "- 封面、目录、表格、图表：仅当用户 prompt 明确要求时添加",
        "- session 内用 officecli 增量构建；handoff 前 officecli close",
        "- 预览（封面 PNG / HTML / 大纲）由 host 在 finalize 后自动生成，Agent 勿运行预览脚本",
        "- 明确报告 exports/*.docx 路径",
        "- 章节用 Heading1，小节用 Heading2；若用户提供 outline，每项映射为一个 Heading1",
        "",
    ])
    if upload_paths:
        uploads_dir = str(Path(project_root_str).parent.parent / "uploads" / (job_id or ""))
        parts.append(f"UPLOADS_DIR: {uploads_dir}")
        parts.append("用户已上传的素材文件:")
        for up in upload_paths:
            parts.append(f"  - {up}")
        parts.append("")
        parts.append("建议命令:")
        parts.append(
            f"  python3 skills/word-master/scripts/source_to_md.py "
            f"\"{uploads_dir}\" -o \"{project_root_str}/sources/summary.md\""
        )
        parts.append("")
    if options is not None:
        from backend.api.schemas.job_options import format_options_for_prompt

        parts.append(format_options_for_prompt(options))
        parts.append("")
        opts_json = json.dumps(options.model_dump(), ensure_ascii=False)
        parts.append(f"JOB_OPTIONS_JSON: {opts_json}")
        parts.append("")
    parts.append("用户内容：")
    parts.append(prompt)
    return "\n".join(parts)
