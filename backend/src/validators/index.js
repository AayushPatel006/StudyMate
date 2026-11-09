import { TASK_TYPES, PRIORITIES, TASK_STATUSES } from '../models/Task.js';
import { isValidTime, toMinutes, isValidDateStr } from '../utils/time.js';
import { badRequest } from '../utils/httpError.js';

const str = (v) => (typeof v === 'string' ? v.trim() : v);

/**
 * Validate and normalise task input. Returns a clean object or throws 400 with
 * per-field errors. `partial` allows PATCH-style updates.
 */
export function validateTaskInput(body = {}, { partial = false, now = new Date() } = {}) {
  const errors = {};
  const out = {};
  const has = (k) => body[k] !== undefined;

  if (!partial || has('title')) {
    const v = str(body.title);
    if (!v) errors.title = 'Title is required';
    else if (v.length > 120) errors.title = 'Title must be 120 characters or fewer';
    else out.title = v;
  }
  if (!partial || has('course')) {
    const v = str(body.course);
    if (!v) errors.course = 'Course is required';
    else if (v.length > 80) errors.course = 'Course must be 80 characters or fewer';
    else out.course = v;
  }
  if (has('description')) {
    const v = str(body.description) ?? '';
    if (typeof v !== 'string') errors.description = 'Description must be text';
    else if (v.length > 2000) errors.description = 'Description must be 2000 characters or fewer';
    else out.description = v;
  }
  if (!partial || has('type')) {
    const v = body.type ?? 'Assignment';
    if (!TASK_TYPES.includes(v)) errors.type = `Type must be one of: ${TASK_TYPES.join(', ')}`;
    else out.type = v;
  }
  if (!partial || has('priority')) {
    const v = body.priority ?? 'Medium';
    if (!PRIORITIES.includes(v)) errors.priority = `Priority must be one of: ${PRIORITIES.join(', ')}`;
    else out.priority = v;
  }
  if (!partial || has('status')) {
    const v = body.status ?? 'Pending';
    if (!TASK_STATUSES.includes(v)) errors.status = `Status must be one of: ${TASK_STATUSES.join(', ')}`;
    else out.status = v;
  }
  if (!partial || has('estimatedHours')) {
    const v = Number(body.estimatedHours);
    if (body.estimatedHours === '' || body.estimatedHours === null || !Number.isFinite(v)) errors.estimatedHours = 'Estimated hours is required';
    else if (v < 0.25 || v > 200) errors.estimatedHours = 'Estimated hours must be between 0.25 and 200';
    else out.estimatedHours = Math.round(v * 4) / 4; // quarter-hour precision
  }
  if (!partial || has('dueDate')) {
    const d = body.dueDate ? new Date(body.dueDate) : null;
    if (!d || Number.isNaN(d.getTime())) errors.dueDate = 'A valid due date is required';
    else if (!partial && d.getTime() < now.getTime()) errors.dueDate = 'Due date cannot be in the past';
    else out.dueDate = d;
  }

  if (Object.keys(errors).length) throw badRequest('Please fix the highlighted fields', errors);
  return out;
}

export function validateAvailabilityInput(body = {}) {
  const errors = {};
  const out = {};

  const days = body.availableDays;
  if (!Array.isArray(days) || days.length === 0) errors.availableDays = 'Select at least one study day';
  else if (!days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) errors.availableDays = 'Invalid weekday';
  else out.availableDays = [...new Set(days)].sort((a, b) => a - b);

  const { preferredStartTime: s, preferredEndTime: e } = body;
  if (!isValidTime(s) || s === '24:00') errors.preferredStartTime = 'Use a valid start time (HH:MM)';
  if (!isValidTime(e)) errors.preferredEndTime = 'Use a valid end time (HH:MM)';
  let windowMinutes = 0;
  if (!errors.preferredStartTime && !errors.preferredEndTime) {
    windowMinutes = toMinutes(e) - toMinutes(s);
    if (windowMinutes <= 0) errors.preferredEndTime = 'End time must be after start time';
    else if (windowMinutes < 30) errors.preferredEndTime = 'Your study window must be at least 30 minutes';
    else {
      out.preferredStartTime = s;
      out.preferredEndTime = e;
    }
  }

  const max = Number(body.maxStudyHoursPerDay);
  if (!Number.isFinite(max) || max < 0.5 || max > 16) errors.maxStudyHoursPerDay = 'Daily limit must be between 0.5 and 16 hours';
  else if (windowMinutes > 0 && max * 60 > windowMinutes)
    errors.maxStudyHoursPerDay = `Daily limit can't exceed your study window (${Math.round((windowMinutes / 60) * 100) / 100}h)`;
  else out.maxStudyHoursPerDay = Math.round(max * 4) / 4;

  if (body.maxSessionMinutes !== undefined) {
    const v = Number(body.maxSessionMinutes);
    if (!Number.isInteger(v) || v < 30 || v > 240) errors.maxSessionMinutes = 'Session length must be 30–240 minutes';
    else out.maxSessionMinutes = v;
  }
  if (body.breakMinutes !== undefined) {
    const v = Number(body.breakMinutes);
    if (!Number.isInteger(v) || v < 0 || v > 60) errors.breakMinutes = 'Break must be 0–60 minutes';
    else out.breakMinutes = v;
  }

  if (Object.keys(errors).length) throw badRequest('Please fix your availability settings', errors);
  return out;
}

export function validateSessionEditInput(body = {}) {
  const errors = {};
  if (!isValidDateStr(body.date)) errors.date = 'Use a valid date';
  if (!isValidTime(body.startTime) || body.startTime === '24:00') errors.startTime = 'Use a valid start time';
  if (!isValidTime(body.endTime)) errors.endTime = 'Use a valid end time';
  if (!errors.startTime && !errors.endTime && toMinutes(body.endTime) <= toMinutes(body.startTime))
    errors.endTime = 'End time must be after start time';
  if (body.explanation !== undefined && (typeof body.explanation !== 'string' || body.explanation.length > 500))
    errors.explanation = 'Note must be 500 characters or fewer';
  if (Object.keys(errors).length) throw badRequest('Please fix the session details', errors);
  const out = { date: body.date, startTime: body.startTime, endTime: body.endTime };
  if (body.explanation !== undefined) out.explanation = body.explanation.trim();
  return out;
}

export function validateAuthInput(body = {}, { register = false } = {}) {
  const errors = {};
  const email = str(body.email)?.toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address';
  if (typeof body.password !== 'string' || body.password.length < (register ? 8 : 1))
    errors.password = register ? 'Password must be at least 8 characters' : 'Password is required';
  else if (body.password.length > 128) errors.password = 'Password is too long';
  let name;
  if (register) {
    name = str(body.name);
    if (!name) errors.name = 'Name is required';
    else if (name.length > 80) errors.name = 'Name must be 80 characters or fewer';
  }
  if (Object.keys(errors).length) throw badRequest('Please check your details', errors);
  return { email, password: body.password, name };
}
