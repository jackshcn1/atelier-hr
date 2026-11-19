/**
 * lib/purchaseRefresh.js — the twice-weekly refresh of the last 90 days of
 * purchases.
 *
 * The nightly sync pulls the pay cycle that is running, so a bill is looked at
 * for a month after its date and never again. But Petpooja lets a bill be
 * edited or cancelled up to 90 days after its date, so the books drift away
 * from what Petpooja says:
 *
 *   - a bill cancelled after its cycle closed stayed in the books as money owed;
 *   - a payment recorded in Petpooja was never seen, so the bill stayed unpaid;
 *   - an amount that was corrected stayed as it was;
 *   - a bill entered late was never seen at all.
 *
 * The refresh re-reads the last N days of purchases and puts the books right.
 * It runs twice a week, so the books are never more than a few days behind
 * Petpooja.
 *
 * **A bill that Petpooja no longer has.** A document *deleted* outright leaves
 * no trace in any report — there is nothing to read. The only sign is that the
 * bill is in the books and not in the report. That is a weaker signal than a
 * cancellation, so it is handled with two strikes: the first refresh flags it
 * and says so, and the next refresh removes it. A single odd export can never
 * remove a good bill.
 *
 * The rules here are pure and are checked on their own; the parts that touch
 * the database are at the bottom.
 */

import { todayInIST } from './financePeriod.js';

/** The only reports a refresh may pull. */
export const REFRESH_REPORTS = ['purchase_invoices', 'purchase_returns'];

/** How many days a refresh covers when nobody says otherwise. */
export const DEFAULT_REFRESH_DAYS = 90;

/** The longest window a refresh may ask for. */
export const MAX_REFRESH_DAYS = 365;

/** A bill is only removed after it has been missing this many refreshes. */
export const MISSES_BEFORE_REMOVAL = 2;

const DAY_MS = 86400000;

/** Move a 'YYYY-MM-DD' date by a number of days. */
function shiftDays(date, delta) {
  const [year, month, day] = String(date).split('-').map(Number);
  const moved = new Date(Date.UTC(year, month - 1, day) + delta * DAY_MS);
  return `${moved.getUTCFullYear()}-${String(moved.getUTCMonth() + 1).padStart(2, '0')}-${String(
    moved.getUTCDate(),
  ).padStart(2, '0')}`;
}

/**
 * Read the refresh parameters out of a request's query.
 *
 *   ?refresh=90   re-read the last 90 days of purchases
 *
 * A refresh names its own window, so it cannot be combined with a backfill —
 * a backfill asks for a window of history by name, and two windows in one
 * request is one too many.
 *
 * @param {URLSearchParams} params the request's query
 * @param {{groupReports?: string[]|null, requestedReports?: string[]|null,
 *   today?: string}} [options] the reports the request asks for, so a refresh
 *   can refuse to run beside a report it must not touch
 * @returns {{ok: boolean, refresh?: boolean, days?: number, from?: string,
 *   to?: string, reports?: string[], error?: string, status?: number}}
 */
export function parseRefreshRequest(params, { groupReports = null, today = todayInIST() } = {}) {
  const raw = params.get('refresh');
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return { ok: true, refresh: false };
  }

  const days = Number(String(raw).trim());
  if (!Number.isFinite(days) || days < 1 || days > MAX_REFRESH_DAYS) {
    return {
      ok: false,
      status: 400,
      error: `A refresh asks for a number of days between 1 and ${MAX_REFRESH_DAYS}.`,
      expected: { refresh: `1..${MAX_REFRESH_DAYS}` },
    };
  }

  // A refresh and a backfill are two different doors into the same engine.
  const backfillish = ['from', 'to', 'start', 'end', 'revenueMonth'].filter((name) => params.get(name));
  if (backfillish.length > 0) {
    return {
      ok: false,
      status: 400,
      error: `A refresh names its own window — it cannot be combined with ${backfillish.join(', ')}.`,
    };
  }

  // The refresh may only ever pull the purchase reports. The sales report
  // would rewrite a closed month's revenue, and the receivables report is a
  // snapshot that is already fresh every day.
  const asked = String(params.get('reports') || '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  const group = groupReports && groupReports.length ? groupReports : null;

  const named = [...asked, ...(group || [])];
  const notPurchase = named.filter((name) => !REFRESH_REPORTS.includes(name));
  if (notPurchase.length > 0) {
    return {
      ok: false,
      status: 400,
      error: `A refresh may only pull the purchase reports — ${notPurchase.join(', ')} may not be refreshed.`,
      expected: { reports: REFRESH_REPORTS },
    };
  }

  const reports = asked.length ? asked : group || REFRESH_REPORTS;

  // The window is the last N days, ending today.
  const to = today;
  const from = shiftDays(today, -(days - 1));

  return { ok: true, refresh: true, days, from, to, reports };
}

/**
 * The identity of a bill: its supplier, its invoice number and its date.
 *
 * The date is part of it because Petpooja reuses an invoice number — the
 * same number can sit on a cancelled document of one day and on the live
 * bill of another. The case is not part of it, because the same bill is
 * written "AMBROSIA" on one day and "Ambrosia" the next.
 */
export function billKey(vendor, number, date) {
  return `${String(vendor ?? '').trim().toLowerCase()}|${String(number ?? '').trim().toLowerCase()}|${String(
    date ?? '',
  ).trim()}`;
}

/** What a row is worth: a bill's amount, a credit note's credit. */
export function valueOf(row, kind) {
  return kind === 'credit' ? Number(row.debit_note || 0) : Number(row.amount || 0);
}

/**
 * Put the report's rows into the shape the comparison uses.
 *
 * The two reports do not name their columns the same way: a purchase bill
 * carries an invoice number and an invoice date, a debit note carries a debit
 * note number and a debit note date, and both carry the amount as
 * `total_amount`. The comparison only wants one shape, so the rows are
 * renamed here rather than in two places.
 */
export function normaliseReportRows(rows, kind = 'bill') {
  return (rows || []).map((row) => ({
    vendor_name: row.vendor_name,
    invoice_number: kind === 'credit'
      ? String(row.return_number ?? row.invoice_number ?? '').trim()
      : String(row.invoice_number ?? row.return_number ?? '').trim(),
    invoice_date: kind === 'credit'
      ? row.return_date ?? row.invoice_date
      : row.invoice_date ?? row.return_date,
    amount: Number(row.total_amount ?? row.amount ?? 0),
    payment_status: row.payment_status,
  }));
}

/**
 * Compare what Petpooja's report says with what the books hold.
 *
 * @param {Array<object>} reportRows the bills (or debit notes) in the report,
 *   already through `normaliseReportRows`
 * @param {Array<object>} bookRows the same kind of row in the books
 * @param {{kind?: 'bill'|'credit'}} [options]
 * @returns {{inReport: number, inBooks: number, matched: number,
 *   missing: object[], extra: object[], mismatched: object[]}}
 */
export function reconcilePurchases(reportRows, bookRows, { kind = 'bill' } = {}) {
  const report = new Map();
  for (const row of reportRows || []) {
    const key = billKey(row.vendor_name, row.invoice_number, row.invoice_date);
    if (!report.has(key)) report.set(key, row);
  }

  const books = new Map();
  for (const row of bookRows || []) {
    const key = billKey(row.vendor_name, row.invoice_number, row.invoice_date);
    if (!books.has(key)) books.set(key, row);
  }

  const missing = [];
  const extra = [];
  const mismatched = [];
  let matched = 0;

  for (const [key, row] of report) {
    const book = books.get(key);
    if (!book) {
      missing.push(row);
      continue;
    }
    matched += 1;
    const amountDiff = Math.abs(valueOf(book, kind) - Number(row.amount || 0)) > 0.01;
    const bookPaid = String(book.payment_status || '').toLowerCase() === 'paid';
    const reportPaid = String(row.payment_status || '').toLowerCase() === 'paid';
    if (amountDiff || bookPaid !== reportPaid) {
      mismatched.push({ key, book, report: row, amountDiff, paymentDiff: bookPaid !== reportPaid });
    }
  }

  for (const [key, row] of books) {
    if (!report.has(key)) extra.push(row);
  }

  return {
    inReport: report.size,
    inBooks: books.size,
    matched,
    missing,
    extra,
    mismatched,
  };
}

/**
 * Is this row a Petpooja bill — one the refresh is allowed to remove?
 *
 * The rows the accountant wrote in their sheet and the bills a person typed by
 * hand are nobody's but theirs: Petpooja does not know them, so they are
 * never "missing from the report".
 */
export function isPetpoojaRow(row) {
  if (row.source === 'petpooja') return true;
  // The older rows are tagged 'existing' — that is the column's default, so
  // anything written without a source lands there. The description is what
  // tells them apart from a bill a person typed.
  return row.source === 'existing' && String(row.description || '').startsWith('Petpooja');
}

/**
 * Put the books right after a refresh, and say what was done.
 *
 * The bills that Petpooja no longer has are handled with two strikes: the
 * first refresh flags one and says so, and the next refresh removes it.
 *
 * @param {object} supabase a service-role client
 * @param {{kind?: 'bill'|'credit', reportRows: object[], bookRows: object[]}} input
 * @returns {Promise<object>} the reconciliation and what the refresh did
 */
export async function applyRefreshMisses(supabase, { kind = 'bill', reportRows = [], bookRows = [] } = {}) {
  const result = reconcilePurchases(normaliseReportRows(reportRows, kind), bookRows, { kind });

  // Only a row that came from Petpooja can be missing from Petpooja's report.
  const candidates = result.extra.filter(isPetpoojaRow);

  const { data: known, error } = await supabase
    .from('finance_purchase_refresh_misses')
    .select('*')
    .eq('kind', kind);
  if (error) throw error;

  const knownByKey = new Map((known || []).map((row) => [row.bill_key, row]));
  const candidateKeys = new Set(candidates.map((row) => billKey(row.vendor_name, row.invoice_number, row.invoice_date)));

  const flagged = [];
  const removed = [];
  const cleared = [];

  for (const row of candidates) {
    const key = billKey(row.vendor_name, row.invoice_number, row.invoice_date);
    const seen = knownByKey.get(key);
    const stamp = new Date().toISOString();

    if (!seen) {
      const { error: insertError } = await supabase.from('finance_purchase_refresh_misses').insert({
        kind,
        bill_key: key,
        vendor_name: row.vendor_name,
        invoice_number: row.invoice_number,
        invoice_date: row.invoice_date,
        amount: valueOf(row, kind),
        seen_count: 1,
        first_seen_at: stamp,
        last_seen_at: stamp,
      });
      if (insertError) throw insertError;
      flagged.push({ row, seenCount: 1 });
      continue;
    }

    const seenCount = Number(seen.seen_count || 1) + 1;
    if (seenCount >= MISSES_BEFORE_REMOVAL) {
      const { error: deleteError } = await supabase.from('expenses').delete().eq('id', row.id);
      if (deleteError) throw deleteError;
      const { error: clearError } = await supabase
        .from('finance_purchase_refresh_misses')
        .delete()
        .eq('id', seen.id);
      if (clearError) throw clearError;
      removed.push({ row, seenCount });
      continue;
    }

    const { error: updateError } = await supabase
      .from('finance_purchase_refresh_misses')
      .update({ seen_count: seenCount, last_seen_at: stamp })
      .eq('id', seen.id);
    if (updateError) throw updateError;
    flagged.push({ row, seenCount });
  }

  // A flag that no longer applies is cleared: the bill is in the report
  // again, its date was corrected, or it is no longer in the books.
  for (const miss of known || []) {
    if (candidateKeys.has(miss.bill_key)) continue;
    const { error: clearError } = await supabase
      .from('finance_purchase_refresh_misses')
      .delete()
      .eq('id', miss.id);
    if (clearError) throw clearError;
    cleared.push(miss);
  }

  return { ...result, candidates: candidates.length, flagged, removed, cleared };
}

/**
 * The lines the refresh says out loud.
 *
 * A refresh that quietly did nothing looks exactly like a refresh that found
 * nothing, so what it found is said in as many words.
 */
export function describeRefresh(summary, kind = 'bill') {
  const what = kind === 'credit' ? 'debit note(s)' : 'bill(s)';
  const lines = [
    `📊 Refresh check — ${summary.inReport} ${what} in Petpooja's report, ${summary.inBooks} in the books, ` +
      `${summary.matched} matched, ${summary.missing.length} missing, ${summary.candidates ?? summary.extra.length} extra, ` +
      `${summary.mismatched.length} mismatched.`,
  ];

  if (summary.mismatched.length > 0) {
    lines.push(
      `⚠️ ${summary.mismatched.length} ${what} do not match Petpooja's report — the amount or the payment state differs.`,
    );
    for (const row of summary.mismatched.slice(0, 10)) {
      lines.push(
        `   ${row.report.vendor_name} / ${row.report.invoice_number} / ${row.report.invoice_date}` +
          `${row.amountDiff ? ` — ₹${row.report.amount ?? row.report.debit_note ?? 0} against ₹${row.book.amount ?? row.book.debit_note ?? 0}` : ''}` +
          `${row.paymentDiff ? ` — ${row.book.payment_status} against ${row.report.payment_status}` : ''}`,
      );
    }
  }

  for (const item of summary.flagged || []) {
    lines.push(
      `🧾 Flagged: ${item.row.vendor_name} / ${item.row.invoice_number} / ${item.row.invoice_date}` +
        ` — in the books but not in Petpooja's report. It will be removed if it is still missing at the next refresh.`,
    );
  }

  for (const item of summary.removed || []) {
    lines.push(
      `🗑️ Removed: ${item.row.vendor_name} / ${item.row.invoice_number} / ${item.row.invoice_date}` +
        ` — Petpooja no longer has it, and it was missing at ${item.seenCount} refreshes.`,
    );
  }

  if ((summary.cleared || []).length > 0) {
    lines.push(
      `↩️ ${summary.cleared.length} earlier flag(s) cleared — those bills are in Petpooja's report again.`,
    );
  }

  return lines;
}
