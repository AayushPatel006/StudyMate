import { useEffect, useState } from 'react';
import { Sparkles, Cpu, Trash2, TriangleAlert, Target } from 'lucide-react';
import { Button, Field, Modal, PriorityBadge, cx } from '../ui/index.jsx';
import { api, errorMessage } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import { addDaysStr, formatDateLabel, formatDuration, localDateStr, toMinutes } from '../../utils/format.js';

export default function SessionModal({ session, onClose, onChanged }) {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (session) {
      setForm({ date: session.date, startTime: session.startTime, endTime: session.endTime });
      setError('');
      setConfirmDelete(false);
    }
  }, [session]);

  if (!session || !form) return null;

  // Sessions can be moved anywhere in the next 7 days (the planning window).
  const today = localDateStr();
  const dateOptions = Array.from({ length: 7 }, (_, i) => addDaysStr(today, i));
  if (!dateOptions.includes(session.date)) dateOptions.unshift(session.date);

  const duration = toMinutes(form.endTime || '00:00') - toMinutes(form.startTime || '00:00');
  const changed = form.date !== session.date || form.startTime !== session.startTime || form.endTime !== session.endTime;

  async function save() {
    if (duration <= 0) return setError('End time must be after start time.');
    setSaving(true);
    setError('');
    try {
      await api.patch(`/sessions/${session._id}`, form);
      toast.success('Session updated');
      onChanged();
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Could not update session'));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      await api.delete(`/sessions/${session._id}`);
      toast.success('Session removed from your plan');
      onChanged();
      onClose();
    } catch (err) {
      toast.error('Could not delete session', errorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={session.taskTitle}
      description={session.course}
      footer={
        confirmDelete ? (
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">Remove this session from your plan?</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
                Keep it
              </Button>
              <Button variant="danger" onClick={remove} loading={deleting}>
                Delete session
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex w-full items-center justify-between">
            <Button variant="ghost" icon={Trash2} className="text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={save} loading={saving} disabled={!changed}>
                Save changes
              </Button>
            </div>
          </div>
        )
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <PriorityBadge priority={session.priority} />
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {session.source === 'ai' ? <Sparkles className="size-3 text-violet-500" /> : <Cpu className="size-3" />}
            {session.source === 'ai' ? 'Planned by Gemini' : 'Planned by algorithm'}
          </span>
          {session.isManuallyEdited && <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs font-medium text-white">Edited by you</span>}
        </div>

        {(session.focus || session.explanation) && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            {session.focus && (
              <p className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <Target className="size-4 text-brand-500" /> {session.focus}
              </p>
            )}
            {session.explanation && <p className={cx('text-sm leading-relaxed text-slate-600', session.focus && 'mt-1.5')}>{session.explanation}</p>}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Day" htmlFor="s-date" className="sm:col-span-3">
            <select id="s-date" className="input" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}>
              {dateOptions.map((d) => (
                <option key={d} value={d}>
                  {formatDateLabel(d, { weekday: 'long', month: 'short', day: 'numeric' })}
                  {d === today ? ' (today)' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Start" htmlFor="s-start">
            <input id="s-start" type="time" step="300" className="input" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} />
          </Field>
          <Field label="End" htmlFor="s-end">
            <input id="s-end" type="time" step="300" className="input" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} />
          </Field>
          <Field label="Duration">
            <div className="flex h-[38px] items-center rounded-lg border border-dashed border-slate-200 px-3 text-sm text-slate-600">{duration > 0 ? formatDuration(duration) : '—'}</div>
          </Field>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700" role="alert">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            {error}
          </div>
        )}
        <p className="text-xs text-slate-500">Changes are checked against your availability, daily limit, the task deadline and your other sessions.</p>
      </div>
    </Modal>
  );
}
