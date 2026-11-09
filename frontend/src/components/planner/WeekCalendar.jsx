import { useEffect, useState } from 'react';
import { cx } from '../ui/index.jsx';
import { PRIORITY_STYLES, addDaysStr, formatDateLabel, formatTime, localDateStr, toMinutes, formatDuration, parseDateStr } from '../../utils/format.js';

const HOUR_PX = 60;

export default function WeekCalendar({ windowStart, sessions, availability, onSelect }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const days = Array.from({ length: 7 }, (_, i) => addDaysStr(windowStart, i));
  const today = localDateStr(now);

  const starts = sessions.map((s) => toMinutes(s.startTime));
  const ends = sessions.map((s) => toMinutes(s.endTime));
  if (availability) {
    starts.push(toMinutes(availability.preferredStartTime));
    ends.push(toMinutes(availability.preferredEndTime));
  }
  const startHour = Math.max(0, Math.floor(Math.min(...(starts.length ? starts : [17 * 60])) / 60));
  const endHour = Math.min(24, Math.ceil(Math.max(...(ends.length ? ends : [22 * 60])) / 60));
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const height = hours.length * HOUR_PX;
  const minuteToY = (m) => ((m - startHour * 60) / 60) * HOUR_PX;

  const availStart = availability ? toMinutes(availability.preferredStartTime) : null;
  const availEnd = availability ? toMinutes(availability.preferredEndTime) : null;
  const nowMin = now.getHours() * 60 + now.getMinutes();

  return (
    <div className="scrollbar-thin overflow-x-auto">
      <div className="min-w-[760px]">
        {/* Header */}
        <div className="sticky top-0 z-10 grid grid-cols-[56px_repeat(7,1fr)] border-b border-slate-200 bg-white">
          <div />
          {days.map((d) => {
            const isToday = d === today;
            const dayMinutes = sessions.filter((s) => s.date === d).reduce((a, s) => a + s.duration, 0);
            return (
              <div key={d} className="border-l border-slate-100 px-2 py-2.5 text-center">
                <p className={cx('text-[11px] font-semibold tracking-wider uppercase', isToday ? 'text-brand-600' : 'text-slate-400')}>{formatDateLabel(d, { weekday: 'short' })}</p>
                <p className={cx('mx-auto mt-0.5 flex size-7 items-center justify-center rounded-full text-sm font-semibold', isToday ? 'bg-brand-600 text-white' : 'text-slate-800')}>
                  {parseDateStr(d).getDate()}
                </p>
                <p className="mt-0.5 h-4 text-[11px] text-slate-400">{dayMinutes ? formatDuration(dayMinutes) : ''}</p>
              </div>
            );
          })}
        </div>

        {/* Grid */}
        <div className="relative grid grid-cols-[56px_repeat(7,1fr)]" style={{ height }}>
          <div className="relative">
            {hours.map((h) => (
              <div key={h} className={cx('absolute right-2 text-[11px] text-slate-400', h === startHour ? 'translate-y-0.5' : '-translate-y-1/2')} style={{ top: (h - startHour) * HOUR_PX }}>
                {formatTime(h * 60)}
              </div>
            ))}
          </div>
          {days.map((d) => {
            const daySessions = sessions.filter((s) => s.date === d);
            const isAvailableDay = availability?.availableDays?.includes(parseDateStr(d).getDay());
            return (
              <div key={d} className={cx('relative border-l border-slate-100', d === today && 'bg-brand-50/30')}>
                {hours.map((h) => (
                  <div key={h} className="absolute inset-x-0 border-t border-slate-100" style={{ top: (h - startHour) * HOUR_PX }} />
                ))}
                {/* availability band */}
                {isAvailableDay && availStart != null && (
                  <div
                    className="absolute inset-x-1 rounded-md bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,rgb(99_102_241/0.05)_6px,rgb(99_102_241/0.05)_7px)]"
                    style={{ top: minuteToY(availStart), height: minuteToY(availEnd) - minuteToY(availStart) }}
                    aria-hidden="true"
                  />
                )}
                {d === today && nowMin >= startHour * 60 && nowMin <= endHour * 60 && (
                  <div className="absolute inset-x-0 z-20 flex items-center" style={{ top: minuteToY(nowMin) }}>
                    <span className="-ml-1 size-2 rounded-full bg-rose-500" />
                    <span className="h-px flex-1 bg-rose-500" />
                  </div>
                )}
                {daySessions.map((s) => {
                  const top = minuteToY(toMinutes(s.startTime));
                  const h = Math.max(22, minuteToY(toMinutes(s.endTime)) - top - 2);
                  const st = PRIORITY_STYLES[s.priority] || PRIORITY_STYLES.Medium;
                  return (
                    <button
                      key={s._id}
                      onClick={() => onSelect(s)}
                      className={cx('group absolute inset-x-1 z-10 flex overflow-hidden rounded-lg border text-left shadow-soft transition hover:z-30 hover:shadow-lift', st.block)}
                      style={{ top: top + 1, height: h }}
                      title={`${s.taskTitle} · ${formatTime(s.startTime)}–${formatTime(s.endTime)}`}
                    >
                      <span className={cx('w-1 shrink-0', st.bar)} />
                      <span className="min-w-0 flex-1 px-2 py-1">
                        <span className="block truncate text-xs leading-tight font-semibold text-slate-800">{s.taskTitle}</span>
                        {h > 36 && <span className="block truncate text-[11px] text-slate-500">{formatTime(s.startTime)} – {formatTime(s.endTime)}</span>}
                        {h > 58 && s.focus && <span className="mt-0.5 block truncate text-[11px] text-slate-600">{s.focus}</span>}
                        {h > 76 && <span className="block truncate text-[11px] text-slate-400">{s.course}</span>}
                      </span>
                      {s.isManuallyEdited && <span className="absolute top-1 right-1 size-1.5 rounded-full bg-slate-500" title="Edited by you" />}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
