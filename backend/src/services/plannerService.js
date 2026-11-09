import { buildPlanningContext, latestEndOn, rankTasks, urgencyKey, SLOT_STEP } from './planningContext.js';
import { validateSessions } from './validationService.js';
import { fromMinutes, roundUpTo, roundDownTo, prettyDate, prettyTime } from '../utils/time.js';

/**
 * Planner service — provider-independent orchestration.
 *
 *   1. Build a planning context (tasks, availability, window, limits).
 *   2. If a planning agent (Gemini) is configured, ask it for a proposal and run
 *      every proposed session through deterministic validation.
 *   3. Fill any remaining unscheduled work with the deterministic scheduler
 *      (this is also the complete fallback when the agent is unavailable).
 *   4. Produce warnings for work that cannot fit before its deadline.
 *
 * The planning agent sits behind a tiny interface ({ isConfigured, proposeSchedule })
 * so it can be swapped or mocked (NFR-6).
 */

// ---------------------------------------------------------------------------
// Deterministic scheduler (fallback + gap filler)
// ---------------------------------------------------------------------------

/** Subtract padded busy blocks from [start, end]. Returns free intervals. */
function freeIntervals(start, end, busy, pad) {
  const blocks = busy
    .map((b) => [Math.max(start, b.startMin - pad), Math.min(end, b.endMin + pad)])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  const free = [];
  let cursor = start;
  for (const [s, e] of blocks) {
    if (s > cursor) free.push([cursor, s]);
    cursor = Math.max(cursor, e);
  }
  if (cursor < end) free.push([cursor, end]);
  return free;
}

/**
 * Greedy earliest-effective-deadline-first scheduler.
 * Places sessions into free time around `fixed` sessions, respecting availability,
 * deadlines, daily limits, max session length and breaks. Prefers spreading a task
 * over several days by deprioritising a task that already has a full session today.
 *
 * @returns {{ sessions: object[], remaining: Map<string, number> }}
 */
export function scheduleDeterministic(ctx, { fixed = [] } = {}) {
  const { maxSessionMinutes, breakMinutes, maxDailyMinutes, minSessionMinutes } = ctx.settings;
  const remaining = new Map(ctx.tasks.map((t) => [t.id, t.remainingMinutes]));
  for (const f of fixed) remaining.set(String(f.taskId), Math.max(0, (remaining.get(String(f.taskId)) || 0) - f.duration));

  const ranked = rankTasks(ctx.tasks);
  const sessions = [];

  for (const day of ctx.days) {
    const busy = fixed.filter((f) => f.date === day.date);
    let used = busy.reduce((sum, b) => sum + b.duration, 0);
    const perTaskToday = new Map();
    for (const b of busy) perTaskToday.set(String(b.taskId), (perTaskToday.get(String(b.taskId)) || 0) + b.duration);

    for (const [fs, fe] of freeIntervals(day.startMin, day.endMin, busy, breakMinutes)) {
      let cursor = roundUpTo(fs, SLOT_STEP);
      while (cursor < fe && used < maxDailyMinutes) {
        const candidates = ranked
          .filter((t) => (remaining.get(t.id) || 0) >= SLOT_STEP)
          // Stable re-order: tasks that already got a full session today go last.
          .map((t, i) => ({ t, i, tired: (perTaskToday.get(t.id) || 0) >= maxSessionMinutes ? 1 : 0 }))
          .sort((a, b) => a.tired - b.tired || a.i - b.i)
          .map((x) => x.t);

        let placed = null;
        for (const t of candidates) {
          const left = remaining.get(t.id);
          const limitEnd = Math.min(fe, latestEndOn(t, day.date));
          const chunk = roundDownTo(Math.min(maxSessionMinutes, left, maxDailyMinutes - used, limitEnd - cursor), SLOT_STEP);
          if (chunk >= SLOT_STEP && chunk >= Math.min(minSessionMinutes, left)) {
            placed = { t, chunk };
            break;
          }
        }
        if (!placed) break;

        const { t, chunk } = placed;
        sessions.push({
          taskId: t.id,
          taskTitle: t.title,
          course: t.course,
          date: day.date,
          startTime: fromMinutes(cursor),
          endTime: fromMinutes(cursor + chunk),
          startMin: cursor,
          endMin: cursor + chunk,
          duration: chunk,
          priority: t.priority,
          focus: '',
          explanation: '',
          source: 'algorithm',
        });
        remaining.set(t.id, remaining.get(t.id) - chunk);
        perTaskToday.set(t.id, (perTaskToday.get(t.id) || 0) + chunk);
        used += chunk;
        cursor += chunk + breakMinutes;
      }
    }
  }
  return { sessions, remaining };
}

/** Adds "Part i of n" focus labels and plain-language reasons to algorithm sessions. */
function annotate(allSessions, ctx) {
  const byTask = new Map();
  for (const s of [...allSessions].sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin)) {
    if (!byTask.has(s.taskId)) byTask.set(s.taskId, []);
    byTask.get(s.taskId).push(s);
  }
  for (const [taskId, list] of byTask) {
    const task = ctx.taskMap.get(taskId);
    list.forEach((s, i) => {
      if (s.source !== 'algorithm') return;
      if (!s.focus) s.focus = list.length > 1 ? `Part ${i + 1} of ${list.length}` : 'Complete in one session';
      const dueStr = `${prettyDate(task.dueLocal.date)} at ${prettyTime(task.dueLocal.minutes)}`;
      const daysLeft = Math.round((Date.parse(`${task.dueLocal.date}T00:00:00Z`) - Date.parse(`${s.date}T00:00:00Z`)) / 86400000);
      let lead;
      if (daysLeft <= 1) lead = 'Deadline is very close';
      else if (task.priority === 'High') lead = 'High-priority work scheduled early';
      else if (i === 0) lead = 'Earliest effective deadline among your remaining tasks';
      else lead = 'Spread across the week to keep sessions manageable';
      s.explanation = `${lead}. Due ${dueStr} (${task.priority} priority).`;
    });
  }
}

// ---------------------------------------------------------------------------
// Warnings and ranking
// ---------------------------------------------------------------------------

export function buildWarnings(ctx, remaining) {
  const warnings = [];
  for (const { task } of ctx.excluded) {
    warnings.push({
      type: 'OVERDUE',
      severity: 'error',
      taskId: task.id,
      message: `"${task.title}" was due ${prettyDate(task.dueLocal.date)} — it is overdue and was not scheduled. Update its due date or mark it complete.`,
      unscheduledHours: task.estimatedHours,
    });
  }
  if (ctx.tasks.length && ctx.days.length === 0) {
    warnings.push({ type: 'NO_AVAILABILITY', severity: 'error', message: 'No available study time in the next 7 days. Add more study days or widen your hours.' });
  }
  for (const task of ctx.tasks) {
    const left = remaining.get(task.id) || 0;
    if (left < SLOT_STEP) continue;
    const hours = Math.round((left / 60) * 100) / 100;
    if (task.dueLocal.date <= ctx.window.end) {
      warnings.push({
        type: 'INSUFFICIENT_TIME',
        severity: 'warning',
        taskId: task.id,
        unscheduledHours: hours,
        message: `Not enough study time: ${hours}h of "${task.title}" could not be scheduled before it is due ${prettyDate(task.dueLocal.date)} at ${prettyTime(task.dueLocal.minutes)}. Consider adding study hours or adjusting the estimate.`,
      });
    } else {
      warnings.push({
        type: 'CARRYOVER',
        severity: 'info',
        taskId: task.id,
        unscheduledHours: hours,
        message: `${hours}h of "${task.title}" remains for after this week (due ${prettyDate(task.dueLocal.date)}).`,
      });
    }
  }
  return warnings;
}

export function deterministicPriorities(ctx) {
  return rankTasks(ctx.tasks).map((t, i) => {
    const days = Math.max(0, Math.round((Date.parse(`${t.dueLocal.date}T00:00:00Z`) - Date.parse(`${ctx.today}T00:00:00Z`)) / 86400000));
    return {
      taskId: t.id,
      title: t.title,
      course: t.course,
      rank: i + 1,
      reason: `${days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `Due in ${days} days`} · ${t.priority} priority · ${t.estimatedHours}h of work`,
    };
  });
}

function mergePriorities(aiList, ctx) {
  const seen = new Set();
  const out = [];
  for (const p of (Array.isArray(aiList) ? aiList : []).slice().sort((a, b) => a.rank - b.rank)) {
    const task = ctx.taskMap.get(String(p.taskId));
    if (!task || seen.has(task.id)) continue;
    seen.add(task.id);
    out.push({ taskId: task.id, title: task.title, course: task.course, rank: out.length + 1, reason: String(p.reason || '').slice(0, 240) });
  }
  // Any task the model forgot is appended in deterministic order.
  for (const p of deterministicPriorities(ctx)) {
    if (!seen.has(p.taskId)) out.push({ ...p, rank: out.length + 1 });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

const NOT_CONFIGURED_REASON = 'No Gemini API key is configured, so StudyMate used its built-in scheduling algorithm.';

/**
 * Compute a complete plan (pure; no database access).
 * @param {{ tasks, availability, now, tzOffset, agent }} input
 */
export async function computePlan({ tasks, availability, now = new Date(), tzOffset = 0, agent = null }) {
  const ctx = buildPlanningContext({ tasks, availability, now, tzOffset });

  let generatedBy = 'fallback';
  let fallbackReason = null;
  let fallbackCode = null;
  let summary = '';
  let aiAccepted = [];
  let aiPriorities = null;
  const stats = { aiProposed: 0, aiAccepted: 0, aiRejected: 0, algorithmFilled: 0, totalSessions: 0, totalMinutes: 0 };
  let rejected = [];

  const canPlan = ctx.tasks.length > 0 && ctx.days.length > 0;

  if (canPlan && agent?.isConfigured()) {
    try {
      const proposal = await agent.proposeSchedule(ctx);
      const result = validateSessions(proposal.sessions, ctx, { source: 'ai' });
      stats.aiProposed = Array.isArray(proposal.sessions) ? proposal.sessions.length : 0;
      if (result.accepted.length === 0) {
        const err = new Error('None of the AI-proposed sessions passed validation');
        err.code = 'INVALID_RESPONSE';
        err.userMessage = 'Gemini returned a schedule that did not pass StudyMate’s validation rules, so the built-in algorithm was used instead.';
        throw err;
      }
      aiAccepted = result.accepted;
      rejected = result.rejected;
      stats.aiAccepted = result.accepted.length;
      stats.aiRejected = result.rejected.length;
      summary = proposal.summary || '';
      aiPriorities = proposal.prioritizedTasks;
      generatedBy = 'gemini';
    } catch (err) {
      fallbackCode = err.code || 'UNKNOWN';
      fallbackReason = err.userMessage || 'The AI planner was unavailable, so StudyMate used its built-in scheduling algorithm.';
    }
  } else if (canPlan) {
    fallbackCode = 'NOT_CONFIGURED';
    fallbackReason = NOT_CONFIGURED_REASON;
  }

  const fill = scheduleDeterministic(ctx, { fixed: aiAccepted });
  stats.algorithmFilled = generatedBy === 'gemini' ? fill.sessions.length : 0;

  const all = [...aiAccepted, ...fill.sessions].sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
  annotate(all, ctx);
  stats.totalSessions = all.length;
  stats.totalMinutes = all.reduce((sum, s) => sum + s.duration, 0);

  const warnings = buildWarnings(ctx, fill.remaining);
  if (generatedBy === 'gemini' && (rejected.length || fill.sessions.length)) {
    const codes = [...new Set(rejected.flatMap((r) => r.reasons.map((x) => x.message.toLowerCase())))].slice(0, 3);
    const parts = [];
    if (rejected.length) parts.push(`removed ${rejected.length} AI-suggested session${rejected.length === 1 ? '' : 's'} that broke scheduling rules${codes.length ? ` (${codes.join('; ')})` : ''}`);
    if (fill.sessions.length) parts.push(`added ${fill.sessions.length} session${fill.sessions.length === 1 ? '' : 's'} with the scheduling algorithm to cover remaining work`);
    warnings.push({ type: 'AI_ADJUSTED', severity: 'info', message: `Validation ${parts.join(' and ')}.` });
  }

  if (!summary) {
    const hours = Math.round((stats.totalMinutes / 60) * 10) / 10;
    const taskCount = new Set(all.map((s) => s.taskId)).size;
    summary = all.length
      ? `Scheduled ${hours}h across ${all.length} session${all.length === 1 ? '' : 's'} for ${taskCount} task${taskCount === 1 ? '' : 's'}, ordering work by deadline and priority.`
      : 'No sessions could be scheduled with the current tasks and availability.';
  }

  return {
    generatedBy,
    model: generatedBy === 'gemini' ? agent.model : null,
    fallbackReason,
    fallbackCode,
    summary,
    priorities: generatedBy === 'gemini' ? mergePriorities(aiPriorities, ctx) : deterministicPriorities(ctx),
    sessions: all.map(({ startMin, endMin, ...rest }) => rest),
    warnings,
    stats,
    window: ctx.window,
  };
}

export { urgencyKey };
