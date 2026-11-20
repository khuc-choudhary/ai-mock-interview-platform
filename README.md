# InterviewAI – AI Mock Interview Platform

React + TypeScript + Tailwind frontend, FastAPI backend, PostgreSQL (SQLAlchemy + Alembic), any OpenAI-compatible LLM,
browser Web Speech API (with a Whisper-compatible fallback) and browser text-to-speech.

## Architecture

```
frontend/ (Vite, React, TS, Tailwind v4, Framer Motion, Recharts)
  src/{components,pages,layouts,hooks,services,context,types,utils}
backend/ (FastAPI)
  app/core       config, JWT/bcrypt security, auth dependency, rate limiter
  app/database   engine/session
  app/models     users, user_profiles, interview_sessions, interview_questions, interview_answers,
                 answer_evaluations, interview_reports, user_progress, password_reset_tokens
  app/schemas    pydantic request/response validation
  app/routers    auth, interviews, misc (meta, dashboard, analytics, learning, speech)
  app/ai         OpenAI-compatible client, prompts, demo provider
  app/services   question_service, evaluation_service, communication, report_service,
                 interview_service (orchestration), analytics_service, pdf_service
  app/speech     Whisper-compatible transcription
  alembic/       migrations
```

Interview loop: `POST /interviews` (AI greeting + first question) → `POST /interviews/{id}/answers` (saved first, then
AI-evaluated) → `POST /interviews/{id}/next` (next question generated from the full history) → … →
`POST /interviews/{id}/finish` (report + progress update). Each step is separately retryable, so a network or AI failure
never loses an answer.

> **Quick start (Windows):** after the one-time setup below, `.\start.ps1` starts the database, applies migrations and
> opens the backend and frontend. **Deploying?** See [DEPLOY.md](DEPLOY.md) (Render or your own server with Docker).

## Prerequisites
Python 3.11+, Node 20+, and PostgreSQL 14+ (or Docker).

## Setup

### 1. Database
```bash
docker compose up -d          # PostgreSQL 16 on localhost:5432 (user/pass postgres, db mock_interview)
```
Or use your own PostgreSQL and set `DATABASE_URL` in `backend/.env`.

### 2. Backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate         # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
copy .env.example .env         # macOS/Linux: cp .env.example .env   -> then edit JWT_SECRET and LLM_API_KEY
python -m alembic upgrade head # creates all tables
python -m uvicorn app.main:app --reload --port 8000
```
API docs: http://localhost:8000/docs

> The default driver is `pg8000` (pure Python, no native DLLs — it also works on locked-down Windows machines where
> Application Control blocks `psycopg`'s native library). To use psycopg instead: `pip install "psycopg[binary]"` and
> use `postgresql+psycopg://` in `DATABASE_URL`.

### 3. Frontend
```bash
cd frontend
npm install
npm run dev                    # http://localhost:5173
```
The frontend talks to `http://localhost:8000`; override with `VITE_API_URL` in `frontend/.env`.

### 4. Migrations
```bash
python -m alembic upgrade head                              # apply
python -m alembic revision --autogenerate -m "describe"     # after changing models
python -m alembic downgrade -1                              # roll back one
```

## AI configuration (API keys)
Keys live only in `backend/.env` and never reach the browser.

| Variable | Meaning |
|---|---|
| `LLM_API_KEY` | Key for any OpenAI-compatible chat API. **Empty = demo mode.** |
| `LLM_BASE_URL` | e.g. `https://api.openai.com/v1` |
| `LLM_MODEL` | e.g. `gpt-4o-mini` |
| `LLM_JSON_MODE` | `false` if your provider rejects `response_format=json_object` |
| `WHISPER_*` | Optional separate endpoint/key/model for server-side speech-to-text |

Getting a key: **OpenAI** – platform.openai.com → API keys. **Groq** (free tier, also has Whisper) – console.groq.com →
API Keys, with `LLM_BASE_URL=https://api.groq.com/openai/v1`, `LLM_MODEL=llama-3.3-70b-versatile`,
`WHISPER_MODEL=whisper-large-v3`. **Gemini** – aistudio.google.com/apikey with
`LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai`. **Ollama** (local) – `LLM_BASE_URL=http://localhost:11434/v1`,
any non-empty key. More examples are in `backend/.env.example`. Restart the backend after editing `.env`.

### Demo mode
With no `LLM_API_KEY` the app runs in **clearly labelled demo mode**: questions come from a small sample bank and scores
are a simple length/relevance heuristic. Banners appear on every AI page, evaluations/reports are tagged `demo`, and the
PDF carries the notice. It is not real AI evaluation.

## How the pieces work
- **Evaluation**: the LLM scores 9 criteria and classifies the answer (correct / partially correct / incorrect /
  irrelevant / unclear). The backend then caps the overall score by verdict (e.g. incorrect ≤ 40, irrelevant ≤ 15), so
  keyword-heavy but wrong answers cannot score high.
- **Communication**: words-per-minute, pauses and fluency are computed from the real microphone signal (an
  AnalyserNode in the browser) plus the transcript; filler words are counted from the transcript. Typed answers have no
  pace/fluency. Confidence is judged from wording only (hedging); facial expression and emotion are **not** analysed.
  Chrome's recogniser often drops “umm”, so use the Whisper engine for more faithful filler counts.
- **Speech input**: browser SpeechRecognition (Chrome/Edge/Safari) → Whisper upload via `/speech/transcribe` → typing.
- **Security**: bcrypt hashing, JWT with server-side revocation (`token_version`; logout/password change invalidate
  tokens), strict CORS, per-user rate limits on AI/auth endpoints, every query scoped to the owner (others get 404),
  validated inputs, secrets only in env.

## Tests
```bash
cd backend && python -m pytest tests -q    # needs the database migrated; runs auth, full interview flow, isolation, PDF, analytics
```

## Known limitations
- Password-reset emails need `RESEND_API_KEY` or SMTP; without them the link is only logged (and returned in the API response in development).
- Rate limiting is in-memory (single process); use Redis for multi-instance deployments.
- The PDF uses built-in fonts, so Devanagari (Hindi script) text may not render in it. English/Hinglish are fine.
- The JWT is stored in `localStorage` (simple, but exposed to XSS); consider httpOnly cookies for production.
- Voice features need a secure context (localhost or HTTPS) and microphone permission.
