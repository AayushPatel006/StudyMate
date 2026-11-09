import { isValidDateStr, isValidTime, toMinutes, fromMinutes, prettyDate, prettyTime } from '../utils/time.js';
import { latestEndOn, MAX_EDIT_SESSION_MINUTES, SLOT_STEP } from './planningContext.js';

/**
 * Deterministic schedule validation. The AI is never trusted to enforce the
 * scheduling rules — every proposed or edited session passes through here.
 *
 * Rules:
 *  - session belongs to an existing, active task
 *  - date is inside the planning window and on an available day
 *  - times are valid, start < end, duration within limits
 *  - session lies within the student's study window (and not in the past)
 *  - session ends before the task deadline
 *  - sessions do not overlap
 *  - daily study total does not exceed the daily limit
 *  - total scheduled time for a task does not exceed its estimate
 */

export const REASONS = {
  UNKNOWN_TASK: 'Task does not exist or is already completed',
  INVALID_DATE: 'Invalid date',
  DAY_UNAVAILABLE: 'Day is not one of your available study days in the planning window',
  INVALID_TIME: 'Invalid start or end time',
  INVALID_DURATION: 'Session length is not valid',
  OUTSIDE_AVAILABILITY: 'Session falls outside your study hours',
  AFTER_DEADLINE: 'Session ends after the task deadline',
  OVERLAP: 'Session overlaps another session',
  DAILY_LIMIT_EXCEEDED: 'Daily study limit would be exceeded',
  EXCEEDS_TASK_HOURS: 'More time than the task needs is already scheduled',
};

const reason = (code, message = REASONS[code]) => ({ code, message });

/** Static checks that need only the context, not other sessions. */
function checkStatic(s, ctx, { maxDuration }) {
  const reasons = [];
  const task = ctx.taskMap.get(String(s.taskId));
  if (!task) reasons.push(reason('UNKNOWN_TASK'));

  if (!isValidDateStr(s.date)) {
    reasons.push(reason('INVALID_DATE'));
    return { reasons };
  }
  if (!isValidTime(s.startTime) || !isValidTime(s.endTime) || s.startTime === '24:00') {
    reasons.push(reason('INVALID_TIME'));
    return { reasons };
  }
  const startMin = toMinutes(s.startTime);
  const endMin = toMinutes(s.endTime);
  const duration = endMin - startMin;
  if (duration < SLOT_STEP || duration > maxDuration) {
    reasons.push(reason('INVALID_DURATION', duration <= 0 ? 'End time must be after start time' : `Sessions must be between ${SLOT_STEP} and ${maxDuration} minutes`));
  }

  const day = ctx.dayMap.get(s.date);
  if (!day) reasons.push(reason('DAY_UNAVAILABLE'));
  else if (startMin < day.startMin || endMin > day.endMin) {
    const msg = s.date === ctx.today && startMin < day.startMin && startMin >= toMinutes(ctx.availability.startTime)
      ? 'Session starts in the past'
      : `Session must be between ${prettyTime(day.startMin)} and ${prettyTime(day.endMin)} on ${prettyDate(s.date)}`;
    reasons.push(reason('OUTSIDE_AVAILABILITY', msg));
  }

  if (task) {
    const latest = latestEndOn(task, s.date);
    if (endMin > latest) {
      reasons.push(reason('AFTER_DEADLINE', `"${task.title}" is due ${prettyDate(task.dueLocal.date)} at ${prettyTime(task.dueLocal.minutes)}`));
    }
  }
  return { reasons, task, startMin, endMin, duration };
}

const overlaps = (a, b) => a.date === b.date && a.startMin < b.endMin && b.startMin < a.endMin;

/** Converts an accepted proposal into the normalised session shape used everywhere. */
function normalise(s, task, startMin, endMin, source) {
  return {
    taskId: task.id,
    taskTitle: task.title,
    course: task.course,
    date: s.date,
    startTime: fromMinutes(startMin),
    endTime: fromMinutes(endMin),
    startMin,
    endMin,
    duration: endMin - startMin,
    priority: task.priority,
    focus: typeof s.focus === 'string' ? s.focus.slice(0, 160) : '',
    explanation: typeof s.explanation === 'string' ? s.explanation.slice(0, 500) : '',
    source,
  };
}

/**
 * Validate a batch of proposed sessions (e.g. from Gemini).
 * Over-long sessions are trimmed to the maximum session length, and sessions
 * that would exceed a task's estimate are trimmed to what is left; everything
 * else that breaks a rule is dropped with reasons.
 *
 * @returns {{ accepted: object[], rejected: {session: object, reasons: {code,message}[]}[], adjusted: number }}
 */
export function validateSessions(proposals, ctx, { existing = [], source = 'ai' } = {}) {
  const rejected = [];
  const candidates = [];
  let adjusted = 0;
  const maxDuration = ctx.settings.maxSessionMinutes;

  for (const raw of Array.isArray(proposals) ? proposals : []) {
    const s = { ...raw, taskId: raw?.taskId != null ? String(raw.taskId) : '' };
    // Fix: trim over-long sessions instead of discarding them.
    if (isValidTime(s.startTime) && isValidTime(s.endTime) && toMinutes(s.endTime) - toMinutes(s.startTime) > maxDuration) {
      s.endTime = fromMinutes(toMinutes(s.startTime) + maxDuration);
      adjusted += 1;
    }
    const { reasons, task, startMin, endMin } = checkStatic(s, ctx, { maxDuration });
    if (reasons.length) rejected.push({ session: raw, reasons });
    else candidates.push(normalise(s, task, startMin, endMin, source));
  }

  candidates.sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);

  const placed = existing.map((e) => ({ ...e, startMin: e.startMin ?? toMinutes(e.startTime), endMin: e.endMin ?? toMinutes(e.endTime) }));
  const dayTotals = new Map();
  const taskTotals = new Map();
  for (const e of placed) {
    dayTotals.set(e.date, (dayTotals.get(e.date) || 0) + (e.endMin - e.startMin));
    taskTotals.set(String(e.taskId), (taskTotals.get(String(e.taskId)) || 0) + (e.endMin - e.startMin));
  }

  const accepted = [];
  for (const c of candidates) {
    if (placed.some((p) => overlaps(p, c))) {
      rejected.push({ session: c, reasons: [reason('OVERLAP')] });
      continue;
    }
    const dayUsed = dayTotals.get(c.date) || 0;
    if (dayUsed + c.duration > ctx.settings.maxDailyMinutes) {
      rejected.push({ session: c, reasons: [reason('DAILY_LIMIT_EXCEEDED')] });
      continue;
    }
    const task = ctx.taskMap.get(c.taskId);
    const taskLeft = task.remainingMinutes - (taskTotals.get(c.taskId) || 0);
    if (taskLeft < SLOT_STEP) {
      rejected.push({ session: c, reasons: [reason('EXCEEDS_TASK_HOURS')] });
      continue;
    }
    if (c.duration > taskLeft) {
      c.endMin = c.startMin + taskLeft;
      c.endTime = fromMinutes(c.endMin);
      c.duration = taskLeft;
      adjusted += 1;
    }
    accepted.push(c);
    placed.push(c);
    dayTotals.set(c.date, dayUsed + c.duration);
    taskTotals.set(c.taskId, (taskTotals.get(c.taskId) || 0) + c.duration);
  }

  return { accepted, rejected, adjusted };
}

/**
 * Strict validation of a single manually edited session against the other
 * sessions in the plan (no automatic fixing).
 * @returns {{code,message}[]} reasons; empty array means valid.
 */
export function validateSessionEdit(edit, ctx, others = []) {
  const { reasons, startMin, endMin, duration } = checkStatic(edit, ctx, { maxDuration: MAX_EDIT_SESSION_MINUTES });
  if (reasons.length) return reasons;
  const me = { date: edit.date, startMin, endMin };
  const out = [];
  const clash = others.find((o) => overlaps({ ...o, startMin: toMinutes(o.startTime), endMin: toMinutes(o.endTime) }, me));
  if (clash) out.push(reason('OVERLAP', `Overlaps "${clash.taskTitle}" (${clash.startTime}–${clash.endTime})`));
  const dayUsed = others.filter((o) => o.date === edit.date).reduce((sum, o) => sum + o.duration, 0);
  if (dayUsed + duration > ctx.settings.maxDailyMinutes) {
    out.push(reason('DAILY_LIMIT_EXCEEDED', `This would put ${prettyDate(edit.date)} at ${((dayUsed + duration) / 60).toFixed(2).replace(/\.?0+$/, '')}h — your daily limit is ${ctx.settings.maxDailyMinutes / 60}h`));
  }
  return out;
}
