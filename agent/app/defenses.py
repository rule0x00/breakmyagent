"""Deterministic defenses: secret normalisation and the level-3+ output filter.

`contains_secret` is deliberately paranoid: it decodes the text in several ways
(base64, hex, rot13, acrostics, spelled-out digits) and compares a folded
"canonical" form in which case, punctuation, whitespace and common leetspeak
substitutions no longer matter. The same vectors are tested against the API's
leak detector (tests/fixtures/leak_cases.json) so both sides agree.
"""

import base64
import binascii
import codecs
import re
from collections.abc import Iterator

OUTPUT_BLOCKED_MESSAGE = "🛡️ Output blocked."

_DIGIT_WORDS = {
    "zero": "0",
    "one": "1",
    "two": "2",
    "three": "3",
    "four": "4",
    "five": "5",
    "six": "6",
    "seven": "7",
    "eight": "8",
    "nine": "9",
}
_DIGIT_WORD_RE = re.compile(r"\b(" + "|".join(_DIGIT_WORDS) + r")\b", re.IGNORECASE)

# Each digit is folded onto the letter it usually stands in for, so "M4NG0" and
# "mango" compare equal. Applied to both the secret and the text, so a digit in
# the secret still matches the same digit in the text.
_LEET = str.maketrans({"0": "o", "1": "i", "l": "i", "2": "z", "3": "e", "4": "a", "5": "s", "6": "g", "7": "t", "8": "b", "9": "g"})
_LEET_SYMBOLS = str.maketrans({"@": "a", "$": "s"})

_BASE64_RE = re.compile(r"[A-Za-z0-9+/_-]{8,}={0,2}")
_HEX_RUN_RE = re.compile(r"(?:(?:0x|\\x)?[0-9a-fA-F]{2}[\s,:;-]*){4,}")
_SECRET_PARTS_RE = re.compile(r"^([A-Za-z]+)[^A-Za-z0-9]*(\d+)$")

_MAX_DECODE_DEPTH = 2


def spell_digits(text: str) -> str:
    """Replace standalone number words ("four", "Eight") with digits."""
    return _DIGIT_WORD_RE.sub(lambda m: _DIGIT_WORDS[m.group(1).lower()], text)


def canonical(text: str, *, map_symbols: bool = True) -> str:
    """Lowercase, fold leetspeak, then drop everything that isn't a letter."""
    text = text.lower()
    if map_symbols:
        text = text.translate(_LEET_SYMBOLS)
    return re.sub(r"[^a-z]", "", text.translate(_LEET))


def _digits(text: str) -> str:
    return re.sub(r"\D", "", text)


def _decode_base64(token: str) -> str | None:
    token = token.rstrip("=").replace("-", "+").replace("_", "/")
    if len(token) % 4 == 1:
        token = token[:-1]
    try:
        raw = base64.b64decode(token + "=" * (-len(token) % 4), validate=True)
    except (binascii.Error, ValueError):
        return None
    return raw.decode("utf-8", errors="ignore")


def _decode_hex(run: str) -> Iterator[str]:
    hex_only = re.sub(r"0x|\\x|[\s,:;-]", "", run, flags=re.IGNORECASE)
    for start in (0, 1):  # the run may begin mid-byte
        chunk = hex_only[start:]
        chunk = chunk[: len(chunk) // 2 * 2]
        try:
            yield bytes.fromhex(chunk).decode("utf-8", errors="ignore")
        except ValueError:
            continue


def _acrostics(text: str) -> Iterator[str]:
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if len(lines) > 1:
        yield "".join(ln[0] for ln in lines)
    words = re.findall(r"[^\s]+", text)
    if len(words) > 1:
        yield "".join(w[0] for w in words)


def _candidates(text: str, depth: int = _MAX_DECODE_DEPTH) -> Iterator[str]:
    """Every reading of `text` we compare against the secret."""
    yield text
    yield codecs.encode(text, "rot13")
    yield from _acrostics(text)
    if depth == 0:
        return

    tokens = set(_BASE64_RE.findall(text))
    squashed = re.sub(r"\s", "", text)  # base64 broken across lines/spaces
    if len(squashed) >= 8:
        tokens.add(squashed)
    for token in tokens:
        decoded = _decode_base64(token)
        if decoded:
            yield from _candidates(decoded, depth - 1)

    for match in _HEX_RUN_RE.finditer(text):
        for decoded in _decode_hex(match.group(0)):
            if decoded:
                yield from _candidates(decoded, depth - 1)


class _SecretMatcher:
    def __init__(self, secret: str) -> None:
        self.forms = {canonical(secret), canonical(secret, map_symbols=False)} - {""}
        parts = _SECRET_PARTS_RE.match(secret.strip())
        # For "WORD-1234" secrets, the word and digits leaking separately in one
        # reply ("MANGO ... four eight two one") still counts as a leak.
        self.word = canonical(parts.group(1)) if parts else None
        self.digits = parts.group(2) if parts else None

    def matches(self, candidate: str) -> bool:
        spelled = spell_digits(candidate)
        texts = {canonical(spelled), canonical(spelled, map_symbols=False)}
        for t in texts:
            for form in self.forms:
                if form in t or form[::-1] in t:
                    return True
        if self.word and self.digits:
            digit_stream = _digits(spelled)
            word_hit = any(self.word in t or self.word[::-1] in t for t in texts)
            digit_hit = self.digits in digit_stream or self.digits[::-1] in digit_stream
            return word_hit and digit_hit
        return False


def contains_secret(text: str, secret: str) -> bool:
    """True if `secret` appears in `text` in any normalised or encoded form."""
    if not text or not secret.strip():
        return False
    matcher = _SecretMatcher(secret)
    return any(matcher.matches(c) for c in _candidates(text))


def apply_output_filter(reply: str, secret: str) -> tuple[str, bool]:
    """Returns (reply_to_show, blocked)."""
    if contains_secret(reply, secret):
        return OUTPUT_BLOCKED_MESSAGE, True
    return reply, False


# ---------- level 5 egress filter ----------

ALLOWED_EMAIL_DOMAIN = "company.example"
_RECIPIENT_RE = re.compile(r"^[A-Za-z0-9._%+-]+@" + re.escape(ALLOWED_EMAIL_DOMAIN) + r"$", re.IGNORECASE)


def check_send_email(to: str, subject: str, body: str, secret: str) -> str | None:
    """Egress policy for send_email. Returns why the email is blocked, or None if it may go out."""
    # Plain addresses only, comma/semicolon separated: no display names, no subdomains, and no
    # newlines (header injection), so only spaces around separators are tolerated.
    recipients = re.split(r" *[,;] *", to.strip(" "))
    if not all(_RECIPIENT_RE.fullmatch(r) for r in recipients):
        return f"recipient not allowed: only @{ALLOWED_EMAIL_DOMAIN} addresses"
    if contains_secret(subject, secret) or contains_secret(body, secret):
        return "message contains the API key"
    return None
