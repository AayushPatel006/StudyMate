import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { Given, When, Then } from '@cucumber/cucumber';
import { computePlan } from '../../src/services/plannerService.js';
import { buildPlanningContext } from '../../src/services/planningContext.js';
import { validateSessionEdit } from '../../src/services/validationService.js';
import { AiError } from '../../src/services/aiService.js';
import { toMinutes, addDays, weekdayOf } from '../../src/utils/time.js';

const DAY_INDEX = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
const localDate = (date, time) => new Date(`${date}T${time}:00-05:00`);

/** Date of the named weekday on/after "today". */
function dateFor(world, dayName) {
  const today = world.today;
  for (let i = 0; i < 7; i += 1) {
    const d = addDays(today, i);
    if (weekdayOf(d) === DAY_INDEX[dayName]) return d;
  }
  throw new Error(`No ${dayName} this week`);
}

const to24 = (h, ampm) => (Number(h) % 12) + (ampm === 'PM' ? 12 : 0);

Given('today is Monday {string} at {string}', function (date, time) {
  this.today = date;
  this.now = localDate(date, time);
});

Given('I have a task {string} due {word} that needs {int} hours', function (title, dayName, hours) {
  // "due Friday" = due at the start of Friday (00:00), i.e. the work must be done before Friday.
  this.tasks.push({
    _id: new mongoose.Types.ObjectId(),
    title,
    course: 'CS 101',
    type: 'Assignment',
    description: '',
    dueDate: localDate(dateFor(this, dayName), '00:00'),
    estimatedHours: hours,
    priority: 'Medium',
    status: 'Pending',
  });
});

Given('I am free {word} to {word} from {int} {word} to {int} {word}', function (fromDay, toDay, sh, sAmPm, eh, eAmPm) {
  const days = [];
  for (let d = DAY_INDEX[fromDay]; d <= DAY_INDEX[toDay]; d += 1) days.push(d);
  this.availability = {
    availableDays: days,
    preferredStartTime: `${String(to24(sh, sAmPm)).padStart(2, '0')}:00`,
    preferredEndTime: `${String(to24(eh, eAmPm)).padStart(2, '0')}:00`,
    maxStudyHoursPerDay: 3,
    maxSessionMinutes: 90,
    breakMinutes: 0,
  };
});

Given('the AI planning service is rate limited', function () {
  this.agent = { model: 'gemini-2.5-flash', isConfigured: () => true, proposeSchedule: async () => { throw new AiError('RATE_LIMITED', 'Free-tier quota reached'); } };
});

Given('the AI proposes a session for {string} on {word} at {int} {word}', function (title, dayName, h, ampm) {
  const world = this;
  this.agent = {
    model: 'gemini-2.5-flash',
    isConfigured: () => true,
    proposeSchedule: async () => {
      const task = world.tasks.find((t) => t.title === title);
      const start = `${String(to24(h, ampm)).padStart(2, '0')}:00`;
      return { summary: '', prioritizedTasks: [], sessions: [{ taskId: task._id.toString(), date: dateFor(world, dayName), startTime: start, endTime: `${String(to24(h, ampm) + 1).padStart(2, '0')}:00`, focus: '', explanation: '' }] };
    },
  };
});

When('I ask for a study plan', async function () {
  this.plan = await computePlan({ tasks: this.tasks, availability: this.availability, now: this.now, tzOffset: this.tzOffset, agent: this.agent });
});

When('I move the first {string} session to {word} at {int} {word}', function (title, dayName, h, ampm) {
  const session = this.plan.sessions.find((s) => s.taskTitle === title);
  const others = this.plan.sessions.filter((s) => s !== session);
  const start = to24(h, ampm) * 60;
  const pad = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const edit = { taskId: session.taskId, date: dateFor(this, dayName), startTime: pad(start), endTime: pad(Math.min(start + session.duration, 24 * 60)) };
  const ctx = buildPlanningContext({ tasks: this.tasks, availability: this.availability, now: this.now, tzOffset: this.tzOffset });
  // Exclude sessions already on the target day that would clash, so the test isolates the rule under test.
  const othersFiltered = others.filter((o) => o.date !== edit.date);
  this.editResult = validateSessionEdit(edit, ctx, othersFiltered);
});

Then('all sessions for {string} are before {word}', function (title, dayName) {
  const limit = dateFor(this, dayName);
  const mine = this.plan.sessions.filter((s) => s.taskTitle === title);
  assert.ok(mine.length > 0, 'expected at least one session');
  for (const s of mine) assert.ok(s.date < limit, `${s.date} is not before ${limit}`);
});

Then('no session is outside my free hours', function () {
  const { availableDays, preferredStartTime, preferredEndTime } = this.availability;
  for (const s of this.plan.sessions) {
    assert.ok(availableDays.includes(weekdayOf(s.date)), `${s.date} is not an available day`);
    assert.ok(toMinutes(s.startTime) >= toMinutes(preferredStartTime), `${s.startTime} starts too early`);
    assert.ok(toMinutes(s.endTime) <= toMinutes(preferredEndTime), `${s.endTime} ends too late`);
  }
});

Then('{string} has {int} hours scheduled', function (title, hours) {
  const minutes = this.plan.sessions.filter((s) => s.taskTitle === title).reduce((a, s) => a + s.duration, 0);
  assert.equal(minutes, hours * 60);
});

Then('I am warned that {string} does not fit before its deadline', function (title) {
  const w = this.plan.warnings.find((x) => x.type === 'INSUFFICIENT_TIME' && x.message.includes(title));
  assert.ok(w, `expected an INSUFFICIENT_TIME warning, got ${JSON.stringify(this.plan.warnings)}`);
});

Then('the plan is marked as generated in fallback mode', function () {
  assert.equal(this.plan.generatedBy, 'fallback');
  assert.equal(this.plan.fallbackCode, 'RATE_LIMITED');
});

Then('the change is accepted', function () {
  assert.deepEqual(this.editResult, []);
});

Then('the change is refused because {string}', function (code) {
  assert.ok(this.editResult.some((r) => r.code === code), JSON.stringify(this.editResult));
});
