import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ListTodo, CalendarClock, CircleCheck, Hourglass, WandSparkles, ArrowRight, Plus, Clock, Sparkles, Cpu, RefreshCw, TriangleAlert, Coffee, Check } from 'lucide-react';
import { Button, Card, EmptyState, PageLoader, PriorityBadge, cx } from '../components/ui/index.jsx';
import TaskFormModal from '../components/tasks/TaskFormModal.jsx';
import { TYPE_ICONS } from './TasksPage.jsx';
import { api, errorMessage } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { PRIORITY_STYLES, dueInfo, formatDuration, formatHours, formatTime, greeting, toMinutes } from '../utils/format.js';

function Stat({ icon: Icon, label, value, sub, tone }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600',
    amber: 'bg-amber-50 text-amber-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    sky: 'bg-sky-50 text-sky-600',
  };
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-slate-500">{label}</p>
        <span className={cx('flex size-8 items-center justify-center rounded-lg', tones[tone])}>
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </Card>
  );
}

function Onboarding({ stats, availabilityConfigured, onAddTask }) {
  const steps = [
    { done: stats.totalTasks > 0, title: 'Add your tasks', desc: 'Assignments, exams and readings with deadlines and hour estimates.', action: <Button size="sm" icon={Plus} onClick={onAddTask}>Add task</Button> },
    { done: availabilityConfigured, title: 'Set your availability', desc: 'Which days and hours you can study each week.', action: <Link to="/availability"><Button size="sm" variant="secondary">Set hours</Button></Link> },
    { done: false, title: 'Generate your study plan', desc: 'StudyMate builds a validated weekly schedule.', action: <Link to="/planner"><Button size="sm" variant="secondary">Open planner</Button></Link> },
  ];
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-100 bg-gradient-to-r from-brand-50 to-white px-5 py-4">
        <h2 className="font-semibold text-slate-900">Get started in 3 steps</h2>
        <p className="text-sm text-slate-500">You'll have a personalized study plan in about a minute.</p>
      </div>
      <ol className="divide-y divide-slate-100">
        {steps.map((s, i) => (
          <li key={s.title} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
            <span className={cx('flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold', s.done ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600')}>
              {s.done ? <Check className="size-4" strokeWidth={3} /> : i + 1}
            </span>
            <div className="flex-1">
              <p className={cx('text-sm font-medium', s.done ? 'text-slate-400 line-through' : 'text-slate-900')}>{s.title}</p>
              <p className="text-xs text-slate-500">{s.desc}</p>
            </div>
            {!s.done && s.action}
          </li>
        ))}
      </ol>
    </Card>
  );
}

export default function DashboardPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = () =>
    api
      .get('/dashboard')
      .then((r) => setData(r.data))
      .catch((err) => toast.error('Could not load dashboard', errorMessage(err)));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data) return <PageLoader />;
  const { stats, upcomingTasks, todaySessions, plan, user } = data;
  const firstName = user?.name?.split(' ')[0] || 'there';
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const todayMinutes = todaySessions.reduce((a, s) => a + s.duration, 0);
  const isNew = stats.totalTasks === 0 || !data.availabilityConfigured || !plan;

  return (
    <div className="animate-fade-in space-y-6">
      {/* Hero */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {stats.activeTasks === 0
              ? 'Nothing on your plate yet — add a task to get started.'
              : todaySessions.length
                ? `You have ${todaySessions.length} study session${todaySessions.length === 1 ? '' : 's'} (${formatDuration(todayMinutes)}) planned today.`
                : `${stats.dueThisWeek} task${stats.dueThisWeek === 1 ? '' : 's'} due in the next 7 days.`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={Plus} onClick={() => setAddOpen(true)}>
            Add task
          </Button>
          <Button variant="brand" icon={plan ? RefreshCw : WandSparkles} onClick={() => navigate('/planner?generate=1')} disabled={stats.activeTasks === 0 || !data.availabilityConfigured}>
            {plan ? 'Regenerate plan' : 'Generate study plan'}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat icon={ListTodo} label="Active tasks" value={stats.activeTasks} sub={stats.overdue ? `${stats.overdue} overdue` : `${stats.totalTasks} total`} tone="brand" />
        <Stat icon={CalendarClock} label="Due this week" value={stats.dueThisWeek} sub="Next 7 days" tone="amber" />
        <Stat icon={CircleCheck} label="Completed" value={stats.completedTasks} sub={stats.totalTasks ? `${Math.round((stats.completedTasks / stats.totalTasks) * 100)}% of all tasks` : 'Nothing yet'} tone="emerald" />
        <Stat icon={Hourglass} label="Est. study hours" value={formatHours(stats.totalEstimatedHours)} sub={plan ? `${formatHours(stats.plannedHours)} scheduled ahead` : 'Not scheduled yet'} tone="sky" />
      </div>

      {isNew && <Onboarding stats={stats} availabilityConfigured={data.availabilityConfigured} onAddTask={() => setAddOpen(true)} />}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        {/* Today */}
        <Card className="lg:col-span-3">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="font-semibold text-slate-900">Today's study sessions</h2>
              <p className="text-xs text-slate-500">{todaySessions.length ? `${formatDuration(todayMinutes)} of focused study` : 'From your active study plan'}</p>
            </div>
            <Link to="/planner" className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
              Planner <ArrowRight className="size-4" />
            </Link>
          </div>
          {!plan ? (
            <EmptyState icon={WandSparkles} title="No study plan yet" description="Generate a plan and your sessions for today will show up here." className="py-10" />
          ) : todaySessions.length === 0 ? (
            <EmptyState icon={Coffee} title="Nothing scheduled today" description="Enjoy the break — or check the planner for upcoming sessions." className="py-10" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {todaySessions.map((s) => {
                const past = toMinutes(s.endTime) <= nowMin;
                const live = toMinutes(s.startTime) <= nowMin && !past;
                return (
                  <li key={s._id} className={cx('flex items-center gap-4 px-5 py-3.5', past && 'opacity-50')}>
                    <div className="w-20 shrink-0">
                      <p className="text-sm font-semibold text-slate-800">{formatTime(s.startTime)}</p>
                      <p className="text-xs text-slate-500">{formatDuration(s.duration)}</p>
                    </div>
                    <span className={cx('h-10 w-1 rounded-full', PRIORITY_STYLES[s.priority]?.bar)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{s.taskTitle}</p>
                      <p className="truncate text-xs text-slate-500">
                        {s.course}
                        {s.focus ? ` · ${s.focus}` : ''}
                      </p>
                    </div>
                    {live && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-600/20">Now</span>}
                  </li>
                );
              })}
            </ul>
          )}
          {plan && (
            <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
              {plan.generatedBy === 'gemini' ? <Sparkles className="size-3.5 text-violet-500" /> : <Cpu className="size-3.5" />}
              Plan v{plan.version} · {plan.generatedBy === 'gemini' ? 'Generated with Gemini' : 'Fallback mode'} · {plan.totalSessions} sessions
              {plan.stale && <span className="ml-auto inline-flex items-center gap-1 font-medium text-sky-700"><RefreshCw className="size-3" /> Out of date</span>}
              {!plan.stale && plan.warnings > 0 && <span className="ml-auto inline-flex items-center gap-1 font-medium text-amber-700"><TriangleAlert className="size-3" /> {plan.warnings} warning{plan.warnings === 1 ? '' : 's'}</span>}
            </div>
          )}
        </Card>

        {/* Upcoming */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="font-semibold text-slate-900">Upcoming deadlines</h2>
              <p className="text-xs text-slate-500">Your most urgent work</p>
            </div>
            <Link to="/tasks" className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
              All tasks <ArrowRight className="size-4" />
            </Link>
          </div>
          {upcomingTasks.length === 0 ? (
            <EmptyState icon={ListTodo} title="No upcoming deadlines" description="Add tasks to see what's coming up." className="py-10" action={<Button size="sm" icon={Plus} onClick={() => setAddOpen(true)}>Add task</Button>} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {upcomingTasks.map((t) => {
                const due = dueInfo(t.dueDate);
                const Icon = TYPE_ICONS[t.type];
                return (
                  <li key={t._id} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{t.title}</p>
                      <p className={cx('flex items-center gap-1 text-xs', due.level === 'overdue' || due.level === 'urgent' ? 'font-medium text-rose-600' : due.level === 'soon' ? 'text-amber-600' : 'text-slate-500')}>
                        <Clock className="size-3" /> {due.label} · {formatHours(t.estimatedHours)}
                      </p>
                    </div>
                    <PriorityBadge priority={t.priority} />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <TaskFormModal open={addOpen} onClose={() => setAddOpen(false)} onSaved={load} />
    </div>
  );
}
