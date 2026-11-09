import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load backend/.env (if present). Real environment variables always win.
dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const nodeEnv = process.env.NODE_ENV || 'development';

let jwtSecret = process.env.JWT_SECRET;
let jwtSecretGenerated = false;
if (!jwtSecret || jwtSecret === 'change_me') {
  // Development convenience: generate a per-process secret so the app still runs.
  // Users will need to log in again after each restart. `npm run setup` writes a persistent one.
  jwtSecret = crypto.randomBytes(32).toString('hex');
  jwtSecretGenerated = true;
}

/**
 * Default Gemini model. gemini-2.5-flash is listed as "Free of charge" on the
 * Gemini API free tier (https://ai.google.dev/gemini-api/docs/pricing, checked Nov 2026).
 * Override with GEMINI_MODEL — use only models marked free on that page.
 */
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

const geminiKey = (process.env.GEMINI_API_KEY || '').trim();

export const env = {
  nodeEnv,
  isTest: nodeEnv === 'test',
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/studymate',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  jwtSecret,
  jwtSecretGenerated,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  gemini: {
    // Treat the placeholder from .env.example as "not configured".
    apiKey: geminiKey && geminiKey !== 'your_api_key_here' ? geminiKey : '',
    model: (process.env.GEMINI_MODEL || '').trim() && process.env.GEMINI_MODEL !== 'your_free_tier_model_name'
      ? process.env.GEMINI_MODEL.trim()
      : DEFAULT_GEMINI_MODEL,
    timeoutMs: Number(process.env.GEMINI_TIMEOUT_MS) || 45000,
  },
};
