import threading
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.core.security import create_staff_token, hash_password
from app.database import get_db
from app.main import app
from app.models import Booking, Lead, LeadActivity, Project, Unit, User, VisitSlot
from app.services import crm_service as crm
from app.services import booking_service as bs
from app.services.lead_service import create_lead, start_conversation
from tests.conftest import TestSession, test_engine, Base

client = TestClient(app)


@pytest.fixture(autouse=True)
def _override(db):
    app.dependency_overrides[get_db] = lambda: db
    yield
    app.dependency_overrides.clear()


@pytest.fixture()
def w(db):
    admin = User(name="Admin", email="a@t.dev", role="admin", password_hash=hash_password("x" * 8))
    e1 = User(name="E1", email="e1@t.dev", role="executive", password_hash=hash_password("x" * 8))
    p = Project(name="P", location="L")
    db.add_all([admin, e1, p])
    db.flush()
    units = [Unit(project_id=p.id, label=f"A-{i}", bhk=3) for i in range(2)]
    db.add_all(units)
    a = create_lead(db, name="Hardik", phone="9876543210", source="portal", consent=True)
    b = create_lead(db, name="Hardik P", phone="09876543210", source="website")
    other = create_lead(db, name="Other", phone="9876500000", source="social")
    for l in (a, b, other):
        l.assigned_to = e1.id
    ca, cb = start_conversation(db, a), start_conversation(db, b)
    t = datetime.now(timezone.utc) + timedelta(days=2)
    s = VisitSlot(project_id=p.id, start_time=t, end_time=t + timedelta(hours=1))
    db.add(s)
    db.flush()
    bs.book_slot(db, b.id, s.id)
    db.commit()
    H = lambda u: {"Authorization": f"Bearer {create_staff_token(u.id, u.role)}"}
    return dict(admin=admin, e1=e1, p=p, units=units, a=a, b=b, other=other, ca=ca, cb=cb, H=H)


def test_merge_moves_history_and_tombstones_source(db, w):
    r = client.post(f"/api/leads/{w['b'].id}/merge", json={"into_id": w["a"].id}, headers=w["H"](w["e1"]))
    assert r.status_code == 200
    db.expire_all()
    assert db.get(Lead, w["b"].id).merged_into == w["a"].id
    assert db.query(Booking).filter_by(lead_id=w["a"].id).count() == 1  # booking followed the primary
    assert any(x.kind == "merge" for x in db.query(LeadActivity).filter_by(lead_id=w["a"].id))
    # merged lead disappears from list but still exists
    ids = [i["id"] for i in client.get("/api/leads", headers=w["H"](w["e1"])).json()["items"]]
    assert w["b"].id not in ids and w["a"].id in ids


def test_merge_rejects_different_phone_self_and_double_merge(db, w):
    h = w["H"](w["e1"])
    assert client.post(f"/api/leads/{w['a'].id}/merge", json={"into_id": w["other"].id}, headers=h).status_code == 409
    assert client.post(f"/api/leads/{w['a'].id}/merge", json={"into_id": w["a"].id}, headers=h).status_code == 409
    assert client.post(f"/api/leads/{w['b'].id}/merge", json={"into_id": w["a"].id}, headers=h).status_code == 200
    assert client.post(f"/api/leads/{w['b'].id}/merge", json={"into_id": w["a"].id}, headers=h).status_code == 409


def test_successful_payment_holds_unit_and_blocks_second_buyer(db, w):
    h, u = w["H"](w["e1"]), w["units"][0]
    assert client.post(f"/api/leads/{w['a'].id}/payments", json={"unit_id": u.id, "outcome": "failed"}, headers=h).status_code == 201
    db.expire_all()
    assert db.get(Unit, u.id).status == "available"  # failed payment holds nothing
    assert client.post(f"/api/leads/{w['a'].id}/payments", json={"unit_id": u.id, "outcome": "success"}, headers=h).status_code == 201
    db.expire_all()
    assert db.get(Unit, u.id).status == "held" and db.get(Unit, u.id).held_by_lead == w["a"].id
    r = client.post(f"/api/leads/{w['other'].id}/payments", json={"unit_id": u.id, "outcome": "success"}, headers=h)
    assert r.status_code == 409


def test_allotment_requires_hold_payment_and_admin(db, w):
    u, adm, ex = w["units"][0], w["H"](w["admin"]), w["H"](w["e1"])
    assert client.post(f"/api/units/{u.id}/allot", headers=adm).status_code == 409  # not held
    client.post(f"/api/leads/{w['a'].id}/payments", json={"unit_id": u.id, "outcome": "success"}, headers=ex)
    assert client.post(f"/api/units/{u.id}/allot", headers=ex).status_code == 403  # executive can't allot
    assert client.post(f"/api/units/{u.id}/allot", headers=adm).status_code == 200
    db.expire_all()
    assert db.get(Unit, u.id).status == "allotted" and db.get(Lead, w["a"].id).status == "won"
    assert client.post(f"/api/units/{u.id}/release", headers=adm).status_code == 409  # allotted can't be released


def test_payment_amount_and_outcome_validated(db, w):
    h, u = w["H"](w["e1"]), w["units"][0]
    for bad in ({"unit_id": u.id, "outcome": "success", "amount_inr": 10}, {"unit_id": u.id, "outcome": "refunded"},
                {"unit_id": u.id, "outcome": "success", "amount_inr": 99999999}):
        assert client.post(f"/api/leads/{w['a'].id}/payments", json=bad, headers=h).status_code == 422


def test_calls_and_tasks(db, w):
    h = w["H"](w["e1"])
    assert client.post(f"/api/leads/{w['a'].id}/calls", json={"outcome": "connected", "duration_sec": 95, "notes": "Wants 3BHK"}, headers=h).status_code == 201
    assert client.post(f"/api/leads/{w['a'].id}/calls", json={"outcome": "teleported"}, headers=h).status_code == 422
    r = client.post(f"/api/leads/{w['a'].id}/tasks", json={"title": "Send brochure", "due_at": "2030-01-01T10:00:00+05:30"}, headers=h)
    assert r.status_code == 201
    assert client.post(f"/api/leads/{w['a'].id}/tasks", json={"title": "x", "due_at": "2030-01-01T10:00:00"}, headers=h).status_code == 422
    d = client.get(f"/api/leads/{w['a'].id}", headers=h).json()
    assert d["calls"][0]["simulated"] is True and d["calls"][0]["duration_sec"] == 95 and d["status"] == "contacted"
    assert client.patch(f"/api/tasks/{r.json()['id']}/done", headers=h).status_code == 200
    assert client.get(f"/api/leads/{w['a'].id}", headers=h).json()["tasks"][0]["done"] is True


def test_executive_cannot_touch_other_execs_lead_in_crm(db, w):
    e2 = User(name="E2", email="e2@t.dev", role="executive", password_hash=hash_password("x" * 8))
    db.add(e2)
    db.commit()
    h2 = w["H"](e2)
    assert client.post(f"/api/leads/{w['a'].id}/calls", json={"outcome": "busy"}, headers=h2).status_code == 403
    assert client.post(f"/api/leads/{w['a'].id}/payments", json={"unit_id": w["units"][0].id, "outcome": "success"}, headers=h2).status_code == 403


def test_concurrent_holds_only_one_buyer_gets_the_unit():
    s = TestSession()
    e = User(name="E", email="e@t.dev", role="executive", password_hash="x")
    p = Project(name="P", location="L")
    s.add_all([e, p])
    s.flush()
    u = Unit(project_id=p.id, label="A-1", bhk=3)
    s.add(u)
    leads = [create_lead(s, name=f"L{i}", phone=f"98765001{i:02d}", source="portal") for i in range(8)]
    s.commit()
    uid, lids, eid = u.id, [l.id for l in leads], e.id
    s.close()
    bar, res = threading.Barrier(8), []

    def go(lid):
        ss = TestSession()
        try:
            bar.wait()
            crm.take_payment(ss, ss.get(Lead, lid), ss.get(User, eid), uid, "success", 50000)
            ss.commit(); res.append("ok")
        except crm.CrmError:
            ss.rollback(); res.append("no")
        finally:
            ss.close()
    ts = [threading.Thread(target=go, args=(i,)) for i in lids]
    [t.start() for t in ts]; [t.join() for t in ts]
    try:
        assert res.count("ok") == 1 and res.count("no") == 7
    finally:
        with test_engine.begin() as c:
            for t in reversed(Base.metadata.sorted_tables):
                c.execute(t.delete())
