import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler, sanitizeBody } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.clientOrigin.split(',').map((s) => s.trim()), credentials: false }));
  app.use(express.json({ limit: '100kb' }));
  app.use(sanitizeBody);
  if (!env.isTest) app.use(morgan('dev'));

  app.get('/', (_req, res) => res.json({ name: 'StudyMate API', docs: '/api/health' }));
  app.use('/api', routes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
