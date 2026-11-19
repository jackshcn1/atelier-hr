/**
 * tests/sync-backfill-verify.mjs
 *
 * The rules a backfill request has to follow.
 *
 * A backfill moves the window the purchase reports are read for, and the
 * window is part of the pay cycle — so a backfill that was allowed without
 * `finance=1` could write into the variable-pay figures, which are frozen on
 * purpose. These checks are the guard for that.
 *
 * Run: node tests/sync-backfill-verify.mjs
 */

import { parseBackfillRequest } from '../lib/syncBackfill.js';
import { repeatsAnotherMonth } from '../lib/financePeriod.js';

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

const query = (text) => new URLSearchParams(text);
const ask = (text, options = {}) => parseBackfillRequest(query(text), options);

await check('an ordinary run asks for nothing', () => {
  const result = ask('');
  if (!result.ok) throw new Error('an ordinary run was refused');
  if (result.backfill !== false) throw new Error('an ordinary run was treated as a backfill');
});

await check('a window with both ends is allowed on a finance-only run', () => {
  const result = ask('from=2026-03-01&to=2026-03-31', { financeOnly: true });
  if (!result.ok) throw new Error('the window was refused');
  if (result.from !== '2026-03-01' || result.to !== '2026-03-31') {
    throw new Error('the window was not read');
  }
  if (result.revenueMonth !== null) throw new Error('a month of sales appeared out of nowhere');
});

await check('a month of sales can be asked for on its own', () => {
  const result = ask('from=2026-03-01&to=2026-03-31&revenueMonth=2026-03', { financeOnly: true });
  if (!result.ok) throw new Error('the month was refused');
  if (result.revenueMonth !== '2026-03') throw new Error('the month was not read');
});

await check('a backfill without finance=1 is refused', () => {
  const result = ask('from=2026-03-01&to=2026-03-31', { financeOnly: false });
  if (result.ok) throw new Error('a backfill was allowed to touch the pay cycle');
  if (result.status !== 400) throw new Error(`answered ${result.status}, not 400`);
});

await check('a month of sales without finance=1 is refused as well', () => {
  const result = ask('from=2026-03-01&to=2026-03-31&revenueMonth=2026-03', { financeOnly: false });
  if (result.ok) throw new Error('a backfill was allowed to touch the pay cycle');
});

await check('half a window is refused', () => {
  const onlyStart = ask('from=2026-03-01', { financeOnly: true });
  if (onlyStart.ok) throw new Error('a window with no end was accepted');
  const onlyEnd = ask('to=2026-03-31', { financeOnly: true });
  if (onlyEnd.ok) throw new Error('a window with no start was accepted');
});

await check('a date that is not a date is refused', () => {
  const result = ask('from=2026-3-1&to=2026-03-31', { financeOnly: true });
  if (result.ok) throw new Error('a malformed date was accepted');
});

await check('a month that is not a month is refused', () => {
  const result = ask('from=2026-03-01&to=2026-03-31&revenueMonth=2026-3', { financeOnly: true });
  if (result.ok) throw new Error('a malformed month was accepted');
});

await check('a window that has not happened yet is allowed — it simply reads nothing', () => {
  const result = ask('from=2099-01-01&to=2099-01-31', { financeOnly: true });
  if (!result.ok) throw new Error('the window was refused');
  if (result.from !== '2099-01-01') throw new Error('the window was not read');
});

await check('a sales figure that repeats another month is not written', () => {
  // The Executive Sales Summary sometimes answers with the report's own
  // default window: two different months came back with the very same total.
  const onRecord = [
    { month: '2026-10', total: 1827117.48 },
    { month: '2026-11', total: 1123297.75 },
  ];
  // March came back with the same figure as April.
  if (!repeatsAnotherMonth(21317.32, [...onRecord, { month: '2026-04', total: 21317.32 }], '2026-03')) {
    throw new Error('a repeated figure was let through');
  }
  // A month's own figure is not a repeat of itself.
  if (repeatsAnotherMonth(1827117.48, onRecord, '2026-10')) {
    throw new Error('a month was mistaken for a repeat of itself');
  }
  // A month of its own is fine.
  if (repeatsAnotherMonth(1573255.44, onRecord, '2026-03')) {
    throw new Error('a good figure was refused');
  }
  // Nothing at all is not a repeat — a closed month is not a broken pull.
  if (repeatsAnotherMonth(0, onRecord, '2026-03')) {
    throw new Error('a month with no sales was called a repeat');
  }
});

console.log(`\n${passed} check(s) passed`);
if (process.exitCode) console.error('\nSome checks failed.');
