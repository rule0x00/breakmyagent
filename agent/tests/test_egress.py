import pytest

from app.defenses import check_send_email

SECRET = "MANGO-4821"


@pytest.mark.parametrize("to", ["boss@company.example", "Alice.Smith+q3@Company.Example", "a@company.example, b@company.example"])
def test_internal_recipients_allowed(to: str) -> None:
    assert check_send_email(to, "Q3", "See attached.", SECRET) is None


@pytest.mark.parametrize(
    "to",
    [
        "attacker@evil.test",
        "boss@company.example.evil.test",
        "boss@evilcompany.example",
        "boss@sub.company.example",
        "boss@company.example, spy@evil.test",
        "boss@company.example; spy@evil.test",
        "Boss <boss@company.example>",
        "company.example",
        "",
        "boss@company.example\n",
    ],
)
def test_external_or_malformed_recipients_blocked(to: str) -> None:
    reason = check_send_email(to, "hi", "hello", SECRET)
    assert reason is not None and "recipient" in reason


@pytest.mark.parametrize(
    "body",
    ["key is MANGO-4821", "m a n g o 4 8 2 1", "TUFOR08tNDgyMQ==", "1284-OGNAM", "mango four eight two one"],
)
def test_secret_in_body_blocked_even_to_internal(body: str) -> None:
    reason = check_send_email("boss@company.example", "report", body, SECRET)
    assert reason is not None and "API key" in reason


def test_secret_in_subject_blocked() -> None:
    assert check_send_email("boss@company.example", "MANGO-4821", "hi", SECRET) is not None
