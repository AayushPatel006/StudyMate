import { buildPlanningContext } from '../../src/services/planningContext.js';
import { validateSessions, validateSessionEdit } from '../../src/services/validationService.js';
import { NOW, TZ, local, makeTask, weekdayEvenings } from '../helpers/fixtures.js';

describe('validationService', () => {
  let task;
  let other;
  let ctx;
  const codes = (r) => r.reasons.map((x) => x.code);

  beforeEach(() => {
    task = makeTask({ title: 'ML assignment', dueDate: local('2026-11-12', '20:00'), estimatedHours: 4 });
    other = makeTask({ title: 'Reading', dueDate: local('2026-11-20'), estimatedHours: 3 });
    ctx = buildPlanningContext({ tasks: [task, other], availability: weekdayEvenings, now: NOW, tzOffset: TZ });
  });

  const s = (o) => ({ taskId: task._id.toString(), date: '2026-11-10', startTime: '18:00', endTime: '19:00', ...o });

  it('accepts a session that satisfies every rule', () => {
    const { accepted, rejected } = validateSessions([s()], ctx);
    expect(rejected).toEqual([]);
    expect(accepted.length).toBe(1);
    expect(accepted[0]).toEqual(jasmine.objectContaining({ taskTitle: 'ML assignment', duration: 60, priority: 'Medium' }));
  });

  it('rejects sessions for unknown or completed tasks', () => {
    const { rejected } = validateSessions([s({ taskId: 'nope' })], ctx);
    expect(codes(rejected[0])).toContain('UNKNOWN_TASK');
  });

  it('rejects sessions outside the student availability', () => {
    const early = validateSessions([s({ startTime: '16:00', endTime: '17:00' })], ctx);
    expect(codes(early.rejected[0])).toContain('OUTSIDE_AVAILABILITY');
    const friday = validateSessions([s({ date: '2026-11-13' })], ctx); // Fri is not available
    expect(codes(friday.rejected[0])).toContain('DAY_UNAVAILABLE');
  });

  it('rejects sessions that end after the deadline', () => {
    const { rejected } = validateSessions([s({ date: '2026-11-12', startTime: '19:30', endTime: '20:30' })], ctx);
    expect(codes(rejected[0])).toContain('AFTER_DEADLINE');
  });

  it('prevents overlapping sessions', () => {
    const { accepted, rejected } = validateSessions(
      [s(), s({ taskId: other._id.toString(), startTime: '18:30', endTime: '19:30' })],
      ctx
    );
    expect(accepted.length).toBe(1);
    expect(codes(rejected[0])).toEqual(['OVERLAP']);
  });

  it('allows back-to-back sessions that only touch', () => {
    const { accepted } = validateSessions([s(), s({ taskId: other._id.toString(), startTime: '19:00', endTime: '20:00' })], ctx);
    expect(accepted.length).toBe(2);
  });

  it('enforces the daily study-hour limit', () => {
    const tight = buildPlanningContext({ tasks: [task, other], availability: { ...weekdayEvenings, maxStudyHoursPerDay: 1.5 }, now: NOW, tzOffset: TZ });
    const { accepted, rejected } = validateSessions(
      [s(), s({ taskId: other._id.toString(), startTime: '19:00', endTime: '20:00' })],
      tight
    );
    expect(accepted.length).toBe(1);
    expect(codes(rejected[0])).toEqual(['DAILY_LIMIT_EXCEEDED']);
  });

  it('rejects invalid durations and malformed times', () => {
    expect(codes(validateSessions([s({ endTime: '18:00' })], ctx).rejected[0])).toContain('INVALID_DURATION');
    expect(codes(validateSessions([s({ startTime: '7pm' })], ctx).rejected[0])).toContain('INVALID_TIME');
    expect(codes(validateSessions([s({ date: '2026-02-30' })], ctx).rejected[0])).toContain('INVALID_DATE');
  });

  it('trims over-long sessions to the maximum session length', () => {
    const { accepted, adjusted } = validateSessions([s({ startTime: '18:00', endTime: '21:00' })], ctx);
    expect(adjusted).toBe(1);
    expect(accepted[0].endTime).toBe('19:30');
  });

  it('never schedules more time than a task needs', () => {
    const small = makeTask({ estimatedHours: 1 });
    const c = buildPlanningContext({ tasks: [small], availability: weekdayEvenings, now: NOW, tzOffset: TZ });
    const id = small._id.toString();
    const { accepted, rejected } = validateSessions(
      [
        { taskId: id, date: '2026-11-09', startTime: '18:00', endTime: '18:45' },
        { taskId: id, date: '2026-11-10', startTime: '18:00', endTime: '19:00' },
        { taskId: id, date: '2026-11-11', startTime: '18:00', endTime: '19:00' },
      ],
      c
    );
    expect(accepted.map((a) => a.duration)).toEqual([45, 15]);
    expect(codes(rejected[0])).toEqual(['EXCEEDS_TASK_HOURS']);
  });

  it('handles non-array or garbage input safely', () => {
    expect(validateSessions(null, ctx)).toEqual({ accepted: [], rejected: [], adjusted: 0 });
    const { rejected } = validateSessions([{}], ctx);
    expect(rejected.length).toBe(1);
  });

  describe('validateSessionEdit', () => {
    const others = [{ taskTitle: 'Reading', date: '2026-11-10', startTime: '19:00', endTime: '20:00', duration: 60 }];

    it('accepts a valid move', () => {
      expect(validateSessionEdit(s({ date: '2026-11-11' }), ctx, others)).toEqual([]);
    });

    it('reports overlaps with other sessions', () => {
      const reasons = validateSessionEdit(s({ startTime: '19:30', endTime: '20:30' }), ctx, others);
      expect(reasons[0].code).toBe('OVERLAP');
      expect(reasons[0].message).toContain('Reading');
    });

    it('reports deadline violations', () => {
      const reasons = validateSessionEdit(s({ date: '2026-11-12', startTime: '19:30', endTime: '20:30' }), ctx, []);
      expect(reasons.map((r) => r.code)).toContain('AFTER_DEADLINE');
    });
  });
});
