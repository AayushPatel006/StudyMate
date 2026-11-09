/**
 * Time helpers. Study sessions are stored as *local wall-clock* values
 * (date "YYYY-MM-DD", times "HH:MM") so they never shift when rendered.
 * Converting between wall-clock and real instants uses the browser's
 * timezone offset (minutes, same sign convention as Date#getTimezoneOffset:
 * UTC - local, e.g. New York EST = 300).
 */

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidTime(str) {
  return typeof str === 'string' && (TIME_RE.test(str) || str === '24:00');
}

export function isValidDateStr(str) {
  if (typeof str !== 'string' || !DATE_RE.test(str)) return false;
  const d = new Date(`${str}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === str;
}

/** "18:30" -> 1110 */
export function toMinutes(str) {
  if (str === '24:00') return 1440;
  const m = TIME_RE.exec(str);
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 1110 -> "18:30" */
export function fromMinutes(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday ... 6 = Saturday */
export function weekdayOf(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

/** Local wall clock (date + minutes) -> real Date instant. */
export function toInstant(dateStr, minutes, tzOffset = 0) {
  const base = Date.parse(`${dateStr}T00:00:00Z`);
  return new Date(base + minutes * 60000 + tzOffset * 60000);
}

/** Real Date instant -> local wall clock { date, minutes }. */
export function toLocal(instant, tzOffset = 0) {
  const shifted = new Date(new Date(instant).getTime() - tzOffset * 60000);
  const date = shifted.toISOString().slice(0, 10);
  const minutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
  return { date, minutes };
}

export const roundUpTo = (min, step = 15) => Math.ceil(min / step) * step;
export const roundDownTo = (min, step = 15) => Math.floor(min / step) * step;

/** "Fri, Nov 13" from a YYYY-MM-DD string. */
export function prettyDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** "6:30 PM" from minutes. */
export function prettyTime(min) {
  const h24 = Math.floor(min / 60) % 24;
  const m = min % 60;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function clampTzOffset(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || Math.abs(n) > 14 * 60) return 0;
  return Math.round(n);
}
