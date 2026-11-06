"""Staff lead management. Executives only see leads assigned to them or unassigned; admins see all."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import require_admin, require_staff
from app.core.phone import mask_phone
from app.database import get_db
from app.models import (Booking, Conversation, Handoff, Lead, LeadActivity, Message, Role, User,
                        VisitSlot)
from app.schemas.common import AssignIn, NoteIn, StatusIn
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


@router.get("")
def list_leads(search: str | None = Query(None, max_length=80), source: str | None = None,
               status: str | None = None, duplicates_only: bool = False, page: int = Query(1, ge=1),
               page_size: int = Query(25, ge=1, le=100), user: User = Depends(require_staff),
               db: Session = Depends(get_db)):
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
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = db.scalars(q.order_by(Lead.created_at.desc()).offset((page - 1) * page_size).limit(page_size))
    return {"total": total, "page": page, "page_size": page_size, "items": [lead_row(l, db) for l in rows]}


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
            "duplicate": {"id": dup.id, "name": dup.name, "source": dup.source} if dup else None,
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
    db.add(LeadActivity(lead_id=lead.id, actor_id=admin.id, kind="handoff", detail=f"Assigned to {exe.name}"))
    db.commit()
    return lead_row(lead, db)


@router.get("/meta/executives")
def executives(_: User = Depends(require_staff), db: Session = Depends(get_db)):
    return [{"id": u.id, "name": u.name} for u in
            db.scalars(select(User).where(User.role == Role.executive.value, User.is_active))]
