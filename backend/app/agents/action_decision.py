from app.models.schemas import (
    ActionDecisionResult,
    ActionType,
    ClassificationResult,
    PriorityResult,
    ScamDetectionResult,
)


class ActionDecisionAgent:
    async def run(
        self,
        classification: ClassificationResult,
        priority: PriorityResult,
        scam: ScamDetectionResult,
    ) -> ActionDecisionResult:
        if scam.is_suspicious:
            return ActionDecisionResult(
                action=ActionType.flag_scam,
                confidence=0.93,
                reasoning="Potential scam indicators are present and should be reviewed before interaction.",
                suggested_due_date="",
            )

        if classification.category.value == "Job":
            if priority.action_required:
                return ActionDecisionResult(
                    action=ActionType.draft_reply,
                    confidence=0.91,
                    reasoning="Job-related and action-required; drafting a response is the fastest safe next step.",
                )
            return ActionDecisionResult(
                action=ActionType.update_job_dashboard,
                confidence=0.82,
                reasoning="Job signal found; tracking in dashboard is useful even if immediate reply is unnecessary.",
            )

        if priority.action_required:
            return ActionDecisionResult(
                action=ActionType.draft_reply,
                confidence=0.77,
                reasoning="Message appears to require a response soon.",
            )

        return ActionDecisionResult(
            action=ActionType.mark_fyi,
            confidence=0.7,
            reasoning="No immediate action required; mark for informational review.",
        )
