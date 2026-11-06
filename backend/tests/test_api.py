from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.core.security import create_buyer_token, create_staff_token, hash_password
from app.main import app
from app.models import Lead, Project, User, VisitSlot
from app.database import get_db
from tests.conftest import TestSession

client = TestClient(app)


@pytest.fixture(autouse=True)
def _override_db(db):
    app.dependency_overrides[get_db] = lambda: db
    yield
    app.dependency_overrides.clear()


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture()
def world(db):
    admin = User(name="Admin", email="a@t.dev", role="admin", password_hash=hash_password("pw-admin-1"))
    e1 = User(name="E1", email="e1@t.dev", role="executive", password_hash=hash_password("pw-exec-1"))
    e2 = User(name="E2", email="e2@t.dev", role="executive", password_hash=hash_password("pw-exec-2"))
    p = Project(name="P", location="L")
    db.add_all([admin, e1, e2, p])
    db.flush()
    t = datetime.now(timezone.utc) + timedelta(days=2)
    s = VisitSlot(project_id=p.id, start_time=t, end_time=t + timedelta(hours=1))
    db.add(s)
    db.commit()
    return dict(admin=admin, e1=e1, e2=e2, p=p, slot=s)


def test_invalid_login_denied(world):
    assert client.post("/api/auth/login", json={"email": "a@t.dev", "password": "wrong"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "nobody@t.dev", "password": "x"}).status_code == 401
    r = client.post("/api/auth/login", json={"email": "a@t.dev", "password": "pw-admin-1"})
    assert r.status_code == 200 and r.json()["user"]["role"] == "admin"


def test_endpoints_require_auth(world):
    assert client.get("/api/leads").status_code == 401
    assert client.get("/api/leads", headers=H("garbage")).status_code == 401


def test_buyer_token_cannot_use_staff_endpoints(world, db):
    lead_r = client.post("/api/public/enquiry", json={"name": "Buyer One", "phone": "9876543210", "consent": True})
    assert lead_r.status_code == 201
    assert client.get("/api/leads", headers=H(lead_r.json()["token"])).status_code == 403


def test_enquiry_validation(world):
    bad = client.post("/api/public/enquiry", json={"name": "X", "phone": "123"})
    assert bad.status_code == 422
    bad2 = client.post("/api/public/enquiry", json={"name": "Valid Name", "phone": "9876543210", "source": "tv"})
    assert bad2.status_code == 422


def test_executive_cannot_see_other_execs_lead_or_admin_endpoints(world, db):
    lead = Lead(name="Mine", phone="9876543210", phone_normalized="+919876543210", source="portal",
                assigned_to=world["e1"].id)
    db.add(lead)
    db.commit()
    t1, t2 = (create_staff_token(world[k].id, "executive") for k in ("e1", "e2"))
    assert client.get(f"/api/leads/{lead.id}", headers=H(t1)).status_code == 200
    assert client.get(f"/api/leads/{lead.id}", headers=H(t2)).status_code == 403
    assert client.get("/api/leads", headers=H(t2)).json()["total"] == 0
    assert client.patch(f"/api/leads/{lead.id}/assign", json={"executive_id": world["e2"].id}, headers=H(t2)).status_code == 403
    assert client.post("/api/slots", headers=H(t2), json={"project_id": world["p"].id,
                       "start_time": "2030-01-01T10:00:00+05:30"}).status_code == 403


def test_lead_list_masks_phone_but_detail_shows_it(world, db):
    lead = Lead(name="M", phone="9876543210", phone_normalized="+919876543210", source="portal")
    db.add(lead)
    db.commit()
    tok = create_staff_token(world["admin"].id, "admin")
    row = client.get("/api/leads", headers=H(tok)).json()["items"][0]
    assert "76543" not in row["phone"]
    assert client.get(f"/api/leads/{lead.id}", headers=H(tok)).json()["phone"] == "+919876543210"


def test_buyer_booking_flow_and_isolation(world, db):
    a = client.post("/api/public/enquiry", json={"name": "Buyer A", "phone": "9876500001", "consent": True}).json()
    b = client.post("/api/public/enquiry", json={"name": "Buyer B", "phone": "9876500002", "consent": True}).json()
    slot_id = world["slot"].id
    r = client.post("/api/buyer/bookings", json={"slot_id": slot_id}, headers=H(a["token"]))
    assert r.status_code == 201
    bid = r.json()["id"]
    # B cannot take the same slot
    r2 = client.post("/api/buyer/bookings", json={"slot_id": slot_id}, headers=H(b["token"]))
    assert r2.status_code == 409 and r2.json()["detail"]["code"] == "slot_unavailable"
    # B cannot cancel A's booking
    assert client.post(f"/api/buyer/bookings/{bid}/cancel", headers=H(b["token"])).status_code == 404
    # A can cancel own booking, then B can book it
    assert client.post(f"/api/buyer/bookings/{bid}/cancel", headers=H(a["token"])).status_code == 200
    assert client.post("/api/buyer/bookings", json={"slot_id": slot_id}, headers=H(b["token"])).status_code == 201


def test_cannot_block_booked_slot_and_fact_sheet_versioning(world, db):
    a = client.post("/api/public/enquiry", json={"name": "Buyer A", "phone": "9876500001"}).json()
    client.post("/api/buyer/bookings", json={"slot_id": world["slot"].id}, headers=H(a["token"]))
    adm = create_staff_token(world["admin"].id, "admin")
    assert client.patch(f"/api/slots/{world['slot'].id}", json={"status": "blocked"}, headers=H(adm)).status_code == 409
    body = {"content": {"overview": "Sample"}, "rera_number": "DEMO-1"}
    pid = world["p"].id
    assert client.put(f"/api/projects/{pid}/fact-sheet", json=body, headers=H(adm)).json()["version"] == 1
    assert client.put(f"/api/projects/{pid}/fact-sheet", json=body, headers=H(adm)).json()["version"] == 2
    bad = {"content": {"overview": "x", "bhk_options": [{"bhk": 99}]}}
    assert client.put(f"/api/projects/{pid}/fact-sheet", json=bad, headers=H(adm)).status_code == 422
