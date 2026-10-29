"""Runs one player turn against a level's agent.

Levels 1-4 are a single chat-model call (level 4 behind the input guard).
Level 5 is a LangGraph tool loop: agent -> tools -> agent ... until the model stops calling tools.
"""

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.errors import GraphRecursionError
from langgraph.graph import END, START, MessagesState, StateGraph

from app.defenses import apply_output_filter
from app.guard import INPUT_BLOCKED_MESSAGE, InputGuard
from app.levels import LevelConfig
from app.mailbox import Mailbox
from app.schemas import BlockedBy, ChatRequest, ChatResponse, ToolCall, Usage

# Each agent or tools node run is one step; 12 allows ~5 tool rounds before we stop the loop.
MAX_GRAPH_STEPS = 12
STOPPED_MESSAGE = "(The agent was stopped: too many steps.)"


def _to_messages(level: LevelConfig, req: ChatRequest) -> list[BaseMessage]:
    messages: list[BaseMessage] = [SystemMessage(level.render_system_prompt(req.secret))]
    for m in req.history:
        messages.append(HumanMessage(m.content) if m.role == "user" else AIMessage(m.content))
    messages.append(HumanMessage(req.message))
    return messages


def _usage(messages: list[BaseMessage]) -> Usage:
    usage = Usage()
    for m in messages:
        if isinstance(m, AIMessage) and m.usage_metadata:
            usage.input_tokens += m.usage_metadata.get("input_tokens", 0)
            usage.output_tokens += m.usage_metadata.get("output_tokens", 0)
    return usage


async def _run_chat(model: BaseChatModel, messages: list[BaseMessage]) -> tuple[str, list[ToolCall], Usage]:
    result = await model.ainvoke(messages)
    assert isinstance(result, AIMessage)
    return result.text, [], _usage([result])


async def _run_tool_agent(
    model: BaseChatModel, messages: list[BaseMessage], mailbox: Mailbox
) -> tuple[str, list[ToolCall], Usage]:
    bound = model.bind_tools(mailbox.tools())

    async def agent(state: MessagesState) -> dict:
        return {"messages": [await bound.ainvoke(state["messages"])]}

    def tools(state: MessagesState) -> dict:
        last = state["messages"][-1]
        assert isinstance(last, AIMessage)
        return {
            "messages": [
                ToolMessage(content=mailbox.run(tc["name"], tc["args"]), tool_call_id=tc["id"] or tc["name"])
                for tc in last.tool_calls
            ]
        }

    def route(state: MessagesState) -> str:
        last = state["messages"][-1]
        return "tools" if isinstance(last, AIMessage) and last.tool_calls else END

    builder = StateGraph(MessagesState)
    builder.add_node("agent", agent)
    builder.add_node("tools", tools)
    builder.add_edge(START, "agent")
    builder.add_conditional_edges("agent", route, ["tools", END])
    builder.add_edge("tools", "agent")
    graph = builder.compile()

    # Stream state snapshots so a runaway loop still leaves us the messages so far.
    final: list[BaseMessage] = messages
    stopped = False
    try:
        async for state in graph.astream({"messages": messages}, {"recursion_limit": MAX_GRAPH_STEPS}, stream_mode="values"):
            final = state["messages"]
    except GraphRecursionError:
        stopped = True

    last = final[-1]
    reply = STOPPED_MESSAGE if stopped or not isinstance(last, AIMessage) else last.text
    return reply, mailbox.tool_calls, _usage(final)


async def run_level(level: LevelConfig, req: ChatRequest, model: BaseChatModel, guard: InputGuard) -> ChatResponse:
    usage = Usage()
    if level.input_guard:
        # Screens the chat message only. On level 5 the planted email is not screened: that's the
        # indirect-injection path the level is about.
        checked = await guard.check(req.message)
        usage = checked.usage
        if checked.verdict.is_attack:
            return ChatResponse(reply=INPUT_BLOCKED_MESSAGE, blocked_by="input_guard", usage=usage)

    messages = _to_messages(level, req)
    if level.tools:
        reply, tool_calls, agent_usage = await _run_tool_agent(model, messages, Mailbox(req.secret, req.inbox_email))
    else:
        reply, tool_calls, agent_usage = await _run_chat(model, messages)
    usage = Usage(
        input_tokens=usage.input_tokens + agent_usage.input_tokens,
        output_tokens=usage.output_tokens + agent_usage.output_tokens,
    )

    blocked_by: BlockedBy | None = None
    if level.output_filter:
        reply, blocked = apply_output_filter(reply, req.secret)
        if blocked:
            blocked_by = "output_filter"
    if blocked_by is None and any(c.blocked for c in tool_calls):
        blocked_by = "egress_filter"
    return ChatResponse(reply=reply, tool_calls=tool_calls, blocked_by=blocked_by, usage=usage)
