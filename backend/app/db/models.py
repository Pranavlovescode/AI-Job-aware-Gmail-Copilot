from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class EmailAnalysis(Base):
    __tablename__ = "email_analysis"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    thread_id: Mapped[str] = mapped_column(String(255), index=True)
    sender: Mapped[str] = mapped_column(String(255), index=True)
    subject: Mapped[str] = mapped_column(String(500))
    category: Mapped[str] = mapped_column(String(100), index=True)
    subtype: Mapped[str] = mapped_column(String(100), default="")
    priority_score: Mapped[float] = mapped_column(Float)
    priority_label: Mapped[str] = mapped_column(String(50))
    action_required: Mapped[bool] = mapped_column(Boolean, default=False)
    action_decision: Mapped[dict] = mapped_column(JSON, default=dict)
    scam_risk_score: Mapped[float] = mapped_column(Float)
    memory_summary: Mapped[str] = mapped_column(Text, default="")
    generated_reply: Mapped[str] = mapped_column(Text, default="")
    raw_payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class MemorySnippet(Base):
    __tablename__ = "memory_snippet"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    thread_id: Mapped[str] = mapped_column(String(255), index=True)
    sender: Mapped[str] = mapped_column(String(255), index=True)
    content: Mapped[str] = mapped_column(Text)
    snippet_metadata: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class JobApplication(Base):
    __tablename__ = "job_application"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    thread_id: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    company: Mapped[str] = mapped_column(String(255), index=True)
    role: Mapped[str] = mapped_column(String(255))
    location: Mapped[str] = mapped_column(String(255), default="")
    recruiter_name: Mapped[str] = mapped_column(String(255), default="")
    stage: Mapped[str] = mapped_column(String(100), default="Applied")
    last_contact_date: Mapped[str] = mapped_column(String(50), default="")
    interview_datetime: Mapped[str] = mapped_column(String(100), default="")
    next_action: Mapped[str] = mapped_column(String(255), default="")
    follow_up_reminder_date: Mapped[str] = mapped_column(String(50), default="")
    confidence_score: Mapped[float] = mapped_column(Float, default=0.0)
    source_analysis_id: Mapped[int] = mapped_column(ForeignKey("email_analysis.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
