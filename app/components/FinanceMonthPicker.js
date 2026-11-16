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
 */

/** The month named in the address bar, if there is one. */
export function monthFromLocation() {
  if (typeof window === 'undefined') return null;
  const key = new URLSearchParams(window.location.search).get('month');
  return key && /^\d{4}-\d{2}$/.test(key) ? key : null;
}

export function setMonthInLocation(key) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (key) url.searchParams.set('month', key);
  else url.searchParams.delete('month');
  window.history.replaceState({}, '', url);
}

export default function FinanceMonthPicker({ month, currentMonth, onChange, available = [] }) {
  // Every month worth offering: the ones with figures, plus the month on the
  // clock, plus the month on the clock's neighbour either side.
  const options = new Set();
  if (month) options.add(month);
  if (currentMonth) options.add(currentMonth);
  for (const m of available) options.add(m.month);
  const sorted = [...options].sort().reverse();

  return (
    <div className="flex items-center gap-2">
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
    </div>
  );
}
