'use client';

import { monthLabel, previousMonthKey, nextMonthKey } from '../../lib/financePeriod.js';

/**
 * FinanceMonthPicker — moves the finance pages between calendar months.
 *
 * The finance dashboards and the P&L report on the plain calendar month, and
 * the month rolls over on the 1st by itself. This lets an earlier month be
 * looked at as well, without changing the URL of the site around it.
 *
 * The month lives in the `?month=YYYY-MM` query parameter, so a month can be
 * shared as a link and survives a refresh.
 *
 * A page that can also report on several months at once asks for it with
 * `onRangeChange`, and the width of the span is kept in `?range=N`. The month
 * stays the **last** month of the span, so the arrows move the whole window
 * rather than changing its length.
 */

/** The month named in the address bar, if there is one. */
export function monthFromLocation() {
  if (typeof window === 'undefined') return null;
  const key = new URLSearchParams(window.location.search).get('month');
  return key && /^\d{4}-\d{2}$/.test(key) ? key : null;
}

/** How many months the address bar asks for. One is just the month itself. */
export function rangeFromLocation() {
  if (typeof window === 'undefined') return 1;
  const value = Number(new URLSearchParams(window.location.search).get('range'));
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(Math.round(value), 24);
}

export function setMonthInLocation(key) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (key) url.searchParams.set('month', key);
  else url.searchParams.delete('month');
  window.history.replaceState({}, '', url);
}

export function setRangeInLocation(count) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (count && count > 1) url.searchParams.set('range', String(count));
  else url.searchParams.delete('range');
  window.history.replaceState({}, '', url);
}

export default function FinanceMonthPicker({
  month,
  currentMonth,
  onChange,
  available = [],
  range = 1,
  onRangeChange = null,
}) {
  // Every month worth offering: the one being looked at, the month on the
  // clock, and every month on record.
  const options = new Set();
  if (month) options.add(month);
  if (currentMonth) options.add(currentMonth);
  for (const entry of available) {
    // The list may hold plain month keys, or rows that carry one.
    options.add(typeof entry === 'string' ? entry : entry?.month);
  }
  const sorted = [...options].filter(Boolean).sort().reverse();

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={() => onChange(previousMonthKey(month))}
        className="btn-secondary text-xs px-2.5 py-1.5"
        aria-label="Previous month"
      >
        ←
      </button>
      <select
        value={month || ''}
        onChange={(e) => onChange(e.target.value)}
        className="field text-sm py-1.5 px-2.5"
        aria-label="Calendar month"
      >
        {sorted.map((key) => (
          <option key={key} value={key}>{monthLabel(key)}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => onChange(nextMonthKey(month))}
        className="btn-secondary text-xs px-2.5 py-1.5"
        aria-label="Next month"
      >
        →
      </button>

      {onRangeChange && (
        <select
          value={range}
          onChange={(e) => onRangeChange(Number(e.target.value))}
          className="field text-sm py-1.5 px-2.5"
          aria-label="How many months to report on"
        >
          <option value={1}>This month</option>
          <option value={3}>Last 3 months</option>
          <option value={6}>Last 6 months</option>
          <option value={12}>Last 12 months</option>
        </select>
      )}
    </div>
  );
}
