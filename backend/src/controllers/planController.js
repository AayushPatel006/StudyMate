import mongoose from 'mongoose';
import { Task } from '../models/Task.js';
import { StudySession } from '../models/StudySession.js';
import { StudyPlan } from '../models/StudyPlan.js';
import { computePlan } from '../services/plannerService.js';
import { buildPlanningContext } from '../services/planningContext.js';
import { validateSessionEdit } from '../services/validationService.js';
import { getPlanningAgent } from '../services/aiService.js';
import { getActivePlan, getAvailability, savePlan } from '../services/planStore.js';
import { validateSessionEditInput } from '../validators/index.js';
import { HttpError, notFound } from '../utils/httpError.js';
import { toMinutes } from '../utils/time.js';

export async function getActive(req, res) {
  res.json(await getActivePlan(req.userId));
}

export async function listPlans(req, res) {
  const plans = await StudyPlan.find({ userId: req.userId })
    .sort({ version: -1 })
    .limit(20)
    .select('version status generatedBy model createdAt stats windowStart windowEnd')
    .lean();
  res.json({ plans });
}

export async function generate(req, res) {
  const [tasks, availability] = await Promise.all([Task.find({ userId: req.userId }).lean(), getAvailability(req.userId)]);

  const active = tasks.filter((t) => t.status !== 'Completed');
  if (active.length === 0) {
    throw new HttpError(400, 'Add at least one active task before generating a study plan.', { code: 'NO_TASKS' });
  }
  if (!availability.configured) {
    throw new HttpError(400, 'Set your weekly availability before generating a study plan.', { code: 'NO_AVAILABILITY' });
  }

  const result = await computePlan({ tasks, availability, now: new Date(), tzOffset: req.tzOffset, agent: getPlanningAgent() });
  const saved = await savePlan(req.userId, result, { tzOffset: req.tzOffset });
  res.status(201).json({ ...saved, fallbackCode: result.fallbackCode });
}

async function loadOwnedSession(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Session not found');
  const session = await StudySession.findOne({ _id: req.params.id, userId: req.userId });
  if (!session) throw notFound('Session not found');
  return session;
}

export async function updateSession(req, res) {
  const session = await loadOwnedSession(req);
  const input = validateSessionEditInput(req.body);

  const [tasks, availability, others] = await Promise.all([
    Task.find({ userId: req.userId }).lean(),
    getAvailability(req.userId),
    StudySession.find({ planId: session.planId, _id: mongoose.trusted({ $ne: session._id }) }).lean(),
  ]);
  const ctx = buildPlanningContext({ tasks, availability, now: new Date(), tzOffset: req.tzOffset });
  const reasons = validateSessionEdit({ ...input, taskId: session.taskId.toString() }, ctx, others);
  if (reasons.length) {
    throw new HttpError(422, reasons[0].message, { code: 'SCHEDULE_CONFLICT', details: { reasons } });
  }

  session.set({
    ...input,
    duration: toMinutes(input.endTime) - toMinutes(input.startTime),
    isManuallyEdited: true,
  });
  await session.save();
  res.json({ session: session.toObject() });
}

export async function deleteSession(req, res) {
  const session = await loadOwnedSession(req);
  await session.deleteOne();
  res.json({ ok: true });
}
