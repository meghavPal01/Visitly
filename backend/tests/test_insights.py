from datetime import datetime, timedelta, timezone

from app.models import Booking, MessageTemplate, NotificationLog, Project, Reminder, SourceSpend, VisitSlot
from app.services import analytics_service as an
from app.services import booking_service as bs
from app.services import notification_service as ns
from app.services.lead_service import create_lead

NOW = datetime(2026, 11, 10, 4, 0, tzinfo=timezone.utc)


def _project(db):
    p = Project(name="Demo A", location="Loc", rera_number="DEMO-1", map_url="https://maps.example/p")
    db.add(p)
    db.add_all([MessageTemplate(key="visit_reminder", language="en", kind="transactional", body="Hi {name}, visit {when} at {project}"),
                MessageTemplate(key="new_launch", language="en", kind="promotional", body="Hi {name} promo")])
    db.flush()
    return p


def _booked(db, p, hours_ahead=48, phone="9876500001", consent=True):
    lead = create_lead(db, name="Hardik", phone=phone, source="portal", consent=consent)
    s = VisitSlot(project_id=p.id, start_time=NOW + timedelta(hours=hours_ahead), end_time=NOW + timedelta(hours=hours_ahead + 1))
    db.add(s)
    db.flush()
    b = bs.book_slot(db, lead.id, s.id, now=NOW)
    db.commit()
    return lead, s, b


def test_reminders_sent_once_at_the_right_times(db):
    p = _project(db)
    lead, s, b = _booked(db, p)  # visit at NOW+48h
    assert ns.process_due_reminders(db, NOW + timedelta(hours=23)) == {"sent": 0, "skipped": 0, "failed": 0}
    r = ns.process_due_reminders(db, NOW + timedelta(hours=24, minutes=1))
    assert r["sent"] == 1
    assert ns.process_due_reminders(db, NOW + timedelta(hours=24, minutes=5))["sent"] == 0  # idempotent
    assert ns.process_due_reminders(db, NOW + timedelta(hours=46, minutes=1))["sent"] == 1
    logs = db.query(NotificationLog).all()
    assert len(logs) == 2 and all(l.simulated and l.status == "simulated_sent" for l in logs)
    assert {x.status for x in db.query(Reminder)} == {"sent"}


def test_opted_out_buyer_gets_no_reminder_and_block_is_logged(db):
    p = _project(db)
    lead, s, b = _booked(db, p)
    ns.set_consent(db, lead.id, "opted_out")
    db.commit()
    r = ns.process_due_reminders(db, NOW + timedelta(hours=25))
    assert r["sent"] == 0 and r["skipped"] == 1
    assert db.query(NotificationLog).one().status == "blocked_opt_out"


def test_cancelled_booking_reminders_never_send(db):
    p = _project(db)
    lead, s, b = _booked(db, p)
    bs.cancel_booking(db, b.id)
    db.commit()
    assert ns.process_due_reminders(db, NOW + timedelta(hours=47))["sent"] == 0
    assert db.query(NotificationLog).count() == 0


def test_promotional_requires_consent_and_respects_opt_out(db):
    _project(db)
    a = create_lead(db, name="A", phone="9876500011", source="web" if False else "website", consent=True)
    b = create_lead(db, name="B", phone="9876500012", source="website", consent=False)
    c = create_lead(db, name="C", phone="9876500013", source="website", consent=True)
    ns.set_consent(db, c.id, "opted_out")
    db.commit()
    assert ns.send_message(db, a, "new_launch").status == "simulated_sent"
    assert ns.send_message(db, b, "new_launch").status == "blocked_no_consent"
    assert ns.send_message(db, c, "new_launch").status == "blocked_opt_out"
    # re-granting after opt-out restores contact (latest consent record wins)
    ns.set_consent(db, c.id, "granted")
    db.commit()
    assert ns.send_message(db, c, "new_launch").status == "simulated_sent"


def test_analytics_computed_from_rows(db):
    p = _project(db)
    mk = lambda i, src, resp: create_lead(db, name=f"L{i}", phone=f"98765001{i:02d}", source=src, created_at=NOW - timedelta(days=5))
    leads = [mk(i, "portal" if i < 4 else "social", None) for i in range(6)]
    for l, secs in zip(leads, [30, 60, 100, 300, 45, 600]):
        l.first_response_at = l.created_at + timedelta(seconds=secs)
    slots = []
    for i in range(3):
        s = VisitSlot(project_id=p.id, start_time=NOW - timedelta(days=2, hours=i), end_time=NOW - timedelta(days=2, hours=i - 1))
        db.add(s)
        slots.append(s)
    db.flush()
    for lead, s, st in zip(leads[:3], slots, ["completed", "completed", "no_show"]):
        db.add(Booking(lead_id=lead.id, slot_id=s.id, status=st, created_at=NOW - timedelta(days=4)))
    db.add(SourceSpend(source="portal", period_start=NOW - timedelta(days=60), period_end=NOW, amount_inr=600000))
    db.commit()
    m = an.compute(db, days=60, now=NOW)
    t = m["totals"]
    assert t["leads"] == 6 and t["visits_booked"] == 3
    assert t["avg_first_response_seconds"] == round((30 + 60 + 100 + 300 + 45 + 600) / 6)
    assert t["within_sla_pct"] == round(4 / 6, 4)  # 30,60,100,45 <= 120s
    assert t["show_up_rate"] == round(2 / 3, 4)
    portal = next(s for s in m["by_source"] if s["source"] == "portal")
    assert portal["completed"] == 2 and portal["spend_inr"] == 600000 and portal["cost_per_visit"] == 300000
    assert next(s for s in m["by_source"] if s["source"] == "hoarding")["cost_per_visit"] is None  # no divide-by-zero


def test_analytics_empty_db_is_safe(db):
    m = an.compute(db, days=30, now=NOW)
    assert m["totals"]["leads"] == 0 and m["totals"]["avg_first_response_seconds"] is None and m["totals"]["show_up_rate"] is None
