// lib/compliance.js — when is a compliance item due?
//
// The register holds three kinds of thing, and they say "due" in two
// different ways:
//
//   a licence or a supplier's certificate is VALID UNTIL a date
//   a recurring duty was LAST DONE on a date and is NEXT DUE on another
//
// Both are answered here, so the page, a future reminder job and a test all
// say the same thing about the same row.

/** Days from today until the date. Negative when the date has passed. */
export function daysUntil(date, today = new Date()) {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  // Both sides are read in UTC, so the answer is the same wherever the
  // browser is — a date is a day, not an instant.
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((end - start) / 86400000);
}

/**
 * The status of one item.
 *
 *   'expired'   the date has passed
 *   'due_soon'  within 30 days (a licence) or 7 days (a recurring duty)
 *   'due'       within 90 days
 *   'ok'        nothing to do yet
 *   'unknown'   no date at all — the row says nothing about when it is due
 *
 * @param {object} item
 * @param {Date} [today]
 * @returns {{status: string, days: number|null, label: string}}
 */
export function itemStatus(item, today = new Date()) {
  const recurring = item?.kind === 'recurring';
  const days = daysUntil(recurring ? item?.next_due_on : item?.expires_on, today);

  if (days === null) return { status: 'unknown', days: null, label: 'No date' };

  if (days < 0) {
    const over = Math.abs(days);
    return {
      status: 'expired',
      days,
      label: recurring ? `${over} day${over === 1 ? '' : 's'} overdue` : `Expired ${over} day${over === 1 ? '' : 's'} ago`,
    };
  }
  if (days === 0) return { status: 'due_soon', days, label: recurring ? 'Due today' : 'Expires today' };

  const soon = recurring ? 7 : 30;
  const soonish = recurring ? 30 : 90;

  if (days <= soon) {
    return {
      status: 'due_soon',
      days,
      label: recurring ? `Due in ${days} day${days === 1 ? '' : 's'}` : `Expires in ${days} day${days === 1 ? '' : 's'}`,
    };
  }
  if (days <= soonish) {
    return { status: 'due', days, label: `Due in ${days} days` };
  }
  return { status: 'ok', days, label: `Due in ${days} days` };
}

/** The day an item falls due, whichever kind it is. */
export function dueDateOf(item) {
  if (!item) return null;
  return item.kind === 'recurring' ? item.next_due_on : item.expires_on;
}

/**
 * The items that want attention, soonest first.
 *
 * @param {object[]} items
 * @param {number} [withinDays]
 * @param {Date} [today]
 */
export function dueSoon(items, withinDays = 90, today = new Date()) {
  return (items || [])
    .map(item => ({ item, ...itemStatus(item, today) }))
    .filter(entry => entry.days !== null && entry.days <= withinDays)
    .sort((a, b) => a.days - b.days);
}

/**
 * The three figures at the top of the page.
 *
 * @param {object[]} items
 * @param {Date} [today]
 */
export function summarise(items, today = new Date()) {
  const list = items || [];
  const statuses = list.map(item => itemStatus(item, today));
  return {
    dueIn30: statuses.filter(s => s.status === 'due_soon' && s.days !== null && s.days <= 30).length,
    overdue: statuses.filter(s => s.status === 'expired').length,
    dueIn90: statuses.filter(s => s.status === 'due' || s.status === 'due_soon').length,
    withoutDate: statuses.filter(s => s.status === 'unknown').length,
    total: list.length,
  };
}

/**
 * The next date a recurring duty is due, from when it was last done.
 *
 * A month from the 31st is the last day of the next month, not the 3rd of
 * the one after — a pest-control visit due on the 31st is still due on the
 * 30th or 31st of the next month, never in the month after that.
 *
 * @param {string} cadence
 * @param {string|Date} lastDone
 * @returns {string|null} an ISO date
 */
export function nextDueFrom(cadence, lastDone) {
  if (!lastDone || !cadence) return null;
  const d = new Date(lastDone);
  if (Number.isNaN(d.getTime())) return null;

  const add = {
    weekly: { days: 7 },
    fortnightly: { days: 14 },
    monthly: { months: 1 },
    quarterly: { months: 3 },
    half_yearly: { months: 6 },
    annual: { months: 12 },
  }[cadence];
  if (!add) return null;

  if (add.days) {
    d.setUTCDate(d.getUTCDate() + add.days);
  } else {
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + add.months);
    const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, lastDay));
  }
  return d.toISOString().slice(0, 10);
}

/** The label a kind is shown under. */
export const KIND_LABELS = {
  licence: 'Ours',
  vendor_cert: 'Vendor',
  recurring: 'Recurring',
};
