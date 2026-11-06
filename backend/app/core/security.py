from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.core.config import get_settings

ALGO = "HS256"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def _encode(claims: dict, minutes: int) -> str:
    s = get_settings()
    exp = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    return jwt.encode({**claims, "exp": exp}, s.jwt_secret_key, algorithm=ALGO)


def create_staff_token(user_id: int, role: str) -> str:
    return _encode({"sub": str(user_id), "typ": "staff", "role": role}, get_settings().jwt_expire_minutes)


def create_buyer_token(lead_id: int, conversation_id: int) -> str:
    """Buyer sessions are scoped to exactly one lead + conversation."""
    return _encode({"sub": str(lead_id), "typ": "buyer", "conv": conversation_id}, 60 * 24)


def decode_token(token: str) -> dict:
    return jwt.decode(token, get_settings().jwt_secret_key, algorithms=[ALGO])
