import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Coffee, Hourglass, Info, CalendarRange } from 'lucide-react';
import { Button, Card, Field, PageHeader, PageLoader, cx } from '../components/ui/index.jsx';
import { api, errorMessage, fieldErrors } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { WEEKDAYS_SHORT, WEEKDAYS, toMinutes, formatTime, formatHours } from '../utils/format.js';

const ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon → Sun

export default function AvailabilityPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [configured, setConfigured] = useState(false);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    api
      .get('/availability')
      .then((r) => {
        const a = r.data.availability;
        setConfigured(a.configured);
        setForm({
          availableDays: a.availableDays,
          preferredStartTime: a.preferredStartTime,
          preferredEndTime: a.preferredEndTime,
          maxStudyHoursPerDay: a.maxStudyHoursPerDay,
          maxSessionMinutes: a.maxSessionMinutes,
          breakMinutes: a.breakMinutes,
        });
      })
      .catch((err) => toast.error('Could not load availability', errorMessage(err)));
  }, [toast]);

  const update = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
  };

  // Client-side checks mirror the backend validation for instant feedback.
  const clientErrors = useMemo(() => {
    if (!form) return {};
    const e = {};
    if (!form.availableDays.length) e.availableDays = 'Select at least one study day';
    const windowMin = toMinutes(form.preferredEndTime || '00:00') - toMinutes(form.preferredStartTime || '00:00');
    if (!form.preferredStartTime || !form.preferredEndTime) e.preferredEndTime = 'Set both a start and an end time';
    else if (windowMin <= 0) e.preferredEndTime = 'End time must be after start time';
    else if (windowMin < 30) e.preferredEndTime = 'Your study window must be at least 30 minutes';
    const max = Number(form.maxStudyHoursPerDay);
    if (!max || max < 0.5 || max > 16) e.maxStudyHoursPerDay = 'Daily limit must be between 0.5 and 16 hours';
    else if (windowMin > 0 && max * 60 > windowMin) e.maxStudyHoursPerDay = `Can't exceed your study window (${formatHours(windowMin / 60)})`;
    return e;
  }, [form]);

  const shownErrors = { ...errors, ...clientErrors };

  async function save() {
    if (Object.keys(clientErrors).length) return;
    setSaving(true);
    setErrors({});
    try {
      await api.put('/availability', { ...form, maxStudyHoursPerDay: Number(form.maxStudyHoursPerDay) });
      setConfigured(true);
      setDirty(false);
      toast.success('Availability saved', 'Regenerate your study plan to apply the new hours.');
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error('Could not save availability', errorMessage(err));
    }
    setSaving(false);
  }

  if (!form) return <PageLoader />;

  const windowMin = Math.max(0, toMinutes(form.preferredEndTime || '00:00') - toMinutes(form.preferredStartTime || '00:00'));
  const perDay = Math.min(windowMin / 60, Number(form.maxStudyHoursPerDay) || 0);
  const weekly = perDay * form.availableDays.length;

  const toggleDay = (d) => update({ availableDays: form.availableDays.includes(d) ? form.availableDays.filter((x) => x !== d) : [...form.availableDays, d].sort() });

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Availability"
        description="Tell StudyMate when you can study. The planner only schedules sessions inside these hours."
        actions={
          <>
            {configured && !dirty && (
              <Button variant="secondary" onClick={() => navigate('/planner')}>
                Go to planner
              </Button>
            )}
            <Button onClick={save} loading={saving} disabled={!dirty && configured}>
              {configured ? 'Save changes' : 'Save availability'}
            </Button>
          </>
        }
      />

      {!configured && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
          <Info className="mt-0.5 size-4 shrink-0" />
          These are suggested defaults. Adjust them and click <strong className="font-semibold">Save availability</strong> — you need saved availability before generating a plan.
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <Card className="p-5 sm:p-6">
            <h2 className="flex items-center gap-2 font-semibold text-slate-900">
              <CalendarRange className="size-4 text-brand-500" /> Study days
            </h2>
            <p className="mt-1 text-sm text-slate-500">Which days of the week can you study?</p>
            <div className="mt-4 grid grid-cols-7 gap-1.5 sm:gap-2">
              {ORDER.map((d) => {
                const on = form.availableDays.includes(d);
                return (
                  <button
                    key={d}
                    onClick={() => toggleDay(d)}
                    aria-pressed={on}
                    aria-label={WEEKDAYS[d]}
                    className={cx(
                      'flex h-14 flex-col items-center justify-center rounded-xl border text-sm font-semibold transition sm:h-16',
                      on ? 'border-brand-500 bg-brand-500 text-white shadow-[0_4px_14px_-4px_rgb(99_102_241/0.6)]' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'
                    )}
                  >
                    {WEEKDAYS_SHORT[d]}
                    <span className={cx('mt-1 size-1.5 rounded-full', on ? 'bg-white/80' : 'bg-slate-200')} />
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex gap-2 text-xs">
              <button className="font-medium text-brand-600 hover:underline" onClick={() => update({ availableDays: [1, 2, 3, 4, 5] })}>Weekdays</button>
              <span className="text-slate-300">·</span>
              <button className="font-medium text-brand-600 hover:underline" onClick={() => update({ availableDays: [0, 1, 2, 3, 4, 5, 6] })}>Every day</button>
              <span className="text-slate-300">·</span>
              <button className="font-medium text-brand-600 hover:underline" onClick={() => update({ availableDays: [0, 6] })}>Weekends</button>
            </div>
            {shownErrors.availableDays && <p className="mt-2 text-xs font-medium text-rose-600">{shownErrors.availableDays}</p>}
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className="flex items-center gap-2 font-semibold text-slate-900">
              <Clock className="size-4 text-brand-500" /> Study hours
            </h2>
            <p className="mt-1 text-sm text-slate-500">Your preferred study window on each available day.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label="Start time" htmlFor="a-start" error={shownErrors.preferredStartTime}>
                <input id="a-start" type="time" step="900" className={cx('input', shownErrors.preferredStartTime && 'input-error')} value={form.preferredStartTime} onChange={(e) => update({ preferredStartTime: e.target.value })} />
              </Field>
              <Field label="End time" htmlFor="a-end" error={shownErrors.preferredEndTime}>
                <input id="a-end" type="time" step="900" className={cx('input', shownErrors.preferredEndTime && 'input-error')} value={form.preferredEndTime} onChange={(e) => update({ preferredEndTime: e.target.value })} />
              </Field>
              <Field label="Max hours per day" htmlFor="a-max" error={shownErrors.maxStudyHoursPerDay}>
                <input id="a-max" type="number" min="0.5" max="16" step="0.5" className={cx('input', shownErrors.maxStudyHoursPerDay && 'input-error')} value={form.maxStudyHoursPerDay} onChange={(e) => update({ maxStudyHoursPerDay: e.target.value })} />
              </Field>
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className="flex items-center gap-2 font-semibold text-slate-900">
              <Hourglass className="size-4 text-brand-500" /> Session preferences
            </h2>
            <p className="mt-1 text-sm text-slate-500">How long a single focus session can be, and how much rest you want between sessions.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Longest session" htmlFor="a-sess">
                <select id="a-sess" className="input" value={form.maxSessionMinutes} onChange={(e) => update({ maxSessionMinutes: Number(e.target.value) })}>
                  {[30, 45, 60, 75, 90, 120, 150, 180].map((m) => (
                    <option key={m} value={m}>{m < 60 ? `${m} minutes` : `${m / 60} hour${m === 60 ? '' : 's'}`}</option>
                  ))}
                </select>
              </Field>
              <Field label="Break between sessions" htmlFor="a-break">
                <select id="a-break" className="input" value={form.breakMinutes} onChange={(e) => update({ breakMinutes: Number(e.target.value) })}>
                  {[0, 5, 10, 15, 20, 30, 45, 60].map((m) => (
                    <option key={m} value={m}>{m === 0 ? 'No break' : `${m} minutes`}</option>
                  ))}
                </select>
              </Field>
            </div>
          </Card>
        </div>

        {/* Summary */}
        <div className="lg:sticky lg:top-8 lg:self-start">
          <Card className="overflow-hidden">
            <div className="ai-gradient px-5 py-4 text-white">
              <p className="text-xs font-medium text-white/80">Weekly study capacity</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">{formatHours(weekly)}</p>
              <p className="text-xs text-white/80">
                {form.availableDays.length} day{form.availableDays.length === 1 ? '' : 's'} × up to {formatHours(perDay)}
              </p>
            </div>
            <div className="space-y-2.5 p-5">
              {ORDER.map((d) => {
                const on = form.availableDays.includes(d);
                return (
                  <div key={d} className="flex items-center gap-3 text-sm">
                    <span className={cx('w-9 font-medium', on ? 'text-slate-700' : 'text-slate-400')}>{WEEKDAYS_SHORT[d]}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      {on && windowMin > 0 && <div className="h-full rounded-full bg-brand-400" style={{ width: `${Math.min(100, (perDay / 8) * 100)}%` }} />}
                    </div>
                    <span className="w-24 text-right text-xs text-slate-500">
                      {on && windowMin > 0 ? `${formatTime(form.preferredStartTime)}–${formatTime(form.preferredEndTime)}` : 'Off'}
                    </span>
                  </div>
                );
              })}
              <div className="mt-4 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
                <Coffee className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
                Sessions up to {form.maxSessionMinutes} min with {form.breakMinutes ? `${form.breakMinutes}-min breaks` : 'no breaks'} between them.
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
