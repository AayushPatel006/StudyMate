import { computePlan, scheduleDeterministic } from '../../src/services/plannerService.js';
import { buildPlanningContext } from '../../src/services/planningContext.js';
import { validateSessions } from '../../src/services/validationService.js';
import { AiError } from '../../src/services/aiService.js';
import { NOW, TZ, local, makeTask, weekdayEvenings } from '../helpers/fixtures.js';

/** Re-validate a finished plan from scratch: every session must pass every rule. */
function expectAllValid(plan, tasks, availability = weekdayEvenings) {
  const ctx = buildPlanningContext({ tasks, availability, now: NOW, tzOffset: TZ });
  const { rejected, adjusted } = validateSessions(plan.sessions, ctx);
  expect(rejected).withContext(JSON.stringify(rejected, null, 1)).toEqual([]);
  expect(adjusted).toBe(0);
}

const fakeAgent = (impl) => ({ provider: 'fake', model: 'fake-model', isConfigured: () => true, proposeSchedule: impl });

describe('plannerService', () => {
  describe('fallback (deterministic) scheduling', () => {
    it('schedules all work before deadlines and within availability', async () => {
      const tasks = [
        makeTask({ title: 'ML assignment', dueDate: local('2026-11-13', '00:00'), estimatedHours: 4, priority: 'High' }),
        makeTask({ title: 'Quiz prep', dueDate: local('2026-11-11', '12:00'), estimatedHours: 1.5 }),
      ];
      const plan = await computePlan({ tasks, availability: weekdayEvenings, now: NOW, tzOffset: TZ });

      expect(plan.generatedBy).toBe('fallback');
      expect(plan.fallbackCode).toBe('NOT_CONFIGURED');
      expect(plan.warnings.filter((w) => w.severity !== 'info')).toEqual([]);
      const minutes = (title) => plan.sessions.filter((s) => s.taskTitle === title).reduce((a, s) => a + s.duration, 0);
      expect(minutes('ML assignment')).toBe(240);
      expect(minutes('Quiz prep')).toBe(90);
      expectAllValid(plan, tasks);
    });

    it('orders earlier deadlines first', async () => {
      const later = makeTask({ title: 'Later', dueDate: local('2026-11-20'), estimatedHours: 1 });
      const sooner = makeTask({ title: 'Sooner', dueDate: local('2026-11-11'), estimatedHours: 1 });
      const plan = await computePlan({ tasks: [later, sooner], availability: weekdayEvenings, now: NOW, tzOffset: TZ });
      expect(plan.sessions[0].taskTitle).toBe('Sooner');
      expect(plan.priorities.map((p) => p.title)).toEqual(['Sooner', 'Later']);
    });

    it('never produces overlapping sessions and respects the daily limit', async () => {
      const tasks = Array.from({ length: 6 }, (_, i) => makeTask({ dueDate: local('2026-11-16'), estimatedHours: 2 + i, priority: ['High', 'Medium', 'Low'][i % 3] }));
      const plan = await computePlan({ tasks, availability: weekdayEvenings, now: NOW, tzOffset: TZ });
      expectAllValid(plan, tasks);
      const perDay = {};
      for (const s of plan.sessions) perDay[s.date] = (perDay[s.date] || 0) + s.duration;
      Object.values(perDay).forEach((m) => expect(m).toBeLessThanOrEqual(180));
    });

    it('warns when there is not enough time before a deadline', async () => {
      const big = makeTask({ title: 'Huge project', dueDate: local('2026-11-10', '23:59'), estimatedHours: 10 });
      const plan = await computePlan({ tasks: [big], availability: weekdayEvenings, now: NOW, tzOffset: TZ });
      const w = plan.warnings.find((x) => x.type === 'INSUFFICIENT_TIME');
      expect(w).toBeDefined();
      expect(w.unscheduledHours).toBe(4); // 6h fit (Mon+Tue evenings), 4h do not
      expectAllValid(plan, [big]);
    });

    it('reports carry-over for work due after the planning window', async () => {
      const far = makeTask({ title: 'Thesis', dueDate: local('2026-12-01'), estimatedHours: 20 });
      const plan = await computePlan({ tasks: [far], availability: weekdayEvenings, now: NOW, tzOffset: TZ });
      expect(plan.warnings.map((w) => w.type)).toEqual(['CARRYOVER']);
    });

    it('excludes overdue and completed tasks', async () => {
      const overdue = makeTask({ title: 'Old', dueDate: local('2026-11-08') });
      const done = makeTask({ title: 'Done', status: 'Completed' });
      const plan = await computePlan({ tasks: [overdue, done], availability: weekdayEvenings, now: NOW, tzOffset: TZ });
      expect(plan.sessions).toEqual([]);
      expect(plan.warnings.map((w) => w.type)).toEqual(['OVERDUE']);
    });

    it('does not schedule sessions earlier today than the current time', () => {
      const evening = new Date('2026-11-09T23:40:00Z'); // 18:40 local
      const ctx = buildPlanningContext({ tasks: [makeTask({ estimatedHours: 3 })], availability: weekdayEvenings, now: evening, tzOffset: TZ });
      const { sessions } = scheduleDeterministic(ctx);
      const today = sessions.filter((s) => s.date === '2026-11-09');
      today.forEach((s) => expect(s.startTime >= '18:45').toBeTrue());
    });

    it('fills around fixed sessions without overlapping them', () => {
      const t = makeTask({ estimatedHours: 3 });
      const ctx = buildPlanningContext({ tasks: [t], availability: weekdayEvenings, now: NOW, tzOffset: TZ });
      const fixed = [{ taskId: t._id.toString(), date: '2026-11-09', startTime: '18:30', endTime: '19:30', startMin: 1110, endMin: 1170, duration: 60 }];
      const { sessions, remaining } = scheduleDeterministic(ctx, { fixed });
      const total = sessions.reduce((a, s) => a + s.duration, 0);
      expect(total).toBe(120);
      expect(remaining.get(t._id.toString())).toBe(0);
      sessions.filter((s) => s.date === '2026-11-09').forEach((s) => expect(s.endMin <= 1110 || s.startMin >= 1170).toBeTrue());
    });
  });

  describe('AI planning with validation', () => {
    let task;
    beforeEach(() => {
      task = makeTask({ title: 'ML assignment', dueDate: local('2026-11-13', '00:00'), estimatedHours: 3 });
    });

    it('uses valid AI sessions, drops invalid ones and fills the gap deterministically', async () => {
      const id = task._id.toString();
      const agent = fakeAgent(async () => ({
        summary: 'Focus on ML early.',
        prioritizedTasks: [{ taskId: id, rank: 1, reason: 'Due soon' }],
        sessions: [
          { taskId: id, date: '2026-11-09', startTime: '18:00', endTime: '19:30', focus: 'Derive backprop', explanation: 'Fresh start' },
          { taskId: id, date: '2026-11-13', startTime: '18:00', endTime: '19:30', focus: 'Bad', explanation: 'After deadline + Friday' },
        ],
      }));
      const plan = await computePlan({ tasks: [task], availability: weekdayEvenings, now: NOW, tzOffset: TZ, agent });

      expect(plan.generatedBy).toBe('gemini');
      expect(plan.model).toBe('fake-model');
      expect(plan.summary).toBe('Focus on ML early.');
      expect(plan.stats).toEqual(jasmine.objectContaining({ aiProposed: 2, aiAccepted: 1, aiRejected: 1, algorithmFilled: 1 }));
      expect(plan.sessions[0]).toEqual(jasmine.objectContaining({ source: 'ai', focus: 'Derive backprop' }));
      expect(plan.sessions.reduce((a, s) => a + s.duration, 0)).toBe(180);
      expect(plan.warnings.some((w) => w.type === 'AI_ADJUSTED')).toBeTrue();
      expectAllValid(plan, [task]);
    });

    it('falls back when Gemini is rate limited (HTTP 429)', async () => {
      const agent = fakeAgent(async () => {
        throw new AiError('RATE_LIMITED', 'quota reached');
      });
      const plan = await computePlan({ tasks: [task], availability: weekdayEvenings, now: NOW, tzOffset: TZ, agent });
      expect(plan.generatedBy).toBe('fallback');
      expect(plan.fallbackCode).toBe('RATE_LIMITED');
      expect(plan.fallbackReason).toBe('quota reached');
      expect(plan.sessions.length).toBeGreaterThan(0);
    });

    it('falls back when every AI session is invalid', async () => {
      const agent = fakeAgent(async () => ({ summary: 'x', prioritizedTasks: [], sessions: [{ taskId: 'bogus', date: '2026-11-09', startTime: '01:00', endTime: '02:00' }] }));
      const plan = await computePlan({ tasks: [task], availability: weekdayEvenings, now: NOW, tzOffset: TZ, agent });
      expect(plan.generatedBy).toBe('fallback');
      expect(plan.fallbackCode).toBe('INVALID_RESPONSE');
      expectAllValid(plan, [task]);
    });

    it('falls back on unexpected errors (e.g. network)', async () => {
      const agent = fakeAgent(async () => {
        throw new Error('fetch failed');
      });
      const plan = await computePlan({ tasks: [task], availability: weekdayEvenings, now: NOW, tzOffset: TZ, agent });
      expect(plan.generatedBy).toBe('fallback');
      expect(plan.sessions.length).toBeGreaterThan(0);
    });

    it('does not call the agent when there is nothing to plan', async () => {
      const spy = jasmine.createSpy('propose');
      const plan = await computePlan({ tasks: [], availability: weekdayEvenings, now: NOW, tzOffset: TZ, agent: fakeAgent(spy) });
      expect(spy).not.toHaveBeenCalled();
      expect(plan.sessions).toEqual([]);
    });
  });
});
