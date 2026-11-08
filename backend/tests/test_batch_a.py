import csv
import io
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.core import ratelimit
from app.core.security import create_staff_token, hash_password
from app.database import get_db
from app.main import app
from app.models import (AuditLog, Booking, Conversation, FactSheet, Handoff, Lead, Message, Project, User, VisitSlot)
from app.services import ai_service as ai
from app.services import analytics_service as an
from app.services.handoff_service import create_handoff
from app.services.lead_service import create_lead, start_conversation
from tests.fakes import ExplodingLLM, ScriptedLLM, say

client = TestClient(app)
NOW = datetime.now(timezone.utc)


@pytest.fixture(autouse=True)
def _override(db):
    app.dependency_overrides[get_db] = lambda: db
    yield
    app.dependency_overrides.clear()


def H(u):
    return {"Authorization": f"Bearer {create_staff_token(u.id, u.role)}"}


@pytest.fixture()
def w(db):
    admin = User(name="Admin", email="a@t.dev", role="admin", password_hash=hash_password("admin-pass-1"))
    e1 = User(name="E1", email="e1@t.dev", role="executive", password_hash=hash_password("exec-pass-1"))
    e2 = User(name="E2", email="e2@t.dev", role="executive", password_hash=hash_password("exec-pass-2"))
    p = Project(name="P", location="L", rera_number="R-1", map_url="https://maps.example/p")
    db.add_all([admin, e1, e2, p])
    db.flush()
    db.add(FactSheet(project_id=p.id, version=1, content={"overview": "Old", "amenities": ["Gym"]}))
    db.add(FactSheet(project_id=p.id, version=2, content={"overview": "New overview", "amenities": ["Gym", "Pool"], "possession": "Soon"}))
    lead = create_lead(db, name="Hardik", phone="9876543210", source="portal", consent=True)
    lead.assigned_to = e1.id
    conv = start_conversation(db, lead)
    db.commit()
    return dict(admin=admin, e1=e1, e2=e2, p=p, lead=lead, conv=conv)


# ---------------- login rate limit ----------------
def test_login_locks_after_five_failures_even_for_correct_password(w):
    for _ in range(5):
        assert client.post("/api/auth/login", json={"email": "a@t.dev", "password": "wrong"}).status_code == 401
    r = client.post("/api/auth/login", json={"email": "a@t.dev", "password": "admin-pass-1"})
    assert r.status_code == 429 and int(r.headers["Retry-After"]) > 0
    # a different account is unaffected
    assert client.post("/api/auth/login", json={"email": "e1@t.dev", "password": "exec-pass-1"}).status_code == 200


def test_successful_login_resets_the_counter(w):
    for _ in range(4):
        client.post("/api/auth/login", json={"email": "a@t.dev", "password": "wrong"})
    assert client.post("/api/auth/login", json={"email": "a@t.dev", "password": "admin-pass-1"}).status_code == 200
    for _ in range(4):
        assert client.post("/api/auth/login", json={"email": "a@t.dev", "password": "wrong"}).status_code == 401


def test_ratelimit_window_expires():
    t0 = 1_000_000.0
    for _ in range(5):
        ratelimit.record_failure("x@t.dev", "1.1.1.1", now=t0)
    assert ratelimit.retry_after("x@t.dev", "1.1.1.1", now=t0 + 10) > 0
    assert ratelimit.retry_after("x@t.dev", "1.1.1.1", now=t0 + ratelimit.WINDOW_SECONDS + 5) == 0


# ---------------- staff reply / resume assistant ----------------
def test_staff_reply_reaches_buyer_pauses_ai_and_counts_as_first_response(db, w):
    lead = w["lead"]
    r = client.post(f"/api/leads/{lead.id}/reply", json={"text": "Hi Hardik, this is E1. Happy to help."}, headers=H(w["e1"]))
    assert r.status_code == 201
    db.expire_all()
    assert db.get(Lead, lead.id).first_response_at is not None and db.get(Lead, lead.id).status == "contacted"
    assert db.get(Conversation, w["conv"].id).status == "human_active"
    # buyer sees it; and the assistant stays silent while a human is active (model must not be called)
    out = ai.handle_message(db, lead.id, w["conv"].id, "Thanks, can we talk at 5?", ExplodingLLM())
    assert [m.sender for m in out] == ["buyer"]
    # hand back: assistant answers again
    assert client.post(f"/api/leads/{lead.id}/resume-assistant", headers=H(w["e1"])).status_code == 200
    out = ai.handle_message(db, lead.id, w["conv"].id, "Does it have a pool?", ScriptedLLM([say("Yes, a pool.")]))
    assert [m.sender for m in out] == ["buyer", "ai"]


def test_staff_reply_permissions_and_validation(db, w):
    lead = w["lead"]
    assert client.post(f"/api/leads/{lead.id}/reply", json={"text": "x"}, headers=H(w["e2"])).status_code == 403  # not their lead
    assert client.post(f"/api/leads/{lead.id}/reply", json={"text": ""}, headers=H(w["e1"])).status_code == 422
    assert client.post(f"/api/leads/{lead.id}/reply", json={"text": "y" * 1001}, headers=H(w["e1"])).status_code == 422
    nochat = create_lead(db, name="NoChat", phone="9876500099", source="social")
    db.commit()
    assert client.post(f"/api/leads/{nochat.id}/reply", json={"text": "hello"}, headers=H(w["admin"])).status_code == 404


# ---------------- inbox ----------------
def test_inbox_lifecycle_waiting_replied_waiting_again(db, w):
    lead, conv = w["lead"], w["conv"]
    h = create_handoff(db, lead, conv, "missing_fact", None, note="asked possession")
    h.created_at = NOW - timedelta(minutes=30)
    db.commit()
    items = client.get("/api/inbox", headers=H(w["e1"])).json()
    assert items["count"] == 1 and items["items"][0]["waiting_minutes"] >= 29 and items["items"][0]["reason"] == "missing_fact"
    client.post(f"/api/leads/{lead.id}/reply", json={"text": "On it"}, headers=H(w["e1"]))
    assert client.get("/api/inbox", headers=H(w["e1"])).json()["count"] == 0  # answered
    ai.handle_message(db, lead.id, conv.id, "Any update?", ExplodingLLM())  # buyer writes again, assistant paused
    items = client.get("/api/inbox", headers=H(w["e1"])).json()
    assert items["count"] == 1 and "Any update" in items["items"][0]["last_buyer_message"]


def test_inbox_excludes_won_and_other_executives(db, w):
    lead, conv = w["lead"], w["conv"]
    create_handoff(db, lead, conv, "buyer_request", None)
    lead.assigned_to = w["e1"].id
    db.commit()
    assert client.get("/api/inbox", headers=H(w["e2"])).json()["count"] == 0  # not theirs
    assert client.get("/api/inbox", headers=H(w["admin"])).json()["count"] == 1
    lead.status = "won"
    db.commit()
    assert client.get("/api/inbox", headers=H(w["admin"])).json()["count"] == 0


# ---------------- bulk slots ----------------
def _bulk(w, **over):
    body = {"project_id": w["p"].id, "start_date": (NOW + timedelta(days=3)).date().isoformat(), "days": 3,
            "times": ["10:00", "14:30"], "duration_minutes": 60, **over}
    return client.post("/api/slots/bulk", json=body, headers=H(w["admin"]))


def test_bulk_slots_creates_skips_overlaps_and_is_idempotent(db, w):
    r = _bulk(w)
    assert r.status_code == 201 and r.json() == {"created": 6, "skipped": 0}
    assert _bulk(w).json() == {"created": 0, "skipped": 6}  # second run is a no-op
    assert db.query(VisitSlot).filter_by(project_id=w["p"].id).count() == 6
    assert _bulk(w, times=["10:30"], start_date=(NOW + timedelta(days=3)).date().isoformat(), days=1).json()["skipped"] == 1  # overlaps 10:00-11:00


def test_bulk_slots_skips_past_validates_and_requires_admin(db, w):
    yesterday = (NOW - timedelta(days=2)).date().isoformat()
    assert _bulk(w, start_date=yesterday, days=1).json() == {"created": 0, "skipped": 2}
    assert _bulk(w, times=["25:00"]).status_code == 422
    assert _bulk(w, times=[]).status_code == 422
    assert _bulk(w, days=99).status_code == 422
    bad = client.post("/api/slots/bulk", json={"project_id": w["p"].id, "start_date": "2030-01-01", "days": 1, "times": ["10:00"]}, headers=H(w["e1"]))
    assert bad.status_code == 403


# ---------------- audit log ----------------
def test_sensitive_actions_are_audited_and_log_is_admin_only(db, w):
    adm = H(w["admin"])
    client.put(f"/api/projects/{w['p'].id}/fact-sheet", json={"content": {"overview": "X"}}, headers=adm)
    _bulk(w)
    client.patch(f"/api/leads/{w['lead'].id}/assign", json={"executive_id": w["e2"].id}, headers=adm)
    actions = {a.action for a in db.query(AuditLog)}
    assert {"factsheet.update", "slot.bulk", "lead.assign"} <= actions
    log = client.get("/api/audit", headers=adm).json()
    assert log[0]["actor"] == "Admin" and all("action" in x for x in log)
    assert client.get("/api/audit", headers=H(w["e1"])).status_code == 403


# ---------------- CSV export ----------------
def test_csv_export_masks_for_executives_full_for_admin_and_blocks_formula_injection(db, w):
    evil = create_lead(db, name="=HYPERLINK(\"http://evil\")", phone="9876511111", source="website")
    evil.assigned_to = w["e1"].id
    db.commit()
    adm = client.get("/api/leads/export.csv", headers=H(w["admin"]))
    assert adm.status_code == 200 and adm.headers["content-type"].startswith("text/csv")
    rows = list(csv.reader(io.StringIO(adm.text)))
    assert rows[0][:3] == ["id", "name", "phone"]
    names = [r[1] for r in rows[1:]]
    assert any(n.startswith("'=HYPERLINK") for n in names) and not any(n.startswith("=") for n in names)
    assert any("9876543210" in r[2] for r in rows[1:])  # admin: full number (guarded with a leading quote)
    ex = client.get("/api/leads/export.csv", headers=H(w["e1"])).text
    assert "9876543210" not in ex and "•" in ex  # executive: masked
    only = client.get("/api/leads/export.csv?source=website", headers=H(w["admin"])).text
    assert "Hardik" not in only


def test_csv_requires_auth(w):
    assert client.get("/api/leads/export.csv").status_code == 401


# ---------------- analytics compare ----------------
def test_analytics_reports_previous_period(db, w):
    for i, off in enumerate((5, 6, 40, 41, 42)):  # 2 leads this 30-day window, 3 in the previous
        l = create_lead(db, name=f"A{i}", phone=f"98765000{i:02d}", source="portal", created_at=NOW - timedelta(days=off))
        l.first_response_at = l.created_at + timedelta(seconds=60 if off < 30 else 300)
    db.commit()
    m = an.compute(db, days=30, now=NOW)
    assert m["totals"]["leads"] >= 2 and m["previous_totals"]["leads"] == 3
    assert m["previous_totals"]["avg_first_response_seconds"] == 300
    assert an.compute(db, days=30, now=NOW, compare=False)["previous_totals"] is None


# ---------------- public project cards / buyer state ----------------
def test_public_projects_expose_only_latest_approved_facts(w):
    p = client.get("/api/public/projects").json()[0]
    assert p["overview"] == "New overview" and p["amenities"] == ["Gym", "Pool"] and p["possession"] == "Soon"
    assert set(p) >= {"id", "name", "location", "rera_number", "bhk_options"}
    assert "password_hash" not in str(p)


def test_buyer_me_reports_human_takeover(db, w):
    from app.core.security import create_buyer_token
    tok = {"Authorization": f"Bearer {create_buyer_token(w['lead'].id, w['conv'].id)}"}
    assert client.get("/api/buyer/me", headers=tok).json()["conversation"] == {"status": "ai", "executive": None}
    client.post(f"/api/leads/{w['lead'].id}/reply", json={"text": "Hello"}, headers=H(w["e1"]))
    assert client.get("/api/buyer/me", headers=tok).json()["conversation"] == {"status": "human_active", "executive": "E1"}
