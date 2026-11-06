"""Slot availability and atomic booking.

Concurrency design: book_slot takes a row lock on the slot (SELECT ... FOR UPDATE), re-checks
availability inside the transaction, then inserts. A partial unique index on bookings(slot_id)
WHERE status='confirmed' is a second, schema-level guard.
"""
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Booking, BookingStatus, Lead, LeadActivity, LeadStatus, Reminder, VisitSlot

IST = ZoneInfo("Asia/Kolkata")  # assumption: all visits are local to India


class BookingError(Exception):
    code = "booking_error"


class SlotUnavailable(BookingError):
    code = "slot_unavailable"


class SlotNotFound(BookingError):
    code = "slot_not_found"


class AlreadyBooked(BookingError):
    code = "already_booked"


class BookingNotFound(BookingError):
    code = "booking_not_found"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def available_slots(db: Session, project_id: int, day: date, now: datetime | None = None) -> list[VisitSlot]:
    now = now or _now()
    start = datetime.combine(day, time.min, tzinfo=IST).astimezone(timezone.utc)
    end = start + timedelta(days=1)
    booked = select(Booking.slot_id).where(Booking.status == BookingStatus.confirmed.value)
    q = (select(VisitSlot).where(VisitSlot.project_id == project_id, VisitSlot.status == "open",
                                 VisitSlot.start_time >= max(start, now), VisitSlot.start_time < end,
                                 VisitSlot.id.not_in(booked)).order_by(VisitSlot.start_time))
    return list(db.scalars(q))


def _schedule_reminders(db: Session, booking: Booking, slot: VisitSlot, now: datetime) -> None:
    for rtype, delta in (("t_minus_24h", timedelta(hours=24)), ("t_minus_2h", timedelta(hours=2))):
        when = slot.start_time - delta
        existing = db.scalars(select(Reminder).where(Reminder.booking_id == booking.id,
                                                     Reminder.reminder_type == rtype)).first()
        if existing:
            continue  # idempotent
        # A reminder whose time already passed (late booking) is recorded as skipped, not sent.
        db.add(Reminder(booking_id=booking.id, reminder_type=rtype, scheduled_at=when,
                        status="pending" if when > now else "skipped"))


def book_slot(db: Session, lead_id: int, slot_id: int, now: datetime | None = None) -> Booking:
    """Atomically book a slot. Caller owns commit; raises BookingError subclasses on failure."""
    now = now or _now()
    lead = db.get(Lead, lead_id)
    if not lead:
        raise BookingError("lead not found")
    slot = db.scalars(select(VisitSlot).where(VisitSlot.id == slot_id).with_for_update()).first()
    if not slot:
        raise SlotNotFound("slot not found")
    if slot.status != "open" or slot.start_time <= now:
        raise SlotUnavailable("slot is not available")
    taken = db.scalars(select(Booking).where(Booking.slot_id == slot_id,
                                             Booking.status == BookingStatus.confirmed.value)).first()
    if taken:
        raise SlotUnavailable("slot already booked")
    mine = db.scalars(select(Booking).join(VisitSlot, VisitSlot.id == Booking.slot_id).where(
        Booking.lead_id == lead_id, Booking.status == BookingStatus.confirmed.value,
        VisitSlot.start_time > now)).first()
    if mine:
        raise AlreadyBooked("lead already has an upcoming visit; reschedule or cancel it first")
    booking = Booking(lead_id=lead_id, slot_id=slot_id)
    db.add(booking)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise SlotUnavailable("slot already booked")
    _schedule_reminders(db, booking, slot, now)
    lead.status = LeadStatus.visit_booked.value
    db.add(LeadActivity(lead_id=lead_id, kind="booking",
                        detail=f"Site visit booked for {slot.start_time.astimezone(IST):%d %b %Y %I:%M %p} IST"))
    return booking


def cancel_booking(db: Session, booking_id: int, lead_id: int | None = None) -> Booking:
    b = db.scalars(select(Booking).where(Booking.id == booking_id).with_for_update()).first()
    if not b or (lead_id is not None and b.lead_id != lead_id):
        raise BookingNotFound("booking not found")
    if b.status != BookingStatus.confirmed.value:
        raise BookingError("only confirmed bookings can be cancelled")
    b.status = BookingStatus.cancelled.value
    for r in db.scalars(select(Reminder).where(Reminder.booking_id == b.id, Reminder.status == "pending")):
        r.status = "skipped"
    db.add(LeadActivity(lead_id=b.lead_id, kind="booking", detail="Site visit cancelled"))
    return b


def reschedule_booking(db: Session, booking_id: int, new_slot_id: int, lead_id: int | None = None,
                       now: datetime | None = None) -> Booking:
    """Cancel + rebook in one transaction. If the new slot is taken, the old booking is untouched."""
    old = db.get(Booking, booking_id)
    if not old or (lead_id is not None and old.lead_id != lead_id):
        raise BookingNotFound("booking not found")
    if old.status != BookingStatus.confirmed.value:
        raise BookingError("only confirmed bookings can be rescheduled")
    cancel_booking(db, booking_id, lead_id)
    db.flush()
    return book_slot(db, old.lead_id, new_slot_id, now)
