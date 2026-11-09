import mongoose from 'mongoose';
import { StudyPlan } from '../models/StudyPlan.js';
import { StudySession } from '../models/StudySession.js';
import { Availability, DEFAULT_AVAILABILITY } from '../models/Availability.js';

/** Mark the active plan as out of date after tasks/availability change. */
export async function markPlanStale(userId) {
  await StudyPlan.updateOne({ userId, status: 'active' }, { stale: true });
}

export async function getActivePlan(userId) {
  const plan = await StudyPlan.findOne({ userId, status: 'active' }).lean();
  if (!plan) return { plan: null, sessions: [] };
  const sessions = await StudySession.find({ planId: plan._id }).sort({ date: 1, startTime: 1 }).lean();
  return { plan, sessions };
}

/** Returns the stored availability, or defaults (marked configured=false). */
export async function getAvailability(userId) {
  const doc = await Availability.findOne({ userId }).lean();
  if (doc) return { ...doc, configured: true };
  return { ...DEFAULT_AVAILABILITY, configured: false };
}

/**
 * Persist a planning result as a new plan version. The previous active plan is
 * archived, not deleted, so history is preserved for Phase 2.
 */
export async function savePlan(userId, result, { tzOffset }) {
  const last = await StudyPlan.findOne({ userId }).sort({ version: -1 }).select('version').lean();
  const version = (last?.version || 0) + 1;

  const plan = await StudyPlan.create({
    userId,
    version,
    status: 'active',
    generatedBy: result.generatedBy,
    model: result.model || null,
    fallbackReason: result.fallbackReason || null,
    summary: result.summary || '',
    windowStart: result.window.start,
    windowEnd: result.window.end,
    tzOffset,
    priorities: result.priorities,
    warnings: result.warnings,
    stats: result.stats,
  });

  await StudyPlan.updateMany({ userId, status: 'active', _id: mongoose.trusted({ $ne: plan._id }) }, { status: 'archived' });

  const docs = result.sessions.map((s) => ({ ...s, userId, planId: plan._id }));
  const sessions = docs.length ? await StudySession.insertMany(docs) : [];
  return { plan: plan.toObject(), sessions: sessions.map((s) => s.toObject()) };
}
