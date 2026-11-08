"""Staff lead management. Executives only see leads assigned to them or unassigned; admins see all."""
import csv
import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import require_admin, require_staff
from app.core.phone import mask_phone
from app.database import get_db
from app.models import (Booking, Conversation, Handoff, Lead, LeadActivity, Message, Role, User,
                        VisitSlot)
from app.schemas.common import AssignIn, NoteIn, ReplyIn, StatusIn
from app.services.audit import audit
from app.services.lead_service import current_consent

router = APIRouter(prefix="/api/leads", tags=["leads"])


def _visible(user: User):
    if user.role == Role.admin.value:
        return None
    return or_(Lead.assigned_to == user.id, Lead.assigned_to.is_(None))


def _get_lead(db: Session, user: User, lead_id: int) -> Lead:
    lead = db.get(Lead, lead_id)
    if not lead:
        raise HTTPException(404, "Lead not found")
    if user.role != Role.admin.value and lead.assigned_to not in (None, user.id):
        raise HTTPException(403, "This lead is assigned to another executive")
    return lead


def lead_row(lead: Lead, db: Session, full_phone: bool = False) -> dict:
    exe = db.get(User, lead.assigned_to) if lead.assigned_to else None
    return {"id": lead.id, "name": lead.name,
            "phone": lead.phone_normalized if full_phone else mask_phone(lead.phone_normalized),
            "source": lead.source, "status": lead.status, "project_id": lead.project_id, "bhk": lead.bhk,
            "budget_lakh": float(lead.budget_lakh) if lead.budget_lakh is not None else None,
            "language": lead.language, "duplicate_of": lead.duplicate_of, "merged_into": lead.merged_into,
            "assigned_to": {"id": exe.id, "name": exe.name} if exe else None,
            "is_synthetic": lead.is_synthetic, "created_at": lead.created_at.isoformat(),
            "first_response_at": lead.first_response_at.isoformat() if lead.first_response_at else None}


def _filtered(user: User, search, source, status, duplicates_only):
    q = select(Lead).where(Lead.merged_into.is_(None))
    if (v := _visible(user)) is not None:
        q = q.where(v)
    if search:
        like = f"%{search.strip()}%"
        q = q.where(or_(Lead.name.ilike(like), Lead.phone_normalized.ilike(like)))
    if source:
        q = q.where(Lead.source == source)
    if status:
        q = q.where(Lead.status == status)
    if duplicates_only:
        q = q.where(Lead.duplicate_of.is_not(None))
    return q


def _csv_cell(v) -> str:
    """Neutralise spreadsheet formula injection: a leading = + - @ (or tab/CR) would run as a formula."""
    s = "" if v is None else str(v)
    return "'" + s if s[:1] in ("=", "+", "-", "@", "\t", "\r") else s


@router.get("/export.csv")
def export_csv(search: str | None = Query(None, max_length=80), source: str | None = None,
               status: str | None = None, duplicates_only: bool = False,
               user: User = Depends(require_staff), db: Session = Depends(get_db)):
    """Admins get full phone numbers; executives get the same masked numbers they see in the list."""
    rows = db.scalars(_filtered(user, search, source, status, duplicates_only)
                      .order_by(Lead.created_at.desc()).limit(5000)).all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["id", "name", "phone", "source", "status", "bhk", "budget_lakh", "language", "assigned_to",
                "possible_duplicate_of", "created_at_utc"])
    for l in rows:
        r = lead_row(l, db, full_phone=user.role == Role.admin.value)
        w.writerow([_csv_cell(x) for x in (r["id"], r["name"], r["phone"], r["source"], r["status"], r["bhk"],
                                           r["budget_lakh"], r["language"], r["assigned_to"]["name"] if r["assigned_to"] else "",
                                           r["duplicate_of"], r["created_at"])])
    return Response(buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="visitly-leads-{datetime.now(timezone.utc):%Y%m%d}.csv"'})


@router.get("")
def list_leads(search: str | None = Query(None, max_length=80), source: str | None = None,
               status: str | None = None, duplicates_only: bool = False, page: int = Query(1, ge=1),
               page_size: int = Query(25, ge=1, le=100), user: User = Depends(require_staff),
               db: Session = Depends(get_db)):
    q = _filtered(user, search, source, status, duplicates_only)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = db.scalars(q.order_by(Lead.created_at.desc()).offset((page - 1) * page_size).limit(page_size))
    return {"total": total, "page": page, "page_size": page_size, "items": [lead_row(l, db) for l in rows]}


def _dup_out(db: Session, d: Lead) -> dict:
    n_book = db.scalar(select(func.count()).select_from(Booking).where(Booking.lead_id == d.id))
    exe = db.get(User, d.assigned_to) if d.assigned_to else None
    return {"id": d.id, "name": d.name, "source": d.source, "status": d.status, "bhk": d.bhk,
            "budget_lakh": float(d.budget_lakh) if d.budget_lakh is not None else None, "language": d.language,
            "created_at": d.created_at.isoformat(), "bookings": n_book, "assigned_to": exe.name if exe else None}


@router.get("/{lead_id}")
def lead_detail(lead_id: int, user: User = Depends(require_staff), db: Session = Depends(get_db)):
    lead = _get_lead(db, user, lead_id)
    conv = db.scalars(select(Conversation).where(Conversation.lead_id == lead.id)
                      .order_by(Conversation.id.desc())).first()
    msgs = db.scalars(select(Message).where(Message.conversation_id == conv.id).order_by(Message.id)) if conv else []
    bookings = db.execute(select(Booking, VisitSlot).join(VisitSlot, VisitSlot.id == Booking.slot_id)
                          .where(Booking.lead_id == lead.id).order_by(VisitSlot.start_time.desc())).all()
    handoff = db.scalars(select(Handoff).where(Handoff.lead_id == lead.id).order_by(Handoff.id.desc())).first()
    acts = db.scalars(select(LeadActivity).where(LeadActivity.lead_id == lead.id)
                      .order_by(LeadActivity.id.desc()).limit(100))
    dup = db.get(Lead, lead.duplicate_of) if lead.duplicate_of else None
    from app.api.crm import lead_extras
    return {**lead_row(lead, db, full_phone=True), **lead_extras(db, lead.id), "consent": current_consent(db, lead.id),
            "duplicate": _dup_out(db, dup) if dup else None,
            "conversation_status": conv.status if conv else None,
            "messages": [{"id": m.id, "sender": m.sender, "content": m.content,
                          "created_at": m.created_at.isoformat()} for m in msgs],
            "bookings": [{"id": b.id, "status": b.status, "start_time": s.start_time.isoformat(),
                          "project_id": s.project_id} for b, s in bookings],
            "handoff": {"summary": handoff.summary, "reason": handoff.reason,
                        "created_at": handoff.created_at.isoformat()} if handoff else None,
            "activities": [{"id": a.id, "kind": a.kind, "detail": a.detail,
                            "created_at": a.created_at.isoformat()} for a in acts]}


@router.post("/{lead_id}/notes", status_code=201)
def add_note(lead_id: int, body: NoteIn, user: User = Depends(require_staff), db: Session = Depends(get_db)):
    lead = _get_lead(db, user, lead_id)
    db.add(LeadActivity(lead_id=lead.id, actor_id=user.id, kind="note", detail=body.text.strip()))
    db.commit()
    return {"ok": True}


@router.patch("/{lead_id}/status")
def set_status(lead_id: int, body: StatusIn, user: User = Depends(require_staff), db: Session = Depends(get_db)):
    lead = _get_lead(db, user, lead_id)
    old, lead.status = lead.status, body.status
    db.add(LeadActivity(lead_id=lead.id, actor_id=user.id, kind="status",
                        detail=f"Status changed {old} → {body.status} by {user.name}"))
    db.commit()
    return lead_row(lead, db)


@router.patch("/{lead_id}/assign")
def assign(lead_id: int, body: AssignIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    lead = db.get(Lead, lead_id)
    exe = db.get(User, body.executive_id)
    if not lead or not exe or exe.role != Role.executive.value:
        raise HTTPException(404, "Lead or executive not found")
    lead.assigned_to = exe.id
    audit(db, admin, "lead.assign", "lead", lead.id, f"to {exe.name}")
    db.add(LeadActivity(lead_id=lead.id, actor_id=admin.id, kind="handoff", detail=f"Assigned to {exe.name}"))
    db.commit()
    return lead_row(lead, db)


@router.get("/meta/executives")
def executives(_: User = Depends(require_staff), db: Session = Depends(get_db)):
    return [{"id": u.id, "name": u.name} for u in
            db.scalars(select(User).where(User.role == Role.executive.value, User.is_active))]


def _latest_conv(db: Session, lead_id: int) -> Conversation:
    conv = db.scalars(select(Conversation).where(Conversation.lead_id == lead_id).order_by(Conversation.id.desc())).first()
    if not conv:
        raise HTTPException(404, "This lead hasn’t opened a chat yet")
    return conv


@router.post("/{lead_id}/reply", status_code=201)
def staff_reply(lead_id: int, body: ReplyIn, user: User = Depends(require_staff), db: Session = Depends(get_db)):
    """An executive writes into the buyer's chat. The assistant pauses until 'resume assistant' is used."""
    lead = _get_lead(db, user, lead_id)
    conv = _latest_conv(db, lead.id)
    now = datetime.now(timezone.utc)
    db.add(Message(conversation_id=conv.id, sender="executive", content=body.text.strip(),
                   meta={"executive": user.name}, created_at=now))
    conv.status = "human_active"
    conv.assigned_to = lead.assigned_to = lead.assigned_to or user.id
    if lead.first_response_at is None:
        lead.first_response_at = now  # a human reply counts as the first response
    if lead.status == "new":
        lead.status = "contacted"
    db.add(LeadActivity(lead_id=lead.id, actor_id=user.id, kind="message", detail=f"{user.name} replied in chat"))
    db.commit()
    return {"ok": True, "conversation_status": conv.status}


@router.post("/{lead_id}/resume-assistant")
def resume_assistant(lead_id: int, user: User = Depends(require_staff), db: Session = Depends(get_db)):
    lead = _get_lead(db, user, lead_id)
    conv = _latest_conv(db, lead.id)
    conv.status = "ai"
    db.add(LeadActivity(lead_id=lead.id, actor_id=user.id, kind="message", detail=f"{user.name} handed the chat back to the assistant"))
    db.commit()
    return {"conversation_status": conv.status}
