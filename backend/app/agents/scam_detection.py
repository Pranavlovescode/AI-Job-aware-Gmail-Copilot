import re

from app.models.schemas import EmailInput, ScamDetectionResult


class ScamDetectionAgent:
    async def run(self, email: EmailInput) -> ScamDetectionResult:
        text = f"{email.subject} {email.body}".lower()
        flags = []
        score = 5

        suspicious_domains = ["@gmail.com", "@yahoo.com", "@outlook.com"]
        if any(domain in email.sender.lower() for domain in suspicious_domains) and "recruit" in text:
            score += 20
            flags.append("Generic email domain used for recruiting communication.")

        if re.search(r"\$\s?\d{3,}\s?(per hour|/hour)", text):
            score += 20
            flags.append("Unusually high salary claim for initial contact.")

        if any(token in text for token in ["send money", "processing fee", "gift card", "wire transfer"]):
            score += 45
            flags.append("Request for money or suspicious payment language.")

        if any(token in text for token in ["within 1 hour", "act now", "final warning"]):
            score += 20
            flags.append("High-pressure urgency tactics detected.")

        score = min(score, 100)
        return ScamDetectionResult(risk_score=score, flags=flags, is_suspicious=score >= 40)
