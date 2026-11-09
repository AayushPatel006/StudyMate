import mongoose from 'mongoose';

// Strip query operators ($gt, $ne, ...) from filter objects built from user input.
mongoose.set('sanitizeFilter', true);
mongoose.set('strictQuery', true);

export async function connectDB(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  return mongoose.connection;
}

export async function disconnectDB() {
  await mongoose.disconnect();
}

/** Redact credentials from a connection string before logging it. */
export function redactUri(uri) {
  return uri.replace(/\/\/([^@/]+)@/, '//***:***@');
}
