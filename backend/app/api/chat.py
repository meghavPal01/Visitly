from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import BuyerSession, buyer_session
from app.database import get_db
from app.models import Conversation, Lead, Message
from app.schemas.common import Language
from app.services import ai_service
from app.services.handoff_service import create_handoff
from app.services.llm import LLM, get_llm

router = APIRouter(prefix="/api/buyer", tags=["chat"])


class MessageIn(BaseModel):
    text: str = Field(min_length=1, max_length=1000)


class LanguageIn(BaseModel):
    language: Language


def msg_out(m: Message) -> dict:
    return {"id": m.id, "sender": m.sender, "content": m.content, "meta": m.meta,
            "created_at": m.created_at.isoformat()}


def llm_dep() -> LLM | None:
    return get_llm()


@router.get("/messages")
def history(sess: BuyerSession = Depends(buyer_session), db: Session = Depends(get_db)):
    rows = db.scalars(select(Message).where(Message.conversation_id == sess.conversation_id).order_by(Message.id))
    return [msg_out(m) for m in rows]


@router.post("/messages")
def send(body: MessageIn, sess: BuyerSession = Depends(buyer_session), db: Session = Depends(get_db),
         llm: LLM | None = Depends(llm_dep)):
    if not body.text.strip():
        raise HTTPException(422, "Message is empty")
    try:
        msgs = ai_service.handle_message(db, sess.lead_id, sess.conversation_id, body.text, llm)
    except ValueError as e:
        raise HTTPException(429, str(e))
    return [msg_out(m) for m in msgs]


@router.post("/handoff")
def talk_to_human(sess: BuyerSession = Depends(buyer_session), db: Session = Depends(get_db),
                  llm: LLM | None = Depends(llm_dep)):
    """'Talk to a human' button: deterministic, never depends on the model."""
    msgs = ai_service.handle_message(db, sess.lead_id, sess.conversation_id, "I want to talk to a human salesperson", llm)
    return [msg_out(m) for m in msgs]


@router.post("/language")
def set_language(body: LanguageIn, sess: BuyerSession = Depends(buyer_session), db: Session = Depends(get_db)):
    conv, lead = db.get(Conversation, sess.conversation_id), db.get(Lead, sess.lead_id)
    conv.language = lead.language = body.language
    db.commit()
    return {"language": body.language}
