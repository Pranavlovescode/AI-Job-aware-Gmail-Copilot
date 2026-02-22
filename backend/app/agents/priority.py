from app.models.schemas import EmailInput, PriorityLabel, PriorityResult


class PriorityScoringAgent:
    async def run(self, email: EmailInput) -> PriorityResult:
        text = f"{email.subject} {email.body}".lower()

        score = 35
        reasons = []

        if any(token in text for token in ["asap", "urgent", "immediately", "today", "deadline"]):
            score += 35
            reasons.append("Urgent or time-sensitive language detected.")

        if any(token in text for token in ["interview", "offer", "assessment"]):
            score += 25
            reasons.append("Career-critical hiring workflow detected.")

        if any(token in text for token in ["reply", "confirm", "action required"]):
            score += 15
            reasons.append("Explicit response/action request found.")

        score = min(score, 100)

        if score >= 85:
            label = PriorityLabel.critical
        elif score >= 65:
            label = PriorityLabel.high
        elif score >= 45:
            label = PriorityLabel.medium
        else:
            label = PriorityLabel.low

        return PriorityResult(
            score=score,
            label=label,
            action_required=score >= 55,
            reasons=reasons or ["No explicit urgency markers; normal processing window."],
        )
