# StudyMate — Future Development (Phase 2: Final Presentation)

This document is the hand-off between the **midterm MVP (Phase 1, implemented)** and the **final presentation (Phase 2, planned)**. Phase 2 extends this same codebase — it is not a rewrite.

Source of truth for requirements: [`docs/Agentic_AI_Study_Planner_Proposal.pdf`](docs/Agentic_AI_Study_Planner_Proposal.pdf).

---

## 1. Implemented in Phase 1

| Proposal item | Status | Where |
|---|---|---|
| FR-1 Sign up / log in / log out | ✅ Implemented | `controllers/authController.js`, `pages/AuthPage.jsx` |
| FR-2 Task CRUD (title, course, deadline, hours, priority) + type, description, status | ✅ Implemented | `controllers/taskController.js`, `pages/TasksPage.jsx` |
| FR-4 Weekly availability | ✅ Implemented (one window per day for selected days) | `controllers/availabilityController.js`, `pages/AvailabilityPage.jsx` |
| FR-5 Generate a weekly plan with the planning agent | ✅ Gemini free tier + deterministic fallback | `services/plannerService.js`, `services/aiService.js` |
| FR-6 Check each session against deadlines and availability | ✅ Deterministic validator | `services/validationService.js` |
| FR-7 Weekly calendar or list view | ✅ Both | `components/planner/WeekCalendar.jsx`, `SessionList.jsx` |
| FR-10 Short reason for each suggestion | ✅ For generated sessions (`explanation`, `focus`) and task ranking | `StudySession.explanation`, `StudyPlan.priorities` |
| FR-11 Move, edit or reject any session | ✅ Edit (day/time) and delete, both validated | `planController.updateSession/deleteSession` |
| FR-13 Save tasks, availability, plan versions | ✅ Each generation is a new `StudyPlan` version; old ones archived | `services/planStore.js` |
| FR-14 Warn when there isn't enough time | ✅ Basic: `INSUFFICIENT_TIME`, `OVERDUE`, `CARRYOVER` warnings at generation time | `plannerService.buildWarnings` |
| NFR-3 Agent failure doesn't break the app | ✅ Automatic fallback; plan saved only after validation | `computePlan` |
| NFR-4 Hashed passwords, protected routes, per-user data | ✅ | `middleware/auth.js` |
| NFR-5 Only planning data sent to the LLM | ✅ Short ids, no identity data | `aiService.buildPlannerPayload` |
| NFR-6 Agent behind one interface, mockable | ✅ `{ isConfigured, proposeSchedule, chat }` | `aiService.createGeminiAgent`, tests |
| NFR-7 Jasmine unit tests + Cucumber scenarios | ✅ 46 unit, 28 integration, 6 Cucumber scenarios | `backend/spec`, `backend/features` |
| Basic AI study assistant (chat) | ✅ Gemini, grounded in tasks/availability/plan | `assistantController.js`, `pages/AssistantPage.jsx` |

## 2. Reserved for Phase 2

| Feature | Proposal ref | Notes |
|---|---|---|
| Mark sessions/tasks complete, delayed or missed | FR-8, US-2, UC-6 | `StudySession.status` field already exists (`scheduled` only used today). |
| Autonomous replanning after progress changes, new tasks, deadline or availability changes | FR-9, UC-6 | Only affected sessions should move. The `stale` flag already detects when replanning is needed. |
| Reuse freed time when a task is finished early | UC-6 1a | Part of the replanner. |
| Preserve hand-edited sessions during replans | FR-12, US-3 | `StudySession.isManuallyEdited` is already set on every manual edit. |
| Explanations for each *change* (moved / removed / added) | FR-10 | Store a diff between plan versions. |
| Accept / reject proposed changes; reject whole plan keeps previous active | UC-5, UC-6, NFR-8 | Needs a `proposed` plan status. |
| Goals and AI task decomposition into subtasks | FR-3 | `Task.parentTaskId` already exists. |
| Advanced progress tracking and analytics (study hours, completion, history) | — | Uses session status + plan versions. |
| Proactive insufficient-time warnings (not just at generation) and "what could be shortened" suggestions | FR-14, UC-6 4a | |
| Warn-but-allow edits that pass a deadline | UC-5 3a | Phase 1 blocks them. |
| Multiple availability blocks per day / per-day hours | UC-3 | Extend `Availability` with `slots: [{day,start,end}]`. |
| Google Calendar sync, notifications and reminders | FR-15 | Out of first-release scope in the proposal. |
| Canvas / LMS import | — | If feasible. |
| CI pipeline (GitHub Actions running the test suites) | NFR-7 | |

## 3. Planned architecture extensions

```
                       ┌──────────────── existing ────────────────┐
POST /plans/generate → computePlan(ctx, agent) → validateSessions → savePlan(version n)
                       └──────────────────────────────────────────┘
Phase 2:
POST /sessions/:id/progress   { status: completed|missed|delayed }
POST /plans/replan            → replanService.computeReplan(activePlan, changes, agent)
                                  1. lock: isManuallyEdited sessions, completed sessions, past sessions
                                  2. compute affected tasks (missed/delayed/new/changed deadline)
                                  3. agent.proposeReplan(ctx, locked, affected)   ← new agent method
                                  4. validateSessions(proposal, ctx, { existing: locked })  ← reuse
                                  5. scheduleDeterministic(ctx, { fixed: locked+accepted }) ← reuse
                                  6. diff vs current version → [{ type: moved|added|removed, reason }]
                                  7. save as StudyPlan{ status: 'proposed', parentVersion }
POST /plans/:id/accept | /reject   → proposed → active (previous → archived) or discard
```

Reusable pieces already in place:

- **`buildPlanningContext`** — add `lockedSessions` and per-task `completedMinutes` (from session status) so `remainingMinutes = estimate − completed`.
- **`validateSessions(..., { existing })`** — already validates proposals *around* fixed sessions; replanning passes locked sessions as `existing`.
- **`scheduleDeterministic(ctx, { fixed })`** — already fills gaps around fixed sessions; this is the replanning fallback.
- **Agent interface** — add `proposeReplan(ctx, locked, changes)`; the Gemini prompt/response schema mirrors `proposeSchedule` plus a `changes[]` array with reasons.
- **`StudyPlan`** — add `status: 'proposed'`, `parentPlanId`, `changes: [{ sessionId, type, reason }]`.
- **`StudySession`** — `status` (`completed | missed | delayed`) and `isManuallyEdited` already exist.
- **Frontend** — `PlannerPage` already shows plan source, version and stale state; add a "Proposed changes" review panel (diff list with Accept / Reject), and status actions in `SessionModal`.

## 4. Suggested implementation order

1. Session progress actions (complete / missed / delayed) — API + `SessionModal` buttons + tests.
2. Task "remaining hours" from completed sessions (`completedMinutes`).
3. `replanService` with deterministic-only replanning (locks + `scheduleDeterministic`), plus plan diff.
4. Proposed-plan workflow (accept / reject) and change explanations in the UI.
5. Gemini `proposeReplan` on top of step 3 (validator + fallback already handle failures).
6. Cucumber scenarios for US-2 ("Missed session gets moved") and the rest of US-3 ("later re-plans leave that session where I put it").
7. Goals / subtasks (FR-3) and AI decomposition.
8. Progress analytics page.
9. Multiple availability slots per day.
10. Integrations (Google Calendar, reminders), CI.

## 5. Existing limitations to address

- Regenerating replaces all sessions, including manual edits.
- Planning window fixed at 7 days from "now"; no week navigation.
- One availability window per day; same hours for all selected days.
- Edits violating a deadline are blocked rather than warned.
- Timezone offset is captured per request; DST transitions inside a week may shift a deadline check by one hour. Phase 2 could store an IANA timezone per user.
- No frontend automated tests; no CI yet.
- JWT stored in `localStorage`.

## 6. Important technical decisions

| Decision | Why |
|---|---|
| **AI output is never trusted** — every session passes `validationService` | Proposal §1.4 / risk table. Rules stay testable without the LLM. |
| **Hybrid planning** (AI proposal → validate → deterministic gap-fill) | A partially bad AI response still yields a complete, valid plan; total fallback when AI fails. |
| **Gemini free tier only**, model from `GEMINI_MODEL`, default `gemini-2.5-flash` | Course budget is $0. SDK retries disabled on 429 and a local 8 req/min limiter protect quota. |
| **Short task ids (`T1`, `T2`) in prompts** | Less hallucination of ids; no database ids or personal data sent (NFR-5). |
| **Structured output** via `responseMimeType: application/json` + `responseJsonSchema` | Reliable parsing; parser still tolerates code fences and validates shape. |
| **Sessions stored as local wall-clock strings** (`date: YYYY-MM-DD`, `HH:MM`) | Calendar never shifts on render; browser sends `X-Timezone-Offset` for deadline comparisons. |
| **Plans are versioned, not overwritten** | Foundation for replanning history, diffs and "reject keeps previous plan". |
| **Deterministic scheduler = effective-deadline-first** (High priority treated as due 36 h earlier, Medium 12 h) with soft spreading across days | EDF is feasibility-friendly; priority weighting matches user expectations; spreading avoids cramming. |
| **Stale flag** on task/availability changes | Implements the UC-2/UC-3 "flag for re-planning" hook without automatic replanning. |
| **JWT auth with bcrypt** rather than demo mode | Proposal FR-1 / NFR-4; small cost, avoids rework later. |
| **Jasmine + Cucumber** | Named in the proposal (NFR-7). |
