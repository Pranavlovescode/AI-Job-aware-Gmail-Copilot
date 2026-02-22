from app.models.schemas import Category, ClassificationResult, EmailInput, JobSubtype


class ClassificationAgent:
    async def run(self, email: EmailInput) -> ClassificationResult:
        text = f"{email.subject} {email.body}".lower()

        if any(token in text for token in ["unsubscribe", "discount", "sale", "limited offer"]):
            return ClassificationResult(
                category=Category.promotion,
                subtype=JobSubtype.unknown,
                confidence=0.84,
                reasoning="Detected promotional language and marketing terms.",
            )

        if any(token in text for token in ["invoice", "payment", "bank", "transaction"]):
            return ClassificationResult(
                category=Category.finance,
                subtype=JobSubtype.unknown,
                confidence=0.82,
                reasoning="Detected finance and billing language.",
            )

        if any(token in text for token in ["job", "interview", "recruiter", "application", "offer", "assessment"]):
            subtype = JobSubtype.unknown
            if "thank you for applying" in text or "application received" in text:
                subtype = JobSubtype.application_confirmation
            elif "recruiter" in text or "sourcing" in text:
                subtype = JobSubtype.recruiter_outreach
            elif "interview" in text:
                subtype = JobSubtype.interview_invitation
            elif "assessment" in text or "coding challenge" in text:
                subtype = JobSubtype.coding_assessment
            elif "offer" in text:
                subtype = JobSubtype.offer_letter
            elif "regret" in text or "unfortunately" in text:
                subtype = JobSubtype.rejection
            elif "follow up" in text or "checking in" in text:
                subtype = JobSubtype.follow_up

            return ClassificationResult(
                category=Category.job,
                subtype=subtype,
                confidence=0.9,
                reasoning="Detected hiring/recruiting keywords and context.",
            )

        if any(token in text for token in ["urgent", "verify account", "wire transfer", "gift card", "send money"]):
            return ClassificationResult(
                category=Category.spam,
                subtype=JobSubtype.unknown,
                confidence=0.78,
                reasoning="Detected common spam/scam intent patterns.",
            )

        if any(token in text for token in ["update", "newsletter", "announcement"]):
            return ClassificationResult(
                category=Category.update,
                subtype=JobSubtype.unknown,
                confidence=0.72,
                reasoning="Detected informational or update-style content.",
            )

        return ClassificationResult(
            category=Category.personal,
            subtype=JobSubtype.unknown,
            confidence=0.6,
            reasoning="Defaulted to personal due to lack of specialized signals.",
        )
