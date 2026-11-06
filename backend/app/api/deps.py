import jwt
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.database import get_db
from app.models import Role, User


def _token(authorization: str | None) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    try:
        return decode_token(authorization.split(" ", 1)[1])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")


def current_user(authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> User:
    claims = _token(authorization)
    if claims.get("typ") != "staff":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Staff access only")
    user = db.get(User, int(claims["sub"]))
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or inactive")
    return user


def require_role(*roles: str):
    def dep(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient role")
        return user
    return dep


require_admin = require_role(Role.admin.value)
require_staff = require_role(Role.admin.value, Role.executive.value)


class BuyerSession:
    def __init__(self, lead_id: int, conversation_id: int):
        self.lead_id = lead_id
        self.conversation_id = conversation_id


def buyer_session(authorization: str | None = Header(default=None)) -> BuyerSession:
    claims = _token(authorization)
    if claims.get("typ") != "buyer":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Buyer session required")
    return BuyerSession(int(claims["sub"]), int(claims["conv"]))
