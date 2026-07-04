"""Revision (post-completion modification) pipeline.

When the user clicks "Edit" on a done job, this module:

  1. Validates the source job (status==done, has project_dir on disk).
  2. Creates a new job row in 'queued' state with revision_of_job_id
     pointing at the source. The new job is owned by the same user and
     inherits project_name + options.
  3. Copies the source's project_dir into the new job's project_root
     (so the agent's filesystem view is self-contained).
  4. Constructs the modification prompt (with a fallback template for
     the no-session case, see ``_build_revision_prompt``).
  5. Decrements the user's quota_credits by 1 and writes pending_confirm
     so the dispatcher picks it up and runs ``claude --resume <sid> -p``.

Why a new job, not in-place mutation
------------------------------------
A single ``session_id`` is a linear progression in the LLM. Mixing the
"create" run and a "modify" run on the same row would surface the
intermediate state in the UI in a confusing way. A new job gives the
revision its own status / cost / events / cancel, and lets the
revision_of_job_id field give the UI a clean "v2" link.

Why a copy of project_dir
-------------------------
Docker mounts the new job's project_root into the container. The source
project_dir lives under a different job_id subtree, so without copying
the agent would not see the original SVGs / images / exports. We copy
(``shutil.copytree``) so the new run is fully isolated; on failure we
can simply delete the copy without touching the source.
"""
from __future__ import annotations

import json
import logging
import shutil
import uuid
from pathlib import Path
from typing import Sequence

from backend.api.schemas.job_options import GlobalRevision, RevisionItem
from backend.paths import project_root_for


def _SessionLocal():
    """Late-bound SessionLocal so this module can be imported on Python
    3.14 / SQLAlchemy 2.x test environments without paying the
    model-registration cost (which trips a 3.14 typing.Union bug)."""
    from backend.db.session import SessionLocal as _SL
    return _SL

log = logging.getLogger("backend.runtime.revisions")

# Names of artifacts that the agent's edit/write work does NOT need to
# see. Kept small to keep the revision copy fast; expand if needed.
_COPY_IGNORE_DIRS: tuple[str, ...] = (
    "__pycache__",
    ".git",
    "node_modules",
    "venv",
    ".venv",
)

_COPY_IGNORE_FILES: tuple[str, ...] = (
    "a.out",  # accidental build artifacts occasionally land in project dirs
)


def copy_project_dir(src: Path, dst_root: Path, project_name: str) -> Path:
    """Copy the entire ``src`` project directory into ``dst_root/<project_name>``.

    Returns the new path. ``dst_root`` is the per-user
    ``data/users/<uid>/projects/<new_job_id>/`` — the agent's mount root.
    """
    if not src.is_dir():
        raise FileNotFoundError(f"source project_dir does not exist: {src}")
    dst = dst_root / project_name
    if dst.exists():
        # Idempotency: if a previous attempt left a copy behind, blow it
        # away. We never want a half-copy to leak into a new revision.
        shutil.rmtree(dst, ignore_errors=True)

    def _ignore(_dir: str, names: Sequence[str]) -> list[str]:
        ignored: list[str] = []
        for n in names:
            if n in _COPY_IGNORE_DIRS:
                ignored.append(n)
            elif n in _COPY_IGNORE_FILES:
                ignored.append(n)
        return ignored

    shutil.copytree(
        src,
        dst,
        symlinks=False,
        ignore=_ignore,
        ignore_dangling_symlinks=True,
    )
    return dst


# ---------------------------------------------------------------------------
# Prompt templates
# ---------------------------------------------------------------------------


def _format_items_for_prompt(
    items: list[RevisionItem],
    slide_lookup: dict[int, str] | None = None,
) -> str:
    """Render each comment as ``- 第 N 页（<name>）: <comment>`` if we have
    a name lookup, else just ``- 第 N 页: <comment>``."""
    lines: list[str] = []
    for it in items:
        if slide_lookup and it.slide_index in slide_lookup:
            lines.append(
                f"- 第 {it.slide_index} 页（{slide_lookup[it.slide_index]}）: {it.comment}"
            )
        else:
            lines.append(f"- 第 {it.slide_index} 页: {it.comment}")
    return "\n".join(lines)


def _word_docx_path_hint() -> str:
    return (
        "定位文档：Read outline.md 了解结构；运行 "
        "`python3 skills/word-master/scripts/find_docx.py <project_dir>` 找到 exports/*.docx；"
        "用 `officecli view <docx> outline` 查看段落层级。"
    )


def _word_postprocess_steps() -> str:
    return (
        "后处理（修改 docx 后必须执行）：\n"
        "1. `officecli view <docx> issues --json` 与 `officecli validate <docx>`\n"
        "2. `bash skills/word-master/scripts/generate_preview.sh <project_dir>`\n"
        "3. 确认 exports/*.docx 仍为最终产物\n"
    )


def _word_figure_insertion_rules() -> str:
    return (
        "插图/架构图（若用户要求增加图、表图、流程图、架构图）：\n"
        "- 图题段落与图片/diagram **必须相邻**（图题在上、图在下），禁止图题与图片相隔数十段\n"
        "- **禁止**无定位的 `officecli add <docx> /body`（会追加到文档末尾）；"
        "先用 `officecli view <docx> annotated` 找到锚点段落的 paraId 或 `[段落 /body/p[N]]`，"
        "再用 `--after '/body/p[@paraId=...]'` 或 `--after /body/p[N]` 插入\n"
        "- 推荐顺序：① `--type paragraph` 插入图题（Caption 或 Normal，勿用 Heading 充当图题）"
        " ② 紧接 `--type diagram` 或 `--type image --prop src=...` 插在图题段之后\n"
        "- 完成后自检：`officecli view <docx> annotated`，确认图题下 1–2 段内出现 `[Image:` 或 diagram；"
        "若图片落在文档末尾而图题在前部，视为失败，需删除错位图片并 `--after` 重插\n"
        "- 详见 `skills/word-master/workflows/revision-figures.md`\n"
    )


def _global_revision_user_text(gr: GlobalRevision) -> str:
    """Human-readable global revision block for mixed prompts."""
    if gr.kind == "content":
        parts: list[str] = []
        if gr.content_preset:
            parts.append(_CONTENT_PRESET_TEXT.get(gr.content_preset, gr.content_preset))
        if gr.comment and gr.comment.strip():
            parts.append(gr.comment.strip())
        return "\n".join(parts) if parts else "调整全文内容"
    if gr.kind == "custom" and gr.comment:
        return gr.comment.strip()
    return format_global_revision_summary(gr)


def _build_mixed_revision_prompt(
    old_job_id: str,
    items: list[RevisionItem],
    gr: GlobalRevision,
    has_session: bool,
    slide_names: dict[int, str] | None,
    page_count: int,
) -> str:
    items_text = _format_items_for_prompt(items, slide_names)
    global_text = _global_revision_user_text(gr)
    session_note = ""
    if not has_session:
        session_note = (
            "注意：原 session 不可用，你拿不到完整对话历史；请基于 project_dir 自助修改。\n\n"
        )
    return (
        f"{session_note}"
        f"用户对已完成 Word 文档 (job {old_job_id}) 提出**逐页批注 + 全局修改**（文档约 {page_count} 页），请一并完成：\n\n"
        f"## 逐页批注\n{items_text}\n\n"
        f"## 全局修改（{gr.kind}）\n{global_text}\n\n"
        "操作步骤：\n"
        f"1. {_word_docx_path_hint()}\n"
        "2. 先按逐页批注定位修改；comment 含 `[段落 /body/p[N]]` 时用 `officecli view <docx> annotated` 对照\n"
        "3. 再执行全局修改要求；保留 Title/Heading1/Normal 样式层级\n"
        f"4. {_word_figure_insertion_rules()}\n"
        f"5. {_word_postprocess_steps()}\n"
        f"{_common_revision_constraints()}"
    )


def _build_revision_prompt(
    old_job_id: str,
    items: list[RevisionItem],
    has_session: bool,
    slide_names: dict[int, str] | None,
) -> str:
    """Build the user-facing prompt that the agent will read."""
    items_text = _format_items_for_prompt(items, slide_names)
    if has_session:
        return (
            f"用户对已完成 Word 文档 (job {old_job_id}) 提出如下修改意见，请只改这些页/节、保留其它部分不动：\n\n"
            f"{items_text}\n\n"
            "操作步骤：\n"
            f"1. {_word_docx_path_hint()}\n"
            "2. 将用户指定的「第 N 页」对应到 docx 中的段落/节（可用 preview 页码或 outline 顺序定位）；"
            "若 comment 含 `[段落 /body/p[N]]`，用 `officecli view <docx> annotated` 对照 data-path 定位\n"
            "3. 用 `officecli set/add/batch` 修改对应内容；保留 Title/Heading1/Normal 样式层级\n"
            "   若 comment 含 `[位置 x%,y%]`（旧格式），按页码与坐标区域定位\n"
            f"4. {_word_figure_insertion_rules()}\n"
            f"5. {_word_postprocess_steps()}\n"
            "6. 完成后只回复「修改完成」四个字，结束本轮\n\n"
            "硬性约束：\n"
            "- 不要修改用户未提及的页/节\n"
            "- 不要进入 Eight Confirmations 等需要用户交互的环节\n"
            "- 这一轮只跑一次；想再改就让用户重新提交\n"
        )
    return (
        f"用户对已完成 Word 文档 (job {old_job_id}) 提出修改意见。注意：原 session 不可用，"
        f"你拿不到之前的完整对话历史；请基于 project_dir 自助修改。\n\n"
        f"修改意见：\n{items_text}\n\n"
        "操作步骤：\n"
        f"1. {_word_docx_path_hint()}\n"
        "2. 仅修改用户列出的页/节；保留其它部分不动\n"
        f"3. {_word_figure_insertion_rules()}\n"
        f"4. {_word_postprocess_steps()}\n"
        "5. 完成后只回复「修改完成」四个字，结束本轮\n\n"
        "硬性约束：同上（不动未提及页/节、不进交互环节）\n"
    )


_CONTENT_PRESET_TEXT: dict[str, str] = {
    "concise": "全文更简洁，删冗余、缩短句子，保留核心信息",
    "formal": "语气更正式、更专业",
    "translate_en": "将全文翻译成英文（标题、正文、图表标注均翻译）",
    "glossary": "统一专业术语表述，前后一致",
}

_COLOR_KEY_LABELS: dict[str, str] = {
    "primary": "主色",
    "accent": "强调色",
    "bg": "背景",
    "text": "正文",
    "text_secondary": "次要文字",
    "border": "边框",
}


def format_global_revision_summary(gr: GlobalRevision) -> str:
    """One-line human summary for version history UI."""
    if gr.kind == "colors" and gr.color_changes:
        parts = []
        for key, val in gr.color_changes.items():
            label = _COLOR_KEY_LABELS.get(key, key)
            parts.append(f"{label} → {val}")
        return "换配色（" + "；".join(parts) + "）"
    if gr.kind == "typography" and gr.font_family:
        return f"换字体（{gr.font_family[:60]}）"
    if gr.kind == "visual_style" and gr.visual_style:
        return f"视觉风格 → {gr.visual_style}"
    if gr.kind == "content":
        preset = _CONTENT_PRESET_TEXT.get(gr.content_preset or "", "")
        if preset and gr.comment and gr.comment.strip():
            return f"改内容（{preset}；{gr.comment.strip()[:80]}）"
        if preset:
            return f"改内容（{preset}）"
        if gr.comment:
            return f"改内容（{gr.comment.strip()[:120]}）"
    if gr.kind == "custom" and gr.comment:
        return gr.comment.strip()[:120]
    return gr.kind


def _common_revision_constraints() -> str:
    return (
        "硬性约束：\n"
        "- 不要进入 Eight Confirmations 等需要用户交互的环节\n"
        "- 不要修改用户未明确要求的页/节\n"
        "- 这一轮只跑一次；完成后只回复「修改完成」四个字，结束本轮\n"
    )


def _build_global_revision_prompt(
    old_job_id: str,
    gr: GlobalRevision,
    page_count: int,
    has_session: bool,
) -> str:
    """Build agent prompt for document-wide modifications."""
    session_note = ""
    if not has_session:
        session_note = (
            "注意：原 session 不可用，你拿不到完整对话历史；"
            "请基于 project_dir 自助修改。\n\n"
        )

    kind_intro = (
        f"用户对已完成 Word 文档 (job {old_job_id}) 提出**全局修改**（共 {page_count} 页），"
        f"类型：{gr.kind}。\n\n"
    )

    if gr.kind in ("colors", "typography", "visual_style"):
        return (
            f"{session_note}{kind_intro}"
            "此类型修改请转为 officecli 文档操作：\n"
            f"1. {_word_docx_path_hint()}\n"
            "2. 用 `officecli set` 调整样式或段落格式；不要修改 /styles /theme（模板约束）\n"
            f"3. {_word_postprocess_steps()}\n"
            f"{_common_revision_constraints()}"
        )

    if gr.kind == "content":
        preset_line = ""
        if gr.content_preset:
            preset_line = f"内容基调：{_CONTENT_PRESET_TEXT[gr.content_preset]}\n"
        comment_line = ""
        if gr.comment and gr.comment.strip():
            comment_line = f"用户补充：{gr.comment.strip()}\n"
        return (
            f"{session_note}{kind_intro}"
            f"{preset_line}{comment_line}\n"
            "操作步骤：\n"
            f"1. {_word_docx_path_hint()}\n"
            f"2. 按基调修改全文文案（共约 {page_count} 页）；保留 Title/Heading1/Normal 样式\n"
            "3. 尽量用 `officecli set --prop find=... --prop replace=...` 或 batch 小改\n"
            f"4. {_word_postprocess_steps()}\n"
            f"{_common_revision_constraints()}"
        )

    comment = (gr.comment or "").strip()
    return (
        f"{session_note}{kind_intro}"
        f"用户全局指令：\n{comment}\n\n"
        "请自行判断操作轻重，使用 officecli 修改 docx：\n"
        "- 改文案 → set/batch 替换\n"
        "- 改结构 → add/remove/move 段落，保持样式层级\n"
        f"{_word_postprocess_steps()}\n"
        f"{_common_revision_constraints()}"
    )


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


class RevisionError(Exception):
    """User-visible error from queue_revision. Subclassed to keep the
    route handler's error translation simple."""


def queue_revision(
    *,
    old_job_id: str,
    user_id: str,
    items: list[RevisionItem] | None = None,
    global_revision: GlobalRevision | None = None,
    slide_names: dict[int, str] | None = None,
    page_count: int = 0,
) -> str:
    """Validate, copy project_dir, create a new job, deduct credit, queue
    a resume. Returns the new job's id. Raises ``RevisionError`` on
    validation failures (no credit, source not done, no project_dir, …).
    """
    # Both ``Job`` and ``User`` are imported lazily here so that the
    # module can be loaded (and unit-tested) in environments where the
    # SQLAlchemy 2.0 + Python 3.14 typing.Union path is broken. Tests
    # patch ``_SessionLocal`` and ``notify_dispatcher`` and never reach
    # the real ``backend.models`` import.
    from backend.models import Job, User  # noqa: WPS433

    is_global = global_revision is not None
    has_items = bool(items)
    if not has_items and not is_global:
        raise RevisionError("at least one revision item or global_revision is required")

    new_job_id = str(uuid.uuid4())
    log.info(
        "queue_revision: old=%s new=%s user=%s global=%s items=%d",
        old_job_id,
        new_job_id,
        user_id,
        is_global,
        len(items or []),
    )

    with _SessionLocal()() as s:
        old = s.get(Job, old_job_id)
        if not old:
            raise RevisionError(f"source job {old_job_id} not found")
        if old.user_id != user_id:
            raise RevisionError("source job does not belong to this user")
        if old.status != "done":
            raise RevisionError(
                f"source job status is {old.status!r}; only 'done' jobs are editable"
            )
        if not old.project_dir or not Path(old.project_dir).is_dir():
            raise RevisionError(
                "source job's project_dir is missing on disk; cannot edit"
            )

        # ── Deduct credit BEFORE any filesystem work ──
        u = s.get(User, user_id)
        if not u:
            raise RevisionError("user not found")
        if u.quota_credits <= 0:
            raise RevisionError("quota exhausted; cannot start revision")
        u.quota_credits -= 1

        # ── Compose options: inherit from old job, attach revision payload ──
        try:
            old_opts = json.loads(old.options_json) if old.options_json else {}
        except json.JSONDecodeError:
            old_opts = {}
        old_opts.pop("revision_items", None)
        old_opts.pop("global_revision", None)
        old_opts.pop("revision_mode", None)

        if is_global and global_revision and has_items:
            old_opts["revision_mode"] = "mixed"
            old_opts["revision_items"] = [it.model_dump() for it in items]
            old_opts["global_revision"] = global_revision.model_dump()
            prompt = _build_mixed_revision_prompt(
                old_job_id=old_job_id,
                items=items,
                gr=global_revision,
                has_session=bool(old.session_id),
                slide_names=slide_names,
                page_count=page_count or 1,
            )
        elif is_global and global_revision:
            old_opts["revision_mode"] = "global"
            old_opts["global_revision"] = global_revision.model_dump()
            prompt = _build_global_revision_prompt(
                old_job_id=old_job_id,
                gr=global_revision,
                page_count=page_count or 1,
                has_session=bool(old.session_id),
            )
        else:
            old_opts["revision_mode"] = "per_page"
            old_opts["revision_items"] = [it.model_dump() for it in (items or [])]
            prompt = _build_revision_prompt(
                old_job_id=old_job_id,
                items=items or [],
                has_session=bool(old.session_id),
                slide_names=slide_names,
            )
        new_options_json = json.dumps(old_opts, ensure_ascii=False)

        # Project name gets a -r2 / -r3 suffix so it doesn't clash with
        # the parent's project_dir (which lives in a different job root).
        new_project_name = f"{old.project_name}-r{_revision_index(old, s) + 2}"

        # ── Create the new job row in queued state ──
        s.add(Job(
            id=new_job_id,
            user_id=user_id,
            prompt=prompt,
            project_name=new_project_name,
            status="queued",
            require_confirm=False,
            options_json=new_options_json,
            session_id=old.session_id,  # resume target
            revision_of_job_id=old.id,
        ))
        s.commit()

    # ── Copy the project_dir into the new job's project_root ──
    new_root = project_root_for(user_id, new_job_id)
    new_root.mkdir(parents=True, exist_ok=True)
    try:
        new_project_dir = copy_project_dir(
            src=Path(old.project_dir),
            dst_root=new_root,
            project_name=new_project_name,
        )
    except Exception as e:
        # Roll back the credit + mark job failed so we don't leak a queued
        # job that the dispatcher will pick up against a missing dir.
        log.error("copy_project_dir failed for %s: %s", new_job_id, e)
        with _SessionLocal()() as s:
            j = s.get(Job, new_job_id)
            if j:
                j.status = "failed"
                j.error_message = f"failed to copy project_dir: {e}"
                s.commit()
            u = s.get(User, user_id)
            if u:
                u.quota_credits += 1
                s.commit()
        raise RevisionError(f"failed to copy source deck: {e}") from e

    # ── Persist the new project_dir on the job so /preview finds it ──
    with _SessionLocal()() as s:
        j = s.get(Job, new_job_id)
        if j:
            j.project_dir = str(new_project_dir)
            s.commit()

    # ── Wake the dispatcher (it will pick up the new queued job) ──
    _notify_dispatcher()
    return new_job_id


def _notify_dispatcher() -> None:
    """Module-level indirection for the dispatcher wake. The real call
    pulls in ``backend.runtime.jobs`` lazily, so unit tests can patch
    this function without triggering that import chain."""
    from backend.runtime.jobs import notify_dispatcher
    notify_dispatcher()


def _revision_index(parent, s) -> int:
    """Return the number of revisions already created against ``parent``
    (1 = first revision will be r2). Used to suffix the project name.
    """
    from backend.models import Job  # noqa: WPS433
    count = (
        s.query(Job)
        .filter(Job.revision_of_job_id == parent.id)
        .count()
    )
    return count
