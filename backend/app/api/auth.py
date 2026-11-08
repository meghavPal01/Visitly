from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import current_user
from app.core import ratelimit
from app.core.security import create_staff_token, hash_password, verify_password
from app.database import get_db
from app.models import User
from app.schemas.common import LoginIn

router = APIRouter(prefix="/api/auth", tags=["auth"])
_DUMMY = hash_password("not-a-real-password")  # constant-time-ish path for unknown emails


@router.post("/login")
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    email = body.email.lower()
    ip = (request.client.host if request.client else "unknown")
    wait = ratelimit.retry_after(email, ip)
    if wait:
        raise HTTPException(429, f"Too many failed sign-in attempts. Try again in {max(1, wait // 60)} minutes.",
                            headers={"Retry-After": str(wait)})
    user = db.scalars(select(User).where(User.email == email)).first()
    ok = verify_password(body.password, user.password_hash if user else _DUMMY)
    if not user or not ok or not user.is_active:
        ratelimit.record_failure(email, ip)
        raise HTTPException(401, "Invalid email or password")
    ratelimit.record_success(email)
    return {"token": create_staff_token(user.id, user.role),
            "user": {"id": user.id, "name": user.name, "email": user.email, "role": user.role}}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role}
