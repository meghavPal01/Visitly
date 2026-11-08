from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import require_admin, require_staff
from app.api.leads import _visible
from app.database import get_db
from app.models import AuditLog, Conversation, Handoff, Lead, Message, User

router = APIRouter(prefix="/api", tags=["inbox"])


@router.get("/inbox")
def inbox(user: User = Depends(require_staff), db: Session = Depends(get_db)):
    """Leads waiting on a human, longest-waiting first.

    A lead is waiting if it has a handoff and either no executive has replied since the handoff, or the buyer wrote
    after the last executive reply. Won/lost leads and merged leads are excluded.
    """
    now = datetime.now(timezone.utc)
    q = (select(Lead, Handoff).join(Handoff, Handoff.lead_id == Lead.id)
         .where(Lead.merged_into.is_(None), Lead.status.not_in(["won", "lost"])).order_by(Handoff.id.desc()))
    if (v := _visible(user)) is not None:
        q = q.where(v)
    seen, items = set(), []
    for lead, h in db.execute(q.limit(500)).all():
        if lead.id in seen:
            continue  # latest handoff per lead
        seen.add(lead.id)
        conv = db.scalars(select(Conversation).where(Conversation.lead_id == lead.id).order_by(Conversation.id.desc())).first()
        last_exec = last_buyer = None
        last_buyer_text = None
        if conv:
            last_exec = db.scalar(select(func.max(Message.created_at)).where(Message.conversation_id == conv.id, Message.sender == "executive"))
            lb = db.scalars(select(Message).where(Message.conversation_id == conv.id, Message.sender == "buyer").order_by(Message.id.desc()).limit(1)).first()
            last_buyer, last_buyer_text = (lb.created_at, lb.content) if lb else (None, None)
        replied_since_handoff = last_exec is not None and last_exec >= h.created_at
        if not replied_since_handoff:
            waiting_since = h.created_at  # nobody has answered since the handoff
        elif last_buyer and last_buyer > last_exec:
            waiting_since = last_buyer  # answered, but the buyer wrote again
        else:
            waiting_since = None
        if waiting_since is None:
            continue
        exe = db.get(User, lead.assigned_to) if lead.assigned_to else None
        items.append({"lead_id": lead.id, "name": lead.name, "source": lead.source, "language": lead.language,
                      "reason": h.reason, "summary": h.summary.split("\n")[0][:200], "last_buyer_message": (last_buyer_text or "")[:160],
                      "assigned_to": exe.name if exe else None, "waiting_since": waiting_since.isoformat(),
                      "waiting_minutes": max(0, int((now - waiting_since).total_seconds() // 60)), "status": lead.status})
    items.sort(key=lambda i: i["waiting_since"])
    return {"count": len(items), "items": items}


@router.get("/audit")
def audit_log(limit: int = Query(100, ge=1, le=300), _: User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.execute(select(AuditLog, User).outerjoin(User, User.id == AuditLog.actor_id).order_by(AuditLog.id.desc()).limit(limit)).all()
    return [{"id": a.id, "actor": u.name if u else "system", "action": a.action, "entity": a.entity,
             "entity_id": a.entity_id, "detail": a.detail, "created_at": a.created_at.isoformat()} for a, u in rows]
