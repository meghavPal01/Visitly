import pytest

from app.core.phone import InvalidPhone, mask_phone, normalize_phone


@pytest.mark.parametrize("raw", ["+91 9876543210", "9876543210", "+91-98765-43210", "09876543210",
                                 "919876543210", " (+91) 98765 43210 ", "0091 9876543210"[2:]])
def test_variants_normalize_to_same_number(raw):
    assert normalize_phone(raw) == "+919876543210"


@pytest.mark.parametrize("raw", ["", "12345", "5876543210", "98765432101234", "abcdefghij"])
def test_invalid_numbers_rejected(raw):
    with pytest.raises(InvalidPhone):
        normalize_phone(raw)


def test_mask_hides_middle_digits():
    m = mask_phone("+919876543210")
    assert m.endswith("210") and "76543" not in m
