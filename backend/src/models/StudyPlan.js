import mongoose from 'mongoose';

/**
 * A generated plan. Each generation creates a new version; the previous active
 * plan is archived (not deleted). This is the foundation for Phase 2 plan
 * versioning and replanning history.
 */
const warningSchema = new mongoose.Schema(
  {
    type: { type: String, required: true }, // INSUFFICIENT_TIME | OVERDUE | CARRYOVER | NO_AVAILABILITY | AI_ADJUSTED
    severity: { type: String, enum: ['info', 'warning', 'error'], default: 'warning' },
    message: { type: String, required: true },
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
    unscheduledHours: { type: Number, default: 0 },
  },
  { _id: false }
);

const prioritySchema = new mongoose.Schema(
  {
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
    title: String,
    course: String,
    rank: Number,
    reason: String,
  },
  { _id: false }
);

const studyPlanSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    version: { type: Number, required: true },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    generatedBy: { type: String, enum: ['gemini', 'fallback'], required: true },
    model: { type: String, default: null },
    fallbackReason: { type: String, default: null },
    summary: { type: String, default: '' },
    windowStart: { type: String, required: true }, // YYYY-MM-DD (local)
    windowEnd: { type: String, required: true },
    tzOffset: { type: Number, default: 0 },
    priorities: { type: [prioritySchema], default: [] }, // AI/algorithm task ranking
    warnings: { type: [warningSchema], default: [] },
    stats: {
      totalSessions: { type: Number, default: 0 },
      totalMinutes: { type: Number, default: 0 },
      aiProposed: { type: Number, default: 0 },
      aiAccepted: { type: Number, default: 0 },
      aiRejected: { type: Number, default: 0 },
      algorithmFilled: { type: Number, default: 0 },
    },
    // Set when tasks/availability change after generation (UC-2 2a / UC-3 3a).
    stale: { type: Boolean, default: false },
  },
  { timestamps: true }
);

studyPlanSchema.index({ userId: 1, status: 1 });
studyPlanSchema.index({ userId: 1, version: -1 });

export const StudyPlan = mongoose.model('StudyPlan', studyPlanSchema);
