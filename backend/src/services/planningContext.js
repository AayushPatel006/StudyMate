import { addDays, toLocal, toMinutes, weekdayOf, roundUpTo, WEEKDAYS } from '../utils/time.js';

export const PLANNING_HORIZON_DAYS = 7;
export const MIN_SESSION_MINUTES = 30;
export const SLOT_STEP = 15;
export const MAX_EDIT_SESSION_MINUTES = 240;

/**
 * Builds the provider-independent planning context shared by the Gemini agent,
 * the fallback scheduler and the validator.
 *
 * @param {object} p
 * @param {Array}  p.tasks         Task documents (plain objects)
 * @param {object} p.availability  Availability settings
 * @param {Date}   p.now
 * @param {number} p.tzOffset      Browser timezone offset in minutes (UTC - local)
 */
export function buildPlanningContext({ tasks, availability, now = new Date(), tzOffset = 0, horizonDays = PLANNING_HORIZON_DAYS }) {
  const nowLocal = toLocal(now, tzOffset);
  const today = nowLocal.date;
  const windowEnd = addDays(today, horizonDays - 1);

  const availStart = toMinutes(availability.preferredStartTime);
  const availEnd = toMinutes(availability.preferredEndTime);
  const maxDailyMinutes = Math.round(availability.maxStudyHoursPerDay * 60);
  const settings = {
    maxDailyMinutes,
    maxSessionMinutes: availability.maxSessionMinutes ?? 90,
    breakMinutes: availability.breakMinutes ?? 15,
    minSessionMinutes: MIN_SESSION_MINUTES,
  };

  const days = [];
  for (let i = 0; i < horizonDays; i += 1) {
    const date = addDays(today, i);
    const weekday = weekdayOf(date);
    if (!availability.availableDays.includes(weekday)) continue;
    let startMin = availStart;
    if (i === 0) startMin = Math.max(availStart, roundUpTo(nowLocal.minutes + 1, SLOT_STEP));
    if (availEnd - startMin < SLOT_STEP) continue; // nothing usable left today
    days.push({ date, weekday, weekdayName: WEEKDAYS[weekday], startMin, endMin: availEnd, capacityMin: maxDailyMinutes });
  }

  const active = [];
  const excluded = [];
  for (const t of tasks) {
    if (t.status === 'Completed') continue;
    const due = new Date(t.dueDate);
    const entry = {
      id: t._id.toString(),
      title: t.title,
      course: t.course,
      type: t.type,
      priority: t.priority,
      status: t.status,
      description: t.description || '',
      dueDate: due,
      dueLocal: toLocal(due, tzOffset),
      estimatedHours: t.estimatedHours,
      remainingMinutes: roundUpTo(Math.round(t.estimatedHours * 60), SLOT_STEP),
    };
    if (due.getTime() <= now.getTime()) excluded.push({ task: entry, reason: 'OVERDUE' });
    else active.push(entry);
  }

  return {
    now,
    tzOffset,
    today,
    nowMinutes: nowLocal.minutes,
    window: { start: today, end: windowEnd },
    days,
    dayMap: new Map(days.map((d) => [d.date, d])),
    tasks: active,
    taskMap: new Map(active.map((t) => [t.id, t])),
    excluded,
    settings,
    availability: {
      availableDays: availability.availableDays,
      startTime: availability.preferredStartTime,
      endTime: availability.preferredEndTime,
    },
  };
}

/** Latest minute-of-day a session for `task` may END on `date` (or -1 if the deadline has passed). */
export function latestEndOn(task, date) {
  if (task.dueLocal.date > date) return 24 * 60;
  if (task.dueLocal.date === date) return task.dueLocal.minutes;
  return -1;
}

const PRIORITY_BOOST_MIN = { High: 36 * 60, Medium: 12 * 60, Low: 0 };

/**
 * Deterministic urgency ordering: earliest "effective deadline" first, where
 * higher-priority work is treated as due a little earlier.
 */
export function urgencyKey(task) {
  return task.dueDate.getTime() - PRIORITY_BOOST_MIN[task.priority] * 60000;
}

export function rankTasks(tasks) {
  return [...tasks].sort((a, b) => urgencyKey(a) - urgencyKey(b) || b.remainingMinutes - a.remainingMinutes);
}
