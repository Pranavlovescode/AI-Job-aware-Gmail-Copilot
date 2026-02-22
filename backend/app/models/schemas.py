from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class Category(str, Enum):
    job = "Job"
    personal = "Personal"
    spam = "Spam"
    update = "Update"
    finance = "Finance"
    promotion = "Promotion"
    other = "Other"


class JobSubtype(str, Enum):
    application_confirmation = "Application Confirmation"
    recruiter_outreach = "Recruiter Outreach"
    interview_invitation = "Interview Invitation"
    coding_assessment = "Coding Assessment"
    offer_letter = "Offer Letter"
    rejection = "Rejection"
    follow_up = "Follow Up"
    unknown = "Unknown"


class PriorityLabel(str, Enum):
    low = "Low"
    medium = "Medium"
    high = "High"
    critical = "Critical"


class ActionType(str, Enum):
    draft_reply = "Draft Reply"
    suggest_follow_up = "Suggest Follow-Up"
    add_reminder = "Add Reminder"
    update_job_dashboard = "Update Job Dashboard"
    mark_fyi = "Mark as FYI"
    flag_scam = "Flag as Scam"
    no_action = "No Action"


class Tone(str, Enum):
    formal = "Formal"
    friendly = "Friendly"
    concise = "Concise"
    confident = "Confident"
    negotiation = "Negotiation Mode"


class EmailInput(BaseModel):
    thread_id: str = Field(..., description="Conversation thread id from Gmail")
    sender: str
    subject: str
    body: str
    received_at: Optional[datetime] = None
    user_tone: Tone = Tone.formal


class ClassificationResult(BaseModel):
    category: Category
    subtype: JobSubtype = JobSubtype.unknown
    confidence: float = Field(ge=0, le=1)
    reasoning: str


class PriorityResult(BaseModel):
    score: int = Field(ge=0, le=100)
    label: PriorityLabel
    action_required: bool
    reasons: List[str]


class MemoryResult(BaseModel):
    retrieved_count: int
    summary: str
    pending_commitments: List[str]
    prior_tone: str


class ActionDecisionResult(BaseModel):
    action: ActionType
    confidence: float = Field(ge=0, le=1)
    reasoning: str
    suggested_due_date: Optional[str] = ""


class ScamDetectionResult(BaseModel):
    risk_score: int = Field(ge=0, le=100)
    flags: List[str]
    is_suspicious: bool


class JobDashboardExtractionResult(BaseModel):
    is_job_related: bool
    company: str = ""
    role: str = ""
    location: str = ""
    interview_datetime: str = ""
    recruiter_name: str = ""
    stage: str = "Applied"
    next_action: str = ""
    confidence: float = Field(ge=0, le=1, default=0)


class AnalysisResult(BaseModel):
    classification: ClassificationResult
    priority: PriorityResult
    memory: MemoryResult
    action_decision: ActionDecisionResult
    scam_detection: ScamDetectionResult
    job_extraction: JobDashboardExtractionResult
    ai_summary: str
    draft_reply: str


class AnalyzeEmailResponse(BaseModel):
    ok: bool = True
    result: AnalysisResult


class JobDashboardItem(BaseModel):
    company: str
    role: str
    current_stage: str
    last_contact_date: str
    next_action: str
    follow_up_reminder_date: str


class JobDashboardResponse(BaseModel):
    items: List[JobDashboardItem]


class HealthResponse(BaseModel):
    status: str
    env: str
    details: Dict[str, Any]
