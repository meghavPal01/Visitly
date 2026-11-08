"""All Visitly tables. Timestamps are timezone-aware UTC."""
from __future__ import annotations

import enum
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    JSON, Boolean, DateTime, ForeignKey, Index, Integer, Numeric, String, Text,
    UniqueConstraint, text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Role(str, enum.Enum):
    admin = "admin"
    executive = "executive"


class LeadStatus(str, enum.Enum):
    new = "new"
    contacted = "contacted"
    visit_booked = "visit_booked"
    visited = "visited"
    negotiation = "negotiation"
    won = "won"
    lost = "lost"


class BookingStatus(str, enum.Enum):
    confirmed = "confirmed"
    cancelled = "cancelled"
    completed = "completed"
    no_show = "no_show"


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default=Role.executive.value)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Project(Base):
    __tablename__ = "projects"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    location: Mapped[str] = mapped_column(String(255))
    map_url: Mapped[str | None] = mapped_column(String(500))
    rera_number: Mapped[str | None] = mapped_column(String(80))
    is_demo_data: Mapped[bool] = mapped_column(Boolean, default=True)
    fact_sheets: Mapped[list["FactSheet"]] = relationship(back_populates="project", order_by="FactSheet.version.desc()")


class FactSheet(Base):
    """Approved facts the AI may use. content is structured JSON; new edits create a new version."""
    __tablename__ = "fact_sheets"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    content: Mapped[dict] = mapped_column(JSON)
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    project: Mapped[Project] = relationship(back_populates="fact_sheets")
    __table_args__ = (UniqueConstraint("project_id", "version", name="uq_factsheet_version"),)


class Lead(Base):
    __tablename__ = "leads"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(40))
    phone_normalized: Mapped[str] = mapped_column(String(20), index=True)
    email: Mapped[str | None] = mapped_column(String(255))
    source: Mapped[str] = mapped_column(String(40), index=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"))
    budget_lakh: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    bhk: Mapped[int | None] = mapped_column(Integer)
    language: Mapped[str] = mapped_column(String(5), default="en")
    status: Mapped[str] = mapped_column(String(30), default=LeadStatus.new.value, index=True)
    assigned_to: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    duplicate_of: Mapped[int | None] = mapped_column(ForeignKey("leads.id"))
    merged_into: Mapped[int | None] = mapped_column(ForeignKey("leads.id"))
    is_synthetic: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    first_response_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ConsentRecord(Base):
    """Append-only consent history; the latest row per lead is the current state."""
    __tablename__ = "consent_records"
    id: Mapped[int] = mapped_column(primary_key=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id"), index=True)
    status: Mapped[str] = mapped_column(String(20))  # granted | opted_out
    channel: Mapped[str] = mapped_column(String(20), default="all")
    notice_version: Mapped[str] = mapped_column(String(20), default="v1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Conversation(Base):
    __tablename__ = "conversations"
    id: Mapped[int] = mapped_column(primary_key=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id"), index=True)
    language: Mapped[str] = mapped_column(String(5), default="en")
    status: Mapped[str] = mapped_column(String(20), default="ai")  # ai | human_requested | closed
    assigned_to: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    messages: Mapped[list["Message"]] = relationship(back_populates="conversation", order_by="Message.id")


class Message(Base):
    __tablename__ = "messages"
    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id"), index=True)
    sender: Mapped[str] = mapped_column(String(20))  # buyer | ai | executive | system
    content: Mapped[str] = mapped_column(Text)
    meta: Mapped[dict | None] = mapped_column(JSON)  # tool calls, confidence flags
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    conversation: Mapped[Conversation] = relationship(back_populates="messages")


class VisitSlot(Base):
    __tablename__ = "visit_slots"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="open")  # open | blocked
    __table_args__ = (UniqueConstraint("project_id", "start_time", name="uq_slot_project_start"),)


class Booking(Base):
    __tablename__ = "bookings"
    id: Mapped[int] = mapped_column(primary_key=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id"), index=True)
    slot_id: Mapped[int] = mapped_column(ForeignKey("visit_slots.id"), index=True)
    status: Mapped[str] = mapped_column(String(20), default=BookingStatus.confirmed.value)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # Second safety net behind SELECT ... FOR UPDATE: one confirmed booking per slot.
    __table_args__ = (
        Index("uq_booking_one_confirmed_per_slot", "slot_id", unique=True,
              postgresql_where=text("status = 'confirmed'")),
    )


class Reminder(Base):
    __tablename__ = "reminders"
    id: Mapped[int] = mapped_column(primary_key=True)
    booking_id: Mapped[int] = mapped_column(ForeignKey("bookings.id"), index=True)
    reminder_type: Mapped[str] = mapped_column(String(20))  # t_minus_24h | t_minus_2h
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending|sent|skipped|failed
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    __table_args__ = (UniqueConstraint("booking_id", "reminder_type", name="uq_reminder_once"),)


class Handoff(Base):
    __tablename__ = "handoffs"
    id: Mapped[int] = mapped_column(primary_key=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id"), index=True)
    conversation_id: Mapped[int | None] = mapped_column(ForeignKey("conversations.id"))
    executive_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    reason: Mapped[str] = mapped_column(String(40))  # buyer_request | missing_fact | ai_error | booking
    summary: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class LeadActivity(Base):
    __tablename__ = "lead_activities"
    id: Mapped[int] = mapped_column(primary_key=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id"), index=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    kind: Mapped[str] = mapped_column(String(30))  # note|status|booking|handoff|call|payment|merge|message
    detail: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class FollowUpTask(Base):
    __tablename__ = "follow_up_tasks"
    id: Mapped[int] = mapped_column(primary_key=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id"), index=True)
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(200))
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    done: Mapped[bool] = mapped_column(Boolean, default=False)


class MessageTemplate(Base):
    __tablename__ = "message_templates"
    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(40), index=True)
    language: Mapped[str] = mapped_column(String(5), default="en")
    kind: Mapped[str] = mapped_column(String(20), default="transactional")  # transactional|promotional
    body: Mapped[str] = mapped_column(Text)
    __table_args__ = (UniqueConstraint("key", "language", name="uq_template_key_lang"),)


class NotificationLog(Base):
    __tablename__ = "notification_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id"), index=True)
    channel: Mapped[str] = mapped_column(String(20))  # whatsapp|sms
    template_key: Mapped[str] = mapped_column(String(40))
    kind: Mapped[str] = mapped_column(String(20))
    body: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20))  # simulated_sent|blocked_opt_out|blocked_no_consent
    simulated: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Unit(Base):
    __tablename__ = "units"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    label: Mapped[str] = mapped_column(String(40))
    bhk: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="available")  # available|held|allotted
    held_by_lead: Mapped[int | None] = mapped_column(ForeignKey("leads.id"))


class Payment(Base):
    """Simulated token payment. No card/bank details are ever collected."""
    __tablename__ = "payments"
    id: Mapped[int] = mapped_column(primary_key=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id"), index=True)
    unit_id: Mapped[int | None] = mapped_column(ForeignKey("units.id"))
    amount_inr: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20))  # success|failed|pending
    simulated: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class CallLog(Base):
    __tablename__ = "call_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id"), index=True)
    executive_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    outcome: Mapped[str] = mapped_column(String(30))
    duration_sec: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str | None] = mapped_column(Text)
    simulated: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SourceSpend(Base):
    """Marketing spend per lead source per period, used for cost-per-visit."""
    __tablename__ = "source_spend"
    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(40), index=True)
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    amount_inr: Mapped[int] = mapped_column(Integer)
    is_synthetic: Mapped[bool] = mapped_column(Boolean, default=True)


class AuditLog(Base):
    """Who changed what. Append-only; written by admin-sensitive actions."""
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(String(40), index=True)
    entity: Mapped[str] = mapped_column(String(30))
    entity_id: Mapped[int | None] = mapped_column(Integer)
    detail: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
