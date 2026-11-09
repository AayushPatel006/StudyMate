import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { signToken } from '../middleware/auth.js';
import { validateAuthInput } from '../validators/index.js';
import { HttpError, notFound, badRequest } from '../utils/httpError.js';

const BCRYPT_ROUNDS = 10;

export async function register(req, res) {
  const { name, email, password } = validateAuthInput(req.body, { register: true });
  const exists = await User.exists({ email });
  if (exists) throw new HttpError(409, 'An account with this email already exists', { code: 'EMAIL_TAKEN', details: { email: 'Email already registered' } });
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await User.create({ name, email, passwordHash });
  res.status(201).json({ token: signToken(user._id), user: user.toPublic() });
}

export async function login(req, res) {
  const { email, password } = validateAuthInput(req.body);
  const user = await User.findOne({ email }).select('+passwordHash');
  const ok = user && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) throw new HttpError(401, 'Incorrect email or password', { code: 'INVALID_CREDENTIALS' });
  res.json({ token: signToken(user._id), user: user.toPublic() });
}

export async function me(req, res) {
  const user = await User.findById(req.userId);
  if (!user) throw notFound('Account not found');
  res.json({ user: user.toPublic() });
}

export async function updateMe(req, res) {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  if (!name || name.length > 80) throw badRequest('Please enter a name (max 80 characters)', { name: 'Name is required' });
  const user = await User.findByIdAndUpdate(req.userId, { name }, { returnDocument: 'after', runValidators: true });
  if (!user) throw notFound('Account not found');
  res.json({ user: user.toPublic() });
}
