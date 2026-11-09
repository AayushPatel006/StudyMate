/**
 * API integration tests — run against a real MongoDB.
 * Uses MONGODB_URI_TEST (default mongodb://127.0.0.1:27017/studymate_test).
 * The test database is dropped before and after the run.
 */
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../src/app.js';
import { fromMinutes } from '../../src/utils/time.js';
import { setPlanningAgent, createGeminiAgent, AiError } from '../../src/services/aiService.js';

const TEST_URI = process.env.MONGODB_URI_TEST || 'mongodb://127.0.0.1:27017/studymate_test';
const TZ = String(new Date().getTimezoneOffset());

const inDays = (d, h = 23, m = 59) => {
  const x = new Date();
  x.setDate(x.getDate() + d);
  x.setHours(h, m, 0, 0);
  return x.toISOString();
};

describe('StudyMate API (integration)', () => {
  let app;
  let token;
  let api;

  beforeAll(async () => {
    try {
      await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 4000 });
    } catch (e) {
      throw new Error(`Integration tests need MongoDB at ${TEST_URI} (set MONGODB_URI_TEST). ${e.message}`);
    }
    await mongoose.connection.dropDatabase();
    await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
    app = createApp();
    setPlanningAgent(createGeminiAgent({ apiKey: '' })); // fallback mode by default

    const res = await request(app).post('/api/auth/register').send({ name: 'Test Student', email: 'student@test.dev', password: 'password123' });
    expect(res.status).toBe(201);
    token = res.body.token;
    api = (method, url) => request(app)[method](url).set('Authorization', `Bearer ${token}`).set('X-Timezone-Offset', TZ);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  describe('authentication', () => {
    it('rejects duplicate registration', async () => {
      const res = await request(app).post('/api/auth/register').send({ name: 'X', email: 'student@test.dev', password: 'password123' });
      expect(res.status).toBe(409);
    });
    it('logs in with correct credentials only', async () => {
      expect((await request(app).post('/api/auth/login').send({ email: 'student@test.dev', password: 'wrong' })).status).toBe(401);
      const ok = await request(app).post('/api/auth/login').send({ email: 'STUDENT@test.dev', password: 'password123' });
      expect(ok.status).toBe(200);
      expect(ok.body.user.passwordHash).toBeUndefined();
    });
    it('protects routes', async () => {
      expect((await request(app).get('/api/tasks')).status).toBe(401);
      expect((await request(app).get('/api/tasks').set('Authorization', 'Bearer junk')).status).toBe(401);
    });
  });

  describe('task CRUD', () => {
    let taskId;

    it('creates a task', async () => {
      const res = await api('post', '/api/tasks').send({ title: 'ML assignment', course: 'CS 535', type: 'Assignment', dueDate: inDays(4), estimatedHours: 4, priority: 'High' });
      expect(res.status).toBe(201);
      expect(res.body.task).toEqual(jasmine.objectContaining({ title: 'ML assignment', status: 'Pending', estimatedHours: 4 }));
      taskId = res.body.task._id;
    });

    it('validates required fields', async () => {
      const res = await api('post', '/api/tasks').send({ title: '' });
      expect(res.status).toBe(400);
      expect(Object.keys(res.body.error.details)).toEqual(jasmine.arrayContaining(['title', 'course', 'dueDate', 'estimatedHours']));
    });

    it('ignores NoSQL operator injection in bodies', async () => {
      const res = await api('post', '/api/tasks').send({ title: { $gt: '' }, course: 'X', dueDate: inDays(2), estimatedHours: 1 });
      expect(res.status).toBe(400);
    });

    it('edits a task', async () => {
      const res = await api('patch', `/api/tasks/${taskId}`).send({ title: 'ML assignment 3', estimatedHours: 5 });
      expect(res.status).toBe(200);
      expect(res.body.task.title).toBe('ML assignment 3');
      expect(res.body.task.estimatedHours).toBe(5);
    });

    it('updates task status', async () => {
      const res = await api('patch', `/api/tasks/${taskId}`).send({ status: 'Completed' });
      expect(res.body.task.status).toBe('Completed');
      expect(res.body.task.completedAt).toBeTruthy();
      const back = await api('patch', `/api/tasks/${taskId}`).send({ status: 'In Progress' });
      expect(back.body.task.completedAt).toBeNull();
    });

    it('lists and filters tasks', async () => {
      await api('post', '/api/tasks').send({ title: 'Reading', course: 'CS 417', type: 'Reading', dueDate: inDays(6), estimatedHours: 2, priority: 'Low' });
      const all = await api('get', '/api/tasks');
      expect(all.body.tasks.length).toBe(2);
      expect(all.body.courses).toEqual(['CS 417', 'CS 535']);
      const low = await api('get', '/api/tasks?priority=Low');
      expect(low.body.tasks.map((t) => t.title)).toEqual(['Reading']);
      const byCourse = await api('get', '/api/tasks?course=CS%20535&status=In%20Progress');
      expect(byCourse.body.tasks.length).toBe(1);
    });

    it('isolates data between students', async () => {
      const other = await request(app).post('/api/auth/register').send({ name: 'Other', email: 'other@test.dev', password: 'password123' });
      const res = await request(app).get(`/api/tasks/${taskId}`).set('Authorization', `Bearer ${other.body.token}`);
      expect(res.status).toBe(404);
      const list = await request(app).get('/api/tasks').set('Authorization', `Bearer ${other.body.token}`);
      expect(list.body.tasks).toEqual([]);
    });

    it('deletes a task', async () => {
      const tmp = await api('post', '/api/tasks').send({ title: 'Temp', course: 'X', dueDate: inDays(3), estimatedHours: 1 });
      const del = await api('delete', `/api/tasks/${tmp.body.task._id}`);
      expect(del.status).toBe(200);
      expect((await api('get', `/api/tasks/${tmp.body.task._id}`)).status).toBe(404);
    });
  });

  describe('availability', () => {
    it('returns defaults before configuration', async () => {
      const res = await api('get', '/api/availability');
      expect(res.body.availability.configured).toBeFalse();
    });

    it('refuses to plan without availability', async () => {
      const res = await api('post', '/api/plans/generate');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('NO_AVAILABILITY');
    });

    it('rejects invalid time ranges', async () => {
      const res = await api('put', '/api/availability').send({ availableDays: [1], preferredStartTime: '21:00', preferredEndTime: '18:00', maxStudyHoursPerDay: 2 });
      expect(res.status).toBe(400);
      expect(res.body.error.details.preferredEndTime).toBeDefined();
    });

    it('saves weekly availability', async () => {
      const res = await api('put', '/api/availability').send({ availableDays: [0, 1, 2, 3, 4, 5, 6], preferredStartTime: '06:00', preferredEndTime: '23:00', maxStudyHoursPerDay: 4, maxSessionMinutes: 90, breakMinutes: 15 });
      expect(res.status).toBe(200);
      expect(res.body.availability).toEqual(jasmine.objectContaining({ configured: true, maxStudyHoursPerDay: 4 }));
      expect((await api('get', '/api/availability')).body.availability.preferredEndTime).toBe('23:00');
    });
  });

  describe('study plan generation, editing and deletion', () => {
    let plan;
    let sessions;
    let victim;

    it('generates a validated plan in fallback mode without an API key', async () => {
      const res = await api('post', '/api/plans/generate');
      expect(res.status).toBe(201);
      plan = res.body.plan;
      sessions = res.body.sessions;
      expect(plan.generatedBy).toBe('fallback');
      expect(plan.fallbackReason).toContain('No Gemini API key');
      expect(plan.version).toBe(1);
      expect(sessions.length).toBeGreaterThan(0);
      expect(plan.priorities.length).toBe(2);
      for (const s of sessions) {
        expect(s.startTime >= '06:00' && s.endTime <= '23:00').toBeTrue();
        expect(s.duration).toBeLessThanOrEqual(90);
      }
    });

    it('returns the active plan', async () => {
      const res = await api('get', '/api/plans/active');
      expect(res.body.plan._id).toBe(plan._id);
      expect(res.body.sessions.length).toBe(sessions.length);
    });

    it('uses Gemini output when the agent is configured (mocked)', async () => {
      const tasks = (await api('get', '/api/tasks')).body.tasks;
      const target = tasks.find((t) => t.status !== 'Completed');
      setPlanningAgent({
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        isConfigured: () => true,
        proposeSchedule: async (ctx) => ({
          summary: 'Mock Gemini plan',
          prioritizedTasks: ctx.tasks.map((t, i) => ({ taskId: t.id, rank: i + 1, reason: 'mock' })),
          sessions: [{ taskId: target._id, date: ctx.days[1].date, startTime: '20:00', endTime: '21:00', focus: 'Mock focus', explanation: 'mock' }],
        }),
      });
      const res = await api('post', '/api/plans/generate');
      setPlanningAgent(createGeminiAgent({ apiKey: '' }));
      expect(res.status).toBe(201);
      expect(res.body.plan.generatedBy).toBe('gemini');
      expect(res.body.plan.version).toBe(2);
      expect(res.body.sessions.some((s) => s.source === 'ai' && s.focus === 'Mock focus')).toBeTrue();
      const versions = await api('get', '/api/plans');
      expect(versions.body.plans.map((p) => p.status)).toEqual(['active', 'archived']);
    });

    it('falls back when Gemini hits its free-tier limit', async () => {
      setPlanningAgent({ provider: 'gemini', model: 'm', isConfigured: () => true, proposeSchedule: async () => { throw new AiError('RATE_LIMITED', 'Free-tier limit reached'); } });
      const res = await api('post', '/api/plans/generate');
      setPlanningAgent(createGeminiAgent({ apiKey: '' }));
      expect(res.body.plan.generatedBy).toBe('fallback');
      expect(res.body.fallbackCode).toBe('RATE_LIMITED');
      sessions = res.body.sessions;
    });

    it('edits a session to a valid time and marks it as hand-edited', async () => {
      // Move the last session of a multi-session task to the late evening (free time).
      const counts = {};
      sessions.forEach((x) => { counts[x.taskId] = (counts[x.taskId] || 0) + 1; });
      victim = [...sessions].reverse().find((x) => counts[x.taskId] > 1);
      const end = fromMinutes(22 * 60 + victim.duration);
      const res = await api('patch', `/api/sessions/${victim._id}`).send({ date: victim.date, startTime: '22:00', endTime: end });
      expect(res.status).withContext(JSON.stringify(res.body)).toBe(200);
      expect(res.body.session).toEqual(jasmine.objectContaining({ startTime: '22:00', endTime: end, duration: victim.duration, isManuallyEdited: true }));
    });

    it('prevents an edit that overlaps another session', async () => {
      const sibling = sessions.find((x) => x.taskId === victim.taskId && x._id !== victim._id);
      const res = await api('patch', `/api/sessions/${sibling._id}`).send({ date: victim.date, startTime: '22:15', endTime: '22:45' });
      expect(res.status).toBe(422);
      expect(res.body.error.details.reasons.map((r) => r.code)).toContain('OVERLAP');
    });

    it('prevents an edit outside availability', async () => {
      const res = await api('patch', `/api/sessions/${sessions[0]._id}`).send({ date: sessions[0].date, startTime: '23:00', endTime: '23:30' });
      expect(res.status).toBe(422);
      expect(res.body.error.details.reasons[0].code).toBe('OUTSIDE_AVAILABILITY');
    });

    it('deletes a session', async () => {
      const res = await api('delete', `/api/sessions/${sessions[0]._id}`);
      expect(res.status).toBe(200);
      const active = await api('get', '/api/plans/active');
      expect(active.body.sessions.find((x) => x._id === sessions[0]._id)).toBeUndefined();
    });

    it('marks the plan stale when tasks change', async () => {
      await api('post', '/api/tasks').send({ title: 'New quiz', course: 'MATH', dueDate: inDays(2), estimatedHours: 1 });
      const active = await api('get', '/api/plans/active');
      expect(active.body.plan.stale).toBeTrue();
    });
  });

  describe('dashboard and assistant', () => {
    it('returns live statistics', async () => {
      const res = await api('get', '/api/dashboard');
      expect(res.status).toBe(200);
      expect(res.body.user.name).toBe('Test Student');
      expect(res.body.stats.activeTasks).toBe(3);
      expect(res.body.stats.totalEstimatedHours).toBe(8);
      expect(res.body.plan.generatedBy).toBe('fallback');
    });

    it('reports AI status without exposing secrets', async () => {
      const res = await api('get', '/api/ai/status');
      expect(res.body.configured).toBeFalse();
      expect(JSON.stringify(res.body)).not.toMatch(/key/i);
    });

    it('returns a clear message when the assistant is not configured', async () => {
      const res = await api('post', '/api/assistant/chat').send({ message: 'What should I study today?' });
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('AI_NOT_CONFIGURED');
    });

    it('answers via the agent with task context when configured (mocked)', async () => {
      let seenContext = '';
      setPlanningAgent({ provider: 'gemini', model: 'm', isConfigured: () => true, chat: async ({ contextText }) => { seenContext = contextText; return 'Study **New quiz** first.'; } });
      const res = await api('post', '/api/assistant/chat').send({ message: 'What first?', history: [{ role: 'user', content: 'hi' }] });
      setPlanningAgent(createGeminiAgent({ apiKey: '' }));
      expect(res.status).toBe(200);
      expect(res.body.reply).toContain('New quiz');
      expect(seenContext).toContain('New quiz');
    });
  });
});
