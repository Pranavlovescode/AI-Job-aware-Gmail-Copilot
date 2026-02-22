import re

from app.models.schemas import Category, ClassificationResult, EmailInput, JobDashboardExtractionResult


class JobDashboardExtractionAgent:
    async def run(self, email: EmailInput, classification: ClassificationResult) -> JobDashboardExtractionResult:
        if classification.category != Category.job:
            return JobDashboardExtractionResult(is_job_related=False)

        text = f"{email.subject}\n{email.body}"

        company = ""
        role = ""
        location = ""
        recruiter_name = ""
        interview_datetime = ""

        company_match = re.search(r"at\s+([A-Z][A-Za-z0-9&\-\s]{2,})", text)
        role_match = re.search(r"for\s+the\s+([A-Z][A-Za-z0-9\-\s]{2,})\s+(role|position)", text, re.IGNORECASE)
        location_match = re.search(r"location[:\-]\s*([A-Za-z,\s]+)", text, re.IGNORECASE)
        recruiter_match = re.search(r"(regards|best|sincerely),?\s*\n\s*([A-Z][a-z]+\s+[A-Z][a-z]+)", text, re.IGNORECASE)
        interview_match = re.search(r"interview\s+(on|at)\s+([^\n\.]+)", text, re.IGNORECASE)

        if company_match:
            company = company_match.group(1).strip()
        if role_match:
            role = role_match.group(1).strip()
        if location_match:
            location = location_match.group(1).strip()
        if recruiter_match:
            recruiter_name = recruiter_match.group(2).strip()
        if interview_match:
            interview_datetime = interview_match.group(2).strip()

        stage_map = {
            "Application Confirmation": "Applied",
            "Recruiter Outreach": "Screening",
            "Interview Invitation": "Technical Interview",
            "Coding Assessment": "Technical Interview",
            "Offer Letter": "Offer",
            "Rejection": "Rejected",
            "Follow Up": "Screening",
            "Unknown": "Applied",
        }

        stage = stage_map.get(classification.subtype.value, "Applied")

        return JobDashboardExtractionResult(
            is_job_related=True,
            company=company,
            role=role,
            location=location,
            interview_datetime=interview_datetime,
            recruiter_name=recruiter_name,
            stage=stage,
            next_action="Reply and confirm details" if classification.subtype.value in {"Interview Invitation", "Coding Assessment"} else "Track and monitor",
            confidence=0.78,
        )
