import { Task } from '../models/Task.js';
import { User } from '../models/User.js';
import { getActivePlan, getAvailability } from '../services/planStore.js';
import { toLocal } from '../utils/time.js';

export async function getDashboard(req, res) {
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 86400000);
  const [user, tasks, { plan, sessions }, availability] = await Promise.all([
    User.findById(req.userId).lean(),
    Task.find({ userId: req.userId }).sort({ dueDate: 1 }).lean(),
    getActivePlan(req.userId),
    getAvailability(req.userId),
  ]);

  const active = tasks.filter((t) => t.status !== 'Completed');
  const completed = tasks.filter((t) => t.status === 'Completed');
  const upcoming = active.filter((t) => t.dueDate >= now);
  const overdue = active.filter((t) => t.dueDate < now);
  const dueThisWeek = upcoming.filter((t) => t.dueDate <= weekAhead);

  const today = toLocal(now, req.tzOffset).date;
  const todaySessions = sessions.filter((s) => s.date === today);
  const plannedMinutes = sessions.filter((s) => s.date >= today).reduce((sum, s) => sum + s.duration, 0);

  res.json({
    user: user ? { name: user.name } : null,
    today,
    stats: {
      activeTasks: active.length,
      completedTasks: completed.length,
      totalTasks: tasks.length,
      dueThisWeek: dueThisWeek.length,
      overdue: overdue.length,
      totalEstimatedHours: Math.round(active.reduce((sum, t) => sum + t.estimatedHours, 0) * 100) / 100,
      plannedHours: Math.round((plannedMinutes / 60) * 100) / 100,
    },
    upcomingTasks: [...overdue, ...upcoming].slice(0, 6),
    todaySessions,
    plan: plan
      ? { _id: plan._id, version: plan.version, generatedBy: plan.generatedBy, createdAt: plan.createdAt, stale: plan.stale, totalSessions: sessions.length, warnings: plan.warnings.filter((w) => w.severity !== 'info').length }
      : null,
    availabilityConfigured: availability.configured,
  });
}
