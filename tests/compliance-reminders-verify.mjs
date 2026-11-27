/*
 * tests/compliance-reminders-verify.mjs
 *
 * The 90-day reminder has one job and one rule: **do not nag**.
 *
 * A licence that expires in three months is a problem in three months. The
 * register looks ahead, so the owner is not surprised by a renewal. But a
 * reminder that says the same thing every morning is worse than no reminder,
 * so the planner is pinned down here:
 *
 *   - only what is inside the 90-day window is planned at all
 *   - a row with no date is never planned
 *   - one task per item — the second run does not make a second task
 *   - the owner is told once, and again only if the date moves, the task was
 *     closed by hand, or the item has been overdue for a week
 *
 * The planning is pure, so it is tested without a database.
 *
 * Run: npm run test:compliance-reminders
 */

import assert from 'node:assert/strict';
import {
  REMINDER_WINDOW_DAYS,
  OVERDUE_NAG_DAYS,
  planReminders,
  taskFor,
  buildDigest,
} from '../lib/complianceReminders.js';

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
    process.exitCode = 1;
  }
}

const TODAY = new Date('2026-11-27T09:00:00Z');
const days = (n) => {
  const d = new Date(TODAY);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

console.log('compliance reminders');

check('the window is 90 days', () => {
  assert.equal(REMINDER_WINDOW_DAYS, 90);
});

check('a licence due in 89 days is inside the window', () => {
  const plan = planReminders([{ id: 1, kind: 'licence', name: 'FSSAI', expires_on: days(89) }], { today: TODAY });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].days, 89);
});

check('a licence due in 91 days is not — it is not the reminder\'s business yet', () => {
  const plan = planReminders([{ id: 1, kind: 'licence', name: 'FSSAI', expires_on: days(91) }], { today: TODAY });
  assert.equal(plan.length, 0);
});

check('a row with no date is never planned', () => {
  const plan = planReminders([{ id: 1, kind: 'licence', name: 'FSSAI' }], { today: TODAY });
  assert.equal(plan.length, 0);
});

check('a recurring duty is planned by its next due date, not its last one', () => {
  const plan = planReminders(
    [{ id: 1, kind: 'recurring', name: 'Pest control', last_done_on: days(-10), next_due_on: days(20) }],
    { today: TODAY },
  );
  assert.equal(plan.length, 1);
  assert.equal(plan[0].days, 20);
});

check('an overdue item is planned, and says so', () => {
  const plan = planReminders([{ id: 1, kind: 'licence', name: 'Fire NOC', expires_on: days(-5) }], { today: TODAY });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].days, -5);
  assert.equal(plan[0].reason, 'overdue');
});

check('the plan is soonest first — the list is read, not skimmed', () => {
  const plan = planReminders(
    [
      { id: 1, kind: 'licence', name: 'Far', expires_on: days(80) },
      { id: 2, kind: 'licence', name: 'Near', expires_on: days(5) },
      { id: 3, kind: 'licence', name: 'Overdue', expires_on: days(-2) },
    ],
    { today: TODAY },
  );
  assert.deepEqual(plan.map(p => p.item.name), ['Overdue', 'Near', 'Far']);
});

check('a row that has no task yet asks for one', () => {
  const plan = planReminders([{ id: 1, kind: 'licence', name: 'FSSAI', expires_on: days(30) }], { today: TODAY });
  assert.equal(plan[0].createTask, true);
  assert.equal(plan[0].notify, true);
});

check('a row that already has a task does not ask for a second one', () => {
  const item = { id: 1, kind: 'licence', name: 'FSSAI', expires_on: days(30), reminder_task_id: 77 };
  const tasks = new Map([[77, { id: 77, due_date: days(30), status: 'assigned' }]]);
  const plan = planReminders([item], { today: TODAY, tasks });
  assert.equal(plan[0].createTask, false);
});

check('a task deleted by hand is made again — the item still needs one', () => {
  const item = { id: 1, kind: 'licence', name: 'FSSAI', expires_on: days(30), reminder_task_id: 77 };
  const plan = planReminders([item], { today: TODAY, tasks: new Map() });
  assert.equal(plan[0].createTask, true);
  assert.equal(plan[0].reason, 'its task was deleted by hand');
});

check('a task whose date no longer matches the register is moved, and the owner told', () => {
  const item = {
    id: 1, kind: 'licence', name: 'FSSAI', expires_on: days(30),
    reminder_task_id: 77, reminder_notified_at: new Date(TODAY).toISOString(),
  };
  const tasks = new Map([[77, { id: 77, due_date: days(60), status: 'assigned' }]]);
  const plan = planReminders([item], { today: TODAY, tasks });
  assert.equal(plan[0].updateTaskDate, true);
  assert.equal(plan[0].notify, true);
  assert.equal(plan[0].reason, 'the date moved');
});

check('the owner is told once, and not again the next morning', () => {
  const item = {
    id: 1, kind: 'licence', name: 'FSSAI', expires_on: days(30),
    reminder_task_id: 77, reminder_notified_at: new Date(TODAY).toISOString(),
  };
  const tasks = new Map([[77, { id: 77, due_date: days(30), status: 'assigned' }]]);
  const plan = planReminders([item], { today: TODAY, tasks });
  assert.equal(plan[0].notify, false);
});

check('an overdue item is mentioned again after a week, and not before', () => {
  const item = {
    id: 1, kind: 'licence', name: 'Fire NOC', expires_on: days(-3),
    reminder_task_id: 77, reminder_notified_at: new Date(TODAY).toISOString(),
  };
  const tasks = new Map([[77, { id: 77, due_date: days(-3), status: 'assigned' }]]);
  assert.equal(planReminders([item], { today: TODAY, tasks })[0].notify, false);

  const later = new Date(TODAY.getTime() + (OVERDUE_NAG_DAYS + 1) * 86400000);
  const plan = planReminders([item], { today: later, tasks });
  assert.equal(plan[0].notify, true);
});

check('a task closed by hand is reopened, because the item is still due', () => {
  const item = {
    id: 1, kind: 'licence', name: 'FSSAI', expires_on: days(30),
    reminder_task_id: 77, reminder_notified_at: new Date(TODAY).toISOString(),
  };
  const tasks = new Map([[77, { id: 77, due_date: days(30), status: 'completed' }]]);
  const plan = planReminders([item], { today: TODAY, tasks });
  assert.equal(plan[0].reopenTask, true);
  assert.equal(plan[0].notify, true);
});

check('the task says what the item is, and when it is due', () => {
  const task = taskFor(
    { kind: 'licence', name: 'FSSAI Food Licence', expires_on: '2027-02-27', authority: 'FSSAI', reference_no: '1234' },
    { days: 92 },
  );
  assert.match(task.title, /FSSAI Food Licence/);
  assert.match(task.description, /Valid until 2027-02-27/);
  assert.match(task.description, /Issued by FSSAI/);
  assert.match(task.description, /Number 1234/);
  assert.equal(task.due_date, '2027-02-27');
  assert.equal(task.priority, 'normal');
});

check('a recurring duty gets a "Do" task, not a "Renew" one', () => {
  const task = taskFor(
    { kind: 'recurring', name: 'Pest control', cadence: 'monthly', last_done_on: '2026-11-01', next_due_on: '2026-12-01' },
    { days: 4 },
  );
  assert.match(task.title, /^Do: Pest control/);
  assert.match(task.description, /monthly/);
  assert.equal(task.due_date, '2026-12-01');
});

check('the closer it is, the louder the task', () => {
  const item = { kind: 'licence', name: 'FSSAI', expires_on: '2027-02-27' };
  assert.equal(taskFor(item, { days: -1 }).priority, 'urgent');
  assert.equal(taskFor(item, { days: 20 }).priority, 'high');
  assert.equal(taskFor(item, { days: 80 }).priority, 'normal');
});

check('the digest is one mail for the whole run, listing every item', () => {
  const plan = planReminders(
    [
      { id: 1, kind: 'licence', name: 'FSSAI Food Licence', expires_on: days(20) },
      { id: 2, kind: 'recurring', name: 'Pest control', next_due_on: days(-2) },
    ],
    { today: TODAY },
  );
  const digest = buildDigest(plan);
  assert.match(digest.subject, /2 things/);
  assert.match(digest.text, /FSSAI Food Licence/);
  assert.match(digest.text, /Pest control/);
  assert.match(digest.text, /due in 20 days/);
  assert.match(digest.text, /2 days overdue/);
});

check('one item in the digest says so by name', () => {
  const plan = planReminders([{ id: 1, kind: 'licence', name: 'FSSAI Food Licence', expires_on: days(20) }], { today: TODAY });
  const digest = buildDigest(plan);
  assert.match(digest.subject, /FSSAI Food Licence/);
});

check('a name with a bracket in it cannot break out of the html', () => {
  const plan = planReminders(
    [{ id: 1, kind: 'licence', name: '<script>alert(1)</script>', expires_on: days(20) }],
    { today: TODAY },
  );
  const digest = buildDigest(plan);
  assert.ok(!digest.html.includes('<script>'));
  assert.match(digest.html, /&lt;script&gt;/);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error('\nSome checks failed.');
