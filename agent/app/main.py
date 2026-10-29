import logging
import time
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from langchain_core.language_models import BaseChatModel
from pydantic import BaseModel

from app.config import Settings, get_settings
from app.graph import run_level
from app.guard import InputGuard, LLMInputGuard
from app.levels import get_level
from app.llm import build_chat_model
from app.schemas import ChatRequest, ChatResponse

log = logging.getLogger(__name__)

app = FastAPI(title="BreakMyAgent agent service")


class HealthResponse(BaseModel):
    status: str
    provider: str
    model: str


def get_agent_model(settings: Annotated[Settings, Depends(get_settings)]) -> BaseChatModel:
    return build_chat_model(settings, settings.agent_model, settings.agent_max_tokens)


def get_input_guard(settings: Annotated[Settings, Depends(get_settings)]) -> InputGuard:
    return LLMInputGuard(settings)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(status="ok", provider=settings.llm_provider, model=settings.agent_model)


@app.post("/levels/{n}/chat", response_model=ChatResponse, response_model_by_alias=True)
async def chat(
    n: int,
    req: ChatRequest,
    model: Annotated[BaseChatModel, Depends(get_agent_model)],
    guard: Annotated[InputGuard, Depends(get_input_guard)],
) -> ChatResponse:
    level = get_level(n)
    if level is None:
        raise HTTPException(status_code=404, detail=f"Level {n} does not exist")

    started = time.perf_counter()
    try:
        res = await run_level(level, req, model, guard)
    except Exception as exc:  # provider errors, timeouts, bad keys
        log.exception("LLM call failed for level %s", n)
        raise HTTPException(status_code=502, detail="Upstream model error") from exc
    res.latency_ms = int((time.perf_counter() - started) * 1000)
    return res
