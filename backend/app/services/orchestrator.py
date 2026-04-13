from typing import TypedDict

from langgraph.graph import END, START, StateGraph
from sqlalchemy.orm import Session

from app.agents.action_decision import run_action_decision_agent
from app.agents.classification import run_classification_agent
from app.agents.job_extraction import run_job_extraction_agent
from app.agents.memory import run_memory_agent
from app.agents.priority import run_priority_agent
from app.agents.reply_generation import run_reply_generation_agent
from app.agents.scam_detection import run_scam_detection_agent
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
from app.services.embeddings import get_embeddings
from app.services.vector_store import get_vector_store


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


# Initialize stateful services once
_embeddings = get_embeddings()
_vector_store = get_vector_store(_embeddings)


async def _classification_node(state: PipelineState) -> PipelineState:
    return {"classification": await run_classification_agent(state["email"])}


async def _priority_node(state: PipelineState) -> PipelineState:
    return {"priority": await run_priority_agent(state["email"])}


async def _memory_node(state: PipelineState) -> PipelineState:
    return {"memory": await run_memory_agent(state["email"], _vector_store)}


async def _scam_node(state: PipelineState) -> PipelineState:
    return {"scam_detection": await run_scam_detection_agent(state["email"])}


async def _action_node(state: PipelineState) -> PipelineState:
    return {
        "action_decision": await run_action_decision_agent(
            state["classification"], state["priority"], state["scam_detection"]
        )
    }


async def _job_extraction_node(state: PipelineState) -> PipelineState:
    return {
        "job_extraction": await run_job_extraction_agent(
            state["email"], state["classification"]
        )
    }


async def _reply_node(state: PipelineState) -> PipelineState:
    return {
        "draft_reply": await run_reply_generation_agent(
            state["email"], state["memory"], state["action_decision"]
        )
    }


async def _assemble_result_node(state: PipelineState) -> PipelineState:
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


async def _persist_result_node(state: PipelineState) -> PipelineState:
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


def create_orchestrator_graph():
    """
    Builds and compiles the LangGraph pipeline using function-based nodes.
    """
    graph = StateGraph(PipelineState)
    graph.add_node("classification", _classification_node)
    graph.add_node("priority", _priority_node)
    graph.add_node("memory", _memory_node)
    graph.add_node("scam_detection", _scam_node)
    graph.add_node("action_decision", _action_node)
    graph.add_node("job_extraction", _job_extraction_node)
    graph.add_node("reply_generation", _reply_node)
    graph.add_node("assemble_result", _assemble_result_node)
    graph.add_node("persist_result", _persist_result_node)

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


# Compiled graph instance
orchestrator_graph = create_orchestrator_graph()


async def analyze_email_orchestrator(db: Session, email: EmailInput) -> AnalysisResult:
    """
    Function-based entry point to analyze an email using the LangGraph pipeline.
    """
    final_state = await orchestrator_graph.ainvoke({"db": db, "email": email})
    return final_state["result"]
