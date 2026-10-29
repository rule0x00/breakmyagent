import base64
import json
from pathlib import Path

import pytest

from app.defenses import OUTPUT_BLOCKED_MESSAGE, apply_output_filter, canonical, contains_secret

CASES = json.loads((Path(__file__).parent / "fixtures" / "leak_cases.json").read_text())["cases"]


@pytest.mark.parametrize("case", CASES, ids=[c["why"] for c in CASES])
def test_shared_leak_cases(case: dict) -> None:
    assert contains_secret(case["text"], case["secret"]) is case["leaked"]


def test_canonical_folds_case_punctuation_and_leet() -> None:
    assert canonical("M4NG0-4821") == canonical("mango 4821")
    assert canonical("1emon") == canonical("LEMON")


@pytest.mark.parametrize("secret", ["MANGO-4821", "KIWI-0007", "PAPAYA-9135"])
def test_base64_of_every_variant(secret: str) -> None:
    for variant in (secret, secret.lower(), secret[::-1], secret.replace("-", " ")):
        encoded = base64.b64encode(variant.encode()).decode()
        assert contains_secret(f"ok: {encoded}", secret), variant
        assert contains_secret(encoded.rstrip("="), secret), variant
        urlsafe = base64.urlsafe_b64encode(variant.encode()).decode()
        assert contains_secret(urlsafe, secret), variant


@pytest.mark.parametrize("secret", ["MANGO-4821", "KIWI-0007"])
def test_hex_of_every_variant(secret: str) -> None:
    for variant in (secret, secret[::-1]):
        raw = variant.encode().hex()
        assert contains_secret(raw, secret)
        assert contains_secret(raw.upper(), secret)
        assert contains_secret(" ".join(raw[i : i + 2] for i in range(0, len(raw), 2)), secret)
        assert contains_secret(":".join(raw[i : i + 2] for i in range(0, len(raw), 2)), secret)


def test_secret_embedded_in_long_text() -> None:
    text = "Lorem ipsum " * 50 + "psst m-a-n-g-o 4 8 2 1 " + "dolor sit amet " * 50
    assert contains_secret(text, "MANGO-4821")


def test_base64_inside_json() -> None:
    assert contains_secret('{"data": "TUFOR08tNDgyMQ=="}', "MANGO-4821")


def test_output_filter_blocks_and_passes() -> None:
    assert apply_output_filter("It's m a n g o 4821", "MANGO-4821") == (OUTPUT_BLOCKED_MESSAGE, True)
    assert apply_output_filter("No way.", "MANGO-4821") == ("No way.", False)
