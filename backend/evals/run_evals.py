"""Re-runnable evaluation of the buyer assistant against a REAL model.

    cd backend && source .venv/bin/activate
    AI_API_KEY=... AI_MODEL=... python evals/run_evals.py            # all cases
    python evals/run_evals.py --only human-en,book-flow              # subset
    python evals/run_evals.py --stub                                 # no key: checks the harness itself

It uses TEST_DATABASE_URL (never your dev database), builds its own tiny world (one project, a fact sheet, two
executives, slots tomorrow) and checks behavioural rules, not exact wording. A failing case means "look at this
transcript", not necessarily "the model is wrong": read the printed reply before tuning the prompt.
Exit code 1 if any case fails.
"""
import argparse
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.core.config import get_settings  # noqa: E402

os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", get_settings().test_database_url)
get_settings.cache_clear()

from sqlalchemy import select  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models import Booking, FactSheet, Handoff, Lead, Project, User, VisitSlot  # noqa: E402
from app.services import ai_service as ai  # noqa: E402
from app.services.lead_service import create_lead, start_conversation  # noqa: E402
from app.services.llm import LLMResult, get_llm  # noqa: E402


class StubLLM:
    """Says something generic and never calls tools. Proves the harness runs; most behavioural cases should FAIL."""
    def complete(self, system, messages, tools=None):
        return LLMResult(text="Thanks for your message. How can I help?")


def build_world(db):
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    for n in ("Priya", "Rahul"):
        db.add(User(name=n, email=f"{n.lower()}@eval.dev", role="executive", password_hash=hash_password("x" * 12)))
    p = Project(name="Demo Project A", location="Demo Locality (placeholder)", rera_number="DEMO-RERA-0001 (placeholder)", map_url="https://maps.example/a")
    p2 = Project(name="Demo Project B", location="Another Locality (placeholder)", rera_number="DEMO-RERA-0002 (placeholder)")
    db.add_all([p, p2])
    db.flush()
    db.add(FactSheet(project_id=p.id, version=1, content={
        "overview": "SAMPLE: residential apartments.", "possession": None, "amenities": ["Clubhouse", "Gym", "Covered parking"],
        "bhk_options": [{"bhk": 3, "carpet_sqft": 1350, "indicative_price_lakh_min": 80, "indicative_price_lakh_max": 100}],
        "location_highlights": [], "faqs": []}))
    db.add(FactSheet(project_id=p2.id, version=1, content={"overview": "SAMPLE: second project.", "amenities": ["Pool"], "bhk_options": []}))
    tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).replace(minute=0, second=0, microsecond=0)
    for i, h in enumerate((5, 7, 9)):  # 10:30, 12:30, 14:30 IST-ish, whatever the date, all in the future
        t = tomorrow.replace(hour=h)
        db.add(VisitSlot(project_id=p.id, start_time=t, end_time=t + timedelta(hours=1)))
    db.add(Lead(name="Someone Else", phone="9000000001", phone_normalized="+919000000001", source="portal"))
    db.commit()


def check(case, replies, db, lead_id):
    e, fails = case["expect"], []
    text = "\n".join(r.content for r in replies if r.sender == "ai")
    tools = [t for r in replies for t in ((r.meta or {}).get("tools") or [])]
    handoff = any((r.meta or {}).get("handoff") for r in replies)
    booked = db.scalars(select(Booking).where(Booking.lead_id == lead_id)).all()
    others = db.scalars(select(Booking).where(Booking.lead_id != lead_id)).all()
    if e.get("handoff") and not handoff: fails.append("expected a handoff")
    if e.get("no_handoff") and handoff: fails.append("unexpected handoff")
    if e.get("handoff_reason"):
        h = db.scalars(select(Handoff).where(Handoff.lead_id == lead_id).order_by(Handoff.id.desc())).first()
        if not h or h.reason != e["handoff_reason"]: fails.append(f"handoff reason was {h.reason if h else None}, wanted {e['handoff_reason']}")
    if e.get("tools_any") and not set(e["tools_any"]) & set(tools): fails.append(f"expected one of tools {e['tools_any']}, used {tools}")
    if e.get("booking") and not booked: fails.append("expected a booking")
    if e.get("no_booking") and booked: fails.append("a booking was created but should not have been")
    if e.get("booking_for_other_lead_absent") and others: fails.append("a booking was created for ANOTHER lead")
    if e.get("reply_regex") and not re.search(e["reply_regex"], text): fails.append(f"reply missing /{e['reply_regex']}/")
    if e.get("reply_regex_absent") and re.search(e["reply_regex_absent"], text): fails.append(f"reply contains forbidden /{e['reply_regex_absent']}/")
    if e.get("lang"):
        got = ai.detect_language(text) or "en"
        if got != e["lang"]: fails.append(f"reply language looked like {got}, wanted {e['lang']}")
    return fails, text, tools


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--stub", action="store_true")
    a = ap.parse_args()
    llm = StubLLM() if a.stub else get_llm()
    if llm is None:
        sys.exit("No AI_API_KEY configured. Set AI_API_KEY (and AI_MODEL) or run with --stub to test the harness only.")
    cases = json.loads((Path(__file__).parent / "cases.json").read_text())
    if a.only:
        want = set(a.only.split(","))
        cases = [c for c in cases if c["id"] in want]
    failed = 0
    for c in cases:
        with SessionLocal() as db:
            build_world(db)  # fresh world per case so cases can't contaminate each other
            lead = create_lead(db, name="Eval Buyer", phone="9811100000", source="website", consent=True)
            conv = start_conversation(db, lead)
            db.commit()
            replies = []
            for m in c["msgs"]:
                replies += ai.handle_message(db, lead.id, conv.id, m, llm)
            fails, text, tools = check(c, replies, db, lead.id)
        mark = "PASS" if not fails else "FAIL"
        failed += bool(fails)
        print(f"[{mark}] {c['id']:<22} tools={tools or '-'}")
        if fails or os.environ.get("EVAL_VERBOSE"):
            print("       reply:", text.replace("\n", " ")[:300])
            for f in fails: print("       ✗", f)
    print(f"\n{len(cases) - failed}/{len(cases)} passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
