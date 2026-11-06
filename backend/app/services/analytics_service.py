"""Dashboard metrics, all computed from rows (no hard-coded numbers).

Definitions:
  first response time  = lead.first_response_at - lead.created_at
  visits booked        = bookings created in window whose status is not 'cancelled'
  booking rate         = visits booked / leads in window
  show-up rate         = completed / (completed + no_show) for visits already due
  cost per visit       = prorated source spend in window / completed visits (by source)
"""
from datetime import datetime, timedelta, timezone
from statistics import median

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Booking, Lead, SourceSpend, VisitSlot

SOURCES = ["portal", "social", "website", "hoarding"]
SLA_SECONDS = 120  # 2-minute first-response target


def _spend_in_window(db: Session, source: str, start: datetime, end: datetime) -> float:
    total = 0.0
    for r in db.scalars(select(SourceSpend).where(SourceSpend.source == source, SourceSpend.period_end > start,
                                                  SourceSpend.period_start < end)):
        span = (r.period_end - r.period_start).total_seconds() or 1
        overlap = (min(r.period_end, end) - max(r.period_start, start)).total_seconds()
        total += r.amount_inr * max(0.0, overlap) / span
    return total


def compute(db: Session, days: int = 60, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    start = now - timedelta(days=days)
    leads = list(db.scalars(select(Lead).where(Lead.created_at >= start, Lead.created_at <= now, Lead.merged_into.is_(None))))
    deltas = [(l.first_response_at - l.created_at).total_seconds() for l in leads if l.first_response_at]
    rows = db.execute(select(Booking, VisitSlot, Lead).join(VisitSlot, VisitSlot.id == Booking.slot_id)
                      .join(Lead, Lead.id == Booking.lead_id)
                      .where(Booking.created_at >= start, Booking.created_at <= now)).all()

    def stats(source: str | None):
        ls = [l for l in leads if source is None or l.source == source]
        bs_ = [(b, s) for b, s, l in rows if source is None or l.source == source]
        booked = [b for b, _ in bs_ if b.status != "cancelled"]
        done = sum(1 for b, _ in bs_ if b.status == "completed")
        noshow = sum(1 for b, _ in bs_ if b.status == "no_show")
        out = {"leads": len(ls), "visits_booked": len(booked), "completed": done, "no_show": noshow,
               "booking_rate": round(len(booked) / len(ls), 4) if ls else None,
               "show_up_rate": round(done / (done + noshow), 4) if (done + noshow) else None}
        return out

    by_source = []
    for src in SOURCES:
        s = stats(src)
        spend = _spend_in_window(db, src, start, now)
        s.update(source=src, spend_inr=round(spend),
                 cost_per_visit=round(spend / s["completed"]) if s["completed"] else None)
        by_source.append(s)
    total = stats(None)
    total_spend = sum(s["spend_inr"] for s in by_source)

    weeks: dict[str, int] = {}
    for l in leads:
        d = l.created_at.astimezone(timezone.utc).date()
        monday = d - timedelta(days=d.weekday())
        weeks[monday.isoformat()] = weeks.get(monday.isoformat(), 0) + 1

    return {"window_days": days, "generated_at": now.isoformat(), "is_synthetic_data": any(l.is_synthetic for l in leads),
            "totals": {**total, "avg_first_response_seconds": round(sum(deltas) / len(deltas)) if deltas else None,
                       "median_first_response_seconds": round(median(deltas)) if deltas else None,
                       "within_sla_pct": round(sum(1 for d in deltas if d <= SLA_SECONDS) / len(deltas), 4) if deltas else None,
                       "spend_inr": total_spend,
                       "cost_per_visit": round(total_spend / total["completed"]) if total["completed"] else None},
            "by_source": by_source,
            "leads_per_week": [{"week": k, "leads": v} for k, v in sorted(weeks.items())],
            "sla_seconds": SLA_SECONDS}
