/**
 * Seeds a demo account with realistic tasks and availability.
 *   npm run seed            (from the project root or backend/)
 * Login: demo@studymate.app / demo1234
 * Re-running resets the demo account's data (other accounts are untouched).
 */
import bcrypt from 'bcryptjs';
import { env } from '../src/config/env.js';
import { connectDB, disconnectDB, redactUri } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { Task } from '../src/models/Task.js';
import { Availability } from '../src/models/Availability.js';
import { StudyPlan } from '../src/models/StudyPlan.js';
import { StudySession } from '../src/models/StudySession.js';

const DEMO_EMAIL = 'demo@studymate.app';
const DEMO_PASSWORD = 'demo1234';

function inDays(days, hour = 23, minute = 59) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function main() {
  await connectDB(env.mongoUri);
  console.log(`Connected to ${redactUri(env.mongoUri)}`);

  let user = await User.findOne({ email: DEMO_EMAIL });
  if (!user) {
    user = await User.create({ name: 'Alex Rivera', email: DEMO_EMAIL, passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10) });
  }
  await Promise.all([
    Task.deleteMany({ userId: user._id }),
    StudySession.deleteMany({ userId: user._id }),
    StudyPlan.deleteMany({ userId: user._id }),
    Availability.deleteMany({ userId: user._id }),
  ]);

  const uid = user._id;
  await Task.insertMany([
    { userId: uid, title: 'ML Assignment 3 — Neural Nets', course: 'CS 535 Machine Learning', type: 'Assignment', dueDate: inDays(4, 23, 59), estimatedHours: 4, priority: 'High', status: 'In Progress', description: 'Backprop derivations + PyTorch MLP on Fashion-MNIST.' },
    { userId: uid, title: 'Software Engineering Midterm', course: '14:332:452 Software Engineering', type: 'Exam', dueDate: inDays(6, 10, 0), estimatedHours: 6, priority: 'High', description: 'Covers requirements, UML, design patterns, testing.' },
    { userId: uid, title: 'Project slides — sprint demo', course: '14:332:452 Software Engineering', type: 'Project', dueDate: inDays(3, 17, 0), estimatedHours: 2.5, priority: 'Medium' },
    { userId: uid, title: 'Quiz 4 practice', course: 'MATH 250 Linear Algebra', type: 'Quiz', dueDate: inDays(2, 9, 0), estimatedHours: 1.5, priority: 'Medium' },
    { userId: uid, title: 'Read Chapter 7: Distributed Consensus', course: 'CS 417 Distributed Systems', type: 'Reading', dueDate: inDays(9, 12, 0), estimatedHours: 3, priority: 'Low' },
    { userId: uid, title: 'Lab 5 write-up', course: 'CS 417 Distributed Systems', type: 'Assignment', dueDate: inDays(12, 23, 59), estimatedHours: 3, priority: 'Medium' },
    { userId: uid, title: 'Problem Set 2', course: 'MATH 250 Linear Algebra', type: 'Assignment', dueDate: inDays(-3, 23, 59), estimatedHours: 2, priority: 'Medium', status: 'Completed', completedAt: inDays(-4) },
  ]);

  await Availability.create({
    userId: uid,
    availableDays: [0, 1, 2, 3, 4, 5, 6],
    preferredStartTime: '17:00',
    preferredEndTime: '22:00',
    maxStudyHoursPerDay: 3.5,
    maxSessionMinutes: 90,
    breakMinutes: 15,
  });

  console.log(`\nDemo account ready:\n  email:    ${DEMO_EMAIL}\n  password: ${DEMO_PASSWORD}\n`);
  await disconnectDB();
}

main().catch(async (err) => {
  console.error('Seeding failed:', err.message);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
