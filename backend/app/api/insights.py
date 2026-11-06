import asyncio
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_admin, require_staff
from app.database import SessionLocal, get_db
from app.models import Booking, Lead, MessageTemplate, NotificationLog, Reminder, User, VisitSlot
from app.services import analytics_service, notification_service as ns

router = APIRouter(prefix="/api", tags=["insights"])
log = logging.getLogger("visitly.worker")


@router.get("/analytics")
def analytics(days: int = Query(60, ge=7, le=365), _: User = Depends(require_staff), db: Session = Depends(get_db)):
    return analytics_service.compute(db, days)


@router.get("/comms/logs")
def logs(limit: int = Query(50, ge=1, le=200), _: User = Depends(require_staff), db: Session = Depends(get_db)):
    rows = db.execute(select(NotificationLog, Lead).join(Lead, Lead.id == NotificationLog.lead_id)
                      .order_by(NotificationLog.id.desc()).limit(limit)).all()
    return [{"id": n.id, "lead_id": l.id, "lead_name": l.name, "channel": n.channel, "kind": n.kind,
             "template_key": n.template_key, "status": n.status, "body": n.body, "simulated": n.simulated,
             "created_at": n.created_at.isoformat()} for n, l in rows]


@router.get("/comms/reminders")
def reminders(_: User = Depends(require_staff), db: Session = Depends(get_db)):
    rows = db.execute(select(Reminder, Booking, VisitSlot, Lead).join(Booking, Booking.id == Reminder.booking_id)
                      .join(VisitSlot, VisitSlot.id == Booking.slot_id).join(Lead, Lead.id == Booking.lead_id)
                      .where(Booking.status == "confirmed").order_by(Reminder.scheduled_at).limit(100)).all()
    return [{"id": r.id, "type": r.reminder_type, "status": r.status, "scheduled_at": r.scheduled_at.isoformat(),
             "sent_at": r.sent_at.isoformat() if r.sent_at else None, "lead_id": l.id, "lead_name": l.name,
             "visit_at": s.start_time.isoformat()} for r, b, s, l in rows]


@router.get("/comms/templates")
def templates(_: User = Depends(require_staff), db: Session = Depends(get_db)):
    return [{"key": t.key, "language": t.language, "kind": t.kind, "body": t.body}
            for t in db.scalars(select(MessageTemplate).order_by(MessageTemplate.key, MessageTemplate.language))]


class SendIn(BaseModel):
    lead_id: int
    template_key: str
    channel: str = "whatsapp"


@router.post("/comms/send", status_code=201)
def send(body: SendIn, _: User = Depends(require_staff), db: Session = Depends(get_db)):
    lead = db.get(Lead, body.lead_id)
    if not lead:
        raise HTTPException(404, "Lead not found")
    try:
        row = ns.send_message(db, lead, body.template_key, body.channel, {"project": "our project", "rera": ""})
    except ValueError as e:
        raise HTTPException(422, str(e))
    db.commit()
    return {"status": row.status, "simulated": True}


class RunIn(BaseModel):
    simulate_now: datetime | None = None


@router.post("/comms/run-reminders")
def run_reminders(body: RunIn, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Admin demo control: process reminders as if it were `simulate_now`."""
    return ns.process_due_reminders(db, body.simulate_now)


async def reminder_loop(interval: int = 60):
    """In-process worker for the demo. Production would use a durable scheduler/queue (see TDD)."""
    while True:
        try:
            with SessionLocal() as db:
                await asyncio.to_thread(ns.process_due_reminders, db)
        except Exception:
            log.exception("reminder loop error")
        await asyncio.sleep(interval)
