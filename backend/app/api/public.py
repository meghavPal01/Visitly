"""Buyer-facing endpoints. Buyers authenticate with a session token scoped to one lead."""
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import BuyerSession, buyer_session
from app.core.security import create_buyer_token
from app.database import get_db
from app.models import Booking, Lead, Project, VisitSlot
from app.schemas.common import BookIn, EnquiryIn, RescheduleIn
from app.services import booking_service as bs
from app.services.lead_service import create_lead, current_consent, start_conversation

router = APIRouter(prefix="/api", tags=["buyer"])


def slot_out(s: VisitSlot, project: Project | None = None) -> dict:
    return {"id": s.id, "project_id": s.project_id, "start_time": s.start_time.isoformat(),
            "end_time": s.end_time.isoformat(),
            "location": project.location if project else None, "map_url": project.map_url if project else None}


def booking_out(db: Session, b: Booking) -> dict:
    slot = db.get(VisitSlot, b.slot_id)
    project = db.get(Project, slot.project_id)
    return {"id": b.id, "status": b.status, "slot": slot_out(slot, project), "project_name": project.name,
            "rera_number": project.rera_number}


@router.get("/public/projects")
def public_projects(db: Session = Depends(get_db)):
    return [{"id": p.id, "name": p.name, "location": p.location, "rera_number": p.rera_number,
             "is_demo_data": p.is_demo_data} for p in db.scalars(select(Project).order_by(Project.id))]


@router.post("/public/enquiry", status_code=201)
def enquiry(body: EnquiryIn, db: Session = Depends(get_db)):
    if body.project_id and not db.get(Project, body.project_id):
        raise HTTPException(404, "Project not found")
    lead = create_lead(db, name=body.name, phone=body.phone, source=body.source, project_id=body.project_id,
                       language=body.language, consent=body.consent)
    conv = start_conversation(db, lead)
    db.commit()
    return {"token": create_buyer_token(lead.id, conv.id), "lead_id": lead.id, "conversation_id": conv.id}


@router.get("/public/slots")
def public_slots(project_id: int, day: date, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    return [slot_out(s, project) for s in bs.available_slots(db, project_id, day)]


@router.get("/buyer/me")
def buyer_me(sess: BuyerSession = Depends(buyer_session), db: Session = Depends(get_db)):
    lead = db.get(Lead, sess.lead_id)
    now = datetime.now(timezone.utc)
    upcoming = db.scalars(select(Booking).join(VisitSlot, VisitSlot.id == Booking.slot_id).where(
        Booking.lead_id == lead.id, Booking.status == "confirmed", VisitSlot.start_time > now)).first()
    return {"lead": {"id": lead.id, "name": lead.name, "language": lead.language, "project_id": lead.project_id,
                     "budget_lakh": float(lead.budget_lakh) if lead.budget_lakh else None, "bhk": lead.bhk},
            "consent": current_consent(db, lead.id),
            "upcoming_booking": booking_out(db, upcoming) if upcoming else None}


def _run(db: Session, fn):
    try:
        result = fn()
        db.commit()
        return result
    except bs.BookingError as e:
        db.rollback()
        status = 404 if isinstance(e, (bs.SlotNotFound, bs.BookingNotFound)) else 409
        raise HTTPException(status, {"code": e.code, "message": str(e)})


@router.post("/buyer/bookings", status_code=201)
def buyer_book(body: BookIn, sess: BuyerSession = Depends(buyer_session), db: Session = Depends(get_db)):
    b = _run(db, lambda: bs.book_slot(db, sess.lead_id, body.slot_id))
    return booking_out(db, b)


@router.post("/buyer/bookings/{booking_id}/cancel")
def buyer_cancel(booking_id: int, sess: BuyerSession = Depends(buyer_session), db: Session = Depends(get_db)):
    b = _run(db, lambda: bs.cancel_booking(db, booking_id, lead_id=sess.lead_id))  # scoped: own bookings only
    return booking_out(db, b)


@router.post("/buyer/bookings/{booking_id}/reschedule")
def buyer_reschedule(booking_id: int, body: RescheduleIn, sess: BuyerSession = Depends(buyer_session),
                     db: Session = Depends(get_db)):
    b = _run(db, lambda: bs.reschedule_booking(db, booking_id, body.new_slot_id, lead_id=sess.lead_id))
    return booking_out(db, b)


@router.post("/buyer/opt-out")
def buyer_opt_out(sess: BuyerSession = Depends(buyer_session), db: Session = Depends(get_db)):
    from app.services.notification_service import set_consent
    set_consent(db, sess.lead_id, "opted_out")
    db.commit()
    return {"consent": "opted_out"}


@router.post("/buyer/consent")
def buyer_consent(sess: BuyerSession = Depends(buyer_session), db: Session = Depends(get_db)):
    from app.services.notification_service import set_consent
    set_consent(db, sess.lead_id, "granted")
    db.commit()
    return {"consent": "granted"}
