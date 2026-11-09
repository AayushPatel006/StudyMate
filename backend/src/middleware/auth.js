import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { unauthorized } from '../utils/httpError.js';
import { clampTzOffset } from '../utils/time.js';

export function signToken(userId) {
  return jwt.sign({ sub: userId.toString() }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

/** Requires a valid Bearer token; sets req.userId (ObjectId). */
export function requireAuth(req, _res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(unauthorized());
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    if (!mongoose.isValidObjectId(payload.sub)) throw new Error('bad subject');
    req.userId = new mongoose.Types.ObjectId(payload.sub);
    return next();
  } catch {
    return next(unauthorized('Your session has expired. Please log in again.'));
  }
}

/** Reads the browser's timezone offset (minutes) from X-Timezone-Offset. */
export function timezone(req, _res, next) {
  req.tzOffset = clampTzOffset(req.get('x-timezone-offset'));
  next();
}
