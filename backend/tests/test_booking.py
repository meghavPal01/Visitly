import threading
from datetime import datetime, timedelta, timezone

import pytest

from app.models import Booking, Project, Reminder, VisitSlot
from app.services import booking_service as bs
from app.services.lead_service import create_lead
from tests.conftest import TestSession

NOW = datetime(2026, 11, 10, 4, 0, tzinfo=timezone.utc)


def _setup(db, hours_ahead=48, n_leads=1):
    p = Project(name="Demo Project A", location="Demo Location")
    db.add(p)
    db.flush()
    slot = VisitSlot(project_id=p.id, start_time=NOW + timedelta(hours=hours_ahead),
                     end_time=NOW + timedelta(hours=hours_ahead + 1))
    db.add(slot)
    leads = [create_lead(db, name=f"L{i}", phone=f"98765432{i:02d}", source="website") for i in range(n_leads)]
    db.commit()
    return p, slot, leads


def test_booking_creates_two_reminders(db):
    _, slot, (lead,) = _setup(db)
    b = bs.book_slot(db, lead.id, slot.id, now=NOW)
    db.commit()
    rems = db.query(Reminder).filter_by(booking_id=b.id).all()
    assert {r.reminder_type for r in rems} == {"t_minus_24h", "t_minus_2h"}
    assert all(r.status == "pending" for r in rems)


def test_late_booking_skips_past_reminders(db):
    _, slot, (lead,) = _setup(db, hours_ahead=1)
    b = bs.book_slot(db, lead.id, slot.id, now=NOW)
    db.commit()
    st = {r.reminder_type: r.status for r in db.query(Reminder).filter_by(booking_id=b.id)}
    assert st == {"t_minus_24h": "skipped", "t_minus_2h": "skipped"}


def test_booked_slot_not_offered_and_cannot_be_rebooked(db):
    p, slot, (a, b) = _setup(db, n_leads=2)
    bs.book_slot(db, a.id, slot.id, now=NOW)
    db.commit()
    day = (slot.start_time.astimezone(bs.IST)).date()
    assert bs.available_slots(db, p.id, day, now=NOW) == []
    with pytest.raises(bs.SlotUnavailable):
        bs.book_slot(db, b.id, slot.id, now=NOW)


def test_past_and_blocked_slots_unavailable(db):
    p, slot, (lead,) = _setup(db)
    slot.status = "blocked"
    db.commit()
    with pytest.raises(bs.SlotUnavailable):
        bs.book_slot(db, lead.id, slot.id, now=NOW)
    slot.status = "open"
    db.commit()
    with pytest.raises(bs.SlotUnavailable):
        bs.book_slot(db, lead.id, slot.id, now=slot.start_time + timedelta(minutes=1))


def test_cancel_frees_slot_and_skips_reminders(db):
    p, slot, (a, b) = _setup(db, n_leads=2)
    bk = bs.book_slot(db, a.id, slot.id, now=NOW)
    db.commit()
    bs.cancel_booking(db, bk.id)
    db.commit()
    assert all(r.status == "skipped" for r in db.query(Reminder).filter_by(booking_id=bk.id))
    bs.book_slot(db, b.id, slot.id, now=NOW)  # now free again
    db.commit()


def test_failed_reschedule_keeps_original_booking(db):
    p, s1, (a, b) = _setup(db, n_leads=2)
    s2 = VisitSlot(project_id=p.id, start_time=s1.start_time + timedelta(hours=3),
                   end_time=s1.start_time + timedelta(hours=4))
    db.add(s2)
    db.commit()
    bs.book_slot(db, b.id, s2.id, now=NOW)
    mine = bs.book_slot(db, a.id, s1.id, now=NOW)
    db.commit()
    with pytest.raises(bs.SlotUnavailable):
        bs.reschedule_booking(db, mine.id, s2.id, now=NOW)
    db.rollback()  # API layer rolls back on BookingError
    assert db.get(Booking, mine.id).status == "confirmed"


def test_concurrent_buyers_only_one_wins():
    """Real Postgres, 12 threads, one slot: exactly one booking succeeds."""
    s = TestSession()
    _, slot, leads = _setup(s, n_leads=12)
    slot_id, lead_ids = slot.id, [l.id for l in leads]
    s.close()
    barrier = threading.Barrier(len(lead_ids))
    results: list[str] = []

    def worker(lid):
        sess = TestSession()
        try:
            barrier.wait()
            bs.book_slot(sess, lid, slot_id, now=NOW)
            sess.commit()
            results.append("ok")
        except bs.SlotUnavailable:
            sess.rollback()
            results.append("taken")
        finally:
            sess.close()

    ts = [threading.Thread(target=worker, args=(i,)) for i in lead_ids]
    [t.start() for t in ts]
    [t.join() for t in ts]
    chk = TestSession()
    try:
        assert results.count("ok") == 1 and results.count("taken") == 11
        assert chk.query(Booking).filter_by(slot_id=slot_id, status="confirmed").count() == 1
    finally:
        from tests.conftest import test_engine, Base
        chk.close()
        with test_engine.begin() as c:
            for t in reversed(Base.metadata.sorted_tables):
                c.execute(t.delete())
