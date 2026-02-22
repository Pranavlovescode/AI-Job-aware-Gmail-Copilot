const API_BASE_URL = "http://localhost:8000/api/v1";

let copilotRoot = null;
let currentDraft = "";

function ensurePanel() {
  if (copilotRoot) return;

  copilotRoot = document.createElement("div");
  copilotRoot.id = "gmail-copilot-root";
  copilotRoot.innerHTML = `
    <div class="gmail-copilot-card">
      <div class="gmail-copilot-header">
        <h3>Agentic Gmail Copilot</h3>
        <p>Multi-agent analysis with human-in-the-loop safety</p>
      </div>
      <div class="gmail-copilot-body" id="gmail-copilot-body">
        <div class="gmail-copilot-row">
          Open an email and click <strong>Analyze Current Email</strong>.
        </div>
        <div class="gmail-copilot-actions">
          <button class="gmail-copilot-btn primary" id="gmail-copilot-analyze">Analyze Current Email</button>
          <button class="gmail-copilot-btn secondary" id="gmail-copilot-insert">Insert Reply</button>
        </div>
      </div>
      <div class="gmail-copilot-footer">
        Drafts are never auto-sent.
      </div>
    </div>
  `;

  document.body.appendChild(copilotRoot);

  document.getElementById("gmail-copilot-analyze").addEventListener("click", analyzeCurrentEmail);
  document.getElementById("gmail-copilot-insert").addEventListener("click", insertDraftIntoReply);
}

function extractEmailFromDom() {
  const subject = document.querySelector("h2.hP")?.innerText?.trim() || "";
  const sender = document.querySelector("span.gD")?.getAttribute("email") || "unknown@unknown.com";
  const bodyNode = document.querySelector("div.a3s.aiL") || document.querySelector("div[role='listitem'] .a3s");
  const body = bodyNode?.innerText?.trim() || "";

  const threadId = window.location.hash.replace("#", "") || `${Date.now()}`;

  return { subject, sender, body, thread_id: threadId };
}

function renderStatus(message) {
  const bodyEl = document.getElementById("gmail-copilot-body");
  bodyEl.innerHTML = `<div class="gmail-copilot-row">${message}</div>`;
}

function escapeHtml(input) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderAnalysis(result) {
  currentDraft = result.draft_reply || "";
  const priorityClass = result.priority.label.toLowerCase();
  const scamWarning = result.scam_detection.is_suspicious
    ? `<div class="gmail-copilot-row gmail-copilot-warning">Scam warning: ${result.scam_detection.flags.join("; ") || "Review sender and requests carefully."}</div>`
    : "";

  const bodyEl = document.getElementById("gmail-copilot-body");
  bodyEl.innerHTML = `
    <div class="gmail-copilot-row"><strong>Category</strong><br/><span class="gmail-copilot-pill">${escapeHtml(result.classification.category)}${result.classification.subtype !== "Unknown" ? ` / ${escapeHtml(result.classification.subtype)}` : ""}</span></div>
    <div class="gmail-copilot-row"><strong>Priority</strong><br/><span class="gmail-copilot-pill ${priorityClass}">${escapeHtml(result.priority.label)} (${result.priority.score})</span></div>
    <div class="gmail-copilot-row"><strong>Action Required</strong><br/>${result.priority.action_required ? "Yes" : "No"}</div>
    <div class="gmail-copilot-row"><strong>Recommended Action</strong><br/>${escapeHtml(result.action_decision.action)}</div>
    <div class="gmail-copilot-row"><strong>AI Summary</strong><div class="gmail-copilot-text">${escapeHtml(result.ai_summary)}</div></div>
    <div class="gmail-copilot-row"><strong>Memory Context</strong><div class="gmail-copilot-text">${escapeHtml(result.memory.summary)}</div></div>
    ${scamWarning}
    <div class="gmail-copilot-row"><strong>Draft Reply</strong><div class="gmail-copilot-text">${escapeHtml(currentDraft || "No draft generated for this email.")}</div></div>
    <div class="gmail-copilot-actions">
      <button class="gmail-copilot-btn primary" id="gmail-copilot-analyze">Analyze Current Email</button>
      <button class="gmail-copilot-btn secondary" id="gmail-copilot-insert">Insert Reply</button>
    </div>
  `;

  document.getElementById("gmail-copilot-analyze").addEventListener("click", analyzeCurrentEmail);
  document.getElementById("gmail-copilot-insert").addEventListener("click", insertDraftIntoReply);
}

async function analyzeCurrentEmail() {
  try {
    renderStatus("Analyzing email with multi-agent pipeline...");

    const email = extractEmailFromDom();
    if (!email.subject && !email.body) {
      renderStatus("No readable email content found. Open a specific Gmail thread first.");
      return;
    }

    const payload = {
      ...email,
      user_tone: "Formal"
    };

    const response = await fetch(`${API_BASE_URL}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    const data = await response.json();
    renderAnalysis(data.result);
  } catch (error) {
    renderStatus(`Analysis failed: ${error.message}. Check backend server and CORS settings.`);
  }
}

function insertDraftIntoReply() {
  if (!currentDraft) {
    renderStatus("No draft available. Analyze an email first.");
    return;
  }

  const editable = document.querySelector("div[aria-label='Message Body'][contenteditable='true']");
  if (!editable) {
    renderStatus("Open a Gmail reply box first, then click Insert Reply.");
    return;
  }

  editable.focus();
  editable.innerText = currentDraft;
  editable.dispatchEvent(new InputEvent("input", { bubbles: true }));
  renderStatus("Draft inserted into the compose box.");
}

ensurePanel();

const observer = new MutationObserver(() => {
  if (!document.getElementById("gmail-copilot-root")) {
    copilotRoot = null;
    ensurePanel();
  }
});

observer.observe(document.body, { childList: true, subtree: true });
