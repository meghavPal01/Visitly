"""Mock WhatsApp/SMS delivery. Nothing is sent; every attempt is logged with simulated=True.

Consent rules (assumptions, documented in the TDD):
  * promotional templates need a granted consent record and no later opt-out
  * transactional templates (visit reminders) are blocked only after an explicit opt-out
"""
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Booking, ConsentRecord, Lead, LeadActivity, MessageTemplate, NotificationLog, Project, Reminder, VisitSlot
from app.services import booking_service as bs
from app.services.lead_service import current_consent

log = logging.getLogger("visitly.notify")
CHANNELS = {"whatsapp", "sms"}


def set_consent(db: Session, lead_id: int, status: str, channel: str = "all") -> None:
    assert status in {"granted", "opted_out"}
    db.add(ConsentRecord(lead_id=lead_id, status=status, channel=channel))
    db.add(LeadActivity(lead_id=lead_id, kind="message", detail=f"Consent {status.replace('_', ' ')}"))


def render(db: Session, template_key: str, language: str, ctx: dict) -> tuple[MessageTemplate, str]:
    t = db.scalars(select(MessageTemplate).where(MessageTemplate.key == template_key, MessageTemplate.language == language)).first() \
        or db.scalars(select(MessageTemplate).where(MessageTemplate.key == template_key, MessageTemplate.language == "en")).first()
    if not t:
        raise ValueError(f"unknown template {template_key}")

    class _D(dict):
        def __missing__(self, k):
            return ""
    return t, t.body.format_map(_D(ctx))


def send_message(db: Session, lead: Lead, template_key: str, channel: str = "whatsapp", ctx: dict | None = None) -> NotificationLog:
    if channel not in CHANNELS:
        raise ValueError("channel must be whatsapp or sms")
    tmpl, body = render(db, template_key, lead.language, {"name": lead.name, **(ctx or {})})
    consent = current_consent(db, lead.id)
    status = "simulated_sent"
    if consent == "opted_out":
        status = "blocked_opt_out"
    elif tmpl.kind == "promotional" and consent != "granted":
        status = "blocked_no_consent"
    row = NotificationLog(lead_id=lead.id, channel=channel, template_key=template_key, kind=tmpl.kind,
                          body=body if status == "simulated_sent" else f"[not sent] {body}", status=status, simulated=True)
    db.add(row)
    return row


def process_due_reminders(db: Session, now: datetime | None = None, batch: int = 100) -> dict:
    """Send due reminders exactly once. Safe to run concurrently (SKIP LOCKED) and repeatedly (status flip)."""
    now = now or datetime.now(timezone.utc)
    due = db.scalars(select(Reminder).where(Reminder.status == "pending", Reminder.scheduled_at <= now)
                     .order_by(Reminder.scheduled_at).limit(batch).with_for_update(skip_locked=True)).all()
    res = {"sent": 0, "skipped": 0, "failed": 0}
    for r in due:
        b = db.get(Booking, r.booking_id)
        slot = db.get(VisitSlot, b.slot_id)
        if b.status != "confirmed" or slot.start_time <= now:
            r.status = "skipped"
            res["skipped"] += 1
            continue
        try:
            lead, project = db.get(Lead, b.lead_id), db.get(Project, slot.project_id)
            hrs = "tomorrow" if r.reminder_type == "t_minus_24h" else "in about 2 hours"
            when = f"{hrs} at {slot.start_time.astimezone(bs.IST):%I:%M %p}"
            log_row = send_message(db, lead, "visit_reminder", "whatsapp",
                                   {"project": project.name, "when": when, "map_url": project.map_url or "",
                                    "rera": project.rera_number or ""})
            r.attempts += 1
            r.status = "sent" if log_row.status == "simulated_sent" else "skipped"
            r.sent_at = now if r.status == "sent" else None
            res["sent" if r.status == "sent" else "skipped"] += 1
        except Exception:
            log.exception("reminder %s failed", r.id)
            r.attempts += 1
            r.status = "failed" if r.attempts >= 3 else "pending"
            res["failed"] += 1
    db.commit()
    return res
