from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import JobApplication
from app.db.session import get_db
from app.models.schemas import (
    AnalyzeEmailResponse,
    EmailInput,
    HealthResponse,
    JobDashboardItem,
    JobDashboardResponse,
)
from app.services.orchestrator import AgentOrchestrator

router = APIRouter()
orchestrator = AgentOrchestrator()


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(
        status="ok",
        env=settings.app_env,
        details={
            "api_prefix": settings.api_prefix,
            "vector_provider": settings.vector_provider,
            "llm_model": settings.openai_model,
        },
    )


@router.post("/analyze", response_model=AnalyzeEmailResponse)
async def analyze_email(payload: EmailInput, db: Session = Depends(get_db)) -> AnalyzeEmailResponse:
    result = await orchestrator.analyze_email(db, payload)
    return AnalyzeEmailResponse(result=result)


@router.get("/jobs/dashboard", response_model=JobDashboardResponse)
def get_job_dashboard(db: Session = Depends(get_db)) -> JobDashboardResponse:
    rows = db.query(JobApplication).order_by(JobApplication.updated_at.desc()).limit(100).all()
    items = [
        JobDashboardItem(
            company=row.company,
            role=row.role,
            current_stage=row.stage,
            last_contact_date=row.last_contact_date,
            next_action=row.next_action,
            follow_up_reminder_date=row.follow_up_reminder_date,
        )
        for row in rows
    ]
    return JobDashboardResponse(items=items)
