from app.models import Lead
from app.services.lead_service import create_lead, current_consent


def test_duplicate_phone_is_flagged_not_merged(db):
    a = create_lead(db, name="Hardik", phone="+91 98765 43210", source="portal", consent=True)
    b = create_lead(db, name="Hardik P", phone="09876543210", source="website")
    db.commit()
    assert a.duplicate_of is None
    assert b.duplicate_of == a.id
    assert b.merged_into is None  # never auto-merged
    assert db.query(Lead).count() == 2


def test_consent_recorded(db):
    a = create_lead(db, name="A", phone="9876543211", source="social", consent=True)
    b = create_lead(db, name="B", phone="9876543212", source="social", consent=False)
    db.commit()
    assert current_consent(db, a.id) == "granted"
    assert current_consent(db, b.id) == "none"
