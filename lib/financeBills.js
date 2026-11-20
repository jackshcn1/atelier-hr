/**
 * lib/financeBills.js — which bills a period covers, and what to say about it.
 *
 * The bills page can be looked at in two ways:
 *
 *   a **month** — the window Petpooja reports on, so the list can be set
 *     beside the same window in Petpooja and compared bill for bill;
 *
 *   a **custom period** — any span of days. A quarter, a financial year, one
 *     supplier's statement, the weeks since a price rise.
 *
 * A bill with no date belongs to no period, so it shows in "All months" only.
 *
 * The dates are compared as text, which works because they are written
 * 'YYYY-MM-DD' — in that form the text order is the date order.
 */

import { monthLabel } from './financePeriod.js';

/**
 * The bills in the chosen period.
 *
 * @param {object[]} bills every bill on record
 * @param {{month?: string, from?: string, to?: string}} period
 *   `month` is 'all', a 'YYYY-MM' key, or 'custom'
 * @returns {object[]} the bills in that period
 */
export function billsInPeriod(bills, { month = 'all', from = '', to = '' } = {}) {
  const rows = bills || [];

  if (month === 'custom') {
    return rows.filter((bill) => {
      const date = String(bill.invoice_date || '').slice(0, 10);
      if (!date) return false;
      if (from && date < from) return false;
      if (to && date > to) return false;
      return true;
    });
  }

  if (month === 'all') return rows;

  return rows.filter((bill) => String(bill.invoice_date || '').slice(0, 7) === month);
}

/**
 * What the period filter is saying, in words.
 *
 * @param {{month?: string, from?: string, to?: string}} period
 */
export function periodNote({ month = 'all', from = '', to = '' } = {}) {
  if (month === 'all') return 'Every bill on record, whatever its date.';
  if (month === 'custom') {
    if (from && to) return `The bills dated ${from} to ${to}.`;
    if (from) return `The bills dated ${from} onwards.`;
    if (to) return `The bills dated up to ${to}.`;
    return 'Every bill with a date on it — set the dates to narrow it down.';
  }
  return `Only the bills dated ${monthLabel(month)} — the same window Petpooja reports on.`;
}
