from dataclasses import dataclass
from typing import Dict, List

from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings
from langchain_core.vectorstores import InMemoryVectorStore


@dataclass
class MemoryMatch:
    id: str
    text: str
    metadata: Dict
    score: float


class SimpleVectorStore:
    """
    A simple wrapper for InMemoryVectorStore.
    """
    def __init__(self, embeddings: Embeddings) -> None:
        self._store = InMemoryVectorStore(embedding=embeddings)
        self._ids: set[str] = set()

    def upsert(self, item_id: str, text: str, metadata: Dict) -> None:
        if item_id in self._ids:
            self._store.delete(ids=[item_id])

        doc = Document(page_content=text, metadata={**metadata, "id": item_id})
        self._store.add_documents([doc], ids=[item_id])
        self._ids.add(item_id)

    def search(self, query: str, top_k: int = 5) -> List[MemoryMatch]:
        matches = self._store.similarity_search_with_score(query, k=top_k)
        result: List[MemoryMatch] = []
        for doc, score in matches:
            result.append(
                MemoryMatch(
                    id=str(doc.metadata.get("id", "")),
                    text=doc.page_content,
                    metadata=dict(doc.metadata),
                    score=float(score),
                )
            )
        return result


def get_vector_store(embeddings: Embeddings) -> SimpleVectorStore:
    """
    Factory function for the vector store.
    """
    return SimpleVectorStore(embeddings)
