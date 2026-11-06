from datetime import datetime, timedelta, timezone

import pytest

from app.models import Booking, FactSheet, Handoff, Lead, Message, Project, User, VisitSlot
from app.core.security import hash_password
from app.services import ai_service as ai
from app.services.lead_service import create_lead, start_conversation
from tests.fakes import ExplodingLLM, ScriptedLLM, call, say

NOW = datetime(2026, 11, 10, 4, 0, tzinfo=timezone.utc)  # 09:30 IST


@pytest.fixture()
def w(db):
    exes = [User(name=n, email=f"{n}@t.dev", role="executive", password_hash=hash_password("x" * 8)) for n in ("Priya", "Rahul")]
    p = Project(name="Demo Project A", location="Demo Loc", rera_number="DEMO-1", map_url="https://maps.example/x")
    db.add_all(exes + [p])
    db.flush()
    db.add(FactSheet(project_id=p.id, version=1, content={"overview": "Sample", "amenities": ["Clubhouse"]}))
    slot = VisitSlot(project_id=p.id, start_time=NOW + timedelta(days=1, hours=1), end_time=NOW + timedelta(days=1, hours=2))
    db.add(slot)
    lead = create_lead(db, name="Hardik", phone="9876543210", source="portal", consent=True)
    other = create_lead(db, name="Other", phone="9876543299", source="portal")
    conv = start_conversation(db, lead)
    oconv = start_conversation(db, other)
    db.commit()
    return dict(p=p, slot=slot, lead=lead, other=other, conv=conv, oconv=oconv, exes=exes)


def send(db, w, text, llm, lead="lead", conv="conv"):
    return ai.handle_message(db, w[lead].id, w[conv].id, text, llm, now=NOW)


def test_grounded_answer_sets_first_response_and_prompt_contains_facts(db, w):
    llm = ScriptedLLM([say("Yes, there is a clubhouse.")])
    _, reply = send(db, w, "Is there a clubhouse?", llm)
    assert reply.sender == "ai" and "clubhouse" in reply.content
    assert db.get(Lead, w["lead"].id).first_response_at == NOW
    sys_prompt = llm.calls[0]["system"]
    assert "APPROVED_FACTS" in sys_prompt and "Clubhouse" in sys_prompt and "DEMO-1" in sys_prompt
    assert "Never quote a final price" in sys_prompt


def test_missing_fact_triggers_handoff_with_named_executive_and_summary(db, w):
    llm = ScriptedLLM([call("request_human_handoff", reason="missing_fact", note="asked distance to airport"),
                       say("- Buyer asked airport distance (not in fact sheet)"),  # handoff summary call
                       say("I'll have a salesperson confirm that.")])
    _, reply = send(db, w, "How far is the airport?", llm)
    h = db.query(Handoff).one()
    lead = db.get(Lead, w["lead"].id)
    assert h.reason == "missing_fact" and lead.assigned_to == h.executive_id is not None
    assert "airport" in h.summary
    assert "How far is the airport?" in llm.calls[1]["messages"][0]["content"]  # transcript reached the summary
    assert reply.meta["handoff"]["executive"] in {"Priya", "Rahul"}


def test_booking_via_tools_creates_booking_and_structured_confirmation(db, w):
    llm = ScriptedLLM([call("get_available_slots", project_id=w["p"].id, date="2026-11-11"),
                       call("book_site_visit", slot_id=w["slot"].id),
                       say("Booked! See you tomorrow.")])
    _, reply = send(db, w, "Can I visit tomorrow?", llm)
    b = db.query(Booking).one()
    assert b.lead_id == w["lead"].id and b.status == "confirmed"
    assert reply.meta["booking"]["id"] == b.id and reply.meta["handoff"]["reason"] == "booking"
    # first tool result passed back to the model contained real slot ids from the DB
    tool_result = llm.calls[1]["messages"][-1]["content"][0]["content"]
    assert str(w["slot"].id) in tool_result


def test_model_cannot_book_taken_slot_and_does_not_claim_success(db, w):
    other_lead = w["other"]
    from app.services.booking_service import book_slot
    book_slot(db, other_lead.id, w["slot"].id, now=NOW)
    db.commit()
    llm = ScriptedLLM([call("book_site_visit", slot_id=w["slot"].id), say("That slot was just taken, please pick another.")])
    _, reply = send(db, w, "Book 11am", llm)
    assert db.query(Booking).count() == 1  # only the other buyer's
    assert "booking" not in (reply.meta or {})
    assert '"ok": false' in llm.calls[1]["messages"][-1]["content"][0]["content"]


def test_model_supplied_lead_id_is_ignored_and_bad_args_dont_crash(db, w):
    llm = ScriptedLLM([call("book_site_visit", slot_id=w["slot"].id, lead_id=w["other"].id),
                       call("book_site_visit", slot_id="DROP TABLE"), call("get_available_slots", project_id=999, date="x"),
                       call("nonexistent_tool"), say("ok")])
    send(db, w, "book it", llm)
    b = db.query(Booking).one()
    assert b.lead_id == w["lead"].id  # session lead, not the injected one


def test_llm_error_falls_back_in_buyers_language_with_handoff(db, w):
    llm = ScriptedLLM([RuntimeError("timeout")])
    _, reply = send(db, w, "नमस्ते, मुझे 3 BHK चाहिए", llm)
    assert reply.meta["fallback"] is True and "सेल्स टीम" in reply.content
    assert db.query(Handoff).one().reason == "ai_error"
    assert db.get(Lead, w["lead"].id).first_response_at == NOW


def test_no_api_key_degrades_gracefully(db, w):
    _, reply = send(db, w, "hello", None)
    assert reply.meta["fallback"] is True and db.query(Handoff).count() == 1


def test_tool_loop_is_capped(db, w):
    llm = ScriptedLLM([call("save_preferences", bhk=3)] * 20)
    _, reply = send(db, w, "hi", llm)
    assert len(llm.calls) == ai.MAX_TOOL_ROUNDS and reply.meta["fallback"] is True


@pytest.mark.parametrize("text", ["I want to talk to a human", "please connect me to a salesperson", "मुझे सेल्स पर्सन से बात करनी है",
                                  "મારે સેલ્સ પર્સન સાથે વાત કરવી છે"])
def test_human_request_is_deterministic_and_idempotent(db, w, text):
    _, r1 = send(db, w, text, ExplodingLLM())
    _, r2 = send(db, w, text, ExplodingLLM())
    assert r1.meta["handoff"]["executive"] == r2.meta["handoff"]["executive"]
    assert db.query(Handoff).count() == 1


def test_language_detection_and_switch(db, w):
    assert ai.detect_language("નમસ્તે, મને 3 BHK જોઈએ છે") == "gu"
    assert ai.detect_language("नमस्ते") == "hi"
    assert ai.detect_language("hello") is None
    llm = ScriptedLLM([say("હા")])
    send(db, w, "ક્લબહાઉસ છે?", llm)
    assert "Gujarati" in llm.calls[0]["system"]


def test_preferences_saved_and_validated(db, w):
    llm = ScriptedLLM([call("save_preferences", budget_lakh=90, bhk=3, project_id=w["p"].id), call("save_preferences", bhk=99, budget_lakh=-5), say("noted")])
    send(db, w, "3bhk 90 lakh", llm)
    lead = db.get(Lead, w["lead"].id)
    assert lead.bhk == 3 and float(lead.budget_lakh) == 90 and lead.project_id == w["p"].id


def test_round_robin_picks_least_loaded(db, w):
    send(db, w, "talk to a human", ExplodingLLM())
    send(db, w, "talk to a human", ExplodingLLM(), lead="other", conv="oconv")
    owners = {db.get(Lead, w[k].id).assigned_to for k in ("lead", "other")}
    assert len(owners) == 2  # spread across both executives


def test_buyer_cannot_read_other_conversation_via_history(db, w):
    send(db, w, "secret msg", ScriptedLLM([say("ok")]))
    msgs = ai._history(db, w["oconv"].id)
    assert all("secret" not in m["content"] for m in msgs)
