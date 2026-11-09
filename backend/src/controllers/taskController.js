import mongoose from 'mongoose';
import { Task, TASK_STATUSES, PRIORITIES } from '../models/Task.js';
import { StudySession } from '../models/StudySession.js';
import { validateTaskInput } from '../validators/index.js';
import { notFound } from '../utils/httpError.js';
import { markPlanStale } from '../services/planStore.js';

function ownedId(id) {
  if (!mongoose.isValidObjectId(id)) throw notFound('Task not found');
  return id;
}

export async function listTasks(req, res) {
  const filter = { userId: req.userId };
  const { status, priority, course } = req.query;
  if (typeof status === 'string' && TASK_STATUSES.includes(status)) filter.status = status;
  if (typeof priority === 'string' && PRIORITIES.includes(priority)) filter.priority = priority;
  if (typeof course === 'string' && course.trim()) filter.course = course.trim();
  const tasks = await Task.find(filter).sort({ status: 1, dueDate: 1 }).lean();
  // Completed tasks sink to the bottom.
  tasks.sort((a, b) => (a.status === 'Completed') - (b.status === 'Completed') || a.dueDate - b.dueDate);
  const courses = await Task.distinct('course', { userId: req.userId });
  res.json({ tasks, courses: courses.sort((a, b) => a.localeCompare(b)) });
}

export async function getTask(req, res) {
  const task = await Task.findOne({ _id: ownedId(req.params.id), userId: req.userId });
  if (!task) throw notFound('Task not found');
  res.json({ task });
}

export async function createTask(req, res) {
  const data = validateTaskInput(req.body);
  if (data.status === 'Completed') data.completedAt = new Date();
  const task = await Task.create({ ...data, userId: req.userId });
  await markPlanStale(req.userId);
  res.status(201).json({ task });
}

export async function updateTask(req, res) {
  const data = validateTaskInput(req.body, { partial: true });
  const task = await Task.findOne({ _id: ownedId(req.params.id), userId: req.userId });
  if (!task) throw notFound('Task not found');
  if (data.status && data.status !== task.status) data.completedAt = data.status === 'Completed' ? new Date() : null;
  task.set(data);
  await task.save();
  // Keep denormalised session fields in sync with the task.
  const sync = {};
  if (data.title) sync.taskTitle = data.title;
  if (data.course) sync.course = data.course;
  if (data.priority) sync.priority = data.priority;
  if (Object.keys(sync).length) await StudySession.updateMany({ userId: req.userId, taskId: task._id }, sync);
  await markPlanStale(req.userId);
  res.json({ task });
}

export async function deleteTask(req, res) {
  const task = await Task.findOneAndDelete({ _id: ownedId(req.params.id), userId: req.userId });
  if (!task) throw notFound('Task not found');
  const { deletedCount } = await StudySession.deleteMany({ userId: req.userId, taskId: task._id });
  await markPlanStale(req.userId);
  res.json({ ok: true, deletedSessions: deletedCount });
}
