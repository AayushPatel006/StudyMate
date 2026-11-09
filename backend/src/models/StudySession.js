import mongoose from 'mongoose';
import { PRIORITIES } from './Task.js';

const studySessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudyPlan', required: true, index: true },
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
    taskTitle: { type: String, required: true },
    course: { type: String, default: '' },
    date: { type: String, required: true }, // YYYY-MM-DD, local wall clock
    startTime: { type: String, required: true }, // HH:MM
    endTime: { type: String, required: true }, // HH:MM
    duration: { type: Number, required: true }, // minutes
    priority: { type: String, enum: PRIORITIES, default: 'Medium' },
    focus: { type: String, default: '', maxlength: 160 }, // what to work on (task breakdown)
    explanation: { type: String, default: '', maxlength: 500 },
    // Who produced the session: Gemini, the deterministic algorithm, or the student.
    source: { type: String, enum: ['ai', 'algorithm'], default: 'algorithm' },
    // Phase 2 hooks: progress tracking (FR-8) and preserving hand edits during replans (FR-12).
    status: { type: String, enum: ['scheduled', 'completed', 'missed', 'delayed'], default: 'scheduled' },
    isManuallyEdited: { type: Boolean, default: false },
  },
  { timestamps: true }
);

studySessionSchema.index({ planId: 1, date: 1, startTime: 1 });

export const StudySession = mongoose.model('StudySession', studySessionSchema);
