from fastapi import FastAPI
from pydantic import BaseModel

from app.config import get_settings

app = FastAPI(title="BreakMyAgent agent service")


class HealthResponse(BaseModel):
    status: str
    provider: str
    model: str


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(status="ok", provider=settings.llm_provider, model=settings.agent_model)
