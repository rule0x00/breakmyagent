import os
from functools import lru_cache
from typing import Literal

from pydantic import BaseModel


class Settings(BaseModel):
    llm_provider: Literal["anthropic", "openai"] = "anthropic"
    agent_model: str = "claude-haiku-5-5"
    guard_model: str = "claude-haiku-5-5"
    classifier_model: str = "claude-haiku-5-5"
    agent_max_tokens: int = 1024


@lru_cache
def get_settings() -> Settings:
    env = {k.lower(): v for k, v in os.environ.items() if v}
    return Settings.model_validate({k: env[k] for k in Settings.model_fields if k in env})
