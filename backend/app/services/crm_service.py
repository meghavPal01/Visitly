"""P2 workflows: merge, follow-up tasks, simulated calls, simulated token payment, unit hold/allotment.
Everything external is simulated and flagged as such. No payment credentials are ever collected."""
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models import (Booking, CallLog, ConsentRecord, Conversation, FollowUpTask, Handoff, Lead, LeadActivity,
                        Payment, Unit, User)


class CrmError(Exception):
    pass


def merge_leads(db: Session, source_id: int, into_id: int, actor: User) -> Lead:
    """Fold `source` into `into`. History is moved, never deleted; source stays as a tombstone (merged_into)."""
    if source_id == into_id:
        raise CrmError("Choose a different lead to merge into")
    # lock in id order so two simultaneous merges can't deadlock
    locked = {l.id: l for l in db.scalars(select(Lead).where(Lead.id.in_([source_id, into_id])).order_by(Lead.id).with_for_update())}
    src, dst = locked.get(source_id), locked.get(into_id)
    if not src or not dst:
        raise CrmError("Lead not found")
    if src.merged_into or dst.merged_into:
        raise CrmError("One of these leads is already merged")
    if src.phone_normalized != dst.phone_normalized:
        raise CrmError("Only leads with the same phone number can be merged")
    for model in (Conversation, Booking, ConsentRecord, LeadActivity, FollowUpTask, CallLog, Payment, Handoff):
        db.execute(update(model).where(model.lead_id == src.id).values(lead_id=dst.id))
    dst.budget_lakh = dst.budget_lakh or src.budget_lakh
    dst.bhk = dst.bhk or src.bhk
    dst.project_id = dst.project_id or src.project_id
    dst.assigned_to = dst.assigned_to or src.assigned_to
    if src.first_response_at and (not dst.first_response_at or src.first_response_at < dst.first_response_at):
        dst.first_response_at = src.first_response_at
    src.merged_into, src.duplicate_of = dst.id, None
    db.add(LeadActivity(lead_id=dst.id, actor_id=actor.id, kind="merge",
                        detail=f"Merged lead #{src.id} ({src.name}, {src.source}) into this lead by {actor.name}"))
    return dst


def add_task(db: Session, lead: Lead, actor: User, title: str, due_at) -> FollowUpTask:
    t = FollowUpTask(lead_id=lead.id, assignee_id=lead.assigned_to or actor.id, title=title.strip(), due_at=due_at)
    db.add(t)
    db.add(LeadActivity(lead_id=lead.id, actor_id=actor.id, kind="note", detail=f"Follow-up created: {t.title}"))
    return t


def log_call(db: Session, lead: Lead, actor: User, outcome: str, duration_sec: int, notes: str | None) -> CallLog:
    c = CallLog(lead_id=lead.id, executive_id=actor.id, outcome=outcome, duration_sec=duration_sec if outcome == "connected" else 0,
                notes=notes, simulated=True)
    db.add(c)
    db.add(LeadActivity(lead_id=lead.id, actor_id=actor.id, kind="call",
                        detail=f"Simulated call: {outcome.replace('_', ' ')}" + (f", {duration_sec}s" if outcome == "connected" else "")))
    if outcome == "connected" and lead.status == "new":
        lead.status = "contacted"
    return c


def take_payment(db: Session, lead: Lead, actor: User, unit_id: int, outcome: str, amount_inr: int) -> Payment:
    """Simulated token payment. Success places a hold on the unit; the row lock prevents two buyers holding one unit."""
    unit = db.scalars(select(Unit).where(Unit.id == unit_id).with_for_update()).first()
    if not unit:
        raise CrmError("Unit not found")
    if lead.project_id and unit.project_id != lead.project_id:
        raise CrmError("This unit belongs to a different project than the lead’s enquiry")
    if unit.status != "available" and unit.held_by_lead != lead.id:
        raise CrmError("This unit is no longer available")
    pay = Payment(lead_id=lead.id, unit_id=unit.id, amount_inr=amount_inr, status=outcome, simulated=True)
    db.add(pay)
    if outcome == "success":
        unit.status, unit.held_by_lead = "held", lead.id
    db.add(LeadActivity(lead_id=lead.id, actor_id=actor.id, kind="payment",
                        detail=f"Simulated token payment ₹{amount_inr:,} for {unit.label}: {outcome}"
                        + (" (unit held)" if outcome == "success" else "")))
    return pay


def allot_unit(db: Session, unit_id: int, actor: User) -> Unit:
    unit = db.scalars(select(Unit).where(Unit.id == unit_id).with_for_update()).first()
    if not unit:
        raise CrmError("Unit not found")
    if unit.status != "held" or not unit.held_by_lead:
        raise CrmError("Only a held unit can be allotted")
    ok = db.scalars(select(Payment).where(Payment.unit_id == unit.id, Payment.lead_id == unit.held_by_lead,
                                          Payment.status == "success")).first()
    if not ok:
        raise CrmError("No successful token payment on record for this unit")
    unit.status = "allotted"
    lead = db.get(Lead, unit.held_by_lead)
    lead.status = "won"
    db.add(LeadActivity(lead_id=lead.id, actor_id=actor.id, kind="payment", detail=f"Unit {unit.label} allotted by {actor.name}"))
    return unit


def release_unit(db: Session, unit_id: int, actor: User) -> Unit:
    unit = db.scalars(select(Unit).where(Unit.id == unit_id).with_for_update()).first()
    if not unit or unit.status != "held":
        raise CrmError("Only a held unit can be released")
    db.add(LeadActivity(lead_id=unit.held_by_lead, actor_id=actor.id, kind="payment", detail=f"Hold on {unit.label} released by {actor.name}"))
    unit.status, unit.held_by_lead = "available", None
    return unit
