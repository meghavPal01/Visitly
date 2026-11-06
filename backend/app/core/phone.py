import re

_INDIAN_MOBILE = re.compile(r"^[6-9]\d{9}$")


class InvalidPhone(ValueError):
    pass


def normalize_phone(raw: str) -> str:
    """Return canonical '+91XXXXXXXXXX' for Indian mobile numbers.

    '+91 98765-43210', '09876543210', '919876543210', '9876543210' -> '+919876543210'
    Raises InvalidPhone for anything that is not a valid 10-digit Indian mobile.
    """
    if raw is None:
        raise InvalidPhone("phone required")
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    elif len(digits) == 13 and digits.startswith("091"):
        digits = digits[3:]
    if not _INDIAN_MOBILE.match(digits):
        raise InvalidPhone("not a valid Indian mobile number")
    return "+91" + digits


def mask_phone(normalized: str) -> str:
    """'+919876543210' -> '+91 98•••••210' for list views."""
    if len(normalized) < 8:
        return "•••"
    return f"{normalized[:3]} {normalized[3:5]}•••••{normalized[-3:]}"
