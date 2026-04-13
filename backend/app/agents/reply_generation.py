from app.models.schemas import ActionDecisionResult, EmailInput, MemoryResult, Tone
from app.services.llm_client import complete_text


async def run_reply_generation_agent(
    email: EmailInput,
    memory: MemoryResult,
    action: ActionDecisionResult,
) -> str:
    """
    Generates a draft reply based on the email content, memory, and decided action.
    """
    if action.action.value not in {"Draft Reply", "Suggest Follow-Up"}:
        return ""

    fallback = (
        "Hi,\n\n"
        "Thank you for your email. I have reviewed the details and appreciate the update. "
        "Please let me know if you need anything else from my side.\n\n"
        "Best regards,"
    )

    tone_instruction = {
        Tone.formal: "Use a formal and polished tone.",
        Tone.friendly: "Use a warm and friendly tone.",
        Tone.concise: "Be concise and direct.",
        Tone.confident: "Use a confident and professional tone.",
        Tone.negotiation: "Use a tactful negotiation tone with clear asks.",
    }[email.user_tone]

    prompt = (
        "Generate only an email body (no subject) with no hallucinated facts. "
        f"{tone_instruction}\n"
        f"Incoming email subject: {email.subject}\n"
        f"Incoming email sender: {email.sender}\n"
        f"Incoming email body: {email.body[:1800]}\n"
        f"Conversation memory: {memory.summary[:1000]}\n"
        "If the incoming email asks for specific missing information, acknowledge and ask clarifying questions."
    )

    return await complete_text(prompt, fallback=fallback)
