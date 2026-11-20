/**
 * tests/finance-bills-verify.mjs
 *
 * The bills page can be looked at in two ways: a month — the window
 * Petpooja reports on — or a custom period, any span of days.
 *
 * These checks pin down that a period covers the bills it says it covers,
 * that a bill with no date belongs to no period, and that the page says in
 * words what it is showing.
 *
 * Run: npm run test:bills
 */

import assert from 'node:assert/strict';
import { billsInPeriod, periodNote } from '../lib/financeBills.js';

let passed = 0;
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

const BILLS = [
  { id: 1, invoice_date: '2026-06-14', amount: 1000 },
  { id: 2, invoice_date: '2026-07-02', amount: 2000 },
  { id: 3, invoice_date: '2026-07-31', amount: 3000 },
  { id: 4, invoice_date: '2026-08-01', amount: 4000 },
  { id: 5, invoice_date: '2026-09-30', amount: 5000 },
  { id: 6, invoice_date: '2026-10-01', amount: 6000 },
  { id: 7, invoice_date: null, amount: 7000 },
];

const ids = (rows) => rows.map((row) => row.id);

await check('every month is every bill', () => {
  assert.deepEqual(ids(billsInPeriod(BILLS, { month: 'all' })), [1, 2, 3, 4, 5, 6, 7]);
});

await check('a month is the bills dated in it', () => {
  assert.deepEqual(ids(billsInPeriod(BILLS, { month: '2026-07' })), [2, 3]);
  assert.deepEqual(ids(billsInPeriod(BILLS, { month: '2026-09' })), [5]);
});

await check('a custom period is the bills dated inside it', () => {
  const rows = billsInPeriod(BILLS, { month: 'custom', from: '2026-07-01', to: '2026-09-30' });
  assert.deepEqual(ids(rows), [2, 3, 4, 5]);
});

await check('the ends of a custom period are included', () => {
  const rows = billsInPeriod(BILLS, { month: 'custom', from: '2026-07-02', to: '2026-09-30' });
  assert.deepEqual(ids(rows), [2, 3, 4, 5], 'a bill on the first day is in');
  const other = billsInPeriod(BILLS, { month: 'custom', from: '2026-07-03', to: '2026-09-30' });
  assert.deepEqual(ids(other), [3, 4, 5], 'a bill before the first day is out');
});

await check('a custom period with one end is still a period', () => {
  assert.deepEqual(ids(billsInPeriod(BILLS, { month: 'custom', from: '2026-08-01' })), [4, 5, 6]);
  assert.deepEqual(ids(billsInPeriod(BILLS, { month: 'custom', to: '2026-07-31' })), [1, 2, 3]);
});

await check('a custom period with no dates is every bill with a date on it', () => {
  const rows = billsInPeriod(BILLS, { month: 'custom' });
  assert.deepEqual(ids(rows), [1, 2, 3, 4, 5, 6]);
});

await check('a bill with no date belongs to no period', () => {
  for (const period of [
    { month: 'all' },
    { month: '2026-07' },
    { month: 'custom', from: '2026-01-01', to: '2026-12-31' },
  ]) {
    if (period.month === 'all') continue;
    const rows = billsInPeriod(BILLS, period);
    assert.ok(!ids(rows).includes(7), 'the undated bill is not in a period');
  }
});

await check('the page says what it is showing', () => {
  assert.match(periodNote({ month: 'all' }), /Every bill on record/);
  assert.match(periodNote({ month: '2026-08' }), /August 2026/);
  assert.match(periodNote({ month: 'custom', from: '2026-07-01', to: '2026-09-30' }), /2026-07-01 to 2026-09-30/);
  assert.match(periodNote({ month: 'custom', from: '2026-07-01' }), /onwards/);
  assert.match(periodNote({ month: 'custom', to: '2026-09-30' }), /up to/);
  assert.match(periodNote({ month: 'custom' }), /set the dates/);
});

console.log(`\n${passed} check(s) passed`);
