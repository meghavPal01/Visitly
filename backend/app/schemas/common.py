from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.phone import InvalidPhone, normalize_phone

Language = Literal["en", "hi", "gu"]
Source = Literal["portal", "social", "website", "hoarding"]


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class EnquiryIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    phone: str = Field(max_length=40)
    source: Source = "website"
    project_id: int | None = None
    language: Language = "en"
    consent: bool = False

    @field_validator("phone")
    @classmethod
    def _phone(cls, v):
        try:
            normalize_phone(v)
        except InvalidPhone:
            raise ValueError("Enter a valid 10-digit Indian mobile number")
        return v

    @field_validator("name")
    @classmethod
    def _name(cls, v):
        return " ".join(v.split())


class BookIn(BaseModel):
    slot_id: int


class RescheduleIn(BaseModel):
    new_slot_id: int


class NoteIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class StatusIn(BaseModel):
    status: Literal["new", "contacted", "visit_booked", "visited", "negotiation", "won", "lost"]


class AssignIn(BaseModel):
    executive_id: int


class FAQ(BaseModel):
    q: str = Field(min_length=1, max_length=300)
    a: str = Field(min_length=1, max_length=1000)


class BHKOption(BaseModel):
    bhk: int = Field(ge=1, le=6)
    carpet_sqft: int | None = Field(default=None, ge=100, le=10000)
    indicative_price_lakh_min: float | None = Field(default=None, ge=0, le=100000)
    indicative_price_lakh_max: float | None = Field(default=None, ge=0, le=100000)


class FactSheetContent(BaseModel):
    overview: str = Field(max_length=2000)
    possession: str | None = Field(default=None, max_length=200)
    bhk_options: list[BHKOption] = Field(default_factory=list, max_length=10)
    amenities: list[str] = Field(default_factory=list, max_length=40)
    location_highlights: list[str] = Field(default_factory=list, max_length=30)
    faqs: list[FAQ] = Field(default_factory=list, max_length=30)


class FactSheetIn(BaseModel):
    content: FactSheetContent
    location: str | None = Field(default=None, max_length=255)
    map_url: str | None = Field(default=None, max_length=500)
    rera_number: str | None = Field(default=None, max_length=80)

    @field_validator("map_url")
    @classmethod
    def _map(cls, v):
        if v and not v.startswith("https://"):
            raise ValueError("map_url must be an https URL")
        return v


class SlotCreateIn(BaseModel):
    project_id: int
    start_time: datetime
    duration_minutes: int = Field(default=60, ge=15, le=240)


class SlotPatchIn(BaseModel):
    status: Literal["open", "blocked"]


class MergeIn(BaseModel):
    into_id: int


class TaskIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    due_at: datetime


class CallIn(BaseModel):
    outcome: Literal["connected", "no_answer", "busy", "wrong_number", "callback_requested"]
    duration_sec: int = Field(default=0, ge=0, le=7200)
    notes: str | None = Field(default=None, max_length=2000)


class PaymentIn(BaseModel):
    unit_id: int
    outcome: Literal["success", "failed", "pending"]
    amount_inr: int = Field(default=50000, ge=1000, le=500000)
