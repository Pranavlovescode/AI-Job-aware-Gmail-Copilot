import type React from "react";
import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles/content.scss";

const DEFAULT_API_BASE = "http://127.0.0.1:8000/api/v1";
const ROOT_ID = "gmail-copilot-root";
const TOGGLE_ICON = chrome.runtime.getURL("copilot-icon.png");

type Tone = "Formal" | "Friendly" | "Concise" | "Confident" | "Negotiation Mode";

type AnalysisResult = {
  classification: { category: string; subtype: string };
  priority: {
    score: number;
    label: string;
    action_required: boolean;
    reasons: string[];
  };
  memory: { summary: string; pending_commitments: string[] };
  action_decision: { action: string; reasoning: string };
  scam_detection: { risk_score: number; flags: string[] };
  job_extraction: {
    is_job_related: boolean;
    company: string;
    role: string;
    stage: string;
    next_action: string;
  };
  ai_summary: string;
  draft_reply: string;
};

type AnalysisApiResponse = { result: AnalysisResult };
type JobDashboardItem = {
  company: string;
  role: string;
  current_stage: string;
  last_contact_date: string;
  next_action: string;
  follow_up_reminder_date: string;
};
type JobDashboardResponse = { items: JobDashboardItem[] };
type ApiWorkerResponse<T> = { ok: true; data: T } | { ok: false; error: string };

/* ── Helpers ── */

function extractEmailFromDom(): {
  thread_id: string;
  sender: string;
  subject: string;
  body: string;
} {
  const subject = document.querySelector("h2.hP")?.textContent?.trim() || "";
  const sender =
    document.querySelector("span.gD")?.getAttribute("email") || "unknown@unknown.com";
  const bodyNode =
    document.querySelector("div.a3s.aiL") ||
    document.querySelector("div[role='listitem'] .a3s");
  const body = bodyNode?.textContent?.trim() || "";
  const thread_id = window.location.hash.replace("#", "") || `thread_${Date.now()}`;
  return { thread_id, sender, subject, body };
}

function priorityModifier(label: string): string {
  const val = label.toLowerCase();
  if (val === "critical" || val === "high") return "badge-priority--high";
  if (val === "medium") return "badge-priority--medium";
  return "badge-priority--low";
}

function buildAnalyzeUrl(rawInput: string): string {
  const cleaned = (rawInput.trim() || DEFAULT_API_BASE).replace(/\/+$/, "");
  if (cleaned.endsWith("/analyze")) return cleaned;
  if (cleaned.endsWith("/api/v1")) return `${cleaned}/analyze`;
  return `${cleaned}/api/v1/analyze`;
}

function buildDashboardUrl(rawInput: string): string {
  const cleaned = (rawInput.trim() || DEFAULT_API_BASE).replace(/\/+$/, "");
  if (cleaned.endsWith("/jobs/dashboard")) return cleaned;
  if (cleaned.endsWith("/api/v1")) return `${cleaned}/jobs/dashboard`;
  return `${cleaned}/api/v1/jobs/dashboard`;
}

function formatDate(value: string): string {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return value;
  return parsed.toLocaleDateString();
}

function requestApi<T>(url: string, method: "GET" | "POST", payload?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: "API_REQUEST", method, url, payload },
      (response: ApiWorkerResponse<T>) => {
        if (chrome.runtime.lastError) {
          reject(new Error(`Extension message error: ${chrome.runtime.lastError.message}`));
          return;
        }
        if (!response) {
          reject(new Error("No response from extension worker."));
          return;
        }
        if (!response.ok) {
          reject(new Error(response.error));
          return;
        }
        resolve(response.data);
      }
    );
  });
}

function insertDraftIntoReply(draft: string): string | null {
  if (!draft) return "No draft available. Analyze an email first.";
  const editable = document.querySelector(
    "div[aria-label='Message Body'][contenteditable='true']"
  ) as HTMLDivElement | null;
  if (!editable) return "Open a Gmail reply composer first, then try insert.";
  editable.focus();
  editable.innerText = draft;
  editable.dispatchEvent(new InputEvent("input", { bubbles: true }));
  return null;
}

/* ── Component ── */

function App(): React.JSX.Element {
  const [apiBase, setApiBase] = useState(DEFAULT_API_BASE);
  const [tone, setTone] = useState<Tone>("Formal");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [isOpen, setIsOpen] = useState(true);
  const [view, setView] = useState<"assistant" | "dashboard">("assistant");
  const [dashboardJobs, setDashboardJobs] = useState<JobDashboardItem[]>([]);
  const [showApiConfig, setShowApiConfig] = useState(false);

  const draft = result?.draft_reply ?? "";
  const analyzeUrl = useMemo(() => buildAnalyzeUrl(apiBase), [apiBase]);

  async function analyzeCurrentEmail(): Promise<void> {
    setLoading(true);
    setError("");
    try {
      const extracted = extractEmailFromDom();
      if (!extracted.subject && !extracted.body) {
        throw new Error("No readable email content found. Open a Gmail thread first.");
      }
      const data = await requestApi<AnalysisApiResponse>(analyzeUrl, "POST", {
        ...extracted,
        user_tone: tone,
      });
      setResult(data.result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error.";
      setError(`${message} Verify backend on http://127.0.0.1:8000.`);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function copyDraft(): Promise<void> {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft);
    } catch {
      setError("Clipboard write failed.");
    }
  }

  async function openDashboard(): Promise<void> {
    setView("dashboard");
    setLoading(true);
    setError("");
    try {
      const jobs = await requestApi<JobDashboardResponse>(
        buildDashboardUrl(apiBase),
        "GET"
      );
      setDashboardJobs(jobs.items);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error.";
      setError(`${message} Could not load dashboard jobs.`);
      setDashboardJobs([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {/* ── Floating image toggle ── */}
      {!isOpen && (
        <button
          className="copilot-toggle"
          onClick={() => setIsOpen(true)}
          title="Open AI Job Copilot"
          aria-label="Open AI Job Copilot"
        >
          <img src={TOGGLE_ICON} alt="AI Copilot" />
        </button>
      )}

      {/* ── Sidebar panel ── */}
      {isOpen && (
        <div className="copilot-sidebar">
          <div className="copilot-panel">

            {/* Header */}
            <header className="copilot-header">
              <div className="copilot-header__top">
                <div className="copilot-header__branding">
                  <img
                    className="copilot-header__logo"
                    src={TOGGLE_ICON}
                    alt="Copilot logo"
                  />
                  <div>
                    <p className="copilot-header__tag">AI Job Copilot</p>
                    <h2 className="copilot-header__title">Gmail Assistant</h2>
                  </div>
                </div>
                <button
                  className="copilot-header__close"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close copilot"
                  title="Close"
                >
                  ✕
                </button>
              </div>
              <p className="copilot-header__subtitle">
                Drafts only — nothing is auto-sent
              </p>
            </header>

            {/* Nav tabs */}
            <nav className="copilot-nav">
              <button
                className={`copilot-nav__tab${view === "assistant" ? " copilot-nav__tab--active" : ""}`}
                onClick={() => setView("assistant")}
              >
                ✦ Assistant
              </button>
              <button
                className={`copilot-nav__tab${view === "dashboard" ? " copilot-nav__tab--active" : ""}`}
                onClick={openDashboard}
              >
                ⬡ Dashboard
              </button>
              <button
                className={`copilot-nav__tab${showApiConfig ? " copilot-nav__tab--active" : ""}`}
                onClick={() => setShowApiConfig(!showApiConfig)}
              >
                ⚙ Config
              </button>
            </nav>

            {/* API Config drawer */}
            {showApiConfig && (
              <div className="api-config">
                <label>
                  <span className="api-config__label">API Base URL</span>
                  <input
                    type="text"
                    className="api-config__input"
                    value={apiBase}
                    onChange={(e) => setApiBase(e.target.value)}
                    placeholder="http://127.0.0.1:8000/api/v1"
                  />
                </label>
              </div>
            )}

            {/* Tone selector */}
            <div className="copilot-config">
              <label>
                <span className="copilot-config__label">Response Tone</span>
                <select
                  className="copilot-config__select"
                  value={tone}
                  onChange={(e) => setTone(e.target.value as Tone)}
                >
                  <option value="Formal">Formal</option>
                  <option value="Friendly">Friendly</option>
                  <option value="Concise">Concise</option>
                  <option value="Confident">Confident</option>
                  <option value="Negotiation Mode">Negotiation Mode</option>
                </select>
              </label>
            </div>

            {/* Scrollable content */}
            <section className="copilot-content">

              {/* Analyze card */}
              {view === "assistant" && (
                <div className="analyze-card">
                  <div className="analyze-card__header">
                    <span className="analyze-card__icon">✦</span>
                    <h3 className="analyze-card__title">Analyze Email</h3>
                  </div>
                  <p className="analyze-card__desc">
                    Open a Gmail thread then run the AI pipeline — category, priority, job signals, and draft reply.
                  </p>
                  <div className="analyze-card__actions">
                    <button
                      className="btn-analyze"
                      onClick={analyzeCurrentEmail}
                      disabled={loading}
                    >
                      {loading ? "Analyzing…" : "✦ Analyze Email"}
                    </button>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && <div className="error-banner">{error}</div>}

              {/* Loading spinner */}
              {loading && (
                <div className="loading-state">
                  <div className="loading-state__spinner" />
                  <p className="loading-state__text">Running AI pipeline…</p>
                </div>
              )}

              {/* ── Assistant results ── */}
              {!loading && view === "assistant" && result && (
                <>
                  {/* Classification + Priority */}
                  <div className="result-grid">
                    <article className="result-cell">
                      <p className="result-cell__label">Classification</p>
                      <div className="result-cell__badges">
                        <span className="badge-emerald">{result.classification.category}</span>
                        <span className="badge-slate">{result.classification.subtype}</span>
                      </div>
                    </article>
                    <article className="result-cell">
                      <p className="result-cell__label">Priority</p>
                      <div className="result-cell__badges">
                        <span className={priorityModifier(result.priority.label)}>
                          {result.priority.label} · {result.priority.score}
                        </span>
                        <span className="badge-slate">
                          {result.priority.action_required ? "Action needed" : "FYI"}
                        </span>
                      </div>
                    </article>
                  </div>

                  {/* AI Summary */}
                  <article className="info-card">
                    <div className="info-card__header">
                      <span className="info-card__icon">◈</span>
                      <p className="info-card__title">AI Summary</p>
                    </div>
                    <p className="info-card__text">{result.ai_summary}</p>
                  </article>

                  {/* Action Plan */}
                  <article className="info-card">
                    <div className="info-card__header">
                      <span className="info-card__icon">⟶</span>
                      <p className="info-card__title">Action Plan</p>
                    </div>
                    <p className="info-card__bold">{result.action_decision.action}</p>
                    <p className="info-card__text">{result.action_decision.reasoning}</p>
                    {result.priority.reasons.length > 0 && (
                      <ul className="info-card__list">
                        {result.priority.reasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    )}
                  </article>

                  {/* Job Signals */}
                  <article className="job-card">
                    <p className="job-card__label">Job Signals</p>
                    {result.job_extraction.is_job_related ? (
                      <p className="job-card__detected">Job-related email detected</p>
                    ) : null}
                    <div className="job-card__row">
                      <strong>{result.job_extraction.company || "Unknown company"}</strong>
                      <span className="dot">·</span>
                      <span>{result.job_extraction.role || "Unknown role"}</span>
                    </div>
                    <div className="job-card__row">
                      <span>Next:</span>
                      <span>{result.job_extraction.next_action || "Track and monitor"}</span>
                    </div>
                    <span className="job-card__stage-badge">
                      {result.job_extraction.stage || "Applied"}
                    </span>
                  </article>

                  {/* Draft Reply */}
                  <article className="draft-card">
                    <div className="draft-card__title-row">
                      <div className="info-card__header" style={{ marginBottom: 0 }}>
                        <span className="info-card__icon">✉</span>
                        <p className="info-card__title">Draft Reply</p>
                      </div>
                    </div>
                    <pre className="draft-card__pre">{draft || "No draft generated."}</pre>
                    <div className="draft-card__actions">
                      <button
                        className="btn-insert"
                        onClick={() => {
                          const message = insertDraftIntoReply(draft);
                          if (message) setError(message);
                        }}
                      >
                        ↩ Insert Reply
                      </button>
                      <button className="btn-outline" onClick={copyDraft}>
                        ⎘ Copy Draft
                      </button>
                    </div>
                  </article>
                </>
              )}

              {/* ── Dashboard mini view ── */}
              {!loading && view === "dashboard" && (
                <article className="dashboard-mini">
                  <div className="dashboard-mini__header">
                    <p className="dashboard-mini__title">Job Pipeline</p>
                    <span className="dashboard-mini__count">
                      {dashboardJobs.length} applications
                    </span>
                  </div>
                  <p className="dashboard-mini__desc">
                    Recent applications synced from your backend.
                  </p>
                  {dashboardJobs.length === 0 ? (
                    <div className="dashboard-mini__empty">
                      No job applications found yet.
                    </div>
                  ) : (
                    <div className="dashboard-mini__list">
                      {dashboardJobs.map((job, idx) => (
                        <div
                          key={`${job.company}-${job.role}-${idx}`}
                          className="job-mini-card"
                        >
                          <p className="job-mini-card__role">{job.role || "Unknown role"}</p>
                          <p className="job-mini-card__company">{job.company || "Unknown company"}</p>
                          <p className="job-mini-card__meta">
                            Last contact: {formatDate(job.last_contact_date)}
                          </p>
                          <p className="job-mini-card__meta">
                            Next: {job.next_action || "Track and monitor"}
                          </p>
                          <span className="job-mini-card__stage">
                            {job.current_stage || "Unknown"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Mount ── */

function mountPanel(): void {
  if (document.getElementById(ROOT_ID)) return;
  const mountNode = document.createElement("aside");
  mountNode.id = ROOT_ID;
  document.body.appendChild(mountNode);
  createRoot(mountNode).render(<App />);
}

mountPanel();

const observer = new MutationObserver(() => {
  if (!document.getElementById(ROOT_ID)) mountPanel();
});

observer.observe(document.body, { childList: true, subtree: true });
