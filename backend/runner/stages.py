"""Pipeline stage classification and project path helpers."""
from __future__ import annotations

import json
import re
from pathlib import Path

STAGE_RULES: list[tuple[callable, str]] = [
    (lambda c, f, w: "source_to_md" in c or ("officecli" in c and "view" in c and "text" in c), "1 解析素材"),
    (lambda c, f, w: "outline.md" in f or "load_skill" in c, "2 规划大纲"),
    (lambda c, f, w: "analyze_template" in c or ("dump" in c and "officecli" in c) or ("view" in c and "outline" in c), "3 分析模板"),
    (lambda c, f, w: "officecli merge" in c or " merge " in c, "4 模板合并"),
    (lambda c, f, w: "officecli add" in c or "officecli set" in c or "officecli batch" in c or "officecli create" in c, "5 文档构建"),
    (lambda c, f, w: "view" in c and "issues" in c or "validate" in c, "6 质量检查"),
    (lambda c, f, w: "exports/" in f and ".docx" in f or "officecli close" in c, "7 导出完成"),
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
        if template_path:
            template_path = template_path.replace(host_prefix, mount_path, 1)
    else:
        project_root_str = str(project_root)

    parts = [
        "请先用 read_file 读取 skills/word-master/SKILL.md，然后严格按其工作流执行，"
        "为以下内容生成一份 Word 文档（.docx）。",
        "",
        "## 运行模式",
        "web（参见 skills/word-master/references/web-mode.md）",
        "",
        f"项目目录名使用: {project_name}",
        f"WORK_ROOT: {project_root_str}",
    ]
    if job_id:
        parts.append(f"JOB_ID: {job_id}")
    if template_path:
        parts.append(f"TEMPLATE_PATH: {template_path}")
    template_data_path = None
    if options is not None and getattr(options, "template_data", None):
        template_data_path = str(Path(project_root_str) / "data.json")
        parts.append(f"TEMPLATE_DATA_PATH: {template_data_path}")
        parts.append(
            "若 TEMPLATE_DATA_PATH 存在：优先走 template-merge（officecli merge），"
            "无需 AI 推断已有字段；仅对缺失字段从 prompt 补充。"
        )
    parts.extend([
        "",
        "重要约束：",
        "1. 所有产物写入 WORK_ROOT，最终 .docx 必须在 exports/ 目录下。",
        "2. 先运行 source_to_md.py 解析上传素材，再写 outline.md，再构建文档。",
        "3. 使用 officecli 操作文档；不确定语法时运行 officecli help docx。",
        "4. 构建文档时必须为文档标题设置 style=Title，章节设置 style=Heading1，正文设置 style=Normal；"
        "禁止用 Normal+加粗代替标题；交付前用 officecli view outline 自检。",
        "5. 交付前必须 officecli view issues 和 officecli validate。",
        "6. 完成导出后运行 bash skills/word-master/scripts/generate_preview.sh 生成 .preview/page-*.png。",
        "7. 完成导出后明确告知 exports 下生成的 .docx 路径。",
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
