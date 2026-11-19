/**
 * lib/syncBackfill.js — what a backfill request is allowed to ask for.
 *
 * The nightly sync pulls the month that is running and the pay cycle that is
 * running. The months before them are never looked at, so filling them in
 * takes a request that names the window it wants:
 *
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD   the window the purchase and
 *                purchase-return reports are read for.
 *   ?revenueMonth=YYYY-MM   one calendar month of sales.
 *
 * A window change moves the pay cycle, and the pay cycle is what payroll and
 * variable pay are built on — so a backfill is only ever allowed on a
 * finance-only run. The rules live here, away from the route, so they can be
 * checked on their own.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

/**
 * Read the backfill parameters out of a request's query.
 *
 * @param {URLSearchParams} params the request's query
 * @param {{financeOnly?: boolean}} [options] whether the run is finance-only
 * @returns {{ok: boolean, backfill?: boolean, from?: string, to?: string,
 *   revenueMonth?: string|null, error?: string, status?: number}}
 */
export function parseBackfillRequest(params, { financeOnly = false } = {}) {
  const from = params.get('from');
  const to = params.get('to');
  const revenueMonth = params.get('revenueMonth');

  // Nothing asked for — this is an ordinary run.
  if (!from && !to && !revenueMonth) return { ok: true, backfill: false };

  const bad = [];
  if (from && !DATE.test(from)) bad.push('from');
  if (to && !DATE.test(to)) bad.push('to');
  if (revenueMonth && !MONTH.test(revenueMonth)) bad.push('revenueMonth');
  if (bad.length > 0) {
    return {
      ok: false,
      status: 400,
      error: `Bad backfill parameter: ${bad.join(', ')}.`,
      expected: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD', revenueMonth: 'YYYY-MM' },
    };
  }

  // A window needs both ends of it. Half a window would silently read the
  // whole report and then filter it, which is not the same thing.
  if (!from || !to) {
    return { ok: false, status: 400, error: 'A backfill window needs both from and to.' };
  }

  if (!financeOnly) {
    return {
      ok: false,
      status: 400,
      error: 'A backfill is only allowed with finance=1 — it must not touch payroll.',
    };
  }

  return { ok: true, backfill: true, from, to, revenueMonth: revenueMonth || null };
}
