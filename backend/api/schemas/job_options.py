"""Job creation options — validation and prompt formatting for Word generation."""
from __future__ import annotations

import json
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

Language = Literal["zh", "en"]
GenerationMode = Literal["freeform", "template"]
Scenario = Literal["report", "contract", "letter", "memo", "academic", "general"]
Audience = Literal["general", "executive", "team", "client", "expert", "student"]
Tone = Literal["formal", "casual", "technical", "professional", "concise"]
PageSize = Literal["A4", "Letter"]
CitationStyle = Literal["APA", "IEEE", "MLA", "Chicago"]

SPEC_COLOR_KEYS = (
    "primary",
    "accent",
    "bg",
    "text",
    "text_secondary",
    "border",
)


class RevisionItem(BaseModel):
    slide_index: int = Field(ge=1, le=100)
    comment: str = Field(min_length=1, max_length=1000)


ContentPreset = Literal["concise", "formal", "translate_en", "glossary"]
GlobalRevisionKind = Literal["colors", "typography", "visual_style", "content", "custom"]


class GlobalRevision(BaseModel):
    kind: GlobalRevisionKind = "custom"
    color_changes: dict[str, str] | None = None
    font_family: str | None = None
    visual_style: str | None = None
    content_preset: ContentPreset | None = None
    comment: str | None = None


class RevisionRequest(BaseModel):
    mode: Literal["per_page", "global"] = "per_page"  # type: ignore[name-defined]
    items: list[RevisionItem] | None = None
    global_revision: GlobalRevision | None = None


class JobOptions(BaseModel):
    generation_mode: GenerationMode = "freeform"
    template_id: str | None = None
    language: Language = "zh"
    scenario: Scenario = "report"
    audience: Audience = "general"
    tone: Tone = "formal"
    include_toc: bool = True
    include_cover: bool = True
    page_size: PageSize = "A4"
    citation_style: CitationStyle | None = None
    section_count: int = Field(default=5, ge=2, le=30)
    core_topic: str | None = Field(default=None, max_length=2000)
    outline: list[str] | None = None
    revision_items: list[RevisionItem] | None = None
    template_data: dict[str, str] | None = None
    generation_hint: str | None = Field(default=None, max_length=2000)


DEFAULT_JOB_OPTIONS = JobOptions()

_LANGUAGE = {
    "zh": ("中文", "正文、标题使用中文"),
    "en": ("English", "document in English"),
}
_SCENARIO = {
    "report": ("工作报告", "officecli load_skill word"),
    "contract": ("合同", "template-merge 优先"),
    "letter": ("公函/信件", "officecli load_skill word"),
    "memo": ("会议纪要", "template-merge 优先"),
    "academic": ("学术论文", "officecli load_skill academic-paper"),
    "general": ("通用文档", "officecli load_skill word"),
}
_TONE = {
    "formal": "正式",
    "casual": "轻松",
    "technical": "技术",
    "professional": "专业",
    "concise": "简洁",
}


def parse_job_options(raw: str | None) -> JobOptions:
    if not raw:
        return DEFAULT_JOB_OPTIONS
    try:
        return JobOptions.model_validate_json(raw)
    except (ValidationError, json.JSONDecodeError):
        return DEFAULT_JOB_OPTIONS


def job_options_from_form(
    *,
    generation_mode: str = "freeform",
    template_id: str | None = None,
    language: str = "zh",
    scenario: str = "report",
    audience: str = "general",
    tone: str = "formal",
    section_count: int = 5,
    include_toc: bool = True,
    include_cover: bool = True,
    page_size: str = "A4",
    citation_style: str | None = None,
    core_topic: str | None = None,
    outline: list[str] | None = None,
    template_data: dict[str, str] | None = None,
    generation_hint: str | None = None,
) -> JobOptions:
    return JobOptions(
        generation_mode=generation_mode,  # type: ignore[arg-type]
        template_id=template_id,
        language=language,  # type: ignore[arg-type]
        scenario=scenario,  # type: ignore[arg-type]
        audience=audience,  # type: ignore[arg-type]
        tone=tone,  # type: ignore[arg-type]
        section_count=section_count,
        include_toc=include_toc,
        include_cover=include_cover,
        page_size=page_size,  # type: ignore[arg-type]
        citation_style=citation_style,  # type: ignore[arg-type]
        core_topic=core_topic,
        outline=outline,
        template_data=template_data,
        generation_hint=generation_hint,
    )


def format_options_for_prompt(opts: JobOptions) -> str:
    lines = ["Word 生成要求（请严格遵循）：", ""]
    lines.append(f"- 生成模式：{opts.generation_mode}")
    if opts.template_id:
        lines.append(f"- 模板 ID：{opts.template_id}")
    lang_label, lang_rule = _LANGUAGE[opts.language]
    scen_label, scen_hint = _SCENARIO[opts.scenario]
    lines.append(f"- 语言：{lang_label}（{lang_rule}）")
    lines.append(f"- 场景：{scen_label}（{scen_hint}）")
    lines.append(f"- 语气：{_TONE[opts.tone]}")
    lines.append(f"- 受众：{opts.audience}")
    lines.append(f"- 目标章节数：约 {opts.section_count} 节")
    lines.append(f"- 页面尺寸：{opts.page_size}")
    lines.append(f"- 生成目录：{'是' if opts.include_toc else '否'}")
    lines.append(f"- 封面页：{'是（文档标题单独使用 style=Title 段落）' if opts.include_cover else '否'}")
    if opts.citation_style:
        lines.append(f"- 引用格式：{opts.citation_style}")
    if opts.core_topic:
        lines.append(f"- 核心主题：{opts.core_topic}")
    if opts.outline:
        lines.append("- 用户大纲：")
        for item in opts.outline:
            lines.append(f"  - {item}")
    if opts.generation_mode == "template":
        lines.append("- 模板模式：保持模板结构，仅替换内容（参见 template-merge.md）")
        if opts.template_data:
            lines.append("- 用户已填写模板变量（见 TEMPLATE_DATA_PATH / data.json），优先 officecli merge")
            for key, val in opts.template_data.items():
                preview = val if len(val) <= 80 else f"{val[:77]}…"
                lines.append(f"  - {key}: {preview}")
    if opts.generation_hint:
        lines.append(f"- 生成微调：{opts.generation_hint}")
    return "\n".join(lines)
