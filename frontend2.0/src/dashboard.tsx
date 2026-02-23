import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles/dashboard.scss";

const DEFAULT_API_BASE = "http://127.0.0.1:8000/api/v1";
const STORAGE_KEY = "jobDashboardLocalState";

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

type LocalJobState = { status?: string; note?: string };
type LocalStateMap = Record<string, LocalJobState>;

const STATUS_OPTIONS = [
  "Applied",
  "Recruiter Screen",
  "Interviewing",
  "Offer",
  "Rejected",
  "On Hold",
];

function buildDashboardUrl(rawInput: string): string {
  const cleaned = (rawInput.trim() || DEFAULT_API_BASE).replace(/\/+$/, "");
  if (cleaned.endsWith("/jobs/dashboard")) return cleaned;
  if (cleaned.endsWith("/api/v1")) return `${cleaned}/jobs/dashboard`;
  return `${cleaned}/api/v1/jobs/dashboard`;
}

function requestApi<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: "API_REQUEST", method: "GET", url },
      (response: ApiWorkerResponse<T>) => {
        if (chrome.runtime.lastError) {
          reject(
            new Error(
              `Extension message error: ${chrome.runtime.lastError.message}`
            )
          );
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

function jobKey(job: JobDashboardItem, index: number): string {
  return `${job.company}|${job.role}|${job.last_contact_date}|${index}`;
}

function formatDate(value: string): string {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return value;
  return parsed.toLocaleDateString();
}

function DashboardApp(): React.JSX.Element {
  const [apiBase, setApiBase] = useState(DEFAULT_API_BASE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("All");
  const [jobs, setJobs] = useState<JobDashboardItem[]>([]);
  const [localState, setLocalState] = useState<LocalStateMap>({});

  useEffect(() => {
    chrome.storage.local.get([STORAGE_KEY], (res) => {
      const stored = res[STORAGE_KEY] as LocalStateMap | undefined;
      setLocalState(stored ?? {});
    });
  }, []);

  useEffect(() => {
    chrome.storage.local.set({ [STORAGE_KEY]: localState });
  }, [localState]);

  async function refreshJobs(): Promise<void> {
    setLoading(true);
    setError("");
    try {
      const url = buildDashboardUrl(apiBase);
      const data = await requestApi<JobDashboardResponse>(url);
      setJobs(data.items);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error.";
      setError(
        `${message} Verify backend availability on http://127.0.0.1:8000.`
      );
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stages = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach((job, index) => {
      const key = jobKey(job, index);
      set.add(localState[key]?.status || job.current_stage || "Unknown");
    });
    return ["All", ...Array.from(set).sort()];
  }, [jobs, localState]);

  const filteredJobs = useMemo(() => {
    const query = search.trim().toLowerCase();
    return jobs.filter((job, index) => {
      const key = jobKey(job, index);
      const status = localState[key]?.status || job.current_stage || "Unknown";
      const matchesStage = stageFilter === "All" || status === stageFilter;
      const matchesSearch =
        !query ||
        job.company.toLowerCase().includes(query) ||
        job.role.toLowerCase().includes(query) ||
        status.toLowerCase().includes(query);
      return matchesStage && matchesSearch;
    });
  }, [jobs, localState, search, stageFilter]);

  const metrics = useMemo(() => {
    const total = filteredJobs.length;
    const interviewing = filteredJobs.filter((job, index) => {
      const key = jobKey(job, index);
      const status = (
        localState[key]?.status ||
        job.current_stage ||
        ""
      ).toLowerCase();
      return status.includes("interview");
    }).length;
    const offer = filteredJobs.filter((job, index) => {
      const key = jobKey(job, index);
      const status = (
        localState[key]?.status ||
        job.current_stage ||
        ""
      ).toLowerCase();
      return status.includes("offer");
    }).length;
    return { total, interviewing, offer };
  }, [filteredJobs, localState]);

  function updateLocalState(key: string, patch: LocalJobState): void {
    setLocalState((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  return (
    <main className="dashboard">
      <div className="dashboard__inner">
        {/* Header */}
        <header className="dashboard-header">
          <div className="dashboard-header__top">
            <div>
              <p className="dashboard-header__tag">Personal Dashboard</p>
              <h1 className="dashboard-header__title">Job Pipeline Manager</h1>
              <p className="dashboard-header__subtitle">
                Track roles, update your own status, and keep private notes per
                application.
              </p>
            </div>
            <button className="btn-refresh" onClick={refreshJobs}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {/* Filters */}
          <div className="dashboard-filters">
            <label>
              <span className="dashboard-filters__label">Backend API</span>
              <input
                className="dashboard-filters__input"
                value={apiBase}
                onChange={(e) => setApiBase(e.target.value)}
              />
            </label>
            <label>
              <span className="dashboard-filters__label">Search</span>
              <input
                className="dashboard-filters__input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Company, role, status..."
              />
            </label>
            <label>
              <span className="dashboard-filters__label">Stage</span>
              <select
                className="dashboard-filters__select"
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
              >
                {stages.map((stage) => (
                  <option key={stage} value={stage}>
                    {stage}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>

        {/* Metrics */}
        <section className="dashboard-metrics">
          <article className="metric-card">
            <p className="metric-card__label">Applications</p>
            <p className="metric-card__value">{metrics.total}</p>
          </article>
          <article className="metric-card">
            <p className="metric-card__label">Interviewing</p>
            <p className="metric-card__value">{metrics.interviewing}</p>
          </article>
          <article className="metric-card">
            <p className="metric-card__label">Offers</p>
            <p className="metric-card__value">{metrics.offer}</p>
          </article>
        </section>

        {/* Error */}
        {error && <div className="dashboard-error">{error}</div>}

        {/* Job cards */}
        <section className="dashboard-jobs">
          {filteredJobs.length === 0 && !loading && (
            <div className="dashboard-empty">
              No job applications found for the current filters.
            </div>
          )}

          {filteredJobs.map((job, index) => {
            const key = jobKey(job, index);
            const local = localState[key] ?? {};
            const effectiveStatus =
              local.status || job.current_stage || "Unknown";

            return (
              <article key={key} className="job-card">
                <div className="job-card__top">
                  <div>
                    <h2 className="job-card__role">
                      {job.role || "Unknown role"}
                    </h2>
                    <p className="job-card__company">
                      {job.company || "Unknown company"}
                    </p>
                  </div>
                  <span className="job-card__status-badge">
                    {effectiveStatus}
                  </span>
                </div>

                <div className="job-card__details">
                  <p>
                    <span className="job-card__detail-label">Last Contact</span>
                    {formatDate(job.last_contact_date)}
                  </p>
                  <p>
                    <span className="job-card__detail-label">Follow Up</span>
                    {formatDate(job.follow_up_reminder_date)}
                  </p>
                  <p>
                    <span className="job-card__detail-label">Next Action</span>
                    {job.next_action || "Track and monitor"}
                  </p>
                </div>

                <div className="job-card__controls">
                  <label>
                    <span className="job-card__control-label">My Status</span>
                    <select
                      className="job-card__select"
                      value={effectiveStatus}
                      onChange={(e) =>
                        updateLocalState(key, { status: e.target.value })
                      }
                    >
                      {[effectiveStatus, ...STATUS_OPTIONS]
                        .filter(
                          (value, idx, arr) => arr.indexOf(value) === idx
                        )
                        .map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    <span className="job-card__control-label">
                      Personal Note
                    </span>
                    <input
                      className="job-card__input"
                      value={local.note ?? ""}
                      onChange={(e) =>
                        updateLocalState(key, { note: e.target.value })
                      }
                      placeholder="Add a note..."
                    />
                  </label>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}

createRoot(document.getElementById("dashboard-root")!).render(<DashboardApp />);
