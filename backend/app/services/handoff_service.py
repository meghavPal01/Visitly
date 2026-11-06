"""Human handoff: pick the least-loaded executive, attach a summary + the conversation. Idempotent per conversation."""
import logging

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Conversation, Handoff, Lead, LeadActivity, Message, Project, Role, User
from app.services.llm import LLM

log = logging.getLogger("visitly.handoff")
REASONS = {"buyer_request", "missing_fact", "unsure", "ai_error", "booking"}


def pick_executive(db: Session) -> User | None:
    load = (select(Lead.assigned_to, func.count().label("n")).where(Lead.status.not_in(["won", "lost"]))
            .group_by(Lead.assigned_to).subquery())
    q = (select(User).outerjoin(load, load.c.assigned_to == User.id)
         .where(User.role == Role.executive.value, User.is_active)
         .order_by(func.coalesce(load.c.n, 0), User.id).limit(1))
    return db.scalars(q).first()


def _transcript(db: Session, conv_id: int, limit: int = 30) -> str:
    msgs = db.scalars(select(Message).where(Message.conversation_id == conv_id).order_by(Message.id.desc()).limit(limit))
    return "\n".join(f"{m.sender}: {m.content}" for m in reversed(list(msgs)))


def fallback_summary(db: Session, lead: Lead, conv: Conversation, reason: str, note: str | None) -> str:
    project = db.get(Project, lead.project_id).name if lead.project_id else "not chosen yet"
    buyer_msgs = [m.content for m in db.scalars(select(Message).where(
        Message.conversation_id == conv.id, Message.sender == "buyer").order_by(Message.id.desc()).limit(3))]
    lines = [f"Buyer: {lead.name} (language: {conv.language})", f"Project interest: {project}",
             f"BHK: {lead.bhk or 'unknown'} | Budget: {str(lead.budget_lakh) + ' lakh' if lead.budget_lakh else 'unknown'}",
             f"Handoff reason: {reason}" + (f" — {note}" if note else ""),
             "Recent buyer messages: " + " | ".join(m[:160] for m in reversed(buyer_msgs))]
    return "\n".join(lines)


def make_summary(db: Session, lead: Lead, conv: Conversation, reason: str, note: str | None, llm: LLM | None) -> str:
    if llm is not None:
        try:
            r = llm.complete(
                "You write handoff notes for real-estate sales executives. Using ONLY facts stated in the "
                "conversation, write 4-6 short bullet points in English: requirements (BHK, budget, project), "
                "preferred language, visit status, unanswered questions, and the buyer's mood. Never invent details.",
                [{"role": "user", "content": f"Handoff reason: {reason}. Note: {note or '-'}\n\n"
                                             f"Conversation:\n{_transcript(db, conv.id)}"}])
            if r.text.strip():
                return r.text.strip()
        except Exception:
            log.exception("summary generation failed; using deterministic summary")
    return fallback_summary(db, lead, conv, reason, note)


def create_handoff(db: Session, lead: Lead, conv: Conversation, reason: str, llm: LLM | None = None,
                   note: str | None = None) -> Handoff:
    if reason not in REASONS:
        reason = "unsure"
    existing = db.scalars(select(Handoff).where(Handoff.conversation_id == conv.id)
                          .order_by(Handoff.id.desc())).first()
    exe = db.get(User, lead.assigned_to) if lead.assigned_to else pick_executive(db)  # keep one named owner
    summary = make_summary(db, lead, conv, reason, note, llm)
    if existing and existing.reason == reason:  # idempotent: refresh summary, don't duplicate
        existing.summary = summary
        db.commit()
        return existing
    h = Handoff(lead_id=lead.id, conversation_id=conv.id, executive_id=exe.id if exe else None,
                reason=reason, summary=summary)
    db.add(h)
    if exe:
        lead.assigned_to = conv.assigned_to = exe.id
    conv.status = "human_requested"
    db.add(LeadActivity(lead_id=lead.id, kind="handoff",
                        detail=f"Handoff ({reason}) → {exe.name if exe else 'no executive available'}"))
    db.commit()
    return h
