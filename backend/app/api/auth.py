from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import current_user
from app.core.security import create_staff_token, hash_password, verify_password
from app.database import get_db
from app.models import User
from app.schemas.common import LoginIn

router = APIRouter(prefix="/api/auth", tags=["auth"])
_DUMMY = hash_password("not-a-real-password")  # constant-time-ish path for unknown emails


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalars(select(User).where(User.email == body.email.lower())).first()
    ok = verify_password(body.password, user.password_hash if user else _DUMMY)
    if not user or not ok or not user.is_active:
        raise HTTPException(401, "Invalid email or password")
    return {"token": create_staff_token(user.id, user.role),
            "user": {"id": user.id, "name": user.name, "email": user.email, "role": user.role}}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role}
