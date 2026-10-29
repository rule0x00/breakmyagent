"""Chat-model factory. The provider and model names come from env (see app.config)."""

from typing import Any

from langchain.chat_models import init_chat_model
from langchain_core.language_models import BaseChatModel

from app.config import Settings


def build_chat_model(settings: Settings, model: str, max_tokens: int) -> BaseChatModel:
    kwargs: dict[str, Any] = {"max_tokens": max_tokens}
    if settings.llm_provider == "anthropic":
        # Current Claude models reject sampling params (temperature etc.); effort is
        # the knob instead, and "low" is plenty for a chat game.
        kwargs["output_config"] = {"effort": "low"}
    else:
        kwargs["temperature"] = 0.7
    return init_chat_model(model, model_provider=settings.llm_provider, **kwargs)
