# Scaffold — AI Writing Companion

Scaffold tracks how complete your work is against assignment requirements **as you write**.
Point it at an assignment (manually or auto-discovered from Canvas, Notion, or Google
Classroom), and Claude breaks the rubric into measurable tasks and scores your draft
0–100% in real time — in a web dashboard and a browser sidebar for Google Docs / Notion.

## Architecture

| Component | Stack | Role |
|-----------|-------|------|
| **Backend** (`backend/`) | FastAPI + Python 3.12 | REST API, Claude calls, caching, platform discovery |
| **Web dashboard** (`web/`) | Next.js 15 + React 19 | Assignment list, detail view, draft editor with live progress |
| **Browser extension** (`extension/`) | Plasmo (Chrome MV3) | Sidebar inside Google Docs / Notion that tracks writing live |

```
clients (web + extension)  ──►  FastAPI  ──►  Claude (rubric analysis + scoring)
                                   │
                                   ├──►  Redis      (cache + progress history)
                                   ├──►  Supabase   (persistent storage)
                                   ├──►  Browserbase + Stagehand (LMS discovery)
                                   ├──►  Sentry      (errors + AI monitoring)
                                   └──►  Arize Phoenix (LLM tracing)
```

### How it works

1. **Create an assignment** — manually via the API/UI, or auto-discovered from a platform.
2. **Analyze the rubric** — Claude decomposes the prompt + rubric into measurable tasks.
3. **Track progress** — as you write, Claude scores each task and surfaces what's missing.
4. **Cache smartly** — Redis skips re-calling Claude unless the document changed ≥100 chars.

## Prerequisites

- Docker & Docker Compose
- Node.js 18+
- Python 3.12 (only if running the backend without Docker)
- API keys: **Anthropic** and **Supabase** are required; **Browserbase**, **Sentry**, and
  **Arize Phoenix** are optional.

## Setup

### 1. Create the Supabase table

Run [`backend/supabase_schema.sql`](backend/supabase_schema.sql) in the Supabase SQL editor
(or via `psql`). It creates the `assignments` table the backend expects.

### 2. Configure environment files

```bash
cp backend/.env.example   backend/.env
cp web/.env.example       web/.env.local
cp extension/.env.example extension/.env
```

Fill in the real values. At minimum the backend needs `ANTHROPIC_API_KEY`,
`SUPABASE_URL`, and `SUPABASE_SERVICE_KEY`.

## Deploy

### Option A — Docker Compose (backend + web + Redis + Phoenix)

```bash
docker compose up --build
```

| Service | URL |
|---------|-----|
| Backend API | http://localhost:8000 |
| API docs (Swagger) | http://localhost:8000/docs |
| Web dashboard | http://localhost:3000 |
| Arize Phoenix | http://localhost:6006 |
| Redis | localhost:6379 |

### Option B — run services individually

**Backend**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload   # needs a Redis instance reachable at REDIS_URL
```

**Web dashboard**

```bash
cd web
npm install
npm run dev          # http://localhost:3000
# production: npm run build && npm start
```

**Browser extension**

```bash
cd extension
npm install
npm run dev          # or: npm run build
```

Then in Chrome: **Extensions → Developer mode → Load unpacked** and select the Plasmo
output folder (`extension/build/chrome-mv3-dev` for `dev`, `chrome-mv3-prod` for `build`).
The sidebar injects on `docs.google.com/document/*` and `notion.so`.

## Test

### Backend (pytest)

```bash
cd backend
pip install -r requirements.txt -r requirements-dev.txt
pytest
```

The suite covers pure logic (rubric/JSON parsing, change detection, scraped-data
normalization) and the no-dependency API routes (`/health`, `/api/discovery/supported`).
It runs without any live external services.

### Web (Vitest)

```bash
cd web
npm install
npm test
```

### Manual API smoke test

```bash
# Health
curl http://localhost:8000/health

# Create an assignment (triggers Claude rubric analysis)
curl -X POST http://localhost:8000/api/assignments/ \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Essay on Climate Change",
    "prompt": "Write a 1000-word essay analyzing three causes of climate change.",
    "rubric": [
      {"criterion": "Thesis", "description": "Clear thesis in intro", "points": 20},
      {"criterion": "Evidence", "description": "Three cited sources", "points": 30}
    ]
  }'

# List assignments
curl http://localhost:8000/api/assignments/

# Update progress (replace {id})
curl -X POST http://localhost:8000/api/assignments/{id}/progress \
  -H "Content-Type: application/json" \
  -d '{"assignment_id": "{id}", "document_content": "Climate change is driven by..."}'
```

## Project layout

```
backend/    FastAPI app, services (Claude, Redis, Supabase, Browserbase, Sentry, Arize)
web/        Next.js dashboard
extension/  Plasmo Chrome extension (Google Docs / Notion sidebar)
docker-compose.yml
```

## Environment variables

| Variable | Where | Required | Notes |
|----------|-------|----------|-------|
| `ANTHROPIC_API_KEY` | backend | yes | Claude rubric analysis + scoring |
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | backend | yes | Persistent storage |
| `REDIS_URL` | backend | yes | Defaults to `redis://localhost:6379` |
| `BROWSERBASE_API_KEY` / `BROWSERBASE_PROJECT_ID` | backend | no | LMS auto-discovery |
| `SENTRY_DSN` | backend | no | Error + AI monitoring |
| `PHOENIX_COLLECTOR_ENDPOINT` / `PHOENIX_API_KEY` | backend | no | LLM tracing |
| `ALLOWED_ORIGINS` | backend | no | CORS allowlist |
| `NEXT_PUBLIC_API_URL` | web | yes | Points the dashboard at the backend |
| `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_ORG` / `SENTRY_PROJECT` | web | no | Sentry |
| `PLASMO_PUBLIC_API_URL` / `PLASMO_PUBLIC_DASHBOARD_URL` | extension | yes | Backend + dashboard URLs |
| `PLASMO_PUBLIC_SENTRY_DSN` | extension | no | Sentry |
