"""Seed demo data. ALL data here is synthetic. Re-runnable: `python seed.py --reset`.

Demo password comes from SEED_DEMO_PASSWORD (default below is for demo accounts only).
"""
import os
import random
import sys
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.core.phone import normalize_phone
from app.core.security import hash_password
from app.database import Base, SessionLocal, engine
from app.services import booking_service as bs
from app.services.handoff_service import create_handoff
from app.models import (Booking, ConsentRecord, Conversation, FactSheet, Lead, LeadActivity, Message,
                        MessageTemplate, Project, SourceSpend, Unit, User, VisitSlot)

IST = ZoneInfo("Asia/Kolkata")
DEMO_PASSWORD = os.environ.get("SEED_DEMO_PASSWORD", "Visitly@Demo1")
random.seed(42)


def ist(d, h, m=0):
    return datetime.combine(d, time(h, m), tzinfo=IST).astimezone(timezone.utc)


FACTS = {
    "A": dict(
        name="Demo Project A (Sample)", location="Demo Locality, Ahmedabad (placeholder)",
        content={"overview": "SAMPLE DATA: A residential apartment project used for demonstration only.",
                 "possession": "Sample possession timeline: to be confirmed by the client.",
                 "bhk_options": [{"bhk": 2, "carpet_sqft": 950, "indicative_price_lakh_min": 55, "indicative_price_lakh_max": 70},
                                 {"bhk": 3, "carpet_sqft": 1350, "indicative_price_lakh_min": 80, "indicative_price_lakh_max": 100}],
                 "amenities": ["Clubhouse", "Children's play area", "Covered parking", "24x7 security"],
                 "location_highlights": ["Sample: close to main road (distances to be supplied by client)"],
                 "faqs": [{"q": "Is home loan assistance available?", "a": "Sample FAQ: a salesperson will confirm bank tie-ups."}]}),
    "B": dict(
        name="Demo Project B (Sample)", location="Another Demo Locality, Ahmedabad (placeholder)",
        content={"overview": "SAMPLE DATA: A second residential project used for demonstration only.",
                 "possession": None,
                 "bhk_options": [{"bhk": 3, "carpet_sqft": 1500, "indicative_price_lakh_min": 95, "indicative_price_lakh_max": 120},
                                 {"bhk": 4, "carpet_sqft": 2100, "indicative_price_lakh_min": 140, "indicative_price_lakh_max": 170}],
                 "amenities": ["Swimming pool", "Gym", "Landscaped garden", "Power backup"],
                 "location_highlights": [], "faqs": []}),
}

TEMPLATES = [
    ("visit_reminder", "en", "transactional", "Hello {name}! Reminder: your site visit at {project} is {when}. Location: {map_url}. RERA: {rera}."),
    ("visit_reminder", "hi", "transactional", "नमस्ते {name}! याद दिलाना: {project} में आपकी साइट विज़िट {when} है। लोकेशन: {map_url}। RERA: {rera}।"),
    ("visit_reminder", "gu", "transactional", "નમસ્તે {name}! યાદ અપાવવા: {project} ખાતે તમારી સાઇટ વિઝિટ {when} છે. લોકેશન: {map_url}. RERA: {rera}."),
    ("new_launch", "en", "promotional", "Hello {name}! New updates on {project}. RERA: {rera}. Reply STOP to opt out."),
]


def main(reset: bool):
    if reset:
        Base.metadata.drop_all(engine)
        Base.metadata.create_all(engine)
    db = SessionLocal()
    if db.scalars(select(User)).first():
        print("Already seeded; use --reset to rebuild.")
        return
    now = datetime.now(timezone.utc)
    today = datetime.now(IST).date()

    admin = User(name="Asha Mehta (Admin)", email="admin@visitly.demo", role="admin", password_hash=hash_password(DEMO_PASSWORD))
    execs = [User(name=n, email=e, role="executive", password_hash=hash_password(DEMO_PASSWORD))
             for n, e in (("Priya Shah", "priya@visitly.demo"), ("Rahul Desai", "rahul@visitly.demo"),
                          ("Neha Patel", "neha@visitly.demo"))]
    db.add_all([admin, *execs])
    projects = []
    for k, f in FACTS.items():
        p = Project(name=f["name"], location=f["location"], rera_number=f"DEMO-RERA-000{1 if k == 'A' else 2} (placeholder)",
                    map_url="https://www.google.com/maps/search/?api=1&query=Ahmedabad", is_demo_data=True)
        db.add(p)
        db.flush()
        db.add(FactSheet(project_id=p.id, version=1, content=f["content"], updated_by=admin.id))
        for i, bhk in enumerate([2, 3, 3, 4]):
            db.add(Unit(project_id=p.id, label=f"{k}-{101 + i}", bhk=bhk))
        projects.append(p)
    for key, lang, kind, body in TEMPLATES:
        db.add(MessageTemplate(key=key, language=lang, kind=kind, body=body))
    db.flush()

    used_starts = set()
    # Future slots: next 7 days, 4 per day per project
    for p in projects:
        for d in range(1, 8):
            for h in (10, 11, 14, 16):
                used_starts.add((p.id, ist(today + timedelta(days=d), h)))
                db.add(VisitSlot(project_id=p.id, start_time=ist(today + timedelta(days=d), h),
                                 end_time=ist(today + timedelta(days=d), h) + timedelta(hours=1)))

    # Three named demo leads (incl. a duplicate pair, to demo flagging)
    def mk(name, phone, source, created, lang="en", consent=True, synthetic=False, **kw):
        l = Lead(name=name, phone=phone, phone_normalized=normalize_phone(phone), source=source, created_at=created,
                 language=lang, is_synthetic=synthetic, **kw)
        db.add(l)
        db.flush()
        if consent:
            db.add(ConsentRecord(lead_id=l.id, status="granted", created_at=created))
        return l

    base = mk("Hardik (Demo)", "+91 98250 00001", "portal", now - timedelta(days=2), project_id=projects[0].id, bhk=3, budget_lakh=90)
    dup = mk("Hardik P. (Demo)", "09825000001", "website", now - timedelta(days=1), project_id=projects[0].id)
    dup.duplicate_of = base.id
    mk("Meera (Demo)", "+91 98250 00002", "social", now - timedelta(days=1), lang="gu", project_id=projects[1].id)
    for l in (base, dup):
        db.add(LeadActivity(lead_id=l.id, kind="status", detail=f"Lead created from {l.source}", created_at=l.created_at))

    # Synthetic history (180 days) for the dashboard
    weights = {"portal": 40, "social": 28, "website": 22, "hoarding": 10}
    show_rate = {"portal": .8, "social": .72, "website": .78, "hoarding": .6}
    book_rate = {"portal": .28, "social": .22, "website": .3, "hoarding": .15}
    n = 0
    for i in range(260):
        src = random.choices(list(weights), list(weights.values()))[0]
        created = now - timedelta(days=random.uniform(3, 178), hours=random.uniform(0, 8))
        phone = f"9{random.randint(100000000, 999999999)}"
        l = mk(f"Synthetic Lead {i + 1}", phone, src, created, lang=random.choice(["en", "en", "hi", "gu"]),
               consent=random.random() > .1, synthetic=True, project_id=random.choice(projects).id,
               bhk=random.choice([2, 3, 3, 4]), budget_lakh=random.choice([60, 75, 90, 110]),
               status="contacted", assigned_to=random.choice(execs).id)
        l.first_response_at = created + timedelta(seconds=random.choice([20, 45, 60, 90, 120, 180, 300, 900]))
        if random.random() < book_rate[src]:
            p = projects[l.project_id - projects[0].id]
            start = (created + timedelta(days=random.randint(1, 4))).replace(minute=0, second=0, microsecond=0)
            while (p.id, start) in used_starts:  # unique start per project (DB constraint); bump by a minute until free
                start += timedelta(minutes=1)
            used_starts.add((p.id, start))
            slot = VisitSlot(project_id=p.id, start_time=start, end_time=start + timedelta(hours=1))
            db.add(slot)
            db.flush()
            if start < now:
                st = "completed" if random.random() < show_rate[src] else "no_show"
                l.status = "visited" if st == "completed" else "contacted"
            else:
                st = "confirmed"
                l.status = "visit_booked"
            try:
                db.add(Booking(lead_id=l.id, slot_id=slot.id, status=st, created_at=created + timedelta(hours=1)))
                db.flush()
            except Exception:
                db.rollback()
                raise
            n += 1

    # A fully worked demo conversation: Gujarati buyer, grounded Q&A, booking, named handoff
    meera = db.scalars(select(Lead).where(Lead.name == "Meera (Demo)")).first()
    meera.project_id, meera.bhk, meera.budget_lakh, meera.language = projects[1].id, 3, 100, "gu"
    conv = Conversation(lead_id=meera.id, language="gu", created_at=meera.created_at)
    db.add(conv)
    db.flush()
    t0 = meera.created_at
    for i, (who, text) in enumerate([
        ("buyer", "નમસ્તે, મને 3 BHK જોઈએ છે. બજેટ લગભગ 1 કરોડ."),
        ("ai", "નમસ્તે Meera! Demo Project B (Sample) માં 3 BHK ઉપલબ્ધ છે (સૂચક કિંમત ₹95 લાખથી ₹1.2 કરોડ). શું તમે સાઇટ વિઝિટ બુક કરવા માંગો છો?"),
        ("buyer", "પઝેશન ક્યારે મળશે?"),
        ("ai", "એ માહિતી હાલ મારી પાસે પ્રમાણિત નથી, તેથી અમારા સેલ્સ એક્ઝિક્યુટિવ તમને ચોક્કસ તારીખ જણાવશે."),
    ]):
        db.add(Message(conversation_id=conv.id, sender=who, content=text, created_at=t0 + timedelta(seconds=40 * i)))
    meera.first_response_at = t0 + timedelta(seconds=40)
    first_slot = db.scalars(select(VisitSlot).where(VisitSlot.project_id == projects[1].id, VisitSlot.start_time > now + timedelta(days=1)).order_by(VisitSlot.start_time)).first()
    bs.book_slot(db, meera.id, first_slot.id, now=now)
    create_handoff(db, meera, conv, "missing_fact", None, note="Asked for possession date; not in approved fact sheet")
    db.commit()
    for src, amt in (("portal", 3_600_000), ("social", 2_700_000), ("website", 1_800_000), ("hoarding", 900_000)):
        db.add(SourceSpend(source=src, period_start=now - timedelta(days=180), period_end=now, amount_inr=amt))
    db.commit()
    print(f"Seeded: {1 + len(execs)} users, 2 projects, 263 leads, {n} synthetic bookings.")
    print(f"Demo logins (password from SEED_DEMO_PASSWORD, default '{DEMO_PASSWORD}'): admin@visitly.demo, priya@visitly.demo")


if __name__ == "__main__":
    main("--reset" in sys.argv)
