import { env } from './config/env.js';
import { connectDB, redactUri } from './config/db.js';
import { createApp } from './app.js';

async function main() {
  try {
    await connectDB(env.mongoUri);
    console.log(`[db] Connected to MongoDB at ${redactUri(env.mongoUri)}`);
  } catch (err) {
    console.error(`\n[db] Could not connect to MongoDB at ${redactUri(env.mongoUri)}`);
    console.error(`     ${err.message}`);
    console.error('     Start a local MongoDB server or set MONGODB_URI in backend/.env (see README).\n');
    process.exit(1);
  }

  if (env.jwtSecretGenerated) {
    console.warn('[auth] JWT_SECRET is not set — using a temporary secret (you will be logged out on restart). Run `npm run setup` to create one.');
  }
  if (env.gemini.apiKey) console.log(`[ai] Gemini enabled (model: ${env.gemini.model}, free tier)`);
  else console.log('[ai] No GEMINI_API_KEY — running in fallback mode (built-in scheduling algorithm; assistant disabled).');

  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`[api] StudyMate API listening on http://localhost:${env.port}`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[api] Port ${env.port} is already in use. Set PORT in backend/.env (and VITE_API_PROXY_TARGET for the frontend).`);
    } else console.error(err);
    process.exit(1);
  });
}

main();
