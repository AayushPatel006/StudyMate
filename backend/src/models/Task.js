import mongoose from 'mongoose';

export const TASK_TYPES = ['Assignment', 'Exam', 'Quiz', 'Project', 'Reading', 'Other'];
export const PRIORITIES = ['High', 'Medium', 'Low'];
export const TASK_STATUSES = ['Pending', 'In Progress', 'Completed'];

const taskSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    course: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    type: { type: String, enum: TASK_TYPES, default: 'Assignment' },
    dueDate: { type: Date, required: true },
    estimatedHours: { type: Number, required: true, min: 0.25, max: 200 },
    priority: { type: String, enum: PRIORITIES, default: 'Medium' },
    status: { type: String, enum: TASK_STATUSES, default: 'Pending' },
    completedAt: { type: Date, default: null },
    // Phase 2 hook: FR-3 goals / AI task decomposition. A subtask points to its parent goal.
    parentTaskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
  },
  { timestamps: true }
);

taskSchema.index({ userId: 1, status: 1, dueDate: 1 });

export const Task = mongoose.model('Task', taskSchema);
