from datetime import datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_admin, require_staff
from app.database import get_db
from app.models import Booking, FactSheet, Lead, Project, User, VisitSlot
from app.schemas.common import FactSheetIn, SlotBulkIn, SlotCreateIn, SlotPatchIn
from app.services.audit import audit
from app.services.booking_service import IST

router = APIRouter(prefix="/api", tags=["admin"])


def latest_fact_sheet(db: Session, project_id: int) -> FactSheet | None:
    return db.scalars(select(FactSheet).where(FactSheet.project_id == project_id)
                      .order_by(FactSheet.version.desc()).limit(1)).first()


@router.get("/projects")
def projects(_: User = Depends(require_staff), db: Session = Depends(get_db)):
    return [{"id": p.id, "name": p.name, "location": p.location, "rera_number": p.rera_number,
             "map_url": p.map_url, "is_demo_data": p.is_demo_data} for p in db.scalars(select(Project))]


@router.get("/projects/{pid}/fact-sheet")
def get_fact_sheet(pid: int, _: User = Depends(require_staff), db: Session = Depends(get_db)):
    p, fs = db.get(Project, pid), latest_fact_sheet(db, pid)
    if not p:
        raise HTTPException(404, "Project not found")
    return {"project": {"id": p.id, "name": p.name, "location": p.location, "map_url": p.map_url,
                        "rera_number": p.rera_number},
            "version": fs.version if fs else 0, "content": fs.content if fs else None}


@router.put("/projects/{pid}/fact-sheet")
def put_fact_sheet(pid: int, body: FactSheetIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    p = db.get(Project, pid)
    if not p:
        raise HTTPException(404, "Project not found")
    cur = latest_fact_sheet(db, pid)
    fs = FactSheet(project_id=pid, version=(cur.version + 1) if cur else 1,
                   content=body.content.model_dump(), updated_by=admin.id)  # versioned, never overwritten
    for f in ("location", "map_url", "rera_number"):
        if (v := getattr(body, f)) is not None:
            setattr(p, f, v)
    db.add(fs)
    audit(db, admin, "factsheet.update", "project", pid, f"{p.name}: version {fs.version}")
    db.commit()
    return {"version": fs.version}


@router.get("/slots")
def list_slots(project_id: int, _: User = Depends(require_staff), db: Session = Depends(get_db)):
    rows = db.execute(select(VisitSlot, Booking, Lead)
                      .outerjoin(Booking, (Booking.slot_id == VisitSlot.id) & (Booking.status == "confirmed"))
                      .outerjoin(Lead, Lead.id == Booking.lead_id)
                      .where(VisitSlot.project_id == project_id).order_by(VisitSlot.start_time.desc()).limit(200)).all()
    return [{"id": s.id, "start_time": s.start_time.isoformat(), "end_time": s.end_time.isoformat(),
             "status": s.status, "booking": {"id": b.id, "lead_id": l.id, "lead_name": l.name} if b else None}
            for s, b, l in rows]


@router.post("/slots", status_code=201)
def create_slot(body: SlotCreateIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    if body.start_time.tzinfo is None:
        raise HTTPException(422, "start_time must include a timezone offset")
    if not db.get(Project, body.project_id):
        raise HTTPException(404, "Project not found")
    end = body.start_time + timedelta(minutes=body.duration_minutes)
    overlap = db.scalars(select(VisitSlot).where(VisitSlot.project_id == body.project_id,
                                                 VisitSlot.start_time < end, VisitSlot.end_time > body.start_time)).first()
    if overlap:
        raise HTTPException(409, "Overlaps an existing slot")
    s = VisitSlot(project_id=body.project_id, start_time=body.start_time, end_time=end)
    db.add(s)
    db.flush()
    audit(db, admin, "slot.create", "slot", s.id, f"{body.start_time.isoformat()}")
    db.commit()
    return {"id": s.id}


@router.patch("/slots/{slot_id}")
def patch_slot(slot_id: int, body: SlotPatchIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    s = db.scalars(select(VisitSlot).where(VisitSlot.id == slot_id).with_for_update()).first()
    if not s:
        raise HTTPException(404, "Slot not found")
    if body.status == "blocked":
        if db.scalars(select(Booking).where(Booking.slot_id == slot_id, Booking.status == "confirmed")).first():
            raise HTTPException(409, "Slot has a confirmed booking; cancel or reschedule it first")
    s.status = body.status
    audit(db, admin, f"slot.{body.status}", "slot", s.id, s.start_time.isoformat())
    db.commit()
    return {"id": s.id, "status": s.status}


@router.post("/slots/bulk", status_code=201)
def bulk_slots(body: SlotBulkIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Create the same times on N consecutive days (IST). Past times and overlaps are skipped, not errors."""
    if not db.get(Project, body.project_id):
        raise HTTPException(404, "Project not found")
    now = datetime.now(timezone.utc)
    created = skipped = 0
    for d in range(body.days):
        day = body.start_date + timedelta(days=d)
        for t in body.times:
            hh, mm = map(int, t.split(":"))
            start = datetime.combine(day, time(hh, mm), tzinfo=IST).astimezone(timezone.utc)
            end = start + timedelta(minutes=body.duration_minutes)
            clash = db.scalars(select(VisitSlot).where(VisitSlot.project_id == body.project_id, VisitSlot.start_time < end,
                                                       VisitSlot.end_time > start)).first()
            if start <= now or clash:
                skipped += 1
                continue
            db.add(VisitSlot(project_id=body.project_id, start_time=start, end_time=end))
            db.flush()
            created += 1
    audit(db, admin, "slot.bulk", "project", body.project_id, f"{created} created, {skipped} skipped")
    db.commit()
    return {"created": created, "skipped": skipped}
