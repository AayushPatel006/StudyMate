export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const TASK_TYPES = ['Assignment', 'Exam', 'Quiz', 'Project', 'Reading', 'Other'];
export const PRIORITIES = ['High', 'Medium', 'Low'];
export const STATUSES = ['Pending', 'In Progress', 'Completed'];

/** Local YYYY-MM-DD for a Date. */
export function localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse a YYYY-MM-DD string as a local date (midnight). */
export const parseDateStr = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export function addDaysStr(s, n) {
  const d = parseDateStr(s);
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}

export const toMinutes = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

export const fromMinutes = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** "18:30" -> "6:30 PM" */
export function formatTime(t) {
  const min = typeof t === 'number' ? t : toMinutes(t);
  const h24 = Math.floor(min / 60) % 24;
  const m = min % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h24 >= 12 ? 'PM' : 'AM'}`;
}

export function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export const formatHours = (h) => `${Math.round(h * 100) / 100}h`;

export function formatDateLabel(s, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
  return parseDateStr(s).toLocaleDateString(undefined, opts);
}

export function formatDue(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Relative deadline description + urgency level. */
export function dueInfo(iso, now = new Date()) {
  const due = new Date(iso);
  const ms = due - now;
  const hours = ms / 3600000;
  const days = Math.round((parseDateStr(localDateStr(due)) - parseDateStr(localDateStr(now))) / 86400000);
  let label;
  let level;
  if (ms < 0) {
    label = days === 0 ? 'Overdue today' : `Overdue by ${Math.abs(days)}d`;
    level = 'overdue';
  } else if (hours < 24 && days === 0) {
    label = hours < 1 ? 'Due within the hour' : `Due today, ${due.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
    level = 'urgent';
  } else if (days === 1) {
    label = 'Due tomorrow';
    level = 'urgent';
  } else if (days <= 3) {
    label = `Due in ${days} days`;
    level = 'soon';
  } else {
    label = `Due in ${days} days`;
    level = 'later';
  }
  return { label, level, days };
}

/** ISO -> value for <input type="datetime-local"> */
export function toDateTimeLocal(iso) {
  const d = new Date(iso);
  return `${localDateStr(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export const PRIORITY_STYLES = {
  High: { dot: 'bg-rose-500', badge: 'bg-rose-50 text-rose-700 ring-rose-600/15', block: 'bg-rose-50 border-rose-200 hover:border-rose-300', bar: 'bg-rose-500', text: 'text-rose-700' },
  Medium: { dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700 ring-amber-600/20', block: 'bg-amber-50 border-amber-200 hover:border-amber-300', bar: 'bg-amber-500', text: 'text-amber-700' },
  Low: { dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', block: 'bg-emerald-50 border-emerald-200 hover:border-emerald-300', bar: 'bg-emerald-500', text: 'text-emerald-700' },
};

export const STATUS_STYLES = {
  Pending: 'bg-slate-100 text-slate-700 ring-slate-500/15',
  'In Progress': 'bg-sky-50 text-sky-700 ring-sky-600/20',
  Completed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
};
