/*
 * tests/compliance-reminders-live.mjs
 *
 * The reminder, checked against the real books.
 *
 * The planner is tested without a database (tests/compliance-reminders-verify.mjs).
 * This one goes further: it puts a row in the real register, runs the real
 * reminder against it, and checks what actually happened — a task was made,
 * the task is linked to the row, the owner was told once and not twice, and a
 * date that moves is followed.
 *
 * It **cleans up after itself**: the test row and the task it made are
 * removed at the end, whatever happens.
 *
 * Run: npm run test:compliance-reminders-live
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { runReminders } from '../lib/complianceReminders.js';

// The same .env.local the app reads.
const env = {};
for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const [key, ...value] = line.split('=');
  if (key && value) env[key.trim()] = value.join('=').trim();
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
});

const TEST_NAME = `ZZ Reminder proof ${Date.now()}`;
const inDays = (n) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

let passed = 0;
let itemId = null;
let taskId = null;

async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
    process.exitCode = 1;
  }
}

async function cleanup() {
  // The rows are found by name as well as by id: a run that dies halfway
  // through must not leave a licence called "ZZ Reminder proof" on the
  // register for the owner to find.
  try {
    await supabase.from('tasks').delete().like('title', '%ZZ Reminder proof%');
    await supabase.from('compliance_items').delete().like('name', 'ZZ Reminder proof%');
  } catch (err) {
    console.error(`  ⚠️  The cleanup could not finish: ${err.message}`);
  }
}

console.log('compliance reminders — live');

try {
  // A row due in 60 days: inside the window, far enough away.
  const { data: item, error: insErr } = await supabase
    .from('compliance_items')
    .insert([{ kind: 'licence', name: TEST_NAME, category: 'Proof', expires_on: inDays(60) }])
    .select()
    .single();
  if (insErr) throw insErr;
  itemId = item.id;

  // The mail is caught, not sent — this is a proof, not a letter to the owner.
  const sent = [];
  const mailer = async (message) => {
    sent.push(message);
    return true;
  };

  const first = await runReminders({ supabase, sendMail: mailer });

  await check('the row inside the window is planned', () => {
    assert.ok(first.due >= 1, `expected at least one item, got ${first.due}`);
  });

  await check('a task is made for it', () => {
    assert.equal(first.created, 1);
  });

  await check('the task is linked to the row', async () => {
    const { data: row } = await supabase
      .from('compliance_items')
      .select('reminder_task_id')
      .eq('id', itemId)
      .single();
    assert.ok(row.reminder_task_id, 'the row has no task id');
    taskId = row.reminder_task_id;
  });

  await check('the task really is in the Tasks hub', async () => {
    const { data: task } = await supabase.from('tasks').select('*').eq('id', taskId).single();
    assert.ok(task, 'the task is not in the database');
    assert.match(task.title, new RegExp(TEST_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(task.due_date, inDays(60));
  });

  await check('the owner is told once', () => {
    assert.equal(sent.length, 1);
    assert.match(sent[0].subject, /Compliance/);
    assert.match(sent[0].text, new RegExp(TEST_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });

  await check('the row is marked as told', async () => {
    const { data: row } = await supabase
      .from('compliance_items')
      .select('reminder_notified_at')
      .eq('id', itemId)
      .single();
    assert.ok(row.reminder_notified_at, 'the row was not marked as told');
  });

  // The second run: the same row, the same day.
  const second = await runReminders({ supabase, sendMail: mailer });

  await check('the second run makes no second task', () => {
    assert.equal(second.created, 0);
  });

  await check('the second run does not tell the owner again', () => {
    assert.equal(sent.length, 1);
  });

  // The date moves — the renewal was pushed back.
  await supabase
    .from('compliance_items')
    .update({ expires_on: inDays(120) })
    .eq('id', itemId);

  const third = await runReminders({ supabase, sendMail: mailer });

  await check('a date that moves out of the window is left alone', () => {
    assert.equal(third.created, 0);
  });

  // The date moves back into the window — the owner is told again.
  await supabase
    .from('compliance_items')
    .update({ expires_on: inDays(45) })
    .eq('id', itemId);

  const fourth = await runReminders({ supabase, sendMail: mailer });

  await check('a date that moves is followed, and the owner told again', () => {
    assert.equal(sent.length, 2);
    assert.equal(fourth.updated, 1);
  });

  await check('the task carries the new date', async () => {
    const { data: task } = await supabase.from('tasks').select('*').eq('id', taskId).single();
    assert.equal(task.due_date, inDays(45));
  });
} catch (err) {
  console.error(`  ✗ The live run failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await cleanup();
  console.log(`\n${passed} checks passed. (the test row and its task are cleaned up)`);
  if (process.exitCode) console.error('\nSome checks failed.');
}
