from langchain_community.embeddings import FakeEmbeddings
from langchain_core.embeddings import Embeddings
from langchain_openai import OpenAIEmbeddings

from app.core.config import get_settings


def get_embeddings() -> Embeddings:
    """
    LangChain embedding provider.
    - Uses OpenAI embeddings when API key is configured.
    - Falls back to FakeEmbeddings for local/dev deterministic behavior.
    """
    settings = get_settings()
    if settings.openai_api_key:
        return OpenAIEmbeddings(api_key=settings.openai_api_key)
    return FakeEmbeddings(size=256)
