"""Template analysis and builtin sync helpers."""
from __future__ import annotations

import json
import logging
import shutil
import subprocess
import uuid
from pathlib import Path

from backend.app.template_preview import sync_template_previews
from backend.app.template_slots import parse_slots_json, slots_from_placeholders
from backend.paths import PROJECT_ROOT, builtin_templates_dir, template_dir_for, template_path_for, templates_dir_for
from backend.runner.preview import list_slides

log = logging.getLogger("backend.templates")


def analyze_template_file(template_docx: Path) -> dict:
    script = PROJECT_ROOT / "word-master" / "skills" / "word-master" / "scripts" / "analyze_template.py"
    if script.is_file():
        r = subprocess.run(
            ["python3", str(script), str(template_docx)],
            capture_output=True,
            text=True,
            check=False,
        )
        if r.returncode == 0 and r.stdout.strip():
            return json.loads(r.stdout)
    return {"placeholder_count": 0, "placeholders": []}


def sync_builtin_templates() -> None:
    src = PROJECT_ROOT / "word-master" / "skills" / "word-master" / "templates"
    dest = builtin_templates_dir()
    if not src.is_dir():
        return
    dest.mkdir(parents=True, exist_ok=True)
    for docx in src.glob("*.docx"):
        target_dir = dest / docx.stem
        target_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(docx, target_dir / "template.docx")


def seed_builtin_templates_db(session) -> None:
    from backend.models import Template

    sync_builtin_templates()
    catalog = {
        "report-zh": ("工作报告", "report"),
        "memo-zh": ("会议纪要", "memo"),
        "contract-zh": ("合同", "contract"),
        "letter-zh": ("公函/信件", "letter"),
        "application-zh": ("申请书", "application"),
    }
    for stem, (name, category) in catalog.items():
        tid = f"builtin-{stem}"
        existing = session.get(Template, tid)
        src = builtin_templates_dir() / stem / "template.docx"
        if not src.is_file():
            continue
        meta = analyze_template_file(src)
        placeholders = meta.get("placeholders", [])
        row = existing or Template(id=tid, user_id=None, is_builtin=True)
        row.name = name
        row.category = category
        row.description = f"内置模板：{name}"
        row.file_path = str(src)
        row.placeholder_count = len(placeholders)
        row.placeholders_json = json.dumps(placeholders, ensure_ascii=False)
        if not row.slots_json:
            row.slots_json = json.dumps(slots_from_placeholders(placeholders), ensure_ascii=False)
        row.page_count = max(1, len(list_slides(src.parent)) or 1)
        if not row.preview_path or not Path(row.preview_path).is_file():
            try:
                apply_preview_paths(row, src)
            except Exception:
                log.exception("failed to generate preview for builtin template %s", tid)
        session.merge(row)


def catalog_slots_for_builtin(template_id: str) -> list[dict]:
    catalog_path = PROJECT_ROOT / "webui" / "src" / "lib" / "templateCatalog.json"
    if not catalog_path.is_file():
        return []
    try:
        catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []
    for entry in catalog.get("templates", []):
        if entry.get("builtin_id") == template_id:
            keys = entry.get("placeholders") or []
            return slots_from_placeholders([{"key": k} for k in keys])
    return []


def apply_preview_paths(template, docx: Path) -> None:
    cover, html = sync_template_previews(docx)
    template.preview_path = cover
    template.document_html_path = html


def fork_template(session, *, source: "Template", user_id: str) -> "Template":
    from backend.models import Template

    new_id = str(uuid.uuid4())
    tdir = template_dir_for(user_id, new_id)
    tdir.mkdir(parents=True, exist_ok=True)
    dest = template_path_for(user_id, new_id)
    src_path = Path(source.file_path)
    if source.is_builtin:
        src_path = Path(source.file_path)
    elif source.user_id:
        src_path = template_path_for(source.user_id, source.id)
    if not src_path.is_file():
        raise FileNotFoundError("template file missing")
    shutil.copy2(src_path, dest)

    prev_slots = parse_slots_json(source.slots_json)
    if not prev_slots and source.is_builtin:
        prev_slots = catalog_slots_for_builtin(source.id)
    if not prev_slots and source.placeholders_json:
        try:
            placeholders = json.loads(source.placeholders_json)
            prev_slots = slots_from_placeholders(placeholders)
        except json.JSONDecodeError:
            prev_slots = []

    meta = analyze_template_file(dest)
    placeholders = meta.get("placeholders", [])
    row = Template(
        id=new_id,
        user_id=user_id,
        name=f"{source.name}（副本）",
        category=source.category,
        description=source.description,
        file_path=str(dest),
        placeholder_count=len(placeholders),
        placeholders_json=json.dumps(placeholders, ensure_ascii=False),
        slots_json=json.dumps(prev_slots, ensure_ascii=False) if prev_slots else None,
        page_count=source.page_count or 1,
        is_builtin=False,
    )
    apply_preview_paths(row, dest)
    session.add(row)
    return row


def resolve_template_docx(user_id: str | None, template_id: str | None) -> Path | None:
    if not template_id:
        return None
    from backend.db.session import SessionLocal
    from backend.models import Template

    with SessionLocal() as s:
        t = s.get(Template, template_id)
        if not t:
            return None
        if t.is_builtin:
            return Path(t.file_path)
        if t.user_id and t.user_id != user_id:
            return None
        return template_path_for(t.user_id or user_id or "", template_id)
