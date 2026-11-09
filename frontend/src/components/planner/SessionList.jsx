import { Pencil, Sparkles, Cpu } from 'lucide-react';
import { PriorityBadge, cx } from '../ui/index.jsx';
import { PRIORITY_STYLES, addDaysStr, formatDateLabel, formatDuration, formatTime, localDateStr } from '../../utils/format.js';

export default function SessionList({ windowStart, sessions, onSelect }) {
  const days = Array.from({ length: 7 }, (_, i) => addDaysStr(windowStart, i));
  const today = localDateStr();
  return (
    <div className="divide-y divide-slate-100">
      {days.map((d) => {
        const items = sessions.filter((s) => s.date === d);
        const total = items.reduce((a, s) => a + s.duration, 0);
        return (
          <section key={d} className="px-4 py-4 sm:px-5">
            <div className="mb-2.5 flex items-baseline justify-between">
              <h3 className={cx('text-sm font-semibold', d === today ? 'text-brand-700' : 'text-slate-800')}>
                {formatDateLabel(d, { weekday: 'long', month: 'short', day: 'numeric' })}
                {d === today && <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-medium text-brand-700">Today</span>}
              </h3>
              <span className="text-xs text-slate-400">{items.length ? `${items.length} session${items.length === 1 ? '' : 's'} · ${formatDuration(total)}` : 'Free'}</span>
            </div>
            {items.length === 0 ? (
              <p className="text-sm text-slate-400">No study sessions planned.</p>
            ) : (
              <ul className="space-y-2">
                {items.map((s) => (
                  <li key={s._id}>
                    <button onClick={() => onSelect(s)} className="group flex w-full items-start gap-3 rounded-xl border border-slate-200/80 bg-white p-3 text-left transition hover:border-slate-300 hover:shadow-soft">
                      <span className={cx('mt-0.5 h-10 w-1 shrink-0 rounded-full', PRIORITY_STYLES[s.priority]?.bar)} />
                      <div className="w-[72px] shrink-0 sm:w-24">
                        <p className="text-sm font-semibold text-slate-800">{formatTime(s.startTime)}</p>
                        <p className="text-xs text-slate-500">
                          {formatTime(s.endTime)} · {formatDuration(s.duration)}
                        </p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium text-slate-900">{s.taskTitle}</p>
                          <PriorityBadge priority={s.priority} />
                        </div>
                        <p className="text-xs text-slate-500">
                          {s.course}
                          {s.focus && <> · <span className="text-slate-700">{s.focus}</span></>}
                        </p>
                        {s.explanation && (
                          <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-slate-500">
                            {s.source === 'ai' ? <Sparkles className="mt-0.5 size-3 shrink-0 text-violet-500" /> : <Cpu className="mt-0.5 size-3 shrink-0 text-slate-400" />}
                            {s.explanation}
                          </p>
                        )}
                      </div>
                      <Pencil className="mt-1 size-4 shrink-0 text-slate-300 transition group-hover:text-slate-500" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
