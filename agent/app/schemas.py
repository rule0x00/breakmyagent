from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class HistoryMessage(CamelModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(CamelModel):
    secret: str = Field(min_length=1, max_length=100)
    history: list[HistoryMessage] = Field(default_factory=list, max_length=20)
    message: str = Field(min_length=1, max_length=1000)
    inbox_email: str | None = Field(default=None, max_length=1500)


class ToolCall(CamelModel):
    name: str
    args: dict[str, Any]
    blocked: bool = False


class Usage(CamelModel):
    input_tokens: int = 0
    output_tokens: int = 0


BlockedBy = Literal["input_guard", "output_filter", "egress_filter"]


class ChatResponse(CamelModel):
    reply: str
    tool_calls: list[ToolCall] = Field(default_factory=list)
    blocked_by: BlockedBy | None = None
    usage: Usage = Field(default_factory=Usage)
    latency_ms: int = 0
