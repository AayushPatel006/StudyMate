import mongoose from 'mongoose';

// Fixed clock: Monday 2026-11-09 09:00 in New York (UTC-5 => tzOffset 300).
export const TZ = 300;
export const NOW = new Date('2026-11-09T14:00:00Z');

/** Local wall-clock (New York) -> Date */
export const local = (date, time = '23:59') => new Date(`${date}T${time}:00-05:00`);

let n = 0;
export function makeTask(overrides = {}) {
  n += 1;
  return {
    _id: new mongoose.Types.ObjectId(),
    title: `Task ${n}`,
    course: 'CS 101',
    description: '',
    type: 'Assignment',
    dueDate: local('2026-11-13'),
    estimatedHours: 2,
    priority: 'Medium',
    status: 'Pending',
    ...overrides,
  };
}

export const weekdayEvenings = {
  availableDays: [1, 2, 3, 4], // Mon–Thu
  preferredStartTime: '18:00',
  preferredEndTime: '21:00',
  maxStudyHoursPerDay: 3,
  maxSessionMinutes: 90,
  breakMinutes: 0,
};
