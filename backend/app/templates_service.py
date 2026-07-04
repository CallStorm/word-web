"""Template analysis and builtin sync helpers."""
from __future__ import annotations

import json
import logging
import shutil
import subprocess
import uuid
from pathlib import Path

from backend.paths import PROJECT_ROOT, builtin_templates_dir, template_path_for

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
        row.page_count = 1
        row.preview_path = None
        session.merge(row)


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
