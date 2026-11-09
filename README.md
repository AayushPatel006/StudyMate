# StudyMate
### An Agentic AI-Powered Study Planner and Task Management Assistant

**Plan smarter. Study better. Achieve more.**

StudyMate turns a student's assignments, exams, deadlines and weekly free time into a realistic, deadline-checked weekly study schedule. AI planning runs on the **Google Gemini API free tier**; every AI-generated session is verified by deterministic backend code, and a built-in scheduling algorithm takes over whenever the AI is unavailable.

> **Project status — Midterm MVP (Phase 1 of 2).**
> Software Engineering (14:332:452/567), Rutgers University, Fall 2026.
> The original proposal is in [`docs/Agentic_AI_Study_Planner_Proposal.pdf`](docs/Agentic_AI_Study_Planner_Proposal.pdf). Features planned for the final presentation are listed in [`FUTURE_DEVELOPMENT.md`](FUTURE_DEVELOPMENT.md).

---

## Contents
1. [Implemented midterm features](#implemented-midterm-features)
2. [Technology stack](#technology-stack)
3. [Architecture](#architecture)
4. [Prerequisites](#prerequisites)
5. [Quick start](#quick-start)
6. [MongoDB setup](#mongodb-setup)
7. [Gemini API setup (free tier)](#gemini-api-setup-free-tier)
8. [Fallback mode](#fallback-mode-no-api-key)
9. [Free-tier limits and quota monitoring](#free-tier-limits-and-quota-monitoring)
10. [Commands](#commands)
11. [Testing](#testing)
12. [Project structure](#project-structure)
13. [Known limitations](#known-limitations)
14. [Troubleshooting](#troubleshooting)

---

## Implemented midterm features

| Feature | What it does |
|---|---|
| **Accounts** | Sign up / log in / log out. Passwords hashed with bcrypt, JWT-protected API, each student sees only their own data. |
| **Dashboard** | Greeting, live stats from MongoDB (active tasks, due this week, completed, estimated hours), today's sessions, upcoming deadlines, quick "Generate study plan" action, and a 3-step onboarding checklist for new users. |
| **Task management** | Create, view, edit, delete tasks (title, course, description, type, due date/time, estimated hours, priority, status). Validation, filters (course / priority / status), search, deadline urgency labels, one-click status updates, delete confirmation. |
| **Weekly availability** | Choose study days, start/end time, max hours per day, longest session and break length. Invalid ranges are blocked on both client and server. |
| **AI task prioritization** | Gemini ranks every active task with a one-line reason (deterministic ranking in fallback mode). |
| **AI study-plan generation** | "Generate My Study Plan" sends tasks + availability to Gemini, which breaks work into focused sessions (each with a *focus* step and an *explanation*). The backend validates every session and fills any remaining work with the deterministic scheduler. Warnings are shown when work can't fit before a deadline. |
| **Weekly schedule** | Calendar view (time grid, priority colours, availability bands, "now" line) and list view grouped by day. Shows whether the plan came from Gemini or fallback mode, plan version, and an "out of date" banner when tasks or availability change. |
| **Session editing** | Move (day/time) or delete any session. Edits are validated against availability, daily limit, deadline and other sessions; edited sessions are marked "Edited by you". |
| **AI study assistant** | Chat with Gemini about priorities, workload and task breakdown, grounded in the student's tasks, availability and current plan. Shows a clear message (not a fake answer) when AI isn't configured or is over quota. |
| **Settings** | Edit profile name, see AI engine status (connected / fallback, model, last error), links to get a key and check quota, log out. |

## Technology stack

| Layer | Technologies |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS 4, React Router, Axios, Lucide React icons |
| Backend | Node.js (≥ 20), Express 5, REST/JSON, Mongoose 9, bcryptjs, jsonwebtoken, helmet, express-rate-limit |
| Database | MongoDB (local server or MongoDB Atlas) |
| AI | Google Gemini API via the official `@google/genai` SDK — free tier only, structured JSON output |
| Testing | Jasmine (unit + API integration with Supertest), Cucumber (acceptance scenarios from the proposal's user stories) |

## Architecture

```
React (Vite, :5173) ──/api (Vite proxy)──▶ Express API (:5000) ──▶ MongoDB
                                               │
                                               ├─ plannerService     (orchestration, deterministic scheduler, warnings)
                                               ├─ validationService  (hard scheduling rules — AI output is never trusted)
                                               └─ aiService          (Gemini free tier, behind a provider-neutral "planning agent" interface)
```

Plan generation flow:

1. Load the student's active tasks and availability from MongoDB.
2. Build a provider-neutral **planning context** (next 7 days, usable time windows, limits, remaining minutes per task).
3. If Gemini is configured, send it only the data needed for planning (short task ids like `T1`, no names/emails) and request JSON matching a schema.
4. **Validate** every proposed session: existing task, available day, inside study hours, not in the past, before the deadline, valid duration, no overlaps, daily limit, no more time than the task needs. Over-long sessions are trimmed; everything else that breaks a rule is dropped.
5. Fill unscheduled work with the **deterministic scheduler** (earliest effective deadline first, priority-weighted, spreads tasks across days).
6. Produce warnings (insufficient time, overdue, carry-over), save the plan as a **new version** (previous plan archived), and return it.

If Gemini is missing, rate-limited, slow, returns malformed JSON, or returns nothing valid, step 5 builds the whole plan and the UI shows **Fallback mode**.

More detail: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md) · [`docs/API.md`](docs/API.md) · [`docs/DEVELOPMENT_NOTES.md`](docs/DEVELOPMENT_NOTES.md)

## Prerequisites

- **Node.js 20 or newer** (22 LTS recommended) — check with `node -v`
- **npm** (comes with Node)
- **MongoDB** — either a local MongoDB Community Server (6.0+) **or** a free MongoDB Atlas cluster
- *(Optional)* a free **Google AI Studio** API key for Gemini features

## Quick start

```bash
# 1. Extract the ZIP and enter the folder
unzip StudyMate_Midterm.zip
cd StudyMate

# 2. Install dependencies (root, backend and frontend)
npm run install:all

# 3. Create backend/.env (copies .env.example and generates a JWT secret)
npm run setup

# 4. Make sure MongoDB is running (see "MongoDB setup"), then optionally load demo data
npm run seed

# 5. Start backend + frontend together
npm run dev
```

Open **http://localhost:5173**. The API runs on **http://localhost:5000** (health check: http://localhost:5000/api/health).

With demo data loaded, log in as **demo@studymate.app / demo1234**, or create your own account.

> Windows users: all commands work in PowerShell or Command Prompt. If you prefer, unzip with File Explorer ("Extract All").

## MongoDB setup

StudyMate reads the connection string from `MONGODB_URI` in `backend/.env`.

**Option A — Local MongoDB**
1. Install MongoDB Community Server: https://www.mongodb.com/try/download/community (or `brew install mongodb-community` on macOS).
2. Start it (it usually runs as a service after install; on macOS: `brew services start mongodb-community`).
3. Keep the default: `MONGODB_URI=mongodb://127.0.0.1:27017/studymate`

**Option B — MongoDB Atlas (free M0 cluster)**
1. Create a free cluster at https://www.mongodb.com/cloud/atlas.
2. *Database Access* → add a database user. *Network Access* → add your IP address.
3. *Connect → Drivers* → copy the connection string and set it in `backend/.env`:
   `MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/studymate?retryWrites=true&w=majority`

If the backend can't connect it prints a clear error and exits.

## Gemini API setup (free tier)

StudyMate only uses the **free tier** of the Gemini API. It never enables billing, never switches to a paid provider, and does not use OpenAI or Anthropic APIs.

1. Go to **Google AI Studio** → https://aistudio.google.com/app/apikey and sign in with a Google account.
2. Click **Create API key**. Do **not** set up billing — the key works on the free tier without it.
3. Put it in `backend/.env`:
   ```env
   GEMINI_API_KEY=your_key_here
   GEMINI_MODEL=gemini-2.5-flash
   ```
4. Restart the backend. The console prints `[ai] Gemini enabled (model: …, free tier)`, and the sidebar shows **Gemini connected**.

**Model choice.** The default `gemini-2.5-flash` was listed as "Free of charge" on the official pricing page when this project was built (Nov 2026). `gemini-2.5-flash-lite` is also free and usually has higher free quotas (lighter reasoning). Free-tier availability can change — before switching models, confirm the model shows **Free of charge** on https://ai.google.dev/gemini-api/docs/pricing. Models marked paid-only (for example `gemini-3.1-pro-preview` at the time of writing) will fail with this setup and StudyMate will fall back automatically.

**Security.** The key is read only by the backend (`backend/.env`, which is git-ignored). The frontend never sees it — it only calls StudyMate's own `/api`. Don't put keys in `frontend/.env`; anything prefixed `VITE_` is visible in the browser.

> Note: On the free tier, Google may use prompts and responses to improve its products. StudyMate sends only planning data (task titles, courses, types, due dates, estimates, short descriptions, availability) — never names, emails or passwords.

## Fallback mode (no API key)

StudyMate is fully usable without a Gemini key:

- **Study plans** are generated by the deterministic scheduler and the planner shows *"Fallback mode — built-in scheduling algorithm"* with the reason.
- **The AI assistant** shows a "not connected" screen and the API returns `503 AI_NOT_CONFIGURED` — it never pretends to answer.
- Fallback also kicks in automatically (per request) when Gemini returns HTTP 429, times out, has a network error, rejects the key, can't find the model, or returns invalid output.

To run in fallback mode, leave `GEMINI_API_KEY` empty (or as the placeholder) in `backend/.env`.

## Free-tier limits and quota monitoring

- Free-tier limits are applied **per Google Cloud project** in three dimensions — requests per minute (RPM), tokens per minute (TPM) and requests per day (RPD) — and **change over time**. Daily quotas reset at midnight Pacific time.
- See your current limits and usage in AI Studio: https://aistudio.google.com/usage (also linked from StudyMate's Settings page).
- Each plan generation = **1** Gemini request; each assistant message = **1** request.
- StudyMate protects your quota by: disabling SDK auto-retries on 429, a local limit of 8 AI requests per minute per server, a 45 s timeout (`GEMINI_TIMEOUT_MS`), and falling back instead of retrying.
- When a limit is hit: plans still generate (fallback mode, with a message), the assistant shows "free-tier rate limit or daily quota reached", and Settings shows the last AI error.

## Commands

Run from the project root:

| Command | Description |
|---|---|
| `npm run install:all` | Install root, backend and frontend dependencies |
| `npm run setup` | Create `backend/.env` from the example with a random JWT secret (never overwrites) |
| `npm run dev` | Start backend (nodemon, auto-reload) and frontend (Vite) together |
| `npm start` | Start backend (plain node) and frontend together |
| `npm run seed` | Create/reset the demo account `demo@studymate.app` / `demo1234` with sample tasks |
| `npm test` | Run all backend tests (unit → integration → acceptance) |
| `npm run test:unit` / `test:integration` / `test:acceptance` | Run one suite |
| `npm run build` | Production build of the frontend (`frontend/dist`) |

You can also run each side separately: `cd backend && npm run dev`, `cd frontend && npm run dev`.

| URL | What |
|---|---|
| http://localhost:5173 | StudyMate web app |
| http://localhost:5000/api/health | Backend health check |

## Testing

```bash
npm test
```

- **Unit (Jasmine, 46 specs)** — schedule validation rules, deterministic scheduler, fallback behaviour (429 / invalid output / network errors), Gemini response parsing and error mapping (with a mocked client), input validators, time utilities.
- **Integration (Jasmine + Supertest, 28 specs)** — real HTTP + real MongoDB: auth, task CRUD/status/filters, data isolation between users, availability validation, plan generation in fallback mode, mocked Gemini plan, quota fallback, plan versioning, session edit/overlap/availability checks, session deletion, dashboard, assistant. Uses `MONGODB_URI_TEST` (default `mongodb://127.0.0.1:27017/studymate_test`) and drops that test database before and after.
- **Acceptance (Cucumber, 6 scenarios)** — Gherkin scenarios from the proposal's US-1 and US-3 (e.g. *"Plan fits before the deadline"*), plus insufficient-time, fallback and invalid-AI-output scenarios. Feature files are in `backend/features/`.

Tests never call the real Gemini API.

## Project structure

```
StudyMate/
├── package.json              # root scripts (install:all, setup, dev, seed, test)
├── README.md · FUTURE_DEVELOPMENT.md
├── scripts/setup.mjs
├── docs/                     # proposal PDF, architecture, schema, API, dev notes
├── backend/
│   ├── .env.example
│   ├── src/
│   │   ├── server.js · app.js
│   │   ├── config/           # env, database
│   │   ├── models/           # User, Task, Availability, StudyPlan, StudySession
│   │   ├── routes/ · controllers/ · middleware/ · validators/ · utils/
│   │   └── services/
│   │       ├── aiService.js          # Gemini integration (free tier)
│   │       ├── plannerService.js     # orchestration + fallback scheduler
│   │       ├── validationService.js  # deterministic schedule validation
│   │       ├── planningContext.js    # provider-neutral planning input
│   │       └── planStore.js          # plan persistence / versioning
│   ├── scripts/seed.js
│   ├── spec/                 # Jasmine unit + integration tests
│   └── features/             # Cucumber acceptance tests
└── frontend/
    ├── .env.example · vite.config.js · index.html
    └── src/
        ├── api/client.js     # Axios instance (auth + timezone headers)
        ├── context/          # Auth, Toasts
        ├── components/       # ui/, layout/, tasks/, planner/
        └── pages/            # Dashboard, Tasks, Planner, Availability, Assistant, Settings, Auth
```

## Known limitations

These are deliberate Phase 1 boundaries (see `FUTURE_DEVELOPMENT.md`):

- **No automatic replanning.** Changing tasks or availability marks the plan "out of date"; the student regenerates manually. Regenerating replaces all sessions, including hand-edited ones (they're flagged `isManuallyEdited` so Phase 2 can preserve them).
- **No progress tracking per session.** Task status (Pending / In Progress / Completed) is tracked; session completion / missed / delayed is Phase 2. "In Progress" tasks are still planned for their full estimate.
- **Planning window is the next 7 days** from the moment you generate. Work due later is scheduled if time allows; remaining hours are reported as carry-over notes.
- **Single availability window per day** (same start/end time on every selected day).
- **Timezone:** sessions are stored as local wall-clock times using the browser's timezone at generation time. A DST change inside the 7-day window can shift deadline checks by one hour.
- **Goals / subtasks (FR-3)** aren't exposed yet — the AI breaks work into session-level "focus" steps instead.
- **Sessions can be moved within the next 7 days only.**
- The assistant is advisory and read-only; it can't modify tasks or plans.
- Frontend has no automated tests yet (backend logic is covered).
- AI output quality depends on the free model; the validator guarantees rule-compliance, not optimality.
- Login token is stored in `localStorage` (acceptable for a local demo; Phase 2 could move to httpOnly cookies).

## Troubleshooting

| Problem | Fix |
|---|---|
| `Could not connect to MongoDB` | Start MongoDB or fix `MONGODB_URI`. For Atlas, check the IP allow-list and the password (URL-encode special characters). |
| `Port 5000 is already in use` (common on macOS — AirPlay Receiver uses 5000) | Turn off *AirPlay Receiver* in System Settings → General → AirDrop & Handoff, **or** set `PORT=5001` in `backend/.env` and `VITE_API_PROXY_TARGET=http://localhost:5001` in `frontend/.env`. |
| UI says "Cannot reach the StudyMate server" | The backend isn't running or crashed — check the `api` output in the terminal. |
| Logged out after every backend restart | You have no `JWT_SECRET`; run `npm run setup` (or set one in `backend/.env`). |
| Planner always says fallback mode | Check `GEMINI_API_KEY`, restart the backend, then look at **Settings → Last AI error** (e.g. rate limit, invalid key, model unavailable). |
| "Model unavailable for this key" | Set `GEMINI_MODEL` to a model listed as free on the pricing page (e.g. `gemini-2.5-flash` or `gemini-2.5-flash-lite`). |
| Integration tests fail to connect | They need MongoDB; set `MONGODB_URI_TEST` if yours isn't at `127.0.0.1:27017`. |
