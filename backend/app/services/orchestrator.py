from typing import TypedDict

from langgraph.graph import END, START, StateGraph
from sqlalchemy.orm import Session

from app.agents.action_decision import ActionDecisionAgent
from app.agents.classification import ClassificationAgent
from app.agents.job_extraction import JobDashboardExtractionAgent
from app.agents.memory import MemoryAgent
from app.agents.priority import PriorityScoringAgent
from app.agents.reply_generation import ReplyGenerationAgent
from app.agents.scam_detection import ScamDetectionAgent
from app.db.models import EmailAnalysis, JobApplication
from app.models.schemas import (
    ActionDecisionResult,
    AnalysisResult,
    ClassificationResult,
    EmailInput,
    JobDashboardExtractionResult,
    MemoryResult,
    PriorityResult,
    ScamDetectionResult,
)
from app.services.embeddings import EmbeddingService
from app.services.llm_client import LLMClient
from app.services.vector_store import LangChainVectorStore


class PipelineState(TypedDict, total=False):
    db: Session
    email: EmailInput
    classification: ClassificationResult
    priority: PriorityResult
    memory: MemoryResult
    scam_detection: ScamDetectionResult
    action_decision: ActionDecisionResult
    job_extraction: JobDashboardExtractionResult
    draft_reply: str
    ai_summary: str
    result: AnalysisResult


class AgentOrchestrator:
    def __init__(self) -> None:
        embeddings = EmbeddingService().get_embeddings()
        vector_store = LangChainVectorStore(embeddings)
        llm_client = LLMClient()

        self.classifier = ClassificationAgent()
        self.priority = PriorityScoringAgent()
        self.memory = MemoryAgent(vector_store)
        self.action = ActionDecisionAgent()
        self.reply = ReplyGenerationAgent(llm_client)
        self.scam = ScamDetectionAgent()
        self.job_extract = JobDashboardExtractionAgent()
        self.graph = self._build_graph()

    def _build_graph(self):
        graph = StateGraph(PipelineState)
        graph.add_node("classification", self._classification_node)
        graph.add_node("priority", self._priority_node)
        graph.add_node("memory", self._memory_node)
        graph.add_node("scam_detection", self._scam_node)
        graph.add_node("action_decision", self._action_node)
        graph.add_node("job_extraction", self._job_extraction_node)
        graph.add_node("reply_generation", self._reply_node)
        graph.add_node("assemble_result", self._assemble_result_node)
        graph.add_node("persist_result", self._persist_result_node)

        graph.add_edge(START, "classification")
        graph.add_edge("classification", "priority")
        graph.add_edge("priority", "memory")
        graph.add_edge("memory", "scam_detection")
        graph.add_edge("scam_detection", "action_decision")
        graph.add_edge("action_decision", "job_extraction")
        graph.add_edge("job_extraction", "reply_generation")
        graph.add_edge("reply_generation", "assemble_result")
        graph.add_edge("assemble_result", "persist_result")
        graph.add_edge("persist_result", END)
        return graph.compile()

    async def _classification_node(self, state: PipelineState) -> PipelineState:
        return {"classification": await self.classifier.run(state["email"])}

    async def _priority_node(self, state: PipelineState) -> PipelineState:
        return {"priority": await self.priority.run(state["email"])}

    async def _memory_node(self, state: PipelineState) -> PipelineState:
        return {"memory": await self.memory.run(state["email"])}

    async def _scam_node(self, state: PipelineState) -> PipelineState:
        return {"scam_detection": await self.scam.run(state["email"])}

    async def _action_node(self, state: PipelineState) -> PipelineState:
        return {
            "action_decision": await self.action.run(
                state["classification"], state["priority"], state["scam_detection"]
            )
        }

    async def _job_extraction_node(self, state: PipelineState) -> PipelineState:
        return {
            "job_extraction": await self.job_extract.run(
                state["email"], state["classification"]
            )
        }

    async def _reply_node(self, state: PipelineState) -> PipelineState:
        return {
            "draft_reply": await self.reply.run(
                state["email"], state["memory"], state["action_decision"]
            )
        }

    async def _assemble_result_node(self, state: PipelineState) -> PipelineState:
        ai_summary = (
            f"Category: {state['classification'].category.value}. "
            f"Priority: {state['priority'].label.value} ({state['priority'].score}). "
            f"Action: {state['action_decision'].action.value}. "
            f"Scam risk: {state['scam_detection'].risk_score}/100."
        )
        result = AnalysisResult(
            classification=state["classification"],
            priority=state["priority"],
            memory=state["memory"],
            action_decision=state["action_decision"],
            scam_detection=state["scam_detection"],
            job_extraction=state["job_extraction"],
            ai_summary=ai_summary,
            draft_reply=state["draft_reply"],
        )
        return {"ai_summary": ai_summary, "result": result}

    async def _persist_result_node(self, state: PipelineState) -> PipelineState:
        db = state["db"]
        email = state["email"]
        result = state["result"]

        analysis_row = EmailAnalysis(
            thread_id=email.thread_id,
            sender=email.sender,
            subject=email.subject,
            category=result.classification.category.value,
            subtype=result.classification.subtype.value,
            priority_score=result.priority.score,
            priority_label=result.priority.label.value,
            action_required=result.priority.action_required,
            action_decision=result.action_decision.model_dump(),
            scam_risk_score=result.scam_detection.risk_score,
            memory_summary=result.memory.summary,
            generated_reply=result.draft_reply,
            raw_payload=result.model_dump(),
        )
        db.add(analysis_row)
        db.flush()

        if result.job_extraction.is_job_related:
            existing = (
                db.query(JobApplication)
                .filter(JobApplication.thread_id == email.thread_id)
                .one_or_none()
            )

            if existing:
                existing.company = result.job_extraction.company or existing.company
                existing.role = result.job_extraction.role or existing.role
                existing.location = result.job_extraction.location or existing.location
                existing.recruiter_name = (
                    result.job_extraction.recruiter_name or existing.recruiter_name
                )
                existing.stage = result.job_extraction.stage
                existing.last_contact_date = (
                    email.received_at.isoformat() if email.received_at else ""
                )
                existing.interview_datetime = result.job_extraction.interview_datetime
                existing.next_action = result.job_extraction.next_action
                existing.confidence_score = result.job_extraction.confidence
                existing.source_analysis_id = analysis_row.id
            else:
                db.add(
                    JobApplication(
                        thread_id=email.thread_id,
                        company=result.job_extraction.company,
                        role=result.job_extraction.role,
                        location=result.job_extraction.location,
                        recruiter_name=result.job_extraction.recruiter_name,
                        stage=result.job_extraction.stage,
                        last_contact_date=(
                            email.received_at.isoformat() if email.received_at else ""
                        ),
                        interview_datetime=result.job_extraction.interview_datetime,
                        next_action=result.job_extraction.next_action,
                        confidence_score=result.job_extraction.confidence,
                        source_analysis_id=analysis_row.id,
                    )
                )

        db.commit()
        return {}

    async def analyze_email(self, db: Session, email: EmailInput) -> AnalysisResult:
        final_state = await self.graph.ainvoke({"db": db, "email": email})
        return final_state["result"]
