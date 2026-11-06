from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.phone import normalize_phone
from app.models import ConsentRecord, Conversation, Lead, LeadActivity, LeadStatus

SOURCES = {"portal", "social", "website", "hoarding"}


def find_duplicate(db: Session, phone_normalized: str, exclude_id: int | None = None) -> Lead | None:
    q = select(Lead).where(Lead.phone_normalized == phone_normalized, Lead.merged_into.is_(None))
    if exclude_id:
        q = q.where(Lead.id != exclude_id)
    return db.scalars(q.order_by(Lead.id).limit(1)).first()


def create_lead(db: Session, *, name: str, phone: str, source: str, project_id: int | None = None,
                email: str | None = None, language: str = "en", consent: bool = False,
                is_synthetic: bool = False, created_at=None) -> Lead:
    """Create a lead, flag (never auto-merge) a duplicate, record consent and activity."""
    norm = normalize_phone(phone)
    if source not in SOURCES:
        raise ValueError(f"source must be one of {sorted(SOURCES)}")
    dup = find_duplicate(db, norm)
    lead = Lead(name=name.strip(), phone=phone.strip(), phone_normalized=norm, email=email, source=source,
                project_id=project_id, language=language, status=LeadStatus.new.value,
                duplicate_of=dup.id if dup else None, is_synthetic=is_synthetic)
    if created_at:
        lead.created_at = created_at
    db.add(lead)
    db.flush()
    if consent:
        db.add(ConsentRecord(lead_id=lead.id, status="granted"))
    db.add(LeadActivity(lead_id=lead.id, kind="status", detail=f"Lead created from {source}"
                        + (f" (possible duplicate of #{dup.id})" if dup else "")))
    return lead


def start_conversation(db: Session, lead: Lead) -> Conversation:
    conv = Conversation(lead_id=lead.id, language=lead.language)
    db.add(conv)
    db.flush()
    return conv


def current_consent(db: Session, lead_id: int) -> str:
    row = db.scalars(select(ConsentRecord).where(ConsentRecord.lead_id == lead_id)
                     .order_by(ConsentRecord.id.desc()).limit(1)).first()
    return row.status if row else "none"
