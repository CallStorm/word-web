"""Job creation options — validation and prompt formatting for Word generation."""
from __future__ import annotations

import json
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

Language = Literal["zh", "en"]
GenerationMode = Literal["freeform", "template"]
Scenario = Literal["report", "contract", "letter", "memo", "academic", "general"]
Audience = Literal["general", "executive", "team", "client", "expert", "student"]
Tone = Literal["formal", "casual", "technical", "professional", "concise"]

SPEC_COLOR_KEYS = (
    "primary",
    "accent",
    "bg",
    "text",
    "text_secondary",
    "border",
)


class RevisionItem(BaseModel):
    slide_index: int | None = Field(default=None, ge=1, le=100)
    data_path: str | None = Field(default=None, max_length=200)
    quote: str | None = Field(default=None, max_length=500)
    comment: str = Field(min_length=1, max_length=1000)

    @model_validator(mode="after")
    def require_target(self) -> RevisionItem:
        if self.slide_index is None and not self.data_path:
            raise ValueError("slide_index or data_path is required")
        return self


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
    model_config = ConfigDict(extra="ignore")

    generation_mode: GenerationMode = "freeform"
    language: Language = "zh"
    scenario: Scenario = "report"
    audience: Audience = "general"
    tone: Tone = "formal"
    core_topic: str | None = Field(default=None, max_length=2000)
    outline: list[str] | None = None
    key_points: list[str] | None = None
    template_data: dict[str, str] | None = None
    revision_items: list[RevisionItem] | None = None
    generation_hint: str | None = Field(default=None, max_length=2000)
    job_kind: Literal["agent"] = "agent"


DEFAULT_JOB_OPTIONS = JobOptions()

_LANGUAGE = {
    "zh": ("中文", "正文、标题使用中文"),
    "en": ("English", "document in English"),
}
_SCENARIO = {
    "report": ("工作报告", "officecli load_skill word"),
    "contract": ("合同", "officecli load_skill word"),
    "letter": ("公函/信件", "officecli load_skill word"),
    "memo": ("会议纪要", "officecli load_skill word"),
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
    language: str = "zh",
    scenario: str = "report",
    audience: str = "general",
    tone: str = "formal",
    core_topic: str | None = None,
    outline: list[str] | None = None,
    key_points: list[str] | None = None,
    generation_hint: str | None = None,
) -> JobOptions:
    return JobOptions(
        generation_mode=generation_mode,  # type: ignore[arg-type]
        language=language,  # type: ignore[arg-type]
        scenario=scenario,  # type: ignore[arg-type]
        audience=audience,  # type: ignore[arg-type]
        tone=tone,  # type: ignore[arg-type]
        core_topic=core_topic,
        outline=outline,
        key_points=key_points,
        generation_hint=generation_hint,
    )


def format_options_for_prompt(opts: JobOptions) -> str:
    """Summarize job options for the agent — build/QA rules live in bundled skills."""
    lines = ["## 生成选项", ""]
    lines.append(f"- 生成模式：{opts.generation_mode}")
    lang_label, _ = _LANGUAGE[opts.language]
    scen_label, _ = _SCENARIO[opts.scenario]
    lines.append(f"- 语言：{lang_label}")
    lines.append(f"- 场景：{scen_label}")
    lines.append(f"- 语气：{_TONE[opts.tone]}")
    lines.append(f"- 受众：{opts.audience}")
    if opts.core_topic:
        lines.append(f"- 核心主题：{opts.core_topic}")
    if opts.outline:
        lines.append("- 用户大纲（每项须对应一个 Heading1）：")
        for item in opts.outline:
            lines.append(f"  - {item}")
    if opts.key_points:
        lines.append("- 章节要点：")
        for item in opts.key_points:
            lines.append(f"  - {item}")
    if opts.generation_hint:
        lines.append(f"- 生成微调：{opts.generation_hint}")
    return "\n".join(lines)
