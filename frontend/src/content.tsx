import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./tailwind.css";

const DEFAULT_API_BASE = "http://127.0.0.1:8000/api/v1";
const ROOT_ID = "gmail-copilot-root";

type Tone = "Formal" | "Friendly" | "Concise" | "Confident" | "Negotiation Mode";

type AnalysisResult = {
  classification: { category: string; subtype: string };
  priority: { score: number; label: string; action_required: boolean; reasons: string[] };
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

function priorityTone(label: string): string {
  const val = label.toLowerCase();
  if (val === "critical" || val === "high") return "bg-rose-100 text-rose-700";
  if (val === "medium") return "bg-amber-100 text-amber-700";
  return "bg-emerald-100 text-emerald-700";
}

function scamTone(score: number): string {
  if (score >= 70) return "border-rose-200 bg-rose-50";
  if (score >= 35) return "border-amber-200 bg-amber-50";
  return "border-emerald-200 bg-emerald-50";
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
      {
        type: "API_REQUEST",
        method,
        url,
        payload,
      },
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

function App(): JSX.Element {
  const [apiBase, setApiBase] = useState(DEFAULT_API_BASE);
  const [tone, setTone] = useState<Tone>("Formal");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [isOpen, setIsOpen] = useState(true);
  const [view, setView] = useState<"assistant" | "dashboard">("assistant");
  const [dashboardJobs, setDashboardJobs] = useState<JobDashboardItem[]>([]);

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
      setError(`${message} Verify backend availability on http://127.0.0.1:8000.`);
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
      const jobs = await requestApi<JobDashboardResponse>(buildDashboardUrl(apiBase), "GET");
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
    <div className="text-slateBrand-900">
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed right-5 top-20 z-[2147483647] rounded-xl border border-slateBrand-300 bg-white px-3 py-2 text-sm font-semibold text-slateBrand-800 shadow-lg"
        >
          Open Copilot
        </button>
      )}

      {isOpen && (
        <div className="fixed right-5 top-20 z-[2147483647] w-[392px] max-w-[calc(100vw-20px)]">
          <div className="overflow-hidden rounded-2xl border border-slateBrand-200 bg-white shadow-panel">
          <header className="bg-gradient-to-r from-emerald-100 via-slateBrand-100 to-blue-100 px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-slateBrand-700">
                  AI Job Copilot
                </p>
                <h2 className="mt-1 text-[26px] font-extrabold tracking-tight">
                  Gmail Assistant
                </h2>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                aria-label="Close copilot"
                title="Close"
                className="rounded-lg border border-slateBrand-300 bg-white px-2 py-1 text-xs font-bold text-slateBrand-700 hover:bg-slateBrand-50"
              >
                Close
              </button>
            </div>
            <p className="mt-1 text-xs text-slateBrand-700">
              Drafts are generated only. Nothing is auto-sent.
            </p>
          </header>

          <div className="border-y border-slateBrand-200 bg-slateBrand-50 p-3">
            {/* <label className="mb-2 block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slateBrand-700">
                API URL
              </span>
              <input
                value={apiBase}
                onChange={(e) => setApiBase(e.target.value)}
                className="h-9 w-full rounded-lg border border-slateBrand-300 bg-white px-3 text-sm outline-none ring-offset-2 focus:ring-2 focus:ring-blue-200"
              />
            </label> */}
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slateBrand-700">
                Tone
              </span>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value as Tone)}
                className="h-9 w-full rounded-lg border border-slateBrand-300 bg-white px-3 text-sm outline-none ring-offset-2 focus:ring-2 focus:ring-blue-200"
              >
                <option value="Formal">Formal</option>
                <option value="Friendly">Friendly</option>
                <option value="Concise">Concise</option>
                <option value="Confident">Confident</option>
                <option value="Negotiation Mode">Negotiation Mode</option>
              </select>
            </label>
          </div>

          <section className="copilot-scroll max-h-[calc(100vh-260px)] overflow-y-auto bg-slateBrand-50 p-3">
            <div className="mb-3 rounded-xl border border-slateBrand-200 bg-white p-3">
              <h3 className="text-xl font-bold">Analyze Current Email</h3>
              <p className="mt-1 text-sm leading-6 text-slateBrand-700">
                Open a Gmail thread and run the pipeline for category, priority, scam risk,
                memory context, and draft generation.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={analyzeCurrentEmail}
                  disabled={loading}
                  className="rounded-lg bg-gradient-to-r from-emerald-700 to-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Analyzing..." : "Analyze Email"}
                </button>
                <button
                  onClick={openDashboard}
                  className="rounded-lg border border-slateBrand-300 bg-white px-4 py-2 text-sm font-semibold text-slateBrand-700"
                >
                  {loading && view === "dashboard" ? "Loading..." : "Open Dashboard"}
                </button>
                {view === "dashboard" && (
                  <button
                    onClick={() => setView("assistant")}
                    className="rounded-lg border border-slateBrand-300 bg-white px-4 py-2 text-sm font-semibold text-slateBrand-700"
                  >
                    Back
                  </button>
                )}
              </div>
            </div>

            {error && (
              <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {error}
              </div>
            )}

            {!loading && view === "assistant" && result && (
              <>
                <div className="mb-3 grid grid-cols-2 gap-2">
                  <article className="rounded-xl border border-slateBrand-200 bg-white p-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-slateBrand-700">
                      Classification
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                        {result.classification.category}
                      </span>
                      <span className="rounded-full bg-slateBrand-100 px-3 py-1 text-xs font-semibold text-slateBrand-700">
                        {result.classification.subtype}
                      </span>
                    </div>
                  </article>
                  <article className="rounded-xl border border-slateBrand-200 bg-white p-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-slateBrand-700">
                      Priority
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${priorityTone(result.priority.label)}`}
                      >
                        {result.priority.label} ({result.priority.score})
                      </span>
                      <span className="rounded-full bg-slateBrand-100 px-3 py-1 text-xs font-semibold text-slateBrand-700">
                        {result.priority.action_required ? "Action needed" : "FYI"}
                      </span>
                    </div>
                  </article>
                </div>

                <article className="mb-3 rounded-xl border border-slateBrand-200 bg-white p-3">
                  <p className="text-sm font-bold">AI Summary</p>
                  <p className="mt-1 text-sm leading-6 text-slateBrand-700">{result.ai_summary}</p>
                </article>

                <article className="mb-3 rounded-xl border border-slateBrand-200 bg-white p-3">
                  <p className="text-sm font-bold">Action Plan</p>
                  <p className="mt-1 text-sm font-semibold">{result.action_decision.action}</p>
                  <p className="text-sm leading-6 text-slateBrand-700">
                    {result.action_decision.reasoning}
                  </p>
                  {result.priority.reasons.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slateBrand-700">
                      {result.priority.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  )}
                </article>

                <article
                  className={`mb-3 rounded-xl border p-3 ${scamTone(result.scam_detection.risk_score)}`}
                >
                  <p className="text-sm font-bold">Scam Risk</p>
                  <p className="mt-1 text-sm">
                    Risk score: <strong>{result.scam_detection.risk_score}/100</strong>
                  </p>
                  {result.scam_detection.flags.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slateBrand-700">
                      {result.scam_detection.flags.map((flag) => (
                        <li key={flag}>{flag}</li>
                      ))}
                    </ul>
                  )}
                </article>

                {/* <article className="mb-3 rounded-xl border border-slateBrand-200 bg-white p-3">
                  <p className="text-sm font-bold">Memory Context</p>
                  <p className="mt-1 text-sm leading-6 text-slateBrand-700">
                    {result.memory.summary}
                  </p>
                  {result.memory.pending_commitments.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slateBrand-700">
                      {result.memory.pending_commitments.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}
                </article> */}

                <article className="mb-3 rounded-xl border border-slateBrand-200 bg-white p-3">
                  <p className="text-sm font-bold">Job Signals</p>
                  <p className="mt-1 text-sm leading-6 text-slateBrand-700">
                    {result.job_extraction.is_job_related
                      ? "Job-related email detected."
                      : "Not job-related."}
                    <br />
                    <strong>{result.job_extraction.company || "Unknown company"}</strong> ·{" "}
                    {result.job_extraction.role || "Unknown role"}
                    <br />
                    Stage: {result.job_extraction.stage || "Applied"}
                    <br />
                    Next action: {result.job_extraction.next_action || "Track and monitor"}
                  </p>
                </article>

                <article className="rounded-xl border border-slateBrand-200 bg-white p-3">
                  <p className="text-sm font-bold">Draft Reply</p>
                  <pre className="copilot-scroll mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slateBrand-200 bg-slateBrand-50 p-3 text-sm leading-6 text-slateBrand-900">
                    {draft || "No draft generated."}
                  </pre>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        const message = insertDraftIntoReply(draft);
                        if (message) setError(message);
                      }}
                      className="rounded-lg bg-slateBrand-900 px-4 py-2 text-sm font-semibold text-white"
                    >
                      Insert Reply
                    </button>
                    <button
                      onClick={copyDraft}
                      className="rounded-lg border border-slateBrand-300 bg-white px-4 py-2 text-sm font-semibold text-slateBrand-700"
                    >
                      Copy Draft
                    </button>
                  </div>
                </article>
              </>
            )}

            {!loading && view === "dashboard" && (
              <article className="rounded-xl border border-slateBrand-200 bg-white p-3">
                <p className="text-lg font-bold">Personal Dashboard</p>
                <p className="mt-1 text-sm text-slateBrand-700">
                  Recent job applications from your backend.
                </p>
                {dashboardJobs.length === 0 ? (
                  <p className="mt-3 rounded-lg border border-slateBrand-200 bg-slateBrand-50 p-3 text-sm text-slateBrand-700">
                    No job applications found.
                  </p>
                ) : (
                  <div className="copilot-scroll mt-3 max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                    {dashboardJobs.map((job, idx) => (
                      <div
                        key={`${job.company}-${job.role}-${idx}`}
                        className="rounded-lg border border-slateBrand-200 bg-slateBrand-50 p-3"
                      >
                        <p className="text-sm font-semibold text-slateBrand-900">
                          {job.role || "Unknown role"}
                        </p>
                        <p className="text-sm text-slateBrand-700">
                          {job.company || "Unknown company"}
                        </p>
                        <p className="mt-1 text-xs text-slateBrand-700">
                          Stage: {job.current_stage || "Unknown"} | Last contact:{" "}
                          {formatDate(job.last_contact_date)}
                        </p>
                        <p className="mt-1 text-xs text-slateBrand-700">
                          Next: {job.next_action || "Track and monitor"}
                        </p>
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
