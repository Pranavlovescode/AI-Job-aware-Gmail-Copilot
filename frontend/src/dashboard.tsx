import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./tailwind.css";

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

type JobDashboardResponse = {
  items: JobDashboardItem[];
};

type ApiWorkerResponse<T> = { ok: true; data: T } | { ok: false; error: string };

type LocalJobState = {
  status?: string;
  note?: string;
};

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
      {
        type: "API_REQUEST",
        method: "GET",
        url,
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

function jobKey(job: JobDashboardItem, index: number): string {
  return `${job.company}|${job.role}|${job.last_contact_date}|${index}`;
}

function formatDate(value: string): string {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return value;
  return parsed.toLocaleDateString();
}

function DashboardApp(): JSX.Element {
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
      setError(`${message} Verify backend availability on http://127.0.0.1:8000.`);
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
      const status = (localState[key]?.status || job.current_stage || "").toLowerCase();
      return status.includes("interview");
    }).length;
    const offer = filteredJobs.filter((job, index) => {
      const key = jobKey(job, index);
      const status = (localState[key]?.status || job.current_stage || "").toLowerCase();
      return status.includes("offer");
    }).length;
    return { total, interviewing, offer };
  }, [filteredJobs, localState]);

  function updateLocalState(key: string, patch: LocalJobState): void {
    setLocalState((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slateBrand-50 via-slateBrand-100 to-white px-4 py-8 text-slateBrand-900 md:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 rounded-2xl border border-slateBrand-200 bg-white/90 p-6 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slateBrand-700">
                Personal Dashboard
              </p>
              <h1 className="mt-2 text-4xl font-extrabold tracking-tight">Job Pipeline Manager</h1>
              <p className="mt-2 text-sm text-slateBrand-700">
                Track roles, update your own status, and keep private notes per application.
              </p>
            </div>
            <button
              onClick={refreshJobs}
              className="rounded-lg bg-slateBrand-900 px-4 py-2 text-sm font-semibold text-white"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slateBrand-700">
                Backend API
              </span>
              <input
                value={apiBase}
                onChange={(e) => setApiBase(e.target.value)}
                className="h-10 w-full rounded-lg border border-slateBrand-300 bg-white px-3 text-sm outline-none ring-offset-2 focus:ring-2 focus:ring-blue-200"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slateBrand-700">
                Search
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Company, role, status..."
                className="h-10 w-full rounded-lg border border-slateBrand-300 bg-white px-3 text-sm outline-none ring-offset-2 focus:ring-2 focus:ring-blue-200"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slateBrand-700">
                Stage
              </span>
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                className="h-10 w-full rounded-lg border border-slateBrand-300 bg-white px-3 text-sm outline-none ring-offset-2 focus:ring-2 focus:ring-blue-200"
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

        <section className="mb-5 grid gap-3 sm:grid-cols-3">
          <article className="rounded-xl border border-slateBrand-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slateBrand-700">Applications</p>
            <p className="mt-2 text-3xl font-extrabold">{metrics.total}</p>
          </article>
          <article className="rounded-xl border border-slateBrand-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slateBrand-700">Interviewing</p>
            <p className="mt-2 text-3xl font-extrabold">{metrics.interviewing}</p>
          </article>
          <article className="rounded-xl border border-slateBrand-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slateBrand-700">Offers</p>
            <p className="mt-2 text-3xl font-extrabold">{metrics.offer}</p>
          </article>
        </section>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        )}

        <section className="grid gap-4">
          {filteredJobs.length === 0 && !loading && (
            <div className="rounded-xl border border-slateBrand-200 bg-white p-6 text-center text-slateBrand-700">
              No job applications found for the current filters.
            </div>
          )}

          {filteredJobs.map((job, index) => {
            const key = jobKey(job, index);
            const local = localState[key] ?? {};
            const effectiveStatus = local.status || job.current_stage || "Unknown";

            return (
              <article
                key={key}
                className="rounded-xl border border-slateBrand-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold">{job.role || "Unknown role"}</h2>
                    <p className="text-sm text-slateBrand-700">{job.company || "Unknown company"}</p>
                  </div>
                  <span className="rounded-full bg-slateBrand-100 px-3 py-1 text-xs font-semibold text-slateBrand-700">
                    {effectiveStatus}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 text-sm text-slateBrand-700 md:grid-cols-4">
                  <p>
                    <span className="block text-xs font-bold uppercase tracking-wide text-slateBrand-700">
                      Last Contact
                    </span>
                    {formatDate(job.last_contact_date)}
                  </p>
                  <p>
                    <span className="block text-xs font-bold uppercase tracking-wide text-slateBrand-700">
                      Follow Up
                    </span>
                    {formatDate(job.follow_up_reminder_date)}
                  </p>
                  <p className="md:col-span-2">
                    <span className="block text-xs font-bold uppercase tracking-wide text-slateBrand-700">
                      Next Action
                    </span>
                    {job.next_action || "Track and monitor"}
                  </p>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label>
                    <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slateBrand-700">
                      My Status
                    </span>
                    <select
                      value={effectiveStatus}
                      onChange={(e) => updateLocalState(key, { status: e.target.value })}
                      className="h-10 w-full rounded-lg border border-slateBrand-300 bg-white px-3 text-sm outline-none ring-offset-2 focus:ring-2 focus:ring-blue-200"
                    >
                      {[effectiveStatus, ...STATUS_OPTIONS]
                        .filter((value, idx, arr) => arr.indexOf(value) === idx)
                        .map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slateBrand-700">
                      Personal Note
                    </span>
                    <input
                      value={local.note ?? ""}
                      onChange={(e) => updateLocalState(key, { note: e.target.value })}
                      placeholder="Add a note..."
                      className="h-10 w-full rounded-lg border border-slateBrand-300 bg-white px-3 text-sm outline-none ring-offset-2 focus:ring-2 focus:ring-blue-200"
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
