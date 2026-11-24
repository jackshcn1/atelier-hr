/**
 * tests/purchase-refresh-verify.mjs
 *
 * The twice-weekly refresh of the last 90 days of purchases.
 *
 * Two things have to hold. A refresh may only ever touch the purchases —
 * never the sales report, never the pay periods, never the variable-pay
 * figures. And a bill that Petpooja no longer has is removed only after it
 * has been missing at two refreshes **and** for three days, because a deleted
 * document leaves no trace, a single odd export must never remove a good bill,
 * and the Bills page can now ask for a refresh by hand.
 *
 * Run: npm run test:refresh
 */

import assert from 'node:assert/strict';
import {
  billKey,
  daysSince,
  describeRefresh,
  isPetpoojaRow,
  isReadyForRemoval,
  MIN_DAYS_BEFORE_REMOVAL,
  MISSES_BEFORE_REMOVAL,
  parseRefreshRequest,
  reconcilePurchases,
  valueOf,
} from '../lib/purchaseRefresh.js';

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

const params = (query) => new URLSearchParams(query);
const TODAY = '2026-11-19';

console.log('purchase refresh');

await check('an ordinary run is not a refresh', () => {
  const result = parseRefreshRequest(params(''), { today: TODAY });
  if (!result.ok) throw new Error(result.error);
  if (result.refresh) throw new Error('an ordinary run was taken for a refresh');
});

await check('a refresh reads the last N days, ending today', () => {
  const result = parseRefreshRequest(params('refresh=90'), { today: TODAY });
  if (!result.ok) throw new Error(result.error);
  if (!result.refresh) throw new Error('the refresh was not recognised');
  if (result.days !== 90) throw new Error(`${result.days} days`);
  if (result.to !== TODAY) throw new Error(`the window ends ${result.to}`);
  if (result.from !== '2026-08-22') throw new Error(`the window starts ${result.from}`);
});

await check('a refresh of one day is a window of one day', () => {
  const result = parseRefreshRequest(params('refresh=1'), { today: TODAY });
  if (!result.ok) throw new Error(result.error);
  if (result.from !== TODAY || result.to !== TODAY) throw new Error(`${result.from} → ${result.to}`);
});

await check('a refresh that asks for nothing sensible is refused', () => {
  for (const query of ['refresh=0', 'refresh=-5', 'refresh=400', 'refresh=abc']) {
    const result = parseRefreshRequest(params(query), { today: TODAY });
    if (result.ok) throw new Error(`"${query}" was allowed`);
    if (result.status !== 400) throw new Error(`"${query}" answered ${result.status}`);
  }
});

await check('a refresh cannot be combined with a backfill', () => {
  for (const query of ['refresh=90&from=2026-03-01&to=2026-03-31', 'refresh=90&start=2026-03-01&end=2026-03-31', 'refresh=90&revenueMonth=2026-03']) {
    const result = parseRefreshRequest(params(query), { today: TODAY });
    if (result.ok) throw new Error(`"${query}" was allowed`);
  }
});

await check('a refresh may not run beside a report it must not touch', () => {
  const sales = parseRefreshRequest(params('refresh=90'), { groupReports: ['executive'], today: TODAY });
  if (sales.ok) throw new Error('the sales report was allowed');
  const receivables = parseRefreshRequest(params('refresh=90'), { groupReports: ['due_payment'], today: TODAY });
  if (receivables.ok) throw new Error('the receivables report was allowed');
  const named = parseRefreshRequest(params('refresh=90&reports=purchase_invoices,executive'), { today: TODAY });
  if (named.ok) throw new Error('the sales report was allowed by name');
});

await check('a refresh may run the purchase reports', () => {
  const one = parseRefreshRequest(params('refresh=90'), { groupReports: ['purchase_invoices'], today: TODAY });
  if (!one.ok) throw new Error(one.error);
  if (one.reports.join(',') !== 'purchase_invoices') throw new Error(one.reports.join(','));

  const both = parseRefreshRequest(params('refresh=90'), { today: TODAY });
  if (!both.ok) throw new Error(both.error);
  if (both.reports.length !== 2) throw new Error(both.reports.join(','));
});

await check('a bill is identified by its supplier, its number and its day', () => {
  const a = billKey('Ambrosia - The Classic Bakehouse', 'CBC-1042/26-27', '2026-05-28');
  const b = billKey('AMBROSIA - THE CLASSIC BAKEHOUSE', 'cbc-1042/26-27', '2026-05-28');
  if (a !== b) throw new Error('the case changed the bill');
  if (a === billKey('Ambrosia - The Classic Bakehouse', 'CBC-1042/26-27', '2026-05-29')) {
    throw new Error('the day did not change the bill');
  }
});

await check('the report and the books are compared bill for bill', () => {
  const report = [
    { vendor_name: 'Ambrosia', invoice_number: 'CBC-1', invoice_date: '2026-05-28', amount: 910, payment_status: 'paid' },
    { vendor_name: 'BSP', invoice_number: '48543', invoice_date: '2026-05-09', amount: 1891, payment_status: 'paid' },
  ];
  const books = [
    { vendor_name: 'Ambrosia', invoice_number: 'CBC-1', invoice_date: '2026-05-28', amount: 910, payment_status: 'paid' },
  ];
  const result = reconcilePurchases(report, books);
  if (result.inReport !== 2) throw new Error(`${result.inReport} in the report`);
  if (result.inBooks !== 1) throw new Error(`${result.inBooks} in the books`);
  if (result.matched !== 1) throw new Error(`${result.matched} matched`);
  if (result.missing.length !== 1) throw new Error(`${result.missing.length} missing`);
  if (result.extra.length !== 0) throw new Error(`${result.extra.length} extra`);
});

await check('a bill that does not match is said so', () => {
  const report = [
    { vendor_name: 'Ambrosia', invoice_number: 'CBC-1', invoice_date: '2026-05-28', amount: 910, payment_status: 'paid' },
  ];
  const wrongAmount = [
    { vendor_name: 'Ambrosia', invoice_number: 'CBC-1', invoice_date: '2026-05-28', amount: 900, payment_status: 'paid' },
  ];
  const wrongPayment = [
    { vendor_name: 'Ambrosia', invoice_number: 'CBC-1', invoice_date: '2026-05-28', amount: 910, payment_status: 'unpaid' },
  ];
  if (reconcilePurchases(report, wrongAmount).mismatched.length !== 1) throw new Error('the wrong amount was not caught');
  if (reconcilePurchases(report, wrongPayment).mismatched.length !== 1) throw new Error('the wrong payment state was not caught');
});

await check('a bill Petpooja no longer has is the extra one', () => {
  const report = [
    { vendor_name: 'Ambrosia', invoice_number: 'CBC-1', invoice_date: '2026-05-28', amount: 910, payment_status: 'paid' },
  ];
  const books = [
    { vendor_name: 'Ambrosia', invoice_number: 'CBC-1', invoice_date: '2026-05-28', amount: 910, payment_status: 'paid' },
    { vendor_name: 'Ambrosia', invoice_number: 'CBC-9', invoice_date: '2026-05-18', amount: 5000, payment_status: 'unpaid' },
  ];
  const result = reconcilePurchases(report, books);
  if (result.extra.length !== 1) throw new Error(`${result.extra.length} extra`);
  if (result.extra[0].invoice_number !== 'CBC-9') throw new Error(result.extra[0].invoice_number);
});

await check('a credit note is worth its credit, not its amount', () => {
  if (valueOf({ amount: 0, debit_note: 2237 }, 'credit') !== 2237) throw new Error('the credit is wrong');
  if (valueOf({ amount: 910, debit_note: 0 }, 'bill') !== 910) throw new Error('the amount is wrong');
  const report = [{ vendor_name: 'Ambrosia', invoice_number: '242', invoice_date: '2026-05-15', amount: 2237, payment_status: 'unpaid' }];
  const books = [{ vendor_name: 'Ambrosia', invoice_number: '242', invoice_date: '2026-05-15', amount: 0, debit_note: 2237, payment_status: 'unpaid' }];
  const result = reconcilePurchases(report, books, { kind: 'credit' });
  if (result.matched !== 1) throw new Error(`${result.matched} matched`);
  if (result.mismatched.length !== 0) throw new Error(`${result.mismatched.length} mismatched`);
});

await check('only a Petpooja bill can be missing from Petpooja', () => {
  const petpooja = { source: 'petpooja', description: 'Petpooja purchase bill' };
  const legacy = { source: 'existing', description: 'Petpooja purchase bill' };
  const sheet = { source: 'sheet', description: 'From the accountant invoice sheet' };
  const manual = { source: 'manual', description: 'Gas bill' };
  const untagged = { source: 'existing', description: 'Gas bill' };
  if (!isPetpoojaRow(petpooja)) throw new Error('a Petpooja bill was not recognised');
  if (!isPetpoojaRow(legacy)) throw new Error('an older Petpooja bill was not recognised');
  if (isPetpoojaRow(sheet)) throw new Error("the accountant's bill was taken for Petpooja's");
  if (isPetpoojaRow(manual)) throw new Error('a hand-typed bill was taken for Petpooja’s');
  if (isPetpoojaRow(untagged)) throw new Error('an untagged bill was taken for Petpooja’s');
});

await check('the refresh says what it found', () => {
  const summary = reconcilePurchases(
    [{ vendor_name: 'Ambrosia', invoice_number: 'CBC-1', invoice_date: '2026-05-28', amount: 910, payment_status: 'paid' }],
    [{ vendor_name: 'Ambrosia', invoice_number: 'CBC-9', invoice_date: '2026-05-18', amount: 5000, payment_status: 'unpaid' }],
  );
  const lines = describeRefresh({ ...summary, candidates: summary.extra.length, flagged: [], removed: [], cleared: [] });
  const text = lines.join('\n');
  if (!text.includes('1 bill(s) in Petpooja')) throw new Error('the counts were not said');
  if (!text.includes('1 extra')) throw new Error('the extra was not said');
});

await check('a bill seen missing once is only flagged, never removed', () => {
  const now = new Date('2026-11-24T10:00:00Z');
  if (isReadyForRemoval({ seenCount: 1, firstSeenAt: '2026-11-20T10:00:00Z', now })) {
    throw new Error('a bill seen once was ready to be removed');
  }
});

await check('a bill seen missing twice in a moment is not removed', () => {
  // The button on the Bills page can be pressed twice minutes apart. That is
  // one sighting read twice, not two pieces of evidence.
  const now = new Date('2026-11-24T10:05:00Z');
  const firstSeenAt = '2026-11-24T10:00:00Z';
  if (isReadyForRemoval({ seenCount: 2, firstSeenAt, now })) {
    throw new Error('two presses minutes apart were enough to remove a bill');
  }
});

await check('a bill seen missing twice, two days apart, is still not removed', () => {
  const now = new Date('2026-11-22T10:00:00Z');
  const firstSeenAt = '2026-11-20T10:00:00Z';
  if (isReadyForRemoval({ seenCount: 2, firstSeenAt, now })) {
    throw new Error('two days was treated as enough');
  }
});

await check('a bill missing for three days and seen twice is removed', () => {
  const now = new Date('2026-11-23T10:00:00Z');
  const firstSeenAt = '2026-11-20T10:00:00Z';
  if (!isReadyForRemoval({ seenCount: 2, firstSeenAt, now })) {
    throw new Error('a bill missing for three days was not ready to be removed');
  }
});

await check('the days are counted from the first sighting, not the last', () => {
  // A bill flagged on the 20th and read every day since: it is removed once
  // the three days are up, whatever the sighting count has climbed to.
  const now = new Date('2026-11-23T10:00:00Z');
  const firstSeenAt = '2026-11-20T10:00:00Z';
  if (!isReadyForRemoval({ seenCount: 4, firstSeenAt, now })) {
    throw new Error('a bill missing for three days was not ready to be removed');
  }
  const tooSoon = new Date('2026-11-21T10:00:00Z');
  if (isReadyForRemoval({ seenCount: 9, firstSeenAt, now: tooSoon })) {
    throw new Error('the sighting count overrode the days');
  }
});

await check('a flag with no first sighting is never ready', () => {
  const now = new Date('2026-11-24T10:00:00Z');
  if (isReadyForRemoval({ seenCount: 5, firstSeenAt: null, now })) {
    throw new Error('a bill with no first sighting was ready to be removed');
  }
  if (isReadyForRemoval({ seenCount: 5, firstSeenAt: 'not a date', now })) {
    throw new Error('a bill with an unreadable first sighting was ready to be removed');
  }
});

await check('the days since the first sighting are counted', () => {
  const now = new Date('2026-11-24T10:00:00Z');
  if (daysSince('2026-11-24T10:00:00Z', now) !== 0) throw new Error('same day');
  if (daysSince('2026-11-21T10:00:00Z', now) !== 3) throw new Error('three days');
  if (daysSince('2026-11-25T10:00:00Z', now) !== 0) throw new Error('a day in the future is not days');
  if (daysSince(null, now) !== 0) throw new Error('no stamp is not days');
});

await check('the rule is three days, and two sightings', () => {
  if (MIN_DAYS_BEFORE_REMOVAL !== 3) throw new Error(`${MIN_DAYS_BEFORE_REMOVAL} days`);
  if (MISSES_BEFORE_REMOVAL !== 2) throw new Error(`${MISSES_BEFORE_REMOVAL} sightings`);
});

await check('a flagged bill says how long it has been missing', () => {
  const summary = reconcilePurchases(
    [{ vendor_name: 'Ambrosia', invoice_number: 'CBC-1', invoice_date: '2026-05-28', amount: 910, payment_status: 'paid' }],
    [],
  );
  const fresh = describeRefresh({
    ...summary,
    candidates: 0,
    flagged: [{ row: { vendor_name: 'Ambrosia', invoice_number: 'CBC-9', invoice_date: '2026-05-18' }, seenCount: 1, daysMissing: 0 }],
    removed: [],
    cleared: [],
  });
  if (!fresh.join('\n').includes('after 3 days')) throw new Error('the waiting time was not said');

  const waiting = describeRefresh({
    ...summary,
    candidates: 0,
    flagged: [{ row: { vendor_name: 'Ambrosia', invoice_number: 'CBC-9', invoice_date: '2026-05-18' }, seenCount: 2, daysMissing: 1 }],
    removed: [],
    cleared: [],
  });
  const text = waiting.join('\n');
  if (!text.includes('missing for 1 day')) throw new Error('the days missing were not said');
  if (!text.includes('once 3 days have passed')) throw new Error('the rule was not said');
});

console.log(`\n${passed} check(s) passed`);
