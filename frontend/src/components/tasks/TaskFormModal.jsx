import { useEffect, useState } from 'react';
import { Button, Field, Modal, cx } from '../ui/index.jsx';
import { api, errorMessage, fieldErrors } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import { PRIORITIES, STATUSES, TASK_TYPES, toDateTimeLocal, localDateStr, addDaysStr, PRIORITY_STYLES } from '../../utils/format.js';

const empty = () => ({
  title: '',
  course: '',
  description: '',
  type: 'Assignment',
  dueDate: `${addDaysStr(localDateStr(), 7)}T23:59`,
  estimatedHours: '',
  priority: 'Medium',
  status: 'Pending',
});

export default function TaskFormModal({ open, onClose, task, courses = [], onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(empty());
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(
      task
        ? { title: task.title, course: task.course, description: task.description || '', type: task.type, dueDate: toDateTimeLocal(task.dueDate), estimatedHours: String(task.estimatedHours), priority: task.priority, status: task.status }
        : empty()
    );
  }, [open, task]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e?.preventDefault();
    const clientErrors = {};
    if (!form.title.trim()) clientErrors.title = 'Title is required';
    if (!form.course.trim()) clientErrors.course = 'Course is required';
    if (!form.dueDate) clientErrors.dueDate = 'Due date is required';
    if (!form.estimatedHours || Number(form.estimatedHours) <= 0) clientErrors.estimatedHours = 'Enter the hours you expect this to take';
    if (Object.keys(clientErrors).length) return setErrors(clientErrors);

    setBusy(true);
    const payload = { ...form, estimatedHours: Number(form.estimatedHours), dueDate: new Date(form.dueDate).toISOString() };
    try {
      const res = task ? await api.patch(`/tasks/${task._id}`, payload) : await api.post('/tasks', payload);
      toast.success(task ? 'Task updated' : 'Task added', task ? undefined : 'Regenerate your plan to include it.');
      onSaved?.(res.data.task);
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(task ? 'Could not update task' : 'Could not add task', errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={task ? 'Edit task' : 'New task'}
      description={task ? undefined : 'Add an assignment, exam or anything you need to study for.'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            {task ? 'Save changes' : 'Add task'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Title" htmlFor="t-title" error={errors.title} className="sm:col-span-2">
          <input id="t-title" className={cx('input', errors.title && 'input-error')} value={form.title} onChange={set('title')} placeholder="e.g. ML Assignment 3" maxLength={120} />
        </Field>
        <Field label="Course" htmlFor="t-course" error={errors.course}>
          <input id="t-course" list="course-list" className={cx('input', errors.course && 'input-error')} value={form.course} onChange={set('course')} placeholder="e.g. CS 535" maxLength={80} />
          <datalist id="course-list">
            {courses.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Type" htmlFor="t-type">
          <select id="t-type" className="input" value={form.type} onChange={set('type')}>
            {TASK_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Due date & time" htmlFor="t-due" error={errors.dueDate}>
          <input id="t-due" type="datetime-local" className={cx('input', errors.dueDate && 'input-error')} value={form.dueDate} onChange={set('dueDate')} />
        </Field>
        <Field label="Estimated hours" htmlFor="t-hours" error={errors.estimatedHours} hint="Total time you expect to need">
          <input id="t-hours" type="number" min="0.25" max="200" step="0.25" className={cx('input', errors.estimatedHours && 'input-error')} value={form.estimatedHours} onChange={set('estimatedHours')} placeholder="4" />
        </Field>
        <Field label="Priority" className="sm:col-span-2">
          <div className="grid grid-cols-3 gap-2">
            {PRIORITIES.map((p) => (
              <button
                type="button"
                key={p}
                onClick={() => setForm((f) => ({ ...f, priority: p }))}
                className={cx(
                  'flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition',
                  form.priority === p ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                )}
                aria-pressed={form.priority === p}
              >
                <span className={cx('size-2 rounded-full', PRIORITY_STYLES[p].dot)} />
                {p}
              </button>
            ))}
          </div>
        </Field>
        {task && (
          <Field label="Status" htmlFor="t-status" className="sm:col-span-2">
            <select id="t-status" className="input" value={form.status} onChange={set('status')}>
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Description" htmlFor="t-desc" error={errors.description} hint="Optional — helps the AI break the work into steps" className="sm:col-span-2">
          <textarea id="t-desc" rows={3} className="input resize-none" value={form.description} onChange={set('description')} placeholder="What does this involve?" maxLength={2000} />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
