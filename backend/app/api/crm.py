from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_admin, require_staff
from app.api.leads import _get_lead, lead_row
from app.database import get_db
from app.models import CallLog, FollowUpTask, Lead, Payment, Unit, User
from app.schemas.common import CallIn, MergeIn, PaymentIn, TaskIn
from app.services import crm_service as crm

router = APIRouter(prefix="/api", tags=["crm"])


def _do(db: Session, fn):
    try:
        out = fn()
        db.commit()
        return out
    except crm.CrmError as e:
        db.rollback()
        raise HTTPException(409, str(e))


@router.post("/leads/{lead_id}/merge")
def merge(lead_id: int, body: MergeIn, user: User = Depends(require_staff), db: Session = Depends(get_db)):
    _get_lead(db, user, lead_id)
    _get_lead(db, user, body.into_id)  # must be allowed to see both
    dst = _do(db, lambda: crm.merge_leads(db, lead_id, body.into_id, user))
    return lead_row(dst, db)


@router.post("/leads/{lead_id}/tasks", status_code=201)
def create_task(lead_id: int, body: TaskIn, user: User = Depends(require_staff), db: Session = Depends(get_db)):
    lead = _get_lead(db, user, lead_id)
    if body.due_at.tzinfo is None:
        raise HTTPException(422, "due_at must include a timezone offset")
    t = _do(db, lambda: crm.add_task(db, lead, user, body.title, body.due_at))
    return {"id": t.id}


@router.patch("/tasks/{task_id}/done")
def complete_task(task_id: int, user: User = Depends(require_staff), db: Session = Depends(get_db)):
    t = db.get(FollowUpTask, task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    _get_lead(db, user, t.lead_id)
    t.done = True
    db.commit()
    return {"id": t.id, "done": True}


@router.post("/leads/{lead_id}/calls", status_code=201)
def call(lead_id: int, body: CallIn, user: User = Depends(require_staff), db: Session = Depends(get_db)):
    lead = _get_lead(db, user, lead_id)
    c = _do(db, lambda: crm.log_call(db, lead, user, body.outcome, body.duration_sec, body.notes))
    return {"id": c.id, "simulated": True}


@router.get("/projects/{pid}/units")
def units(pid: int, _: User = Depends(require_staff), db: Session = Depends(get_db)):
    rows = db.execute(select(Unit, Lead).outerjoin(Lead, Lead.id == Unit.held_by_lead)
                      .where(Unit.project_id == pid).order_by(Unit.id)).all()
    return [{"id": u.id, "label": u.label, "bhk": u.bhk, "status": u.status,
             "held_by": {"id": l.id, "name": l.name} if l else None} for u, l in rows]


@router.post("/leads/{lead_id}/payments", status_code=201)
def pay(lead_id: int, body: PaymentIn, user: User = Depends(require_staff), db: Session = Depends(get_db)):
    lead = _get_lead(db, user, lead_id)
    p = _do(db, lambda: crm.take_payment(db, lead, user, body.unit_id, body.outcome, body.amount_inr))
    return {"id": p.id, "status": p.status, "simulated": True}


@router.post("/units/{unit_id}/allot")
def allot(unit_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    u = _do(db, lambda: crm.allot_unit(db, unit_id, admin))
    return {"id": u.id, "status": u.status}


@router.post("/units/{unit_id}/release")
def release(unit_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    u = _do(db, lambda: crm.release_unit(db, unit_id, admin))
    return {"id": u.id, "status": u.status}


def lead_extras(db: Session, lead_id: int) -> dict:
    """Tasks, calls and payments for the lead detail response."""
    tasks = db.scalars(select(FollowUpTask).where(FollowUpTask.lead_id == lead_id).order_by(FollowUpTask.done, FollowUpTask.due_at))
    calls = db.scalars(select(CallLog).where(CallLog.lead_id == lead_id).order_by(CallLog.id.desc()).limit(20))
    pays = db.execute(select(Payment, Unit).outerjoin(Unit, Unit.id == Payment.unit_id).where(Payment.lead_id == lead_id)
                      .order_by(Payment.id.desc()).limit(20)).all()
    return {"tasks": [{"id": t.id, "title": t.title, "due_at": t.due_at.isoformat(), "done": t.done} for t in tasks],
            "calls": [{"id": c.id, "outcome": c.outcome, "duration_sec": c.duration_sec, "notes": c.notes,
                       "created_at": c.created_at.isoformat(), "simulated": c.simulated} for c in calls],
            "payments": [{"id": p.id, "amount_inr": p.amount_inr, "status": p.status, "unit": u.label if u else None,
                          "created_at": p.created_at.isoformat(), "simulated": p.simulated} for p, u in pays]}
