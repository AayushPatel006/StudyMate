import { validateTaskInput, validateAvailabilityInput, validateSessionEditInput } from '../../src/validators/index.js';
import { toMinutes, fromMinutes, addDays, toInstant, toLocal, weekdayOf } from '../../src/utils/time.js';

const details = (fn) => {
  try {
    fn();
  } catch (e) {
    return e.details;
  }
  return null;
};

describe('input validators', () => {
  const now = new Date('2026-11-09T14:00:00Z');
  const good = { title: ' Essay ', course: 'ENG 101', dueDate: '2026-11-20T23:59:00Z', estimatedHours: '2.3', priority: 'High', type: 'Assignment' };

  it('normalises a valid task', () => {
    const out = validateTaskInput(good, { now });
    expect(out).toEqual(jasmine.objectContaining({ title: 'Essay', estimatedHours: 2.25, status: 'Pending', priority: 'High' }));
  });

  it('reports every missing required field', () => {
    expect(Object.keys(details(() => validateTaskInput({}, { now })))).toEqual(jasmine.arrayContaining(['title', 'course', 'dueDate', 'estimatedHours']));
  });

  it('rejects past due dates on create, bad enums and out-of-range hours', () => {
    const d = details(() => validateTaskInput({ ...good, dueDate: '2020-01-01', priority: 'Urgent', estimatedHours: 0 }, { now }));
    expect(Object.keys(d).sort()).toEqual(['dueDate', 'estimatedHours', 'priority']);
  });

  it('allows partial updates (e.g. status only)', () => {
    expect(validateTaskInput({ status: 'Completed' }, { partial: true })).toEqual({ status: 'Completed' });
    expect(details(() => validateTaskInput({ status: 'Done' }, { partial: true })).status).toBeDefined();
  });

  it('validates availability ranges', () => {
    const ok = validateAvailabilityInput({ availableDays: [3, 1, 1], preferredStartTime: '18:00', preferredEndTime: '22:00', maxStudyHoursPerDay: 3 });
    expect(ok.availableDays).toEqual([1, 3]);
    expect(details(() => validateAvailabilityInput({ availableDays: [], preferredStartTime: '22:00', preferredEndTime: '18:00', maxStudyHoursPerDay: 3 }))).toEqual(
      jasmine.objectContaining({ availableDays: jasmine.any(String), preferredEndTime: 'End time must be after start time' })
    );
    expect(details(() => validateAvailabilityInput({ availableDays: [1], preferredStartTime: '18:00', preferredEndTime: '20:00', maxStudyHoursPerDay: 5 })).maxStudyHoursPerDay).toContain("can't exceed");
  });

  it('validates session edits', () => {
    expect(validateSessionEditInput({ date: '2026-11-10', startTime: '18:00', endTime: '19:00' })).toEqual({ date: '2026-11-10', startTime: '18:00', endTime: '19:00' });
    expect(Object.keys(details(() => validateSessionEditInput({ date: 'x', startTime: '19:00', endTime: '18:00' })))).toEqual(['date', 'endTime']);
  });
});

describe('time utils', () => {
  it('converts between minutes and HH:MM', () => {
    expect(toMinutes('18:30')).toBe(1110);
    expect(fromMinutes(1110)).toBe('18:30');
    expect(toMinutes('24:00')).toBe(1440);
  });
  it('does calendar math on date strings', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(weekdayOf('2026-11-09')).toBe(1); // Monday
  });
  it('round-trips local wall clock and instants for a timezone offset', () => {
    const inst = toInstant('2026-11-09', 18 * 60, 300);
    expect(inst.toISOString()).toBe('2026-11-09T23:00:00.000Z');
    expect(toLocal(inst, 300)).toEqual({ date: '2026-11-09', minutes: 1080 });
  });
});
