# API Reference — StudyMate (Phase 1)

Base URL: `http://localhost:5000/api` (the frontend calls `/api` and Vite proxies it).

**Headers**
- `Authorization: Bearer <token>` — required on everything except `/health`, `/auth/register`, `/auth/login`.
- `X-Timezone-Offset: <minutes>` — browser's `new Date().getTimezoneOffset()` (e.g. `300` for New York in winter). Used for planning and validation. Defaults to `0`.

**Errors** always look like:
```json
{ "error": { "message": "Human readable", "code": "MACHINE_CODE", "details": { "field": "message" } } }
```
Common codes: `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `NOT_FOUND` (404), `EMAIL_TAKEN` (409), `SCHEDULE_CONFLICT` (422), `LOCAL_RATE_LIMIT` (429), `AI_NOT_CONFIGURED` (503).

---

## Health
`GET /health` → `{ "ok": true, "service": "studymate-api" }`

## Auth
| Method & path | Body | Response |
|---|---|---|
| `POST /auth/register` | `{ name, email, password (≥8) }` | `201 { token, user }` · `409 EMAIL_TAKEN` |
| `POST /auth/login` | `{ email, password }` | `200 { token, user }` · `401 INVALID_CREDENTIALS` |
| `GET /auth/me` | — | `{ user }` |
| `PATCH /auth/me` | `{ name }` | `{ user }` |

`user = { id, name, email, createdAt }`

## Dashboard
`GET /dashboard` →
```json
{
  "user": { "name": "Alex Rivera" },
  "today": "2026-11-09",
  "stats": { "activeTasks": 6, "completedTasks": 1, "totalTasks": 7, "dueThisWeek": 4, "overdue": 0, "totalEstimatedHours": 19.5, "plannedHours": 19.5 },
  "upcomingTasks": [Task],
  "todaySessions": [StudySession],
  "plan": { "_id": "...", "version": 1, "generatedBy": "fallback", "createdAt": "...", "stale": false, "totalSessions": 18, "warnings": 0 },
  "availabilityConfigured": true
}
```

## Tasks
| Method & path | Notes |
|---|---|
| `GET /tasks?status=&priority=&course=` | `{ tasks: [Task], courses: [string] }` — completed tasks last, then by due date |
| `POST /tasks` | Body: `{ title*, course*, dueDate* (ISO, future), estimatedHours* (0.25–200), type, priority, status, description }` → `201 { task }` |
| `GET /tasks/:id` | `{ task }` |
| `PATCH /tasks/:id` | Any subset of the fields above (e.g. `{ "status": "Completed" }`) → `{ task }` |
| `DELETE /tasks/:id` | Also deletes the task's sessions → `{ ok, deletedSessions }` |

Creating, editing or deleting a task marks the active plan `stale: true`.

## Availability
| Method & path | Notes |
|---|---|
| `GET /availability` | `{ availability }` — defaults with `configured: false` if never saved |
| `PUT /availability` | `{ availableDays: [0–6], preferredStartTime "HH:MM", preferredEndTime "HH:MM", maxStudyHoursPerDay, maxSessionMinutes?, breakMinutes? }` → `{ availability }` |

Validation: ≥ 1 day; end after start; window ≥ 30 min; daily limit 0.5–16 h and ≤ window length.

## Study plans
| Method & path | Notes |
|---|---|
| `POST /plans/generate` | Generates and saves a new plan version. `400 NO_TASKS` / `400 NO_AVAILABILITY` when prerequisites are missing. → `201 { plan, sessions, fallbackCode }` |
| `GET /plans/active` | `{ plan \| null, sessions }` |
| `GET /plans` | Last 20 versions (summary fields) |

`fallbackCode` is `null` when Gemini was used, otherwise one of `NOT_CONFIGURED`, `RATE_LIMITED`, `INVALID_KEY`, `MODEL_UNAVAILABLE`, `TIMEOUT`, `NETWORK`, `SERVICE_UNAVAILABLE`, `INVALID_RESPONSE`, `UNKNOWN`.

`StudyPlan` and `StudySession` fields: see [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md).

## Sessions
| Method & path | Notes |
|---|---|
| `PATCH /sessions/:id` | `{ date "YYYY-MM-DD", startTime, endTime }` → `{ session }` (marked `isManuallyEdited`). `422 SCHEDULE_CONFLICT` with `details.reasons: [{ code, message }]` if it breaks a rule (overlap, outside availability, after deadline, daily limit, …). |
| `DELETE /sessions/:id` | `{ ok: true }` |

## AI
| Method & path | Notes |
|---|---|
| `GET /ai/status` | `{ provider: "gemini", configured, model, lastError, lastErrorAt, lastSuccessAt }` (never includes the key) |
| `POST /assistant/chat` | `{ message (≤2000), history?: [{ role: "user"\|"assistant", content }] }` → `{ reply, model }`. `503 AI_NOT_CONFIGURED` without a key; `429 AI_RATE_LIMITED` when the free-tier quota is hit; `503 AI_*` for other AI failures. |

Rate limits (per server): auth routes 50 / 15 min, AI routes (`/plans/generate`, `/assistant/chat`) 8 / min.

## Example (curl)

```bash
TOKEN=$(curl -s -X POST localhost:5000/api/auth/login -H 'content-type: application/json' \
  -d '{"email":"demo@studymate.app","password":"demo1234"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

curl -s -X POST localhost:5000/api/plans/generate \
  -H "Authorization: Bearer $TOKEN" -H "X-Timezone-Offset: 300"
```
