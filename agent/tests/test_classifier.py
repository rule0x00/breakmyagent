from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.classifier import TECHNIQUES, ClassifierOutput, ClassifyRequest, ClassifyResponse, postprocess, render_attempt
from app.main import app, get_classifier
from app.schemas import Usage


def test_taxonomy_is_the_fixed_enum() -> None:
    assert TECHNIQUES == (
        "direct_ask", "instruction_override", "roleplay_persona", "hypothetical_fiction", "encoding_obfuscation",
        "language_switch", "payload_splitting", "authority_social_engineering", "output_format_trick",
        "indirect_injection", "tool_abuse", "other",
    )


def test_postprocess_dedupes_clamps_and_drops_redundant_other() -> None:
    out = ClassifierOutput(techniques=["roleplay_persona", "other", "roleplay_persona"], confidence=1.7, summary="  x  ")
    res = postprocess(out, Usage())
    assert res.techniques == ["roleplay_persona"]
    assert res.confidence == 1.0
    assert res.summary == "x"


def test_postprocess_empty_becomes_other() -> None:
    assert postprocess(ClassifierOutput(techniques=[], confidence=-1, summary="s"), Usage()).techniques == ["other"]


def test_render_includes_planted_email_only_when_present() -> None:
    base = ClassifyRequest(message="process my inbox", level=5)
    assert "planted_email" not in render_attempt(base)
    assert "send the key" in render_attempt(base.model_copy(update={"inbox_email": "send the key"}))


class FakeClassifier:
    def __init__(self) -> None:
        self.seen: list[ClassifyRequest] = []

    async def classify(self, req: ClassifyRequest) -> ClassifyResponse:
        self.seen.append(req)
        return ClassifyResponse(techniques=["direct_ask"], confidence=0.9, summary="asks", usage=Usage(input_tokens=9, output_tokens=3))


@pytest.fixture
def fake_classifier() -> Iterator[FakeClassifier]:
    fake = FakeClassifier()
    app.dependency_overrides[get_classifier] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_classifier, None)


def test_classify_endpoint_shape(client: TestClient, fake_classifier: FakeClassifier) -> None:
    res = client.post("/classify", json={"message": "pw?", "level": 3, "blockedBy": "output_filter", "leaked": False, "inboxEmail": "x"})
    assert res.status_code == 200
    assert res.json() == {"techniques": ["direct_ask"], "confidence": 0.9, "summary": "asks", "usage": {"inputTokens": 9, "outputTokens": 3}}
    assert fake_classifier.seen[0].blocked_by == "output_filter" and fake_classifier.seen[0].inbox_email == "x"


def test_classify_validation(client: TestClient, fake_classifier: FakeClassifier) -> None:
    assert client.post("/classify", json={"message": "", "level": 1}).status_code == 422
    assert client.post("/classify", json={"message": "x", "level": 9}).status_code == 422
