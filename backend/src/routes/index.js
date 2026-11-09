import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, timezone } from '../middleware/auth.js';
import { env } from '../config/env.js';
import * as auth from '../controllers/authController.js';
import * as tasks from '../controllers/taskController.js';
import * as availability from '../controllers/availabilityController.js';
import * as plans from '../controllers/planController.js';
import * as dashboard from '../controllers/dashboardController.js';
import * as assistant from '../controllers/assistantController.js';

const router = Router();

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: env.isTest ? 1000 : 50, standardHeaders: 'draft-7', legacyHeaders: false });
// Protects the free-tier Gemini quota from accidental hammering.
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: env.isTest ? 1000 : 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { message: 'Too many AI requests — please wait a minute.', code: 'LOCAL_RATE_LIMIT' } },
});

router.get('/health', (_req, res) => res.json({ ok: true, service: 'studymate-api' }));

// Auth (UC-1 / FR-1)
router.post('/auth/register', authLimiter, auth.register);
router.post('/auth/login', authLimiter, auth.login);

// Everything below requires login (NFR-4).
router.use(requireAuth, timezone);

router.get('/auth/me', auth.me);
router.patch('/auth/me', auth.updateMe);

router.get('/dashboard', dashboard.getDashboard);

router.get('/tasks', tasks.listTasks);
router.post('/tasks', tasks.createTask);
router.get('/tasks/:id', tasks.getTask);
router.patch('/tasks/:id', tasks.updateTask);
router.delete('/tasks/:id', tasks.deleteTask);

router.get('/availability', availability.getMyAvailability);
router.put('/availability', availability.saveMyAvailability);

router.get('/plans', plans.listPlans);
router.get('/plans/active', plans.getActive);
router.post('/plans/generate', aiLimiter, plans.generate);
router.patch('/sessions/:id', plans.updateSession);
router.delete('/sessions/:id', plans.deleteSession);

router.get('/ai/status', assistant.aiStatus);
router.post('/assistant/chat', aiLimiter, assistant.chat);

export default router;
