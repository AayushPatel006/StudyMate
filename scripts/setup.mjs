// Creates backend/.env from .env.example (if missing) with a random JWT secret.
// Never overwrites an existing .env. Run: npm run setup
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const example = path.join(root, 'backend', '.env.example');
const target = path.join(root, 'backend', '.env');

if (fs.existsSync(target)) {
  console.log('backend/.env already exists — leaving it unchanged.');
} else {
  const secret = crypto.randomBytes(48).toString('hex');
  const content = fs.readFileSync(example, 'utf8').replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret}`);
  fs.writeFileSync(target, content);
  console.log('Created backend/.env with a random JWT_SECRET.');
}
console.log('\nNext steps:');
console.log('  1. (Optional) paste your free Google AI Studio key into GEMINI_API_KEY in backend/.env');
console.log('  2. Make sure MongoDB is running (or set MONGODB_URI to your Atlas connection string)');
console.log('  3. npm run seed   (optional demo data)');
console.log('  4. npm run dev    → http://localhost:5173');
