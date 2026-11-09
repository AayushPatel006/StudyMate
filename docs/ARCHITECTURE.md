# System Architecture — StudyMate (Phase 1)

StudyMate follows the four-part architecture from the proposal (§1.4): React frontend, Node/Express backend, MongoDB, and a separate planning agent that calls an LLM.

```
┌─────────────────────────┐   REST/JSON    ┌──────────────────────────────────────────────┐
│ React + Vite (:5173)    │  /api/* (proxy)│ Express API (:5000)                          │
│  Dashboard              │ ─────────────▶ │  middleware: helmet, cors, json, sanitize,   │
│  My Tasks               │                │              requireAuth (JWT), timezone     │
│  Study Planner          │ ◀───────────── │  routes → controllers                         │
│  Availability           │                │                                              │
│  AI Assistant           │                │  services/                                    │
│  Settings               │                │   planningContext  ─┐ provider-neutral input │
└─────────────────────────┘                │   plannerService    ├─ orchestration +       │
                                           │                     │  deterministic scheduler│
                                           │   validationService ┘ hard rules              │
                                           │   aiService  ──────────────▶ Gemini API      │
                                           │   planStore (versioning)     (free tier)      │
                                           └───────────────┬──────────────────────────────┘
                                                           ▼
                                                  MongoDB (Mongoose)
                                   users · tasks · availabilities · studyplans · studysessions
```

## Layers

| Layer | Responsibility |
|---|---|
| `routes/index.js` | URL → controller mapping, auth gate, rate limits (auth: 50/15 min; AI: 8/min). |
| `controllers/` | HTTP concerns only: read request, call validators/services, shape response. |
| `validators/` | Pure input validation returning per-field error messages (shown under form fields). |
| `services/planningContext.js` | Converts tasks + availability + "now" + timezone into a planning context: 7-day window, usable minutes per day (today starts at the next 15-min slot), remaining minutes per task, overdue tasks, limits. |
| `services/validationService.js` | Deterministic rules applied to every AI or manual session. |
| `services/plannerService.js` | `computePlan()` (pure, no DB): agent → validate → gap-fill → warnings → ranking. Also the fallback scheduler. |
| `services/aiService.js` | Gemini client, prompts, JSON schema, response parsing, error classification, assistant chat. Exposes a provider-neutral agent. |
| `services/planStore.js` | Persist a plan as a new version, archive the previous one, stale flag, active plan lookup. |
| `models/` | Mongoose schemas. |

## Planning agent interface (NFR-6)

```js
agent = {
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  isConfigured(): boolean,
  proposeSchedule(ctx): Promise<{ summary, prioritizedTasks[], sessions[] }>,
  chat({ message, history, contextText }): Promise<string>,
}
```

`plannerService` only depends on this shape. Tests inject fakes; swapping providers means writing another factory with the same shape. The frontend never knows which provider is used — it only reads `plan.generatedBy` (`gemini` / `fallback`).

## Plan generation sequence

```
Student ──click "Generate"──▶ POST /api/plans/generate
  controller: load tasks + availability (400 NO_TASKS / NO_AVAILABILITY if missing)
  computePlan:
    ctx = buildPlanningContext(...)
    if agent.isConfigured():
        proposal = agent.proposeSchedule(ctx)          ── 45s timeout, no SDK retries
        { accepted, rejected } = validateSessions(proposal.sessions, ctx)
        if accepted is empty → treat as INVALID_RESPONSE → fallback
    fill = scheduleDeterministic(ctx, { fixed: accepted })
    warnings = INSUFFICIENT_TIME | OVERDUE | CARRYOVER | NO_AVAILABILITY | AI_ADJUSTED
  savePlan: new StudyPlan(version+1, active), archive previous, insert sessions
◀── 201 { plan, sessions, fallbackCode }
```

## Validation rules (validationService)

| Code | Rule |
|---|---|
| `UNKNOWN_TASK` | Session must reference an existing, not-completed, not-overdue task of this student. |
| `INVALID_DATE` / `INVALID_TIME` | Real calendar date; `HH:MM` 24-hour times. |
| `INVALID_DURATION` | 15 min ≤ duration ≤ max session length (AI sessions longer than the max are trimmed instead). Manual edits allow up to 4 h. |
| `DAY_UNAVAILABLE` | Date must be in the 7-day window and on an available weekday. |
| `OUTSIDE_AVAILABILITY` | Within preferred start/end time; today's sessions can't start in the past. |
| `AFTER_DEADLINE` | Session must end at or before the task's due date/time. |
| `OVERLAP` | No two sessions overlap (touching is fine). |
| `DAILY_LIMIT_EXCEEDED` | Daily total ≤ max study hours per day. |
| `EXCEEDS_TASK_HOURS` | Total for a task ≤ its estimate (the last session is trimmed if it overshoots). |

## Deterministic scheduler

Greedy, day by day, slot by slot (15-minute grid):

1. Rank tasks by *effective deadline* = due date − priority boost (High 36 h, Medium 12 h, Low 0).
2. For each available day, compute free intervals around already-fixed sessions (padded by the break length).
3. At each cursor position, pick the highest-ranked task that still has work, whose deadline allows a session ending here, preferring tasks that haven't already had a full-length session today (spreads work across days).
4. Session length = min(max session, remaining work, remaining daily capacity, time until interval end / deadline), rounded down to 15 min, at least 30 min unless less work remains.
5. Advance cursor by session + break.

Unplaced work becomes `INSUFFICIENT_TIME` (deadline inside the window) or `CARRYOVER` (deadline later).

## Security

- bcrypt (10 rounds) password hashes, never returned (`select: false`).
- JWT (`Authorization: Bearer`), 7-day expiry; every non-auth route requires it; all queries filter by `userId`.
- `helmet`, CORS restricted to `CLIENT_ORIGIN`, 100 kB JSON limit.
- NoSQL-injection defence: request bodies stripped of `$`/dotted keys, and Mongoose `sanitizeFilter`.
- Gemini key only in `backend/.env`; `/api/ai/status` exposes configured/model/last error only.
- Rate limits on auth and AI routes.

## Timezones

The browser sends `X-Timezone-Offset` (minutes, `Date#getTimezoneOffset`) on every request. Sessions are stored as local wall-clock strings; deadlines are UTC instants converted to local wall-clock for comparisons. Plans store the `tzOffset` they were generated with.
