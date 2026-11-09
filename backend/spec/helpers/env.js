// Loaded by Jasmine before any spec: force a deterministic test environment.
process.env.NODE_ENV = 'test';
process.env.GEMINI_API_KEY = ''; // never call the real API from tests
process.env.JWT_SECRET = 'test-secret-not-for-production';
