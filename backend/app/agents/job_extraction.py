import re

from app.models.schemas import Category, ClassificationResult, EmailInput, JobDashboardExtractionResult


class JobDashboardExtractionAgent:
    @staticmethod
    def _clean_value(value: str) -> str:
        cleaned = re.sub(r"\s+", " ", value or "").strip(" -,:;\n\t")
        cleaned = re.sub(
            r"\b(apply link|job alert|opportunity|opening|position|role)\b",
            "",
            cleaned,
            flags=re.IGNORECASE,
        )
        cleaned = re.sub(r"\s{2,}", " ", cleaned).strip(" -,:;\n\t")
        return cleaned

    @staticmethod
    def _first_match(text: str, patterns: list[str], flags: int = re.IGNORECASE) -> str:
        for pattern in patterns:
            match = re.search(pattern, text, flags)
            if match:
                value = (match.group(1) or "").strip()
                if value:
                    return value
        return ""

    def _extract_company(self, subject: str, text: str, sender: str) -> str:
        from_patterns = [
            r"\bfrom\s+([A-Z][A-Za-z0-9&\-]*(?:\s+[A-Z][A-Za-z0-9&\-]*){0,4})\b",
            r"\bat\s+([A-Z][A-Za-z0-9&\-]*(?:\s+[A-Z][A-Za-z0-9&\-]*){0,4})\b",
            r"\bjoin\s+([A-Z][A-Za-z0-9&\-]*(?:\s+[A-Z][A-Za-z0-9&\-]*){0,4})\b",
            r"\bwith\s+([A-Z][A-Za-z0-9&\-]*(?:\s+[A-Z][A-Za-z0-9&\-]*){0,4})\b",
        ]
        company = self._first_match(text, from_patterns)
        if company:
            return self._clean_value(company)

        subject_match = re.search(r"^\s*([A-Za-z0-9&][A-Za-z0-9&\-. ]{1,50})\s*[-–:|]", subject)
        if subject_match:
            return self._clean_value(subject_match.group(1))

        if "@" in sender:
            domain = sender.split("@", 1)[1].split(".", 1)[0]
            if domain and domain.lower() not in {"gmail", "yahoo", "outlook", "hotmail"}:
                return self._clean_value(domain.replace("-", " ").title())
        return ""

    def _extract_role(self, subject: str, text: str) -> str:
        role_patterns = [
            r"\b(?:role|position|opening|opportunity)\s*(?:for|:)?\s*([A-Za-z][A-Za-z0-9/&\-\s]{2,80})",
            r"\bfor\s+(?:the\s+)?([A-Za-z][A-Za-z0-9/&\-\s]{2,80})\s+(?:role|position|opening)\b",
            r"\b(?:hiring|interview|application)\s+for\s+([A-Za-z][A-Za-z0-9/&\-\s]{2,80})\b",
        ]
        role = self._first_match(text, role_patterns)
        if role:
            return self._clean_value(role)

        subject_role = self._first_match(
            subject,
            [
                r"[-–:|]\s*([A-Za-z][A-Za-z0-9/&\-\s]{2,80})\s*(?:apply link|job|opening|opportunity)?$",
                r"\bfor\s+([A-Za-z][A-Za-z0-9/&\-\s]{2,80})$",
            ],
            flags=re.IGNORECASE,
        )
        return self._clean_value(subject_role)

    def _extract_location(self, text: str) -> str:
        location = self._first_match(
            text,
            [
                r"\blocation\s*[:\-]\s*([A-Za-z][A-Za-z,\-/ ]{1,60})",
                r"\bbased in\s+([A-Za-z][A-Za-z,\-/ ]{1,60})",
                r"\b(?:workplace|work location)\s*[:\-]\s*([A-Za-z][A-Za-z,\-/ ]{1,60})",
                r"\b((?:remote|hybrid|on[- ]site))\b",
            ],
        )
        return self._clean_value(location)

    def _extract_recruiter_name(self, text: str, sender: str) -> str:
        recruiter = self._first_match(
            text,
            [
                r"(?i:\bthis is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b",
                r"(?i:\bi am)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b",
                r"(?i:(?:regards|best regards|thanks|sincerely)),?\s*\n\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})",
            ],
            flags=0,
        )
        if recruiter:
            return self._clean_value(recruiter)

        local_part = sender.split("@", 1)[0]
        name = re.sub(r"[._\-]+", " ", local_part).strip()
        if re.match(r"^[A-Za-z]{2,}(?:\s+[A-Za-z]{2,}){0,2}$", name):
            return name.title()
        return ""

    def _extract_interview_datetime(self, text: str) -> str:
        interview = self._first_match(
            text,
            [
                r"\binterview\s+(?:on|at)\s+([^\n\.]{3,100})",
                r"\bscheduled\s+for\s+([^\n\.]{3,100})",
                r"\bmeeting\s+on\s+([^\n\.]{3,100})",
            ],
        )
        return self._clean_value(interview)

    async def run(self, email: EmailInput, classification: ClassificationResult) -> JobDashboardExtractionResult:
        if classification.category != Category.job:
            return JobDashboardExtractionResult(is_job_related=False)

        subject = email.subject or ""
        text = f"{subject}\n{email.body or ''}"

        company = self._extract_company(subject, text, email.sender or "")
        role = self._extract_role(subject, text)
        location = self._extract_location(text)
        recruiter_name = self._extract_recruiter_name(text, email.sender or "")
        interview_datetime = self._extract_interview_datetime(text)

        print(f"Extracted company: {company}, role: {role}, location: {location}, recruiter: {recruiter_name}, interview_datetime: {interview_datetime}")
        
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
        extracted_fields = sum(
            1
            for value in [company, role, location, recruiter_name, interview_datetime]
            if value
        )
        confidence = min(0.95, 0.55 + extracted_fields * 0.1)

        return JobDashboardExtractionResult(
            is_job_related=True,
            company=company,
            role=role,
            location=location,
            interview_datetime=interview_datetime,
            recruiter_name=recruiter_name,
            stage=stage,
            next_action="Reply and confirm details" if classification.subtype.value in {"Interview Invitation", "Coding Assessment"} else "Track and monitor",
            confidence=confidence,
        )
