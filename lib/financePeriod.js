/**
 * lib/financePeriod.js — the calendar month the finance dashboards report on.
 *
 * The 20th–19th pay cycle stays the basis for salary processing and variable
 * pay. The finance dashboards answer a different question — "how is this
 * month going?" — so they use the plain calendar month, which starts again on
 * the 1st.
 *
 * Everything here is computed in IST (UTC+05:30). The server runs in UTC and
 * the nightly sync runs at 23:30 UTC, which is 05:00 IST the next morning —
 * so "today" must never be read off the server's own clock. On the last day
 * of a month the two disagree, and the business day would be wrong.
 */

const IST_OFFSET_MINUTES = 330;

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * The current moment, shifted so that its UTC fields hold the IST calendar
 * fields. Reading getUTC*() off the result gives the IST date.
 */
export function nowInIST(date = new Date()) {
  return new Date(date.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
}

/** Today's date in IST, as 'YYYY-MM-DD'. */
export function todayInIST(date = new Date()) {
  const ist = nowInIST(date);
  return `${ist.getUTCFullYear()}-${pad2(ist.getUTCMonth() + 1)}-${pad2(ist.getUTCDate())}`;
}

/** The month a date falls in, as 'YYYY-MM' (IST). */
export function monthKeyOf(date = new Date()) {
  const ist = nowInIST(date);
  return `${ist.getUTCFullYear()}-${pad2(ist.getUTCMonth() + 1)}`;
}

function lastDayOfMonth(year, month /* 1-12 */) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * The first and last day of a calendar month.
 * @param {string} key 'YYYY-MM'
 */
export function monthWindow(key) {
  const [year, month] = key.split('-').map(Number);
  if (!year || !month || month < 1 || month > 12) return null;
  const end = `${key}-${pad2(lastDayOfMonth(year, month))}`;
  return { key, start: `${key}-01`, end };
}

/** The month before the given one, as 'YYYY-MM'. */
export function previousMonthKey(key) {
  const [year, month] = key.split('-').map(Number);
  const prev = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return `${prevYear}-${pad2(prev)}`;
}

/** The month after the given one, as 'YYYY-MM'. */
export function nextMonthKey(key) {
  const [year, month] = key.split('-').map(Number);
  const next = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${nextYear}-${pad2(next)}`;
}

/**
 * The window the dashboards report on.
 *
 * The default is the current calendar month, up to today. The window rolls
 * over on the 1st by itself — nothing has to be reset by hand.
 *
 * @param {string|null} requestedKey a 'YYYY-MM' month to look at instead
 */
export function financePeriod(requestedKey = null) {
  const today = todayInIST();
  const currentKey = monthKeyOf();

  let key = currentKey;
  if (requestedKey && /^\d{4}-\d{2}$/.test(requestedKey)) {
    const window = monthWindow(requestedKey);
    if (window) key = requestedKey;
  }

  const window = monthWindow(key);
  const isCurrentMonth = key === currentKey;

  return {
    key,
    label: monthLabel(key),
    start: window.start,
    end: window.end,
    // A month still running only counts the days that have happened. A month
    // that is over counts all of them.
    through: isCurrentMonth ? (today < window.end ? today : window.end) : window.end,
    isCurrentMonth,
    isComplete: !isCurrentMonth,
    previousKey: previousMonthKey(key),
    nextKey: nextMonthKey(key),
  };
}

/** '2026-11' -> 'November 2026'. */
export function monthLabel(key) {
  const [year, month] = key.split('-').map(Number);
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${names[month - 1]} ${year}`;
}

/**
 * The window to pull from Petpooja for a calendar month.
 *
 * `through` is the last day that has actually happened: today for the month
 * that is running, the last day of the month for one that is over. Pulling a
 * month up to its last day is what finalises it.
 */
export function petpoojaMonthWindow(key, { today = todayInIST() } = {}) {
  const window = monthWindow(key);
  if (!window) return null;
  const through = today < window.end ? today : window.end;
  return { key, start: window.start, end: window.end, through };
}
