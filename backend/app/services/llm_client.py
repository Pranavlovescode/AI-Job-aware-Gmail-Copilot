import json
from typing import Any, Dict

from langchain_openai import ChatOpenAI

from app.core.config import get_settings


class LLMClient:
    def __init__(self) -> None:
        self.settings = get_settings()
        self._client = (
            ChatOpenAI(
                model=self.settings.openai_model,
                api_key=self.settings.openai_api_key,
                temperature=0,
                timeout=25,
            )
            if self.settings.openai_api_key
            else None
        )

    @staticmethod
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

    @staticmethod
    def _extract_first_json_block(text: str) -> str:
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            return ""
        return text[start : end + 1]

    async def complete_json(self, prompt: str, fallback: Dict[str, Any]) -> Dict[str, Any]:
        """
        Best-effort JSON completion. Falls back to deterministic local output when API key is missing
        or external model call fails.
        """
        if self._client is None:
            return fallback

        try:
            response = await self._client.ainvoke(
                "Return only valid JSON object.\n\n" + prompt
            )
            text = self._extract_text(response.content).strip()
            payload = self._extract_first_json_block(text)
            if not payload:
                return fallback
            return json.loads(payload)
        except Exception:
            return fallback

    async def complete_text(self, prompt: str, fallback: str) -> str:
        if self._client is None:
            return fallback

        try:
            response = await self._client.ainvoke(prompt)
            text = self._extract_text(response.content).strip()
            return text or fallback
        except Exception:
            return fallback
