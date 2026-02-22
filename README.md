# AI Job-Aware Gmail Copilot

Agentic Gmail Copilot with a Chrome Extension frontend and FastAPI multi-agent backend.

## Monorepo Structure

- `backend/`: FastAPI API + multi-agent orchestration + PostgreSQL models
- `frontend/`: Manifest V3 Gmail extension (injected side panel)

## Features Implemented

- Multi-agent backend pipeline:
  - Classification Agent
  - Priority Scoring Agent
  - Memory Agent (LangChain embeddings + LangChain vector memory)
  - Action Decision Agent
  - Reply Generation Agent
  - Scam Detection Agent
  - Job Dashboard Extraction Agent
- LangGraph-based stateful agent orchestration pipeline
- Human-in-the-loop workflow (draft generation only, never auto-send)
- Job dashboard persistence in PostgreSQL
- Gmail side panel UI with:
  - Category
  - Priority
  - Action required
  - AI summary
  - Memory context
  - Scam warning
  - Draft reply + Insert Reply button

## Backend Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Set `DB_URL` in `.env` for PostgreSQL.

Run API:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API endpoints:

- `GET /api/v1/health`
- `POST /api/v1/analyze`
- `GET /api/v1/jobs/dashboard`

## Frontend Setup (Chrome Extension)

Frontend stack: **React + Vite + TypeScript + Tailwind CSS**.

```bash
cd frontend
npm install
npm run build
```

For local UI iteration:

```bash
npm run dev
```

1. Open Chrome -> `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `frontend/dist` directory
5. Open Gmail (`https://mail.google.com`) and open an email thread
6. Use the right-side Copilot panel
7. Open `Dashboard` from the panel (or extension options page) to manage job applications

## Notes

- Current agent implementations include deterministic fallback logic for reliability.
- If `OPENAI_API_KEY` is set, LLM calls run through LangChain `ChatOpenAI`.
- Memory uses LangChain `InMemoryVectorStore` with `OpenAIEmbeddings` (or `FakeEmbeddings` fallback in local/dev).
