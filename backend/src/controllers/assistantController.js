import { Task } from '../models/Task.js';
import { buildPlanningContext } from '../services/planningContext.js';
import { getPlanningAgent, buildAssistantContext, getAiStatus } from '../services/aiService.js';
import { getActivePlan, getAvailability } from '../services/planStore.js';
import { HttpError, badRequest } from '../utils/httpError.js';
import { env } from '../config/env.js';

export async function chat(req, res) {
  const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
  if (!message) throw badRequest('Type a question first');
  if (message.length > 2000) throw badRequest('Message is too long (max 2000 characters)');
  const history = Array.isArray(req.body.history)
    ? req.body.history.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    : [];

  const agent = getPlanningAgent();
  if (!agent.isConfigured()) {
    throw new HttpError(503, 'The AI assistant needs a Gemini API key. Add GEMINI_API_KEY to backend/.env and restart the server. Everything else in StudyMate works without it.', { code: 'AI_NOT_CONFIGURED' });
  }

  const [tasks, availability, { sessions }] = await Promise.all([
    Task.find({ userId: req.userId }).lean(),
    getAvailability(req.userId),
    getActivePlan(req.userId),
  ]);
  const ctx = buildPlanningContext({ tasks, availability, now: new Date(), tzOffset: req.tzOffset });
  try {
    const reply = await agent.chat({ message, history, contextText: buildAssistantContext(ctx, sessions) });
    res.json({ reply, model: agent.model });
  } catch (err) {
    const status = err.code === 'RATE_LIMITED' ? 429 : 503;
    throw new HttpError(status, err.userMessage || 'The AI assistant is unavailable right now.', { code: `AI_${err.code || 'ERROR'}` });
  }
}

export function aiStatus(_req, res) {
  const agent = getPlanningAgent();
  res.json({
    provider: 'gemini',
    configured: agent.isConfigured(),
    model: agent.isConfigured() ? agent.model : env.gemini.model,
    ...getAiStatus(),
  });
}
