"""Templates API — upload, list, analyze, fork, slots, preview assets."""
from __future__ import annotations

import json
import logging
import shutil
import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel, Field

from backend.app.template_preview import sync_template_previews, template_storage_dir
from backend.runner.preview import list_slides, load_document_outline
from backend.app.template_slots import (
    SlotError,
    parse_slots_json,
    save_template_slots,
    slots_from_placeholders,
)
from backend.app.templates_service import (
    analyze_template_file,
    apply_preview_paths,
    fork_template,
    seed_builtin_templates_db,
)
from backend.auth import CurrentUser
from backend.db.session import SessionLocal
from backend.models import Template
from backend.paths import is_under, template_path_for, templates_dir_for

router = APIRouter(prefix="/templates", tags=["templates"])
log = logging.getLogger("backend.api.templates")

MAX_TEMPLATE_BYTES = 25 * 1024 * 1024


class TemplateUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=128)
    description: str | None = Field(default=None, max_length=2000)
    category: str | None = Field(default=None, max_length=32)


class TemplateSlotPayload(BaseModel):
    key: str = Field(min_length=1, max_length=32)
    label: str = Field(default="", max_length=128)
    hint: str | None = Field(default=None, max_length=500)
    sample_text: str | None = Field(default=None, max_length=500)
    data_path: str | None = Field(default=None, max_length=256)
    order: int | None = None
    source: str | None = None


class TemplateSlotsUpdate(BaseModel):
    slots: list[TemplateSlotPayload]
    name: str | None = Field(default=None, max_length=128)


def _resolve_docx(t: Template) -> Path:
    if t.is_builtin:
        return Path(t.file_path)
    if t.user_id:
        return template_path_for(t.user_id, t.id)
    return Path(t.file_path)


def _parse_placeholders(raw: str | None) -> list:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    return data if isinstance(data, list) else []


def _template_to_dict(t: Template) -> dict:
    placeholders = _parse_placeholders(t.placeholders_json)
    slots = parse_slots_json(t.slots_json)
    if not slots and placeholders:
        slots = slots_from_placeholders(placeholders)
    return {
        "id": t.id,
        "name": t.name,
        "category": t.category,
        "description": t.description,
        "placeholder_count": t.placeholder_count or len(slots),
        "placeholders": placeholders,
        "slots": slots,
        "page_count": t.page_count,
        "is_builtin": t.is_builtin,
        "cover_url": f"/api/templates/{t.id}/cover",
        "document_html_url": f"/api/templates/{t.id}/document-html",
        "preview_url": f"/api/templates/{t.id}/cover",
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


def _get_owned_template(template_id: str, user: CurrentUser, *, allow_builtin: bool = True) -> Template:
    with SessionLocal() as s:
        t = s.get(Template, template_id)
        if not t:
            raise HTTPException(404, "template not found")
        if t.is_builtin:
            if not allow_builtin:
                raise HTTPException(403, "builtin templates are read-only")
            return t
        if t.user_id != user.id:
            raise HTTPException(403, "forbidden")
        return t


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
    t = _get_owned_template(template_id, user)
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
    slots = slots_from_placeholders(placeholders)
    cover, html = sync_template_previews(dest)
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
            slots_json=json.dumps(slots, ensure_ascii=False) if slots else None,
            page_count=1,
            preview_path=cover,
            document_html_path=html,
            is_builtin=False,
        ))
        s.commit()
    return {
        "id": template_id,
        "name": name,
        "placeholder_count": len(placeholders),
        "cover_url": f"/api/templates/{template_id}/cover" if cover else None,
    }


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


@router.post("/{template_id}/fork", status_code=201)
async def fork_template_route(template_id: str, user: CurrentUser) -> dict:
    with SessionLocal() as s:
        source = s.get(Template, template_id)
        if not source:
            raise HTTPException(404, "template not found")
        if not source.is_builtin and source.user_id != user.id:
            raise HTTPException(403, "forbidden")
        try:
            new_row = fork_template(s, source=source, user_id=user.id)
        except FileNotFoundError:
            raise HTTPException(404, "template file missing") from None
        s.commit()
        return _template_to_dict(new_row)


@router.get("/{template_id}/slots")
async def get_template_slots(template_id: str, user: CurrentUser) -> dict:
    t = _get_owned_template(template_id, user)
    slots = parse_slots_json(t.slots_json)
    placeholders = _parse_placeholders(t.placeholders_json)
    if not slots and placeholders:
        slots = slots_from_placeholders(placeholders)
    return {"slots": slots, "placeholders": placeholders}


@router.put("/{template_id}/slots")
async def update_template_slots(template_id: str, body: TemplateSlotsUpdate, user: CurrentUser) -> dict:
    with SessionLocal() as s:
        t = s.get(Template, template_id)
        if not t or t.is_builtin:
            raise HTTPException(404, "template not found")
        if t.user_id != user.id:
            raise HTTPException(403, "forbidden")
        docx = _resolve_docx(t)
        if not docx.is_file():
            raise HTTPException(404, "template file missing")
        previous = parse_slots_json(t.slots_json)
        payloads = [slot.model_dump() for slot in body.slots]
        try:
            next_slots, placeholders = save_template_slots(
                docx,
                previous_slots=previous,
                slot_payloads=payloads,
            )
        except SlotError as e:
            raise HTTPException(422, detail={"message": str(e), "code": e.code}) from e
        t.slots_json = json.dumps(next_slots, ensure_ascii=False)
        t.placeholders_json = json.dumps(placeholders, ensure_ascii=False)
        t.placeholder_count = len(next_slots)
        if body.name:
            t.name = body.name.strip()
        apply_preview_paths(t, docx)
        s.commit()
        return _template_to_dict(t)


@router.post("/{template_id}/preview/sync")
async def sync_template_preview(template_id: str, user: CurrentUser) -> dict:
    with SessionLocal() as s:
        t = s.get(Template, template_id)
        if not t:
            raise HTTPException(404, "template not found")
        if not t.is_builtin and t.user_id != user.id:
            raise HTTPException(403, "forbidden")
        docx = _resolve_docx(t)
        if not docx.is_file():
            raise HTTPException(404, "template file missing")
        apply_preview_paths(t, docx)
        s.commit()
        return _template_to_dict(t)


@router.post("/{template_id}/analyze")
async def reanalyze_template(template_id: str, user: CurrentUser) -> dict:
    with SessionLocal() as s:
        t = s.get(Template, template_id)
        if not t:
            raise HTTPException(404, "template not found")
        if not t.is_builtin and t.user_id != user.id:
            raise HTTPException(403, "forbidden")
        path = _resolve_docx(t)
        if not path.is_file():
            raise HTTPException(404, "template file missing")
        meta = analyze_template_file(path)
        placeholders = meta.get("placeholders", [])
        t.placeholder_count = len(placeholders)
        t.placeholders_json = json.dumps(placeholders, ensure_ascii=False)
        s.commit()
        return _template_to_dict(t)


@router.get("/{template_id}/edit-targets")
async def template_edit_targets(template_id: str, user: CurrentUser) -> dict:
    with SessionLocal() as s:
        t = s.get(Template, template_id)
        if not t:
            raise HTTPException(404, "template not found")
        if not t.is_builtin and t.user_id != user.id:
            raise HTTPException(403, "forbidden")
        docx = _resolve_docx(t)
        if not docx.is_file():
            raise HTTPException(404, "template file missing")
        if not t.preview_path or not t.document_html_path:
            apply_preview_paths(t, docx)
            t.page_count = max(1, len(list_slides(template_storage_dir(docx))) or t.page_count or 1)
            s.commit()
        root = template_storage_dir(docx)
        slides_raw = list_slides(root)
        slides = [
            {
                "index": p["index"],
                "name": p["name"],
                "image_url": f"/api/templates/{t.id}/cover",
                "has_notes": False,
                "notes_url": None,
            }
            for p in slides_raw
        ]
        if not slides:
            slides = [{"index": 1, "name": "page-1", "image_url": f"/api/templates/{t.id}/cover", "has_notes": False, "notes_url": None}]
        outline = load_document_outline(root)
        return {
            "editable": not t.is_builtin,
            "reason": "builtin templates are read-only" if t.is_builtin else None,
            "document_html_url": f"/api/templates/{t.id}/document-html",
            "has_document_html": True,
            "document_outline": outline,
            "slides": slides,
        }


@router.get("/{template_id}/cover")
async def template_cover(template_id: str, user: CurrentUser):
    with SessionLocal() as s:
        t = s.get(Template, template_id)
        if not t:
            raise HTTPException(404, "template not found")
        if not t.is_builtin and t.user_id != user.id:
            raise HTTPException(403, "forbidden")
        docx = _resolve_docx(t)
        if not docx.is_file():
            raise HTTPException(404, "template file missing")
        path = Path(t.preview_path) if t.preview_path else None
        if not path or not path.is_file():
            apply_preview_paths(t, docx)
            s.commit()
            path = Path(t.preview_path) if t.preview_path else None
        if not path or not path.is_file():
            raise HTTPException(404, "cover not available")
    return FileResponse(path, media_type="image/png")


@router.get("/{template_id}/document-html")
async def template_document_html(template_id: str, user: CurrentUser):
    with SessionLocal() as s:
        t = s.get(Template, template_id)
        if not t:
            raise HTTPException(404, "template not found")
        if not t.is_builtin and t.user_id != user.id:
            raise HTTPException(403, "forbidden")
        docx = _resolve_docx(t)
        if not docx.is_file():
            raise HTTPException(404, "template file missing")
        path = Path(t.document_html_path) if t.document_html_path else None
        if not path or not path.is_file():
            apply_preview_paths(t, docx)
            s.commit()
            path = Path(t.document_html_path) if t.document_html_path else None
        if not path or not path.is_file():
            raise HTTPException(404, "document html not available")
    return HTMLResponse(path.read_text(encoding="utf-8"))


@router.get("/{template_id}/preview/{page}")
async def template_preview_legacy(template_id: str, page: int, user: CurrentUser):
    """Legacy route — redirect to cover PNG when available."""
    t = _get_owned_template(template_id, user)
    if t.preview_path and page == 1:
        path = Path(t.preview_path)
        if path.is_file():
            return FileResponse(path, media_type="image/png")
    docx = _resolve_docx(t)
    if not docx.is_file():
        raise HTTPException(404, "template file missing")
    return FileResponse(docx, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")
