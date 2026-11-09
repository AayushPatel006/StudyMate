import mongoose from 'mongoose';
import { HttpError } from '../utils/httpError.js';
import { env } from '../config/env.js';

/** Removes keys starting with "$" or containing "." from request bodies (NoSQL injection guard). */
export function sanitizeBody(req, _res, next) {
  const clean = (v) => {
    if (Array.isArray(v)) return v.map(clean);
    if (v && typeof v === 'object') {
      const out = {};
      for (const [k, val] of Object.entries(v)) {
        if (k.startsWith('$') || k.includes('.')) continue;
        out[k] = clean(val);
      }
      return out;
    }
    return v;
  };
  if (req.body && typeof req.body === 'object') req.body = clean(req.body);
  next();
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { message: `Route not found: ${req.method} ${req.originalUrl}`, code: 'NOT_FOUND' } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { message: err.message, code: err.code, details: err.details } });
  }
  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.fromEntries(Object.entries(err.errors).map(([k, e]) => [k, e.message]));
    return res.status(400).json({ error: { message: 'Validation failed', code: 'VALIDATION_ERROR', details } });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ error: { message: `Invalid ${err.path}`, code: 'INVALID_ID' } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { message: 'Malformed JSON body', code: 'BAD_JSON' } });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ error: { message: 'That record already exists', code: 'DUPLICATE' } });
  }
  if (!env.isTest) console.error('[error]', err);
  return res.status(500).json({ error: { message: 'Something went wrong on our side. Please try again.', code: 'INTERNAL' } });
}
