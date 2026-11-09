import { parsePlanResponse, classifyError, createGeminiAgent, buildPlannerPayload, AiError } from '../../src/services/aiService.js';
import { buildPlanningContext } from '../../src/services/planningContext.js';
import { NOW, TZ, makeTask, weekdayEvenings } from '../helpers/fixtures.js';

describe('aiService', () => {
  const idMap = new Map([['T1', 'abc123']]);

  describe('parsePlanResponse', () => {
    it('parses JSON and maps short ids back to task ids', () => {
      const text = JSON.stringify({ summary: 'ok', prioritizedTasks: [{ taskId: 'T1', rank: 1, reason: 'soon' }], sessions: [{ taskId: 'T1', date: '2026-11-10', startTime: '9:00', endTime: '10:00', focus: 'f', explanation: 'e' }] });
      const out = parsePlanResponse(text, idMap);
      expect(out.sessions[0]).toEqual({ taskId: 'abc123', date: '2026-11-10', startTime: '09:00', endTime: '10:00', focus: 'f', explanation: 'e' });
      expect(out.prioritizedTasks[0].taskId).toBe('abc123');
    });

    it('accepts markdown-fenced JSON', () => {
      const out = parsePlanResponse('```json\n{"summary":"","sessions":[]}\n```', idMap);
      expect(out.sessions).toEqual([]);
    });

    it('throws INVALID_RESPONSE for malformed output', () => {
      for (const bad of ['', 'not json', '{"summary":"no sessions"}', '[]']) {
        expect(() => parsePlanResponse(bad, idMap)).toThrowMatching((e) => e instanceof AiError && e.code === 'INVALID_RESPONSE');
      }
    });
  });

  describe('classifyError', () => {
    it('maps HTTP 429 / RESOURCE_EXHAUSTED to RATE_LIMITED', () => {
      expect(classifyError({ status: 429, message: 'x' }).code).toBe('RATE_LIMITED');
      expect(classifyError(new Error('RESOURCE_EXHAUSTED: quota')).code).toBe('RATE_LIMITED');
    });
    it('maps auth, model, server, network and timeout errors', () => {
      expect(classifyError({ status: 400, message: 'API key not valid. Please pass a valid API key.' }).code).toBe('INVALID_KEY');
      expect(classifyError({ status: 403, message: 'denied' }).code).toBe('INVALID_KEY');
      expect(classifyError({ status: 404, message: 'models/foo is not found' }).code).toBe('MODEL_UNAVAILABLE');
      expect(classifyError({ status: 503, message: 'overloaded' }).code).toBe('SERVICE_UNAVAILABLE');
      expect(classifyError(new TypeError('fetch failed')).code).toBe('NETWORK');
      const abort = new Error('This operation was aborted');
      abort.name = 'AbortError';
      expect(classifyError(abort).code).toBe('TIMEOUT');
    });
  });

  describe('buildPlannerPayload', () => {
    it('sends only planning data with short ids', () => {
      const t = makeTask({ title: 'Essay', description: 'x'.repeat(500) });
      const ctx = buildPlanningContext({ tasks: [t], availability: weekdayEvenings, now: NOW, tzOffset: TZ });
      const { payload, idMap: map } = buildPlannerPayload(ctx);
      expect(payload.tasks[0].id).toBe('T1');
      expect(map.get('T1')).toBe(t._id.toString());
      expect(payload.tasks[0].notes.length).toBe(200);
      expect(JSON.stringify(payload)).not.toContain(t._id.toString());
      expect(payload.planningDays.every((d) => d.from && d.to)).toBeTrue();
    });
  });

  describe('createGeminiAgent', () => {
    it('reports not configured without an API key', async () => {
      const agent = createGeminiAgent({ apiKey: '' });
      expect(agent.isConfigured()).toBeFalse();
      await expectAsync(agent.chat({ message: 'hi' })).toBeRejectedWith(jasmine.objectContaining({ code: 'NOT_CONFIGURED' }));
    });

    it('requests structured JSON and parses the reply', async () => {
      const t = makeTask();
      const ctx = buildPlanningContext({ tasks: [t], availability: weekdayEvenings, now: NOW, tzOffset: TZ });
      const client = { models: { generateContent: jasmine.createSpy('gen').and.resolveTo({ text: JSON.stringify({ summary: 's', prioritizedTasks: [], sessions: [{ taskId: 'T1', date: '2026-11-10', startTime: '18:00', endTime: '19:00', focus: '', explanation: '' }] }) }) } };
      const agent = createGeminiAgent({ apiKey: 'k', model: 'gemini-2.5-flash', client });
      const out = await agent.proposeSchedule(ctx);
      const req = client.models.generateContent.calls.mostRecent().args[0];
      expect(req.model).toBe('gemini-2.5-flash');
      expect(req.config.responseMimeType).toBe('application/json');
      expect(req.config.responseJsonSchema).toBeDefined();
      expect(out.sessions[0].taskId).toBe(t._id.toString());
    });

    it('converts SDK errors into AiError codes', async () => {
      const client = { models: { generateContent: () => Promise.reject(Object.assign(new Error('Too Many Requests'), { status: 429 })) } };
      const agent = createGeminiAgent({ apiKey: 'k', client });
      await expectAsync(agent.chat({ message: 'hi' })).toBeRejectedWith(jasmine.objectContaining({ code: 'RATE_LIMITED' }));
    });

    it('times out slow requests', async () => {
      const client = { models: { generateContent: ({ config }) => new Promise((_, reject) => config.abortSignal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))) } };
      const agent = createGeminiAgent({ apiKey: 'k', client, timeoutMs: 20 });
      await expectAsync(agent.chat({ message: 'hi' })).toBeRejectedWith(jasmine.objectContaining({ code: 'TIMEOUT' }));
    });
  });
});
