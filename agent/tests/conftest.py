from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatResult

from app.main import app, get_agent_model


class FakeChatModel(BaseChatModel):
    """Replies with canned text and records what it was sent."""

    replies: list[str]
    calls: list[list[BaseMessage]] = []

    @property
    def _llm_type(self) -> str:
        return "fake"

    def _generate(self, messages: list[BaseMessage], stop: Any = None, run_manager: Any = None, **kwargs: Any) -> ChatResult:
        self.calls.append(messages)
        text = self.replies[min(len(self.calls) - 1, len(self.replies) - 1)]
        msg = AIMessage(content=text, usage_metadata={"input_tokens": 120, "output_tokens": 30, "total_tokens": 150})
        return ChatResult(generations=[ChatGeneration(message=msg)])


@pytest.fixture
def fake_model() -> Iterator[FakeChatModel]:
    model = FakeChatModel(replies=["I can't share that."], calls=[])
    app.dependency_overrides[get_agent_model] = lambda: model
    yield model
    app.dependency_overrides.clear()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)
