import json
import functools
from typing import Any, Dict, Optional

from langchain_openai import ChatOpenAI

from app.core.config import get_settings


@functools.lru_cache(maxsize=1)
def get_llm_client() -> Optional[ChatOpenAI]:
    """
    Returns a cached instance of the ChatOpenAI client.
    """
    settings = get_settings()
    if not settings.openai_api_key:
        return None
        
    return ChatOpenAI(
        model=settings.openai_model,
        api_key=settings.openai_api_key,
        temperature=0,
        timeout=25,
    )


def _extract_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict) and "text" in item:
                parts.append(str(item["text"]))
        return "\n".join(parts)
    return str(content or "")


def _extract_first_json_block(text: str) -> str:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return ""
    return text[start : end + 1]


async def complete_json(prompt: str, fallback: Dict[str, Any]) -> Dict[str, Any]:
    """
    Best-effort JSON completion. Falls back to deterministic local output when API key is missing
    or external model call fails.
    """
    client = get_llm_client()
    if client is None:
        return fallback

    try:
        response = await client.ainvoke(
            "Return only valid JSON object.\n\n" + prompt
        )
        text = _extract_text(response.content).strip()
        payload = _extract_first_json_block(text)
        if not payload:
            return fallback
        return json.loads(payload)
    except Exception:
        return fallback


async def complete_text(prompt: str, fallback: str) -> str:
    """
    Best-effort text completion.
    """
    client = get_llm_client()
    if client is None:
        return fallback

    try:
        response = await client.ainvoke(prompt)
        text = _extract_text(response.content).strip()
        return text or fallback
    except Exception:
        return fallback
