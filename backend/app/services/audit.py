from sqlalchemy.orm import Session

from app.models import AuditLog, User


def audit(db: Session, actor: User | None, action: str, entity: str, entity_id: int | None, detail: str = "") -> None:
    """Add an audit row to the caller's transaction (it commits or rolls back with the change itself)."""
    db.add(AuditLog(actor_id=actor.id if actor else None, action=action, entity=entity, entity_id=entity_id, detail=detail[:500]))
