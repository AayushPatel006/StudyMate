import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.js';
import { prettyDate, fromMinutes, WEEKDAYS } from '../utils/time.js';

/**
 * Gemini integration (Google AI Studio free tier). All calls happen on the
 * backend; the API key never reaches the browser.
 *
 * Exposes a provider-agnostic "planning agent" interface:
 *   { provider, model, isConfigured(), proposeSchedule(ctx), chat({ message, history, contextText }) }
 */

export class AiError extends Error {
  constructor(code, userMessage, cause) {
    super(userMessage);
    this.code = code;
    this.userMessage = userMessage;
    this.cause = cause;
  }
}

const MESSAGES = {
  NOT_CONFIGURED: 'No Gemini API key is configured. Add GEMINI_API_KEY to backend/.env to enable AI features.',
  RATE_LIMITED: 'The Gemini free-tier rate limit or daily quota has been reached. StudyMate used its built-in algorithm instead — try AI planning again later.',
  INVALID_KEY: 'The Gemini API key was rejected. Check GEMINI_API_KEY in backend/.env.',
  MODEL_UNAVAILABLE: 'The configured Gemini model is not available for this API key. Check GEMINI_MODEL — use a model listed as free on the Gemini pricing page.',
  TIMEOUT: 'Gemini took too long to respond.',
  NETWORK: 'Could not reach the Gemini API (network error).',
  SERVICE_UNAVAILABLE: 'The Gemini API is temporarily unavailable.',
  INVALID_RESPONSE: 'Gemini returned a response StudyMate could not use.',
  BLOCKED: 'Gemini declined to answer this request.',
  UNKNOWN: 'The AI service failed unexpectedly.',
};

/** Map SDK / network errors to stable codes. */
export function classifyError(err) {
  if (err instanceof AiError) return err;
  const status = err?.status ?? err?.code;
  const msg = String(err?.message || '');
  let code = 'UNKNOWN';
  if (err?.name === 'AbortError' || /timed? ?out|aborted/i.test(msg)) code = 'TIMEOUT';
  else if (status === 429 || /RESOURCE_EXHAUSTED|quota|rate limit/i.test(msg)) code = 'RATE_LIMITED';
  else if (status === 401 || status === 403 || /API key not valid|API_KEY_INVALID|PERMISSION_DENIED/i.test(msg)) code = 'INVALID_KEY';
  else if (status === 404 || /not found for API version|is not found|NOT_FOUND/i.test(msg)) code = 'MODEL_UNAVAILABLE';
  else if (typeof status === 'number' && status >= 500) code = 'SERVICE_UNAVAILABLE';
  else if (/fetch failed|ENOTFOUND|ECONNRESET|ECONNREFUSED|EAI_AGAIN|network|socket/i.test(msg)) code = 'NETWORK';
  else if (status === 400 && /billing|paid|free tier/i.test(msg)) code = 'MODEL_UNAVAILABLE';
  return new AiError(code, MESSAGES[code], err);
}

// ---------------------------------------------------------------------------
// Prompt construction (only the data needed for planning is sent — NFR-5)
// ---------------------------------------------------------------------------

const SYSTEM_PLANNER = `You are the planning agent inside StudyMate, a study planner for university students.
Produce a realistic weekly study schedule as JSON.

Hard rules (a deterministic validator will DROP any session that breaks them):
- Only schedule on the listed planningDays, between that day's "from" and "to" times.
- A session for a task must END before that task's due date/time.
- Sessions must not overlap. Leave at least breakMinutes between consecutive sessions.
- Total minutes on any single day must not exceed maxDailyMinutes.
- Each session lasts between minSessionMinutes and maxSessionMinutes, in 15-minute steps. Times are 24h "HH:MM".
- Total scheduled minutes for a task must not exceed its remainingMinutes.
- Use the exact task ids provided (e.g. "T1").

Planning guidance:
- Prioritise by deadline proximity first, then priority (High > Medium > Low), then workload size.
- Break larger tasks into several focused sessions spread over multiple days; avoid cramming one task into a single day.
- For each session give "focus": a concrete sub-step (e.g. "Solve problems 1–4", "Outline report sections", "Review lecture 5–6 notes").
- For each session give "explanation": one short sentence (max 25 words) on why it is scheduled then.
- prioritizedTasks ranks every task (rank 1 = most urgent) with a one-sentence reason.
- If not everything fits, schedule the most urgent work and say what is at risk in "summary" (max 2 sentences).`;

export function buildPlannerPayload(ctx) {
  const idMap = new Map();
  const tasks = ctx.tasks.map((t, i) => {
    const shortId = `T${i + 1}`;
    idMap.set(shortId, t.id);
    return {
      id: shortId,
      title: t.title,
      course: t.course,
      type: t.type,
      priority: t.priority,
      status: t.status,
      due: { date: t.dueLocal.date, time: fromMinutes(t.dueLocal.minutes), weekday: WEEKDAYS[new Date(`${t.dueLocal.date}T00:00:00Z`).getUTCDay()] },
      estimatedHours: t.estimatedHours,
      remainingMinutes: t.remainingMinutes,
      notes: t.description ? t.description.slice(0, 200) : undefined,
    };
  });
  const payload = {
    now: { date: ctx.today, time: fromMinutes(ctx.nowMinutes), weekday: WEEKDAYS[new Date(`${ctx.today}T00:00:00Z`).getUTCDay()] },
    planningDays: ctx.days.map((d) => ({ date: d.date, weekday: d.weekdayName, from: fromMinutes(d.startMin), to: fromMinutes(d.endMin) })),
    limits: {
      maxDailyMinutes: ctx.settings.maxDailyMinutes,
      maxSessionMinutes: ctx.settings.maxSessionMinutes,
      minSessionMinutes: ctx.settings.minSessionMinutes,
      breakMinutes: ctx.settings.breakMinutes,
    },
    tasks,
  };
  return { payload, idMap };
}

export const PLAN_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    prioritizedTasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: { taskId: { type: 'string' }, rank: { type: 'integer' }, reason: { type: 'string' } },
        required: ['taskId', 'rank', 'reason'],
      },
    },
    sessions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          date: { type: 'string', description: 'YYYY-MM-DD' },
          startTime: { type: 'string', description: 'HH:MM 24h' },
          endTime: { type: 'string', description: 'HH:MM 24h' },
          focus: { type: 'string' },
          explanation: { type: 'string' },
        },
        required: ['taskId', 'date', 'startTime', 'endTime', 'focus', 'explanation'],
      },
    },
  },
  required: ['summary', 'prioritizedTasks', 'sessions'],
};

/** Parse + shape-check the model's JSON. Throws AiError(INVALID_RESPONSE). */
export function parsePlanResponse(text, idMap) {
  if (!text || typeof text !== 'string') throw new AiError('INVALID_RESPONSE', MESSAGES.INVALID_RESPONSE);
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  let data;
  try {
    data = JSON.parse(cleaned);
  } catch (e) {
    throw new AiError('INVALID_RESPONSE', 'Gemini returned malformed JSON.', e);
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.sessions)) {
    throw new AiError('INVALID_RESPONSE', 'Gemini’s response was missing the sessions list.');
  }
  const mapId = (id) => idMap.get(String(id).trim()) ?? String(id);
  const sessions = data.sessions
    .filter((s) => s && typeof s === 'object')
    .map((s) => ({
      taskId: mapId(s.taskId),
      date: String(s.date ?? '').trim(),
      startTime: String(s.startTime ?? '').trim().padStart(5, '0'),
      endTime: String(s.endTime ?? '').trim().padStart(5, '0'),
      focus: typeof s.focus === 'string' ? s.focus.trim() : '',
      explanation: typeof s.explanation === 'string' ? s.explanation.trim() : '',
    }));
  const prioritizedTasks = (Array.isArray(data.prioritizedTasks) ? data.prioritizedTasks : [])
    .filter((p) => p && typeof p === 'object')
    .map((p) => ({ taskId: mapId(p.taskId), rank: Number(p.rank) || 999, reason: typeof p.reason === 'string' ? p.reason : '' }));
  return { summary: typeof data.summary === 'string' ? data.summary.slice(0, 600) : '', prioritizedTasks, sessions };
}

// ---------------------------------------------------------------------------
// Assistant context
// ---------------------------------------------------------------------------

export function buildAssistantContext(ctx, sessions = []) {
  const lines = [];
  lines.push(`Current local date/time: ${WEEKDAYS[new Date(`${ctx.today}T00:00:00Z`).getUTCDay()]} ${ctx.today} ${fromMinutes(ctx.nowMinutes)}`);
  lines.push(
    `Weekly availability: ${ctx.availability.availableDays.map((d) => WEEKDAYS[d].slice(0, 3)).join(', ')} from ${ctx.availability.startTime} to ${ctx.availability.endTime}, max ${ctx.settings.maxDailyMinutes / 60}h/day.`
  );
  if (ctx.tasks.length === 0) lines.push('Active tasks: none.');
  else {
    lines.push('Active tasks:');
    for (const t of ctx.tasks) {
      lines.push(`- ${t.title} [${t.course}, ${t.type}, ${t.priority} priority, ${t.status}] due ${prettyDate(t.dueLocal.date)} ${fromMinutes(t.dueLocal.minutes)}, estimated ${t.estimatedHours}h${t.description ? ` — ${t.description.slice(0, 160)}` : ''}`);
    }
  }
  if (ctx.excluded.length) lines.push(`Overdue tasks: ${ctx.excluded.map((e) => e.task.title).join(', ')}`);
  const upcoming = sessions.filter((s) => s.date >= ctx.today).slice(0, 25);
  if (upcoming.length) {
    lines.push('Current study plan (upcoming sessions):');
    for (const s of upcoming) lines.push(`- ${s.date} ${s.startTime}-${s.endTime}: ${s.taskTitle} (${s.course})${s.focus ? ` — ${s.focus}` : ''}`);
  } else lines.push('Current study plan: none generated yet.');
  return lines.join('\n');
}

const SYSTEM_ASSISTANT = `You are StudyMate Assistant, a friendly, practical study-planning coach for a university student.
Use the student's tasks, availability and plan (given below) when relevant. Be specific: name tasks, dates and hours.
Keep answers concise (under ~180 words unless asked for detail). Use short bullet lists where helpful and **bold** for key items.
You cannot change the student's data; if they want changes, tell them where in StudyMate to do it (My Tasks, Availability, Study Planner).
Do not invent tasks or deadlines that are not listed. If information is missing, say so.`;

// ---------------------------------------------------------------------------
// Agent factory
// ---------------------------------------------------------------------------

const status = { lastError: null, lastErrorAt: null, lastSuccessAt: null };
export const getAiStatus = () => ({ ...status });

function withTimeout(promiseFactory, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return promiseFactory(controller.signal).finally(() => clearTimeout(timer));
}

/**
 * @param {object} [opts]
 * @param {string} [opts.apiKey]
 * @param {string} [opts.model]
 * @param {number} [opts.timeoutMs]
 * @param {object} [opts.client]  Injected client (tests) with models.generateContent()
 */
export function createGeminiAgent({ apiKey = env.gemini.apiKey, model = env.gemini.model, timeoutMs = env.gemini.timeoutMs, client } = {}) {
  let ai = client || null;
  const getClient = () => {
    if (!ai) {
      // retryOptions.attempts=1: never sit in long SDK retry loops on 429s; we fall back instead.
      ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: timeoutMs, retryOptions: { attempts: 1 } } });
    }
    return ai;
  };

  async function call(request) {
    if (!apiKey && !client) throw new AiError('NOT_CONFIGURED', MESSAGES.NOT_CONFIGURED);
    try {
      const response = await withTimeout(
        (signal) => getClient().models.generateContent({ ...request, model, config: { ...request.config, abortSignal: signal } }),
        timeoutMs
      );
      status.lastSuccessAt = new Date().toISOString();
      return response;
    } catch (err) {
      const e = classifyError(err);
      status.lastError = e.code;
      status.lastErrorAt = new Date().toISOString();
      throw e;
    }
  }

  return {
    provider: 'gemini',
    model,
    isConfigured: () => Boolean(apiKey || client),

    async proposeSchedule(ctx) {
      const { payload, idMap } = buildPlannerPayload(ctx);
      const response = await call({
        contents: [{ role: 'user', parts: [{ text: `Plan this student's week. Input:\n${JSON.stringify(payload)}` }] }],
        config: {
          systemInstruction: SYSTEM_PLANNER,
          responseMimeType: 'application/json',
          responseJsonSchema: PLAN_RESPONSE_SCHEMA,
          temperature: 0.3,
        },
      });
      try {
        return parsePlanResponse(response?.text, idMap);
      } catch (e) {
        status.lastError = e.code;
        status.lastErrorAt = new Date().toISOString();
        throw e;
      }
    },

    async chat({ message, history = [], contextText = '' }) {
      const contents = [
        ...history.slice(-10).map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content).slice(0, 4000) }] })),
        { role: 'user', parts: [{ text: message }] },
      ];
      const response = await call({
        contents,
        config: { systemInstruction: `${SYSTEM_ASSISTANT}\n\n--- Student data ---\n${contextText}`, temperature: 0.6 },
      });
      const text = response?.text?.trim();
      if (!text) throw new AiError('BLOCKED', MESSAGES.BLOCKED);
      return text;
    },
  };
}

// Single shared agent for the running server (tests inject their own).
let sharedAgent = null;
export function getPlanningAgent() {
  if (!sharedAgent) sharedAgent = createGeminiAgent();
  return sharedAgent;
}
export function setPlanningAgent(agent) {
  sharedAgent = agent;
}
