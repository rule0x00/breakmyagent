"""Shared setup for the eval scripts: import path, .env loading, key check."""

import json
import os
import random
import sys
from pathlib import Path

AGENT_ROOT = Path(__file__).resolve().parent.parent
if str(AGENT_ROOT) not in sys.path:
    sys.path.insert(0, str(AGENT_ROOT))

EVALS_DIR = AGENT_ROOT / "evals"


def load_dotenv(path: Path = AGENT_ROOT.parent / ".env") -> None:
    """Minimal .env reader so `python evals/...` works from a fresh shell. Never overrides real env vars."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        if value and key not in os.environ:
            os.environ[key] = value


def require_api_key() -> None:
    provider = os.environ.get("LLM_PROVIDER", "anthropic")
    key = "OPENAI_API_KEY" if provider == "openai" else "ANTHROPIC_API_KEY"
    if not os.environ.get(key):
        sys.exit(f"{key} is not set (LLM_PROVIDER={provider}). Set it in .env or the environment to run evals.")


def load_jsonl(name: str) -> list[dict]:
    return [json.loads(line) for line in (EVALS_DIR / name).read_text().splitlines() if line.strip()]


def sample(rows: list[dict], n: int | None, seed: int) -> list[dict]:
    if not n or n >= len(rows):
        return rows
    return random.Random(seed).sample(rows, n)
