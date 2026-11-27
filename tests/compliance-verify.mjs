/**
 * tests/compliance-verify.mjs
 *
 * The compliance register says "due" in two ways — a licence is valid UNTIL
 * a date, a recurring duty was LAST DONE on a date and is NEXT DUE on
 * another. Both answers are computed in `lib/compliance.js`, and the page,
 * the register and any future reminder job must all say the same thing about
 * the same row.
 *
 * These checks pin down that arithmetic.
 *
 * Run: npm run test:compliance
 */

import assert from 'node:assert/strict';
import { dueSoon, itemStatus, nextDueFrom, summarise } from '../lib/compliance.js';

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

console.log('compliance');

check('days until a date counts whole days, and is negative once it has passed', () => {
  assert.equal(itemStatus({ kind: 'licence', expires_on: '2026-11-28' }, TODAY).days, 1);
  assert.equal(itemStatus({ kind: 'licence', expires_on: '2026-11-26' }, TODAY).days, -1);
  assert.equal(itemStatus({ kind: 'licence', expires_on: '2026-12-27' }, TODAY).days, 30);
});

check('a licence that has passed is expired, and says how long ago', () => {
  const s = itemStatus({ kind: 'licence', expires_on: '2026-11-20' }, TODAY);
  assert.equal(s.status, 'expired');
  assert.match(s.label, /Expired 7 days ago/);
});

check('a licence inside 30 days is due soon', () => {
  const s = itemStatus({ kind: 'licence', expires_on: '2026-12-10' }, TODAY);
  assert.equal(s.status, 'due_soon');
  assert.match(s.label, /Expires in 13 days/);
});

check('a licence inside 90 days is due, but not yet due soon', () => {
  const s = itemStatus({ kind: 'licence', expires_on: '2027-01-15' }, TODAY);
  assert.equal(s.status, 'due');
});

check('a licence further out is fine', () => {
  const s = itemStatus({ kind: 'licence', expires_on: '2027-06-01' }, TODAY);
  assert.equal(s.status, 'ok');
});

check('a recurring duty is judged on when it is NEXT DUE, not on an expiry', () => {
  const s = itemStatus({ kind: 'recurring', next_due_on: '2026-12-20' }, TODAY);
  assert.equal(s.status, 'due');
  // An expiry date on a recurring duty is not the date it is judged by — and
  // with no next due date it says so rather than guessing.
  assert.equal(itemStatus({ kind: 'recurring', expires_on: '2026-11-20' }, TODAY).status, 'unknown');
});

check('a recurring duty inside 7 days is due soon, sooner than a licence', () => {
  assert.equal(itemStatus({ kind: 'recurring', next_due_on: '2026-12-01' }, TODAY).status, 'due_soon');
  assert.equal(itemStatus({ kind: 'recurring', next_due_on: '2026-11-30' }, TODAY).status, 'due_soon');
  assert.equal(itemStatus({ kind: 'recurring', next_due_on: '2026-11-25' }, TODAY).status, 'expired');
  assert.equal(itemStatus({ kind: 'recurring', next_due_on: '2026-12-20' }, TODAY).status, 'due');
});

check('an item with no date says so, rather than pretending', () => {
  const s = itemStatus({ kind: 'licence' }, TODAY);
  assert.equal(s.status, 'unknown');
  assert.equal(s.label, 'No date');
});

check('the three figures count what they say they count', () => {
  const items = [
    { kind: 'licence', expires_on: '2026-12-10' },   // due soon
    { kind: 'licence', expires_on: '2026-12-25' },   // due soon
    { kind: 'licence', expires_on: '2026-11-10' },   // expired
    { kind: 'recurring', next_due_on: '2026-12-30' },// due
    { kind: 'licence' },                             // no date
  ];
  const s = summarise(items, TODAY);
  assert.equal(s.dueIn30, 2);
  assert.equal(s.overdue, 1);
  assert.equal(s.total, 5);
  assert.equal(s.withoutDate, 1);
});

check('the due list is soonest first', () => {
  const list = dueSoon([
    { id: 1, kind: 'licence', expires_on: '2026-12-20' },
    { id: 2, kind: 'licence', expires_on: '2026-11-29' },
    { id: 3, kind: 'licence', expires_on: '2027-06-01' },
  ], 90, TODAY);
  assert.deepEqual(list.map(e => e.item.id), [2, 1]);
});

check('a recurring duty rolls forward from when it was done', () => {
  assert.equal(nextDueFrom('monthly', '2026-11-28'), '2026-12-28');
  assert.equal(nextDueFrom('quarterly', '2026-11-28'), '2027-02-28');
  assert.equal(nextDueFrom('annual', '2026-11-28'), '2027-11-28');
  assert.equal(nextDueFrom('weekly', '2026-11-28'), '2026-12-05');
  assert.equal(nextDueFrom('fortnightly', '2026-11-28'), '2026-12-12');
  assert.equal(nextDueFrom('monthly', null), null);
});

check('a month from the 31st is the last day of the next month, not the 3rd', () => {
  assert.equal(nextDueFrom('monthly', '2026-01-31'), '2026-02-28');
  assert.equal(nextDueFrom('monthly', '2026-03-31'), '2026-04-30');
  assert.equal(nextDueFrom('annual', '2028-02-29'), '2029-02-28');
});

console.log(`\n${passed} check(s) passed`);
if (process.exitCode) console.error('\nSome checks failed.');
