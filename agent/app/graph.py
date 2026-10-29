"""Runs one player turn against a level's agent.

Levels 1-3 are a single chat-model call. The tool-using LangGraph agent for
level 5 lives here too once it exists.
"""

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

from app.defenses import apply_output_filter
from app.levels import LevelConfig
from app.schemas import ChatRequest, ChatResponse, Usage


def _to_messages(level: LevelConfig, req: ChatRequest) -> list[BaseMessage]:
    messages: list[BaseMessage] = [SystemMessage(level.render_system_prompt(req.secret))]
    for m in req.history:
        messages.append(HumanMessage(m.content) if m.role == "user" else AIMessage(m.content))
    messages.append(HumanMessage(req.message))
    return messages


def _usage(msg: AIMessage) -> Usage:
    meta = msg.usage_metadata or {}
    return Usage(input_tokens=meta.get("input_tokens", 0), output_tokens=meta.get("output_tokens", 0))


async def run_chat_level(level: LevelConfig, req: ChatRequest, model: BaseChatModel) -> ChatResponse:
    result = await model.ainvoke(_to_messages(level, req))
    assert isinstance(result, AIMessage)
    reply = result.text
    blocked_by = None
    if level.output_filter:
        reply, blocked = apply_output_filter(reply, req.secret)
        if blocked:
            blocked_by = "output_filter"
    return ChatResponse(reply=reply, blocked_by=blocked_by, usage=_usage(result))
