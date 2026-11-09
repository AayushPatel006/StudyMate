# Database Schema — StudyMate (MongoDB / Mongoose)

Database name: `studymate` (from `MONGODB_URI`). All collections except `users` carry a `userId` and every query filters on it.

Fields marked **(Phase 2 hook)** exist now so later features don't require migrations; they are not yet used by the UI.

## users

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `name` | String, required, ≤ 80 | |
| `email` | String, required, unique, lowercase | |
| `passwordHash` | String, required, `select: false` | bcrypt |
| `createdAt`, `updatedAt` | Date | timestamps |

## tasks

| Field | Type | Notes |
|---|---|---|
| `userId` | ObjectId → users, indexed | |
| `title` | String, required, ≤ 120 | |
| `course` | String, required, ≤ 80 | |
| `description` | String, ≤ 2000 | |
| `type` | enum `Assignment, Exam, Quiz, Project, Reading, Other` | |
| `dueDate` | Date, required | UTC instant (date + time) |
| `estimatedHours` | Number 0.25–200 | quarter-hour precision |
| `priority` | enum `High, Medium, Low` | |
| `status` | enum `Pending, In Progress, Completed` | |
| `completedAt` | Date \| null | set when status → Completed |
| `parentTaskId` | ObjectId → tasks \| null | **(Phase 2 hook)** goals → subtasks (FR-3) |
| `createdAt`, `updatedAt` | Date | |

Index: `{ userId, status, dueDate }`.

## availabilities (one per user)

| Field | Type | Notes |
|---|---|---|
| `userId` | ObjectId, unique | |
| `availableDays` | [Number] | 0 = Sunday … 6 = Saturday |
| `preferredStartTime` | String `HH:MM` | |
| `preferredEndTime` | String `HH:MM` (`24:00` allowed) | must be ≥ 30 min after start |
| `maxStudyHoursPerDay` | Number 0.5–16 | ≤ length of the window |
| `maxSessionMinutes` | Number 30–240, default 90 | longest single session |
| `breakMinutes` | Number 0–60, default 15 | gap between generated sessions |

If no document exists the API returns defaults with `configured: false`, and plan generation is refused until the student saves availability.

## studyplans (versioned)

| Field | Type | Notes |
|---|---|---|
| `userId` | ObjectId | |
| `version` | Number | increments per user |
| `status` | enum `active, archived` | exactly one active per user; Phase 2 adds `proposed` |
| `generatedBy` | enum `gemini, fallback` | |
| `model` | String \| null | Gemini model id when AI was used |
| `fallbackReason` | String \| null | user-facing reason |
| `summary` | String | AI summary or generated summary |
| `windowStart`, `windowEnd` | String `YYYY-MM-DD` | local 7-day window |
| `tzOffset` | Number | browser offset in minutes at generation |
| `priorities` | [{ `taskId`, `title`, `course`, `rank`, `reason` }] | task ranking |
| `warnings` | [{ `type`, `severity`, `message`, `taskId`, `unscheduledHours` }] | `INSUFFICIENT_TIME`, `OVERDUE`, `CARRYOVER`, `NO_AVAILABILITY`, `AI_ADJUSTED` |
| `stats` | { `totalSessions`, `totalMinutes`, `aiProposed`, `aiAccepted`, `aiRejected`, `algorithmFilled` } | |
| `stale` | Boolean | true after tasks/availability change |
| `createdAt`, `updatedAt` | Date | |

Indexes: `{ userId, status }`, `{ userId, version: -1 }`.

## studysessions

| Field | Type | Notes |
|---|---|---|
| `userId` | ObjectId | |
| `planId` | ObjectId → studyplans, indexed | sessions belong to one plan version |
| `taskId` | ObjectId → tasks | |
| `taskTitle`, `course`, `priority` | denormalised from the task | kept in sync on task edits |
| `date` | String `YYYY-MM-DD` | local wall-clock |
| `startTime`, `endTime` | String `HH:MM` | local wall-clock |
| `duration` | Number (minutes) | |
| `focus` | String ≤ 160 | concrete sub-step (task breakdown) |
| `explanation` | String ≤ 500 | why it was scheduled then |
| `source` | enum `ai, algorithm` | who generated it |
| `status` | enum `scheduled, completed, missed, delayed` | **(Phase 2 hook)** progress tracking — always `scheduled` now |
| `isManuallyEdited` | Boolean | set on every manual edit — **(Phase 2 hook)** preserve during replans (FR-12) |
| `createdAt`, `updatedAt` | Date | |

Index: `{ planId, date, startTime }`.

## Relationships

```
users 1─┬─* tasks 1───* studysessions *───1 studyplans *───1 users
        └─1 availabilities
```

Deleting a task deletes its sessions in every plan version. Old plan versions are kept (archived) for history.
