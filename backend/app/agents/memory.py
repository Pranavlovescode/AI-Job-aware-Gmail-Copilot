from typing import List

from app.models.schemas import EmailInput, MemoryResult
from app.services.vector_store import SimpleVectorStore


async def run_memory_agent(email: EmailInput, store: SimpleVectorStore) -> MemoryResult:
    """
    Retrieves relevant conversation history and updates memory.
    """
    query = f"{email.sender} {email.subject} {email.body[:400]}"
    matches = store.search(query, top_k=3)

    pending_commitments: List[str] = []
    snippets: List[str] = []
    prior_tone = "neutral"

    for item in matches:
        text = item.text
        snippets.append(text[:180])
        if "i will" in text.lower() or "i can" in text.lower():
            pending_commitments.append(text[:90])
        if any(token in text.lower() for token in ["pleased", "excited", "thank you"]):
            prior_tone = "positive and professional"

    summary = " | ".join(snippets) if snippets else "No relevant conversation history found."

    store.upsert(
        item_id=f"{email.thread_id}:{email.sender}:{hash(email.subject)}",
        text=f"Subject: {email.subject}. Body: {email.body[:800]}",
        metadata={"thread_id": email.thread_id, "sender": email.sender},
    )

    return MemoryResult(
        retrieved_count=len(matches),
        summary=summary,
        pending_commitments=pending_commitments,
        prior_tone=prior_tone,
    )
