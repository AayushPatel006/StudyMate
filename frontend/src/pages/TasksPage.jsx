import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, ListTodo, Pencil, Trash2, Search, Clock, BookOpen, FileText, Presentation, ClipboardCheck, GraduationCap, Shapes, Check, X } from 'lucide-react';
import { Button, Card, ConfirmDialog, EmptyState, PageHeader, PageLoader, PriorityBadge, cx } from '../components/ui/index.jsx';
import TaskFormModal from '../components/tasks/TaskFormModal.jsx';
import { api, errorMessage } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { PRIORITIES, STATUSES, STATUS_STYLES, dueInfo, formatDue, formatHours } from '../utils/format.js';

export const TYPE_ICONS = { Assignment: FileText, Exam: GraduationCap, Quiz: ClipboardCheck, Project: Presentation, Reading: BookOpen, Other: Shapes };

const URGENCY = {
  overdue: 'text-rose-600 font-semibold',
  urgent: 'text-rose-600 font-medium',
  soon: 'text-amber-600 font-medium',
  later: 'text-slate-500',
};

function StatusSelect({ task, onChange }) {
  return (
    <select
      value={task.status}
      onChange={(e) => onChange(e.target.value)}
      className={cx('cursor-pointer appearance-none rounded-md border-0 py-0.5 pr-2 pl-2 text-xs font-medium ring-1 ring-inset focus:ring-2 focus:ring-brand-400', STATUS_STYLES[task.status])}
      aria-label={`Status for ${task.title}`}
      onClick={(e) => e.stopPropagation()}
    >
      {STATUSES.map((s) => (
        <option key={s}>{s}</option>
      ))}
    </select>
  );
}

export default function TasksPage() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({ priority: '', status: '', course: '', q: '' });
  const [modal, setModal] = useState({ open: false, task: null });
  const [confirm, setConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = {};
      if (filters.priority) params.priority = filters.priority;
      if (filters.status) params.status = filters.status;
      if (filters.course) params.course = filters.course;
      const res = await api.get('/tasks', { params });
      setData(res.data);
    } catch (err) {
      toast.error('Could not load tasks', errorMessage(err));
      setData((d) => d || { tasks: [], courses: [] });
    }
  }, [filters.priority, filters.status, filters.course, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const tasks = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    if (!data) return [];
    return q ? data.tasks.filter((t) => `${t.title} ${t.course} ${t.description}`.toLowerCase().includes(q)) : data.tasks;
  }, [data, filters.q]);

  async function updateStatus(task, status) {
    setData((d) => ({ ...d, tasks: d.tasks.map((t) => (t._id === task._id ? { ...t, status } : t)) }));
    try {
      await api.patch(`/tasks/${task._id}`, { status });
      toast.success(status === 'Completed' ? 'Nice work! Task completed' : `Marked as ${status}`);
      load();
    } catch (err) {
      toast.error('Could not update status', errorMessage(err));
      load();
    }
  }

  async function doDelete() {
    setDeleting(true);
    try {
      const res = await api.delete(`/tasks/${confirm._id}`);
      toast.success('Task deleted', res.data.deletedSessions ? `${res.data.deletedSessions} planned session(s) removed too.` : undefined);
      setConfirm(null);
      load();
    } catch (err) {
      toast.error('Could not delete task', errorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  const hasFilters = filters.priority || filters.status || filters.course || filters.q;
  const activeCount = data?.tasks.filter((t) => t.status !== 'Completed').length ?? 0;
  const activeHours = data?.tasks.filter((t) => t.status !== 'Completed').reduce((a, t) => a + t.estimatedHours, 0) ?? 0;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="My Tasks"
        description={data ? `${activeCount} active · ${formatHours(activeHours)} of estimated work` : 'Your assignments, exams and projects'}
        actions={
          <Button icon={Plus} onClick={() => setModal({ open: true, task: null })}>
            New task
          </Button>
        }
      />

      {!data ? (
        <PageLoader />
      ) : data.tasks.length === 0 && !hasFilters ? (
        <Card>
          <EmptyState
            icon={ListTodo}
            title="No tasks yet"
            description="Add your assignments, exams and readings with a deadline and an hour estimate — StudyMate turns them into a weekly plan."
            action={
              <Button icon={Plus} onClick={() => setModal({ open: true, task: null })}>
                Add your first task
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/* Filters */}
          <div className="flex flex-col gap-2 border-b border-slate-100 p-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <input className="input pl-9" placeholder="Search tasks…" value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} aria-label="Search tasks" />
            </div>
            <div className="grid grid-cols-3 gap-2 sm:flex">
              <select className="input sm:w-36" value={filters.course} onChange={(e) => setFilters((f) => ({ ...f, course: e.target.value }))} aria-label="Filter by course">
                <option value="">All courses</option>
                {data.courses.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <select className="input sm:w-36" value={filters.priority} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))} aria-label="Filter by priority">
                <option value="">All priorities</option>
                {PRIORITIES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
              <select className="input sm:w-36" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} aria-label="Filter by status">
                <option value="">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            {hasFilters && (
              <Button variant="ghost" size="sm" icon={X} onClick={() => setFilters({ priority: '', status: '', course: '', q: '' })}>
                Clear
              </Button>
            )}
          </div>

          {tasks.length === 0 ? (
            <EmptyState icon={Search} title="No matching tasks" description="Try a different filter or search term." />
          ) : (
            <>
              {/* Desktop table */}
              <table className="hidden w-full text-sm md:table">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
                    <th className="py-2.5 pr-3 pl-5 font-medium">Task</th>
                    <th className="px-3 py-2.5 font-medium">Due</th>
                    <th className="px-3 py-2.5 font-medium">Est.</th>
                    <th className="px-3 py-2.5 font-medium">Priority</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="py-2.5 pr-5 pl-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tasks.map((t) => {
                    const Icon = TYPE_ICONS[t.type] || Shapes;
                    const done = t.status === 'Completed';
                    const due = dueInfo(t.dueDate);
                    return (
                      <tr key={t._id} className={cx('group transition hover:bg-slate-50/70', done && 'opacity-60')}>
                        <td className="py-3 pr-3 pl-5">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => updateStatus(t, done ? 'Pending' : 'Completed')}
                              className={cx('flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition', done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 hover:border-emerald-500')}
                              aria-label={done ? 'Mark as not completed' : 'Mark as completed'}
                              title={done ? 'Mark as not completed' : 'Mark as completed'}
                            >
                              {done && <Check className="size-3" strokeWidth={3} />}
                            </button>
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                              <Icon className="size-4" />
                            </div>
                            <div className="min-w-0">
                              <p className={cx('truncate font-medium text-slate-900', done && 'line-through')}>{t.title}</p>
                              <p className="truncate text-xs text-slate-500">
                                {t.course} · {t.type}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <p className="text-slate-700">{formatDue(t.dueDate)}</p>
                          {!done && <p className={cx('text-xs', URGENCY[due.level])}>{due.label}</p>}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-slate-600">{formatHours(t.estimatedHours)}</td>
                        <td className="px-3 py-3">
                          <PriorityBadge priority={t.priority} />
                        </td>
                        <td className="px-3 py-3">
                          <StatusSelect task={t} onChange={(s) => updateStatus(t, s)} />
                        </td>
                        <td className="py-3 pr-5 pl-3">
                          <div className="flex justify-end gap-1 opacity-60 transition group-hover:opacity-100">
                            <button onClick={() => setModal({ open: true, task: t })} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label={`Edit ${t.title}`}>
                              <Pencil className="size-4" />
                            </button>
                            <button onClick={() => setConfirm(t)} className="rounded-md p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600" aria-label={`Delete ${t.title}`}>
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Mobile cards */}
              <ul className="divide-y divide-slate-100 md:hidden">
                {tasks.map((t) => {
                  const done = t.status === 'Completed';
                  const due = dueInfo(t.dueDate);
                  return (
                    <li key={t._id} className={cx('p-4', done && 'opacity-60')}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className={cx('font-medium text-slate-900', done && 'line-through')}>{t.title}</p>
                          <p className="text-xs text-slate-500">
                            {t.course} · {t.type} · {formatHours(t.estimatedHours)}
                          </p>
                        </div>
                        <PriorityBadge priority={t.priority} />
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span className={cx('inline-flex items-center gap-1 text-xs', done ? 'text-slate-500' : URGENCY[due.level])}>
                          <Clock className="size-3.5" /> {done ? formatDue(t.dueDate) : due.label}
                        </span>
                        <div className="flex items-center gap-1">
                          <StatusSelect task={t} onChange={(s) => updateStatus(t, s)} />
                          <button onClick={() => setModal({ open: true, task: t })} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label={`Edit ${t.title}`}>
                            <Pencil className="size-4" />
                          </button>
                          <button onClick={() => setConfirm(t)} className="rounded-md p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600" aria-label={`Delete ${t.title}`}>
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Card>
      )}

      <TaskFormModal open={modal.open} task={modal.task} courses={data?.courses} onClose={() => setModal({ open: false, task: null })} onSaved={load} />
      <ConfirmDialog
        open={Boolean(confirm)}
        title="Delete this task?"
        description={confirm ? `"${confirm.title}" and any study sessions planned for it will be permanently removed. This can't be undone.` : ''}
        onCancel={() => setConfirm(null)}
        onConfirm={doDelete}
        loading={deleting}
      />
    </div>
  );
}
