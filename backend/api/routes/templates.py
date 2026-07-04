"""Templates API — upload, list, analyze builtin + user templates."""
from __future__ import annotations

import json
import logging
import shutil
import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from backend.app.templates_service import analyze_template_file, seed_builtin_templates_db
from backend.auth import CurrentUser
from backend.db.session import SessionLocal
from backend.models import Template
from backend.paths import is_under, safe_stage_name, templates_dir_for, template_path_for

router = APIRouter(prefix="/templates", tags=["templates"])
log = logging.getLogger("backend.api.templates")

MAX_TEMPLATE_BYTES = 25 * 1024 * 1024


class TemplateUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=128)
    description: str | None = Field(default=None, max_length=2000)
    category: str | None = Field(default=None, max_length=32)


def _template_to_dict(t: Template) -> dict:
    placeholders = []
    if t.placeholders_json:
        try:
            placeholders = json.loads(t.placeholders_json)
        except json.JSONDecodeError:
            pass
    return {
        "id": t.id,
        "name": t.name,
        "category": t.category,
        "description": t.description,
        "placeholder_count": t.placeholder_count,
        "placeholders": placeholders,
        "page_count": t.page_count,
        "is_builtin": t.is_builtin,
        "preview_url": f"/api/templates/{t.id}/preview/1" if t.preview_path else None,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


@router.get("")
async def list_templates(user: CurrentUser) -> dict:
    with SessionLocal() as s:
        seed_builtin_templates_db(s)
        s.commit()
        rows = (
            s.query(Template)
            .filter((Template.user_id == user.id) | (Template.is_builtin == True))  # noqa: E712
            .order_by(Template.is_builtin.desc(), Template.created_at.desc())
            .all()
        )
    return {"templates": [_template_to_dict(t) for t in rows]}


@router.get("/{template_id}")
async def get_template(template_id: str, user: CurrentUser) -> dict:
    with SessionLocal() as s:
        t = s.get(Template, template_id)
        if not t:
            raise HTTPException(404, "template not found")
        if not t.is_builtin and t.user_id != user.id:
            raise HTTPException(403, "forbidden")
    return _template_to_dict(t)


@router.post("", status_code=201)
async def upload_template(
    user: CurrentUser,
    name: Annotated[str, Form(min_length=1, max_length=128)],
    category: Annotated[str, Form()] = "custom",
    description: Annotated[str, Form()] = "",
    file: UploadFile = File(...),
) -> dict:
    if not file.filename or not file.filename.lower().endswith(".docx"):
        raise HTTPException(422, "only .docx templates supported")
    template_id = str(uuid.uuid4())
    tdir = templates_dir_for(user.id) / template_id
    tdir.mkdir(parents=True, exist_ok=True)
    dest = template_path_for(user.id, template_id)
    if not is_under(dest, templates_dir_for(user.id)):
        raise HTTPException(400, "invalid path")
    size = 0
    try:
        with dest.open("wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_TEMPLATE_BYTES:
                    dest.unlink(missing_ok=True)
                    raise HTTPException(413, "template too large")
                out.write(chunk)
    finally:
        await file.close()
    meta = analyze_template_file(dest)
    placeholders = meta.get("placeholders", [])
    with SessionLocal() as s:
        s.add(Template(
            id=template_id,
            user_id=user.id,
            name=name.strip(),
            category=category,
            description=description or None,
            file_path=str(dest),
            placeholder_count=len(placeholders),
            placeholders_json=json.dumps(placeholders, ensure_ascii=False),
            page_count=1,
            is_builtin=False,
        ))
        s.commit()
    return {"id": template_id, "name": name, "placeholder_count": len(placeholders)}


@router.put("/{template_id}")
async def update_template(template_id: str, body: TemplateUpdate, user: CurrentUser) -> dict:
    with SessionLocal() as s:
        t = s.get(Template, template_id)
        if not t or t.is_builtin:
            raise HTTPException(404, "template not found")
        if t.user_id != user.id:
            raise HTTPException(403, "forbidden")
        if body.name:
            t.name = body.name
        if body.description is not None:
            t.description = body.description
        if body.category:
            t.category = body.category
        s.commit()
    return _template_to_dict(t)


@router.delete("/{template_id}")
async def delete_template(template_id: str, user: CurrentUser) -> dict:
    with SessionLocal() as s:
        t = s.get(Template, template_id)
        if not t or t.is_builtin:
            raise HTTPException(404, "template not found")
        if t.user_id != user.id:
            raise HTTPException(403, "forbidden")
        tdir = templates_dir_for(user.id) / template_id
        s.delete(t)
        s.commit()
    if tdir.is_dir():
        shutil.rmtree(tdir, ignore_errors=True)
    return {"ok": True}


@router.post("/{template_id}/analyze")
async def reanalyze_template(template_id: str, user: CurrentUser) -> dict:
    with SessionLocal() as s:
        t = s.get(Template, template_id)
        if not t:
            raise HTTPException(404, "template not found")
        if not t.is_builtin and t.user_id != user.id:
            raise HTTPException(403, "forbidden")
        path = Path(t.file_path)
        if not path.is_file():
            raise HTTPException(404, "template file missing")
        meta = analyze_template_file(path)
        placeholders = meta.get("placeholders", [])
        t.placeholder_count = len(placeholders)
        t.placeholders_json = json.dumps(placeholders, ensure_ascii=False)
        s.commit()
    return _template_to_dict(t)


@router.get("/{template_id}/preview/{page}")
async def template_preview(template_id: str, page: int, user: CurrentUser):
    with SessionLocal() as s:
        t = s.get(Template, template_id)
        if not t:
            raise HTTPException(404, "template not found")
        if not t.is_builtin and t.user_id != user.id:
            raise HTTPException(403, "forbidden")
        path = Path(t.file_path)
    if not path.is_file():
        raise HTTPException(404, "template file missing")
    return FileResponse(path, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")
