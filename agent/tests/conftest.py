from collections.abc import Iterator, Sequence
from typing import Any

import pytest
from fastapi.testclient import TestClient
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatResult

from app.guard import GuardResult, GuardVerdict
from app.main import app, get_agent_model, get_input_guard
from app.schemas import Usage


class FakeChatModel(BaseChatModel):
    """Replies with canned messages (str or AIMessage with tool_calls) and records what it was sent."""

    replies: list[str | AIMessage]
    calls: list[list[BaseMessage]] = []
    bound_tools: list[str] = []

    @property
    def _llm_type(self) -> str:
        return "fake"

    def bind_tools(self, tools: Sequence[Any], **kwargs: Any) -> "FakeChatModel":
        self.bound_tools = [getattr(t, "name", str(t)) for t in tools]
        return self

    def _generate(self, messages: list[BaseMessage], stop: Any = None, run_manager: Any = None, **kwargs: Any) -> ChatResult:
        self.calls.append(list(messages))
        reply = self.replies[min(len(self.calls) - 1, len(self.replies) - 1)]
        msg = reply.model_copy() if isinstance(reply, AIMessage) else AIMessage(content=reply)
        msg.usage_metadata = {"input_tokens": 120, "output_tokens": 30, "total_tokens": 150}
        return ChatResult(generations=[ChatGeneration(message=msg)])


class FakeGuard:
    """Flags any message containing 'password' or 'ignore'."""

    def __init__(self) -> None:
        self.seen: list[str] = []

    async def check(self, message: str) -> GuardResult:
        self.seen.append(message)
        attack = any(w in message.lower() for w in ("password", "ignore"))
        return GuardResult(
            verdict=GuardVerdict(is_attack=attack, reason="test"),
            usage=Usage(input_tokens=40, output_tokens=5),
        )


@pytest.fixture
def fake_model() -> Iterator[FakeChatModel]:
    model = FakeChatModel(replies=["I can't share that."], calls=[])
    app.dependency_overrides[get_agent_model] = lambda: model
    yield model
    app.dependency_overrides.pop(get_agent_model, None)


@pytest.fixture
def fake_guard() -> Iterator[FakeGuard]:
    guard = FakeGuard()
    app.dependency_overrides[get_input_guard] = lambda: guard
    yield guard
    app.dependency_overrides.pop(get_input_guard, None)


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)
