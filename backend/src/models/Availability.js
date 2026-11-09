import mongoose from 'mongoose';

/**
 * Weekly availability. One document per user.
 * availableDays uses JS weekday numbers: 0 = Sunday ... 6 = Saturday.
 */
const availabilitySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    availableDays: { type: [Number], default: [1, 2, 3, 4, 5] },
    preferredStartTime: { type: String, default: '18:00' },
    preferredEndTime: { type: String, default: '22:00' },
    maxStudyHoursPerDay: { type: Number, default: 3, min: 0.5, max: 16 },
    // Planner tuning (kept simple for Phase 1).
    maxSessionMinutes: { type: Number, default: 90, min: 30, max: 240 },
    breakMinutes: { type: Number, default: 15, min: 0, max: 60 },
  },
  { timestamps: true }
);

export const DEFAULT_AVAILABILITY = {
  availableDays: [1, 2, 3, 4, 5],
  preferredStartTime: '18:00',
  preferredEndTime: '22:00',
  maxStudyHoursPerDay: 3,
  maxSessionMinutes: 90,
  breakMinutes: 15,
};

export const Availability = mongoose.model('Availability', availabilitySchema);
