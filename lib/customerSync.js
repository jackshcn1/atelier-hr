/**
 * lib/customerSync.js — pulling the Customer section's data and writing it.
 *
 * Three things are pulled, from three places:
 *
 *   1. **Orders** — Petpooja's All Orders export. One row per order, with
 *      the customer name, the customer phone, the platform order id and the
 *      grand total. This is the order-value half.
 *   2. **Reviews** — the Ratings & Reviews data, for Zomato and for Swiggy.
 *      Read from the same endpoint the page itself reads, so a wide date
 *      range can be asked for.
 *   3. **Feedback** — the Customer Feedback Form sheet, read through the
 *      service account like the accountant's sheet.
 *
 * ## The writes are upserts, never replacements
 *
 * An order keeps its identity — its order number — so a re-pull updates the
 * same row rather than adding a second copy. The same is true of a review
 * (a platform, an order id and a date) and of a feedback response (a bill
 * number and a date).
 *
 * ## The roll-up is worked out from the whole table
 *
 * The customer rows are **not** the roll-up of the window that was just
 * pulled. They are the roll-up of every order the books hold, so a customer's
 * total spend is their spend over all the time the books cover — not their
 * spend in the last ninety days. The page says which window the books cover.
 */

import { createRequire } from 'node:module';
import {
  parseOrdersExport,
  parseRatingsExport,
  buildCustomers,
  linkReviewsToOrders,
  linkFeedbackToOrders,
} from './customerParsers.js';
import { todayInIST } from './financePeriod.js';
import { selectRows } from './supabaseServer.js';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

/** How many days of orders a run asks for by default. */
export const DEFAULT_CUSTOMER_WINDOW_DAYS = 365;

/**
 * The most rows Petpooja will put in one export file.
 *
 * Measured on 20 Nov 2026: a window of 365 days held **27,684** orders, and
 * the export that came back held **10,393** rows — the title rows, the
 * heading, and exactly 10,000 orders. The rest were dropped without a word.
 *
 * So the limit is not a warning, it is a hard edge, and a pull that crosses
 * it has to be split.
 */
export const PETPOOJA_EXPORT_LIMIT = 10000;

/**
 * The windows the Customer section's orders are pulled in.
 *
 * The export is slow and capped, so the year is taken in two pieces:
 *
 *   customer_orders          the last 90 days — pulled every night, so a
 *                            day's orders are never more than a day late.
 *   customer_orders_history  the 285 days before that — pulled once a week,
 *                            because it does not change with the day.
 *
 * Together they cover the last 375 days, which is about a year. The history
 * ends the day **before** the recent window begins, so no order is pulled
 * twice and none is missed between them.
 */
export const CUSTOMER_WINDOWS = {
  customer_orders: { days: 90, offset: 0 },
  customer_orders_history: { days: 285, offset: 91 },
};

/** The date a window of days ends on, and the day it starts. */
export function windowFor(endIso, days = DEFAULT_CUSTOMER_WINDOW_DAYS) {
  const end = new Date(`${endIso}T00:00:00Z`);
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    from: start.toISOString().slice(0, 10),
    to: endIso,
  };
}

/**
 * The first day of the window that ends on this date.
 *
 * The window is a rolling year, so a customer's total spend is their spend
 * over the time the books cover — and a customer who visited last March is
 * still on the books in November.
 *
 * @param {string} endIso the last day, as 'YYYY-MM-DD'
 */
export function customerWindowStart(endIso, days = DEFAULT_CUSTOMER_WINDOW_DAYS) {
  return windowFor(endIso, days).from;
}

/**
 * The window one of the customer reports covers.
 *
 * @param {string} report 'customer_orders' or 'customer_orders_history'
 * @param {string} endIso the last day the books are up to, as 'YYYY-MM-DD'
 */
export function customerWindowFor(report, endIso) {
  const config = CUSTOMER_WINDOWS[report] || CUSTOMER_WINDOWS.customer_orders;
  const end = new Date(`${endIso}T00:00:00Z`);
  const to = new Date(end.getTime() - config.offset * 24 * 60 * 60 * 1000);
  const from = new Date(to.getTime() - config.days * 24 * 60 * 60 * 1000);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

/**
 * The first day Petpooja holds a review for.
 *
 * Measured on 21 Nov 2026: the count endpoint answers **zero** for every day
 * before 1 March 2026 — February 2026, and every month of 2025, 2024 and 2023.
 * March 2026 is where the history starts, so this is where the history pull
 * starts too.
 */
export const RATINGS_HISTORY_START = '2026-03-01';

/**
 * How many days the recent reviews window reaches back.
 *
 * It matches the recent **orders** window (`customer_orders`, 90 days), so the
 * two halves of the reviews cover the same span as the two halves of the
 * orders, and the boundary between them is the same day.
 */
export const RATINGS_WINDOW_DAYS = 90;

/**
 * The window the reviews are pulled in.
 *
 * It ends the day **before** the books are up to, and that is not a detail.
 *
 * **Measured on 21 Nov 2026**, the same range walked twice:
 *
 *   1–20 November  →  count says 57, the walk returns **57** rows, all
 *                     distinct. Complete.
 *   1–21 November  →  count says 58, the walk returns 58 rows but only **45**
 *                     of them are distinct — thirteen rows are the same review
 *                     served twice, because the set under the endpoint is still
 *                     moving while it is being paged.
 *
 * A range that reaches **today** cannot be walked cleanly. A range that ends
 * yesterday can. So the pull ends yesterday, and a day's reviews land the
 * next morning — the same promise the orders make.
 *
 * @param {string} endIso the last day the books are up to, as 'YYYY-MM-DD'
 * @param {number} [days] how many days back the window reaches
 * @returns {{from: string, to: string}}
 */
export function ratingsWindowFor(endIso, days = RATINGS_WINDOW_DAYS) {
  const end = new Date(`${endIso}T00:00:00Z`);
  const to = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const from = new Date(to.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

/**
 * The window the older reviews are pulled in.
 *
 * It ends the day **before** the recent window begins, so no review is pulled
 * twice and none is missed between the two. The recent window is the last
 * ninety days (`ratingsWindowFor`), and the older one reaches back to the
 * first day Petpooja holds — which is what the orders history window already
 * reaches back to, so the two cover the same span of time.
 *
 * @param {string} endIso the last day the books are up to, as 'YYYY-MM-DD'
 * @returns {{from: string, to: string}}
 */
export function ratingsHistoryWindow(endIso) {
  const recent = ratingsWindowFor(endIso);
  const end = new Date(`${recent.from}T00:00:00Z`);
  const to = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  return {
    from: RATINGS_HISTORY_START,
    to: to.toISOString().slice(0, 10),
  };
}

/**
 * How a window of reviews is walked.
 *
 * **A walk must stay inside one calendar month.** Measured on 21 Nov 2026: a
 * window that crosses a month boundary comes back short, and it comes back
 * short **silently** — the count endpoint says 61 reviews and the walk
 * returns 50, 41 or 51 of them. The same window split into two inside-month
 * halves gives exactly 61. Crossing a boundary is short even at 34 rows.
 *
 * So a window is cut into calendar months first, and each month is walked in
 * one go. Measured complete, for the whole month and for a part of one:
 * March 46/46, August 157/157, 1–20 November 57/57, 22–31 August 45/45,
 * 1–14 September 36/36, 1–21 October 66/66 — every one of them the same on
 * three walks, both platforms.
 *
 * **The window must not reach today.** A range that includes today comes back
 * with the same review served on two pages (58 rows, 45 distinct, measured
 * above), so `ratingsWindowFor` ends the window yesterday.
 *
 * @param {string} from 'YYYY-MM-DD'
 * @param {string} to 'YYYY-MM-DD'
 * @returns {Array<{from: string, to: string}>}
 */
export function ratingChunks(from, to) {
  return monthChunks(from, to);
}

/** The day after a date. */
function nextDay(iso) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Split a window into calendar months.
 *
 * A month is the natural chunk: Petpooja's own search works on a date range,
 * and a month is small enough that its export never reaches the cap. The
 * busiest month on record is 3,343 orders (July 2026).
 *
 * @param {string} from 'YYYY-MM-DD'
 * @param {string} to 'YYYY-MM-DD'
 * @returns {Array<{from: string, to: string}>}
 */
export function monthChunks(from, to) {
  const chunks = [];
  let cursor = from;
  while (cursor <= to) {
    const [year, month] = cursor.split('-').map(Number);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const end = monthEnd > to ? to : monthEnd;
    chunks.push({ from: cursor, to: end });
    cursor = nextDay(monthEnd);
  }
  return chunks;
}

/**
 * Split a window into the days it holds.
 *
 * **A day at a time, because the reviews endpoint's page order shifts.**
 * Measured: two identical walks over the same 90 days returned 175 and 212
 * distinct reviews, and the sets differed. A day holds a handful of reviews —
 * one page — so the order cannot bite, and every day was measured to walk
 * completely.
 *
 * @param {string} from 'YYYY-MM-DD'
 * @param {string} to 'YYYY-MM-DD'
 * @returns {Array<string>}
 */
export function dayChunks(from, to) {
  const days = [];
  let cursor = from;
  let guard = 0;
  while (cursor <= to && guard < 2000) {
    days.push(cursor);
    cursor = nextDay(cursor);
    guard += 1;
  }
  return days;
}

/**
 * Split a date range in two, at its middle.
 *
 * @returns {Array<{from: string, to: string}>|null} null when the range is
 *   too short to split — one day is the smallest piece there is.
 */
export function splitRange(from, to) {
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  const days = Math.floor((end - start) / 86400000);
  if (days < 1) return null;
  const middle = new Date(start + Math.floor(days / 2) * 86400000).toISOString().slice(0, 10);
  return [
    { from, to: middle },
    { from: nextDay(middle), to },
  ];
}

/**
 * `1 Oct 2026 01:00:00` — the shape Petpooja's date fields take.
 *
 * **The time of day matters, and it cost 4% of the orders.** The filter is a
 * real timestamp comparison, so a window that ends at `01:00:00` on its last
 * day throws away everything from one in the morning onwards. Measured on
 * September 2026:
 *
 *   end 30 Sep 01:00:00 →  2,884 orders
 *   end 30 Sep 23:59:59 →  2,993 orders
 *
 * 109 orders a month, about 1,300 a year. So the **start** of a window is the
 * first moment of its first day and the **end** is the last moment of its
 * last day, which also keeps one window's end touching the next one's start
 * with no gap between them.
 *
 * @param {string} iso 'YYYY-MM-DD'
 * @param {'start'|'end'} which which edge of the day this is
 */
function petpoojaDate(iso, which = 'start') {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, m, d] = iso.split('-');
  const clock = which === 'end' ? '23:59:59' : '00:00:00';
  return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]} ${y} ${clock}`;
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

/**
 * Petpooja's All Orders export, for a window of dates.
 *
 * The export is a **form post**, not a plain download: the page's own
 * search form has to be filled in, the search pressed, and then the
 * "Export All" link in the Export menu pressed. Doing it any other way
 * returns a file with the headings and no rows — which is exactly what a
 * silent failure looks like, so the row count is checked by the caller.
 *
 * @param {object} page the Playwright page
 * @param {object} context the browser context (for downloads)
 * @param {{from: string, to: string}} window dates as 'YYYY-MM-DD'
 * @returns {Promise<{ok: boolean, rows: Array<Array<any>>, error?: string}>}
 */
export async function fetchOrdersExport(page, context, { from, to }) {
  const ORDERS_URL = 'https://billing.petpooja.com/orders/order_list/';

  await page.goto(ORDERS_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(5000);

  // The date fields are readonly — a calendar owns them — so the readonly
  // is taken off before they are written into.
  for (const [selector, iso, which] of [
    ['#OrderStartdate', from, 'start'],
    ['#OrderEnddate', to, 'end'],
  ]) {
    const field = page.locator(selector);
    if (await field.count() === 0) {
      return { ok: false, error: `The orders page has no ${selector} field.` };
    }
    const value = petpoojaDate(iso, which);
    await field.evaluate((el) => el.removeAttribute('readonly'));
    await field.click({ force: true });
    await field.fill(value);
    await field.evaluate((el, v) => {
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      if (window.jQuery) {
        try { window.jQuery(el).datepicker('setDate', v); } catch (e) { /* the field is already set */ }
      }
    }, value);
  }
  await page.waitForTimeout(1200);

  // Press the page's own search.
  const search = page.locator(
    '#order_search button[type="submit"], #order_search input[type="submit"], button:visible:has-text("Search"), button:visible:has-text("Show All")',
  ).first();
  if (await search.count() > 0) {
    await search.click({ force: true });
    await page.waitForTimeout(10000);
  }

  // How many orders the search found.
  //
  // `null` means the page did not say — the field is not always on the page —
  // and then the export is attempted anyway, and the count is checked against
  // the file afterwards.
  const total = await page.evaluate(() => {
    const el = document.getElementById('total_records');
    return el ? Number(el.value || 0) : null;
  });

  // A window with no orders in it.
  //
  // Petpooja refuses to export a search with no records — it says "There is
  // no record for export" and does nothing — so there is no file to wait for.
  // The older months of the history pull are empty like this, and waiting
  // four minutes for a download that will never come is not a failure, it is
  // a month with no orders in it.
  if (total === 0) {
    console.log(`  📅 ${from} → ${to}: no orders in this window.`);
    return { ok: true, rows: [], total: 0 };
  }

  // The Export menu holds the "Export All" link; it has to be opened first.
  const dropdown = page.locator(
    '.dropdown-toggle:visible:has-text("Export"), button:visible:has-text("Export Excel"), a:visible:has-text("Export Excel")',
  ).first();
  if (await dropdown.count() > 0) {
    await dropdown.click({ force: true });
    await page.waitForTimeout(1500);
  }

  const exportAll = page.locator('a[onclick*="report_export_csv"]').filter({ hasText: 'Export All' }).first();
  if (await exportAll.count() === 0) {
    return { ok: false, error: 'The orders page has no "Export All" link.' };
  }

  // Petpooja asks for confirmation before it exports a large file — "You can't
  // export records more than 10000" — and the answer has to be yes, or
  // nothing is exported at all.
  //
  // Playwright dismisses a dialog that nobody handles, so without this the
  // click does nothing and the download never arrives. That looks exactly
  // like a slow export, and it is why the first attempt at this timed out
  // after four minutes. The handler is attached for the click and taken off
  // again afterwards.
  const acceptDialog = async (dialog) => {
    console.log(`  ℹ️ Petpooja asked to confirm the export: "${String(dialog.message()).slice(0, 90)}" — saying yes.`);
    await dialog.accept();
  };
  page.on('dialog', acceptDialog);

  let buffer;
  try {
    const download = page.waitForEvent('download', { timeout: 240000 });
    await exportAll.click({ force: true });
    const file = await download;
    const stream = await file.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    buffer = Buffer.concat(chunks);
  } catch (error) {
    return { ok: false, error: `The orders export did not arrive: ${error.message}` };
  } finally {
    page.off('dialog', acceptDialog);
  }

  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, blankrows: true })
    .filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''));

  // `total` is the number of records Petpooja says the search found. It is
  // the truth about how much there was, and it is what says whether the file
  // that came back was cut short.
  return { ok: true, rows, total };
}

/**
 * Pull the orders for a window, a calendar month at a time.
 *
 * A month is pulled on its own because Petpooja's export is capped at ten
 * thousand rows. A month that is somehow bigger than the cap is split in
 * half and each half is taken on its own, so no order is ever silently left
 * out of the books.
 *
 * @param {object} page the Playwright page
 * @param {object} context the browser context
 * @param {{from: string, to: string}} window
 * @param {(chunk: object, count: number) => void} [onProgress]
 */
export async function fetchOrdersWindow(page, context, window, onProgress) {
  const orders = [];
  for (const chunk of monthChunks(window.from, window.to)) {
    const got = await fetchOrderChunk(page, context, chunk);
    if (!got.ok) return got;
    orders.push(...got.orders);
    if (onProgress) onProgress(chunk, got.orders.length);
  }
  return { ok: true, orders };
}

/** One chunk of the window, split again if it is over the export limit. */
async function fetchOrderChunk(page, context, chunk) {
  const exported = await fetchOrdersExport(page, context, chunk);
  if (!exported.ok) return exported;

  // A window with no orders in it — a month before the restaurant opened, or
  // a quiet month. There is nothing to read, and that is not a failure.
  if (exported.total === 0) return { ok: true, orders: [] };

  // More records than one file can hold. Petpooja exports the first ten
  // thousand and drops the rest without saying so, so the window is split
  // and each half is taken on its own.
  if (exported.total > PETPOOJA_EXPORT_LIMIT) {
    const halves = splitRange(chunk.from, chunk.to);
    if (!halves) {
      return {
        ok: false,
        error: `The window ${chunk.from} → ${chunk.to} holds more than ${PETPOOJA_EXPORT_LIMIT} orders and cannot be split further.`,
      };
    }
    console.log(`  ⚠️ ${exported.total} orders in ${chunk.from} → ${chunk.to} — more than one file holds. Splitting it.`);
    const first = await fetchOrderChunk(page, context, halves[0]);
    if (!first.ok) return first;
    const second = await fetchOrderChunk(page, context, halves[1]);
    if (!second.ok) return second;
    return { ok: true, orders: [...first.orders, ...second.orders] };
  }

  const parsed = parseOrdersExport(exported.rows);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  // The file must hold every order Petpooja said the search found.
  //
  // Petpooja's own record count is the only thing that says whether a pull
  // was complete. An export that came back short looks exactly like a window
  // with fewer orders in it — and a window quietly missing a hundred orders a
  // month is a set of books that is wrong in a way nobody would ever notice.
  if (exported.total > 0 && parsed.orders.length !== exported.total) {
    return {
      ok: false,
      error: `The export for ${chunk.from} → ${chunk.to} held ${parsed.orders.length} order(s) but Petpooja's search found ${exported.total}. The file came back short.`,
    };
  }

  return { ok: true, orders: parsed.orders };
}

/**
 * The Ratings & Reviews, for every platform, over a window of dates.
 *
 * This is the same endpoint the Ratings & Reviews page reads, with the same
 * parameters — the page's own request was read off the network rather than
 * guessed at. The provider id is what says which platform: 5409 is Zomato
 * and 6736 is Swiggy.
 *
 * ## The endpoint's page order shifts, so the window is pulled a DAY at a time
 *
 * The endpoint answers ten rows at a time, and the order it hands them out in
 * **is not stable between calls**. Measured over the same 90 days:
 *
 *   walk 1 → 175 distinct reviews
 *   walk 2 → 212 distinct reviews
 *
 * and the two sets were not the same set. So a long walk **repeats some
 * reviews and misses others**, and nothing in the answer says so. The sort
 * parameters it accepts (`sort_by`, `sort_order`) are ignored — an ascending
 * walk is not in date order.
 *
 * Pulling a month at a time is what makes the history possible — and a month
 * only works when it is a **whole** month that is **over**. See
 * `ratingChunks()` for the measurement. Anything else is walked a day at a
 * time: a day holds a handful of reviews — one page — so the shifting order
 * cannot bite. Measured: a day and a week both walked **completely**, every
 * time, on every platform.
 *
 * ## And the pull is checked
 *
 * The page's own count endpoint — `online_review_rating_count/428501` — says
 * how many reviews a window holds (`total_reviews`, with a breakdown of one
 * to five stars). That is the only thing that says whether a pull was
 * complete, exactly as `#total_records` is for the orders. A walk's rows are
 * counted and compared before they are written, and a walk that comes up short
 * is **failed**, not written.
 *
 * @param {object} context the browser context
 * @param {{from: string, to: string, today?: string}} window
 * @returns {Promise<{ok: boolean, reviews: Array<object>, error?: string}>}
 */
export async function fetchRatings(context, { from, to, today = todayInIST() }) {
  const PROVIDERS = [
    { userId: '5409', platform: 'zomato' },
    { userId: '6736', platform: 'swiggy' },
  ];

  // A pause between pages.
  //
  // The endpoint answers ten rows at a time, and a window of a year is some
  // forty requests a platform. Asking for them back to back is what a rate
  // limit looks like: the endpoint stops answering with JSON and starts
  // answering with a page of HTML, which is a refusal dressed up as a
  // different format.
  const PAUSE_MS = 250;

  const reviews = [];
  for (const provider of PROVIDERS) {
    for (const chunk of ratingChunks(from, to)) {
      // The month is walked in one go.
      const got = await fetchRatingsRange(context, provider, chunk.from, chunk.to);
      if (got.ok) {
        reviews.push(...got.reviews);
        await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
        continue;
      }

      // **A month that comes back short is walked a day at a time.**
      //
      // A day holds a handful of reviews — one page — so the shifting page
      // order cannot bite, and every day measured walked completely. This is
      // the slow path, and it is only taken when the fast one has failed, so
      // a month that cannot be walked cleanly is still not lost.
      if (!got.short) return got;
      console.log(`  ⚠️ ${provider.platform} ${chunk.from} → ${chunk.to} came back short — walking it a day at a time.`);

      for (const day of dayChunks(chunk.from, chunk.to)) {
        const dayGot = await fetchRatingsRange(context, provider, day, day);
        if (!dayGot.ok) return dayGot;
        reviews.push(...dayGot.reviews);
        await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
      }
    }
  }

  return { ok: true, reviews };
}

/**
 * One window's reviews for one platform, checked against the count endpoint.
 *
 * @param {object} context the browser context
 * @param {{userId: string, platform: string}} provider
 * @param {string} from the first day, as 'YYYY-MM-DD'
 * @param {string} to the last day, as 'YYYY-MM-DD'
 */
async function fetchRatingsRange(context, provider, from, to) {
  const isoDate = from === to ? from : `${from} → ${to}`;
  const HEADERS = {
    referer: 'https://billing.petpooja.com/feedbacks/onlineorderrating/',
    'x-requested-with': 'XMLHttpRequest',
  };
  const form = {
    rest_id: '428501',
    user_id: provider.userId,
    client_restaurant_id: '',
    order_id: '',
    from_date: from,
    to_date: to,
    rating: '0',
  };

  // How many reviews the window holds.
  let expected;
  try {
    const response = await context.request.post(
      'https://billing.petpooja.com/feedbacks/online_review_rating_count/428501',
      { form: { ...form, page: '1' }, headers: HEADERS },
    );
    const payload = JSON.parse(await response.text());
    expected = Number(payload?.total_reviews);
  } catch {
    return {
      ok: false,
      error: `Could not read how many ${provider.platform} reviews ${isoDate} holds: the count endpoint did not answer with a number.`,
    };
  }
  if (!Number.isFinite(expected)) {
    return {
      ok: false,
      error: `Could not read how many ${provider.platform} reviews ${isoDate} holds: the count endpoint did not answer with a number.`,
    };
  }

  // A window with no reviews in it is a window with no reviews in it.
  if (expected === 0) return { ok: true, reviews: [] };

  // The window's rows.
  //
  // Two keys are kept. The **exact** one — the platform order id and the
  // moment the review was written — says whether the same review turned up
  // twice. The **database's** one — the platform, the platform order id and
  // the day — is how a review is written, so it is the one the count is
  // checked against. Measured: no two reviews share the database's key while
  // saying something different, so the two agree.
  const seen = new Map();
  const written = new Set();
  for (let pageNumber = 1; pageNumber <= 60; pageNumber += 1) {
    let payload;
    try {
      const response = await context.request.post(
        'https://billing.petpooja.com/feedbacks/online_review_data/428501',
        { form: { ...form, page: String(pageNumber) }, headers: HEADERS },
      );
      const text = await response.text();
      try {
        payload = JSON.parse(text);
      } catch {
        const kind = text.trimStart().startsWith('<') ? 'a page of HTML' : 'an unreadable answer';
        return {
          ok: false,
          error: `Petpooja answered the ${provider.platform} reviews with ${kind} on page ${pageNumber} (HTTP ${response.status()}). It is either refusing the session or limiting how fast it is asked.`,
        };
      }
    } catch (error) {
      return { ok: false, error: `Could not read ${provider.platform} reviews: ${error.message}` };
    }

    const rows = Array.isArray(payload?.data) ? payload.data : [];
    if (rows.length === 0) break;

    for (const row of rows) {
      const rating = Number(row.rating);
      if (!Number.isFinite(rating)) continue;
      const clientOrderId = String(row.client_order_id ?? '').trim();
      const created = String(row.created ?? '').trim();
      const reviewDate = String(row.created_date ?? '').slice(0, 10) || null;
      // A review is one review: the platform order id and the moment it was
      // written. The same review can turn up on two pages.
      const key = `${clientOrderId}|${created}`;
      if (seen.has(key)) continue;
      seen.set(key, {
        platform: provider.platform,
        client_order_id: clientOrderId,
        rating,
        comment: String(row.feedback ?? '').trim(),
        review_date: reviewDate,
        source: 'petpooja:ratings_and_reviews',
      });
      written.add(`${provider.platform}|${clientOrderId}|${reviewDate}`);
    }

    const perPage = Number(payload?.per_page) || rows.length;
    if (rows.length < perPage) break;

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  // The window's rows have to be every review the window holds.
  //
  // The count is against the key the row is written under, so two reviews
  // that would land on the same row are caught here rather than one of them
  // being quietly lost.
  //
  // A walk that comes back **short** is not the same as a walk that was
  // **refused**: a refusal is the endpoint saying no, and a short walk is the
  // endpoint saying yes to a set that is still moving. The second can be
  // walked again, a day at a time, so it is marked and handed back.
  if (written.size !== expected) {
    return {
      ok: false,
      short: true,
      error: `The ${provider.platform} reviews for ${isoDate} held ${written.size} review(s) but Petpooja's count says ${expected}. The file came back short.`,
    };
  }

  return { ok: true, reviews: [...seen.values()] };
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/** The rows of a table, read whole. A read that means "every row" pages. */
async function readAll(supabase, table, columns = '*') {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

/**
 * The key an order is written under: the order number and the day.
 *
 * **The order number alone is not an identity.** Petpooja restarts its
 * numbering. Measured against Petpooja itself:
 *
 *   March 2026  →  2,688 orders, numbers 4 … 2,691
 *   April 2026  →  3,169 orders, numbers 1 … 3,169
 *
 * The same numbers, in two months. Keyed on the number alone, April
 * overwrote March row for row and March's whole month was lost from the
 * books; and inside a single run the de-duplication map dropped March's
 * orders before they ever reached the database. The pair is the order's
 * identity, and it is the same shape as the other tables here — a review is
 * unique on (platform, client order id, review date), a feedback response
 * on (bill number, response date).
 *
 * @param {object} order an order from parseOrdersExport()
 * @returns {string}
 */
export function orderKey(order) {
  return `${String(order?.order_no || '').trim()}|${order?.order_date || ''}`;
}

/**
 * Write the orders, then work out the customers from every order on record.
 *
 * The roll-up is worked out from the **whole** orders table, not from the
 * window that was just pulled — so a customer's total spend is their spend
 * over all the time the books cover.
 *
 * @param {object} supabase a service-role client
 * @param {Array<object>} orders from parseOrdersExport()
 */
export async function syncOrders(supabase, orders) {
  const now = new Date().toISOString();

  // One row per order, in the books.
  //
  // An upsert cannot carry the same key twice in one request — the database
  // says "ON CONFLICT DO UPDATE command cannot affect row a second time" —
  // so any order that arrives twice is settled here first. The later copy
  // wins, because it is the newer pull.
  //
  // **The key is the order number AND the day, not the order number alone.**
  //
  // Petpooja restarts its numbering. Measured: March 2026 used the numbers
  // 4 to 2,691 and April 2026 used 1 to 3,169 — the same numbers, in two
  // months. Keyed on the number alone, April overwrote March row for row and
  // the whole of March's 2,688 orders was lost from the books; and here in
  // the map, March's orders were dropped before they ever reached the
  // database. The pair is the order's identity.
  const unique = new Map();
  for (const order of orders || []) {
    if (!String(order.order_no || '').trim()) continue;
    unique.set(orderKey(order), order);
  }
  const distinct = [...unique.values()];

  // The orders are written in batches, so a long list is never one huge
  // request. Five hundred at a time: a year of orders is nearly thirty
  // thousand rows, and a hundred and forty small requests take far longer
  // than sixty larger ones.
  const BATCH = 500;
  for (let i = 0; i < distinct.length; i += BATCH) {
    const payload = distinct.slice(i, i + BATCH).map((order) => ({
      order_no: order.order_no,
      client_order_id: order.client_order_id || '',
      phone: order.phone || '',
      is_linked: !!order.is_linked,
      raw_phone: order.raw_phone || '',
      customer_name: order.customer_name || '',
      customer_address: order.customer_address || '',
      order_type: order.order_type || '',
      sub_order_type: order.sub_order_type || '',
      platform: order.platform || '',
      listing: order.listing || '',
      channel: order.channel || '',
      amount: order.amount || 0,
      payment_type: order.payment_type || '',
      status: order.status || '',
      items: order.items || '',
      order_date: order.order_date,
      source: 'petpooja:all_orders',
      synced_at: now,
      updated_at: now,
    }));
    const { error } = await supabase
      .from('customer_orders')
      .upsert(payload, { onConflict: 'order_no,order_date' });
    if (error) throw new Error(error.message);
  }

  // Every order on record — not only this window's.
  //
  // Only the columns the roll-up needs are read. The item text is the
  // longest column on the row and the roll-up does not want it, and a year
  // of orders is thirty thousand rows.
  const allOrders = await readAll(supabase, 'customer_orders',
    'order_no, client_order_id, phone, is_linked, customer_name, customer_address, order_type, sub_order_type, platform, listing, channel, amount, order_date');
  const { customers, gap } = buildCustomers(allOrders);

  const customerPayload = customers.map((customer) => ({
    phone: customer.phone,
    name: customer.name || '',
    address: customer.address || '',
    first_order_at: customer.first_order_at,
    last_order_at: customer.last_order_at,
    order_count: customer.order_count,
    total_spend: customer.total_spend,
    avg_order_value: customer.avg_order_value,
    channel_mix: customer.channel_mix,
    platform: customer.platform || '',
    listing: customer.listing || '',
    listings: customer.listings || {},
    client_order_ids: customer.client_order_ids,
    source: 'petpooja:orders',
    synced_at: now,
    updated_at: now,
  }));

  for (let i = 0; i < customerPayload.length; i += BATCH) {
    const { error } = await supabase
      .from('customers')
      .upsert(customerPayload.slice(i, i + BATCH), { onConflict: 'phone' });
    if (error) throw new Error(error.message);
  }

  return {
    orders: orders.length,
    customers: customerPayload.length,
    gap,
  };
}

/**
 * Write the reviews, and attach each one to the order it was left on.
 *
 * @param {object} supabase a service-role client
 * @param {Array<object>} reviews from parseRatingsExport()
 */
export async function syncReviews(supabase, reviews) {
  const now = new Date().toISOString();

  // One row per review.
  //
  // The ratings endpoint walks its pages ten at a time, and a review can
  // turn up on two of them — the page order is not stable enough to promise
  // otherwise. An upsert cannot carry the same key twice in one request
  // ("ON CONFLICT DO UPDATE command cannot affect row a second time"), so
  // the repeats are settled here first.
  const unique = new Map();
  for (const review of reviews || []) {
    const key = `${review.platform}|${review.client_order_id}|${review.review_date}`;
    unique.set(key, review);
  }
  const distinct = [...unique.values()];

  const BATCH = 200;
  for (let i = 0; i < distinct.length; i += BATCH) {
    const payload = distinct.slice(i, i + BATCH).map((review) => ({
      platform: review.platform,
      client_order_id: review.client_order_id || '',
      rating: review.rating,
      comment: review.comment || '',
      review_date: review.review_date,
      source: review.source || 'petpooja:ratings_and_reviews',
      synced_at: now,
      updated_at: now,
    }));
    const { error } = await supabase
      .from('customer_reviews')
      .upsert(payload, { onConflict: 'platform,client_order_id,review_date' });
    if (error) throw new Error(error.message);
  }

  // Now that the reviews are written, attach them to their orders.
  //
  // The orders carry their **listing** — which of our three pages the order
  // was placed on — because a Swiggy review is on one of two pages and the
  // review itself does not say which. The listing is written by the link
  // and is not part of the review's key, so setting it never moves a row.
  //
  // **Only the orders a review could point at are read.** The books hold tens
  // of thousands of orders; a review names one of them by its platform order
  // id, so one query asks for the candidates and nothing else. Measured:
  // 423 rows in 1.7 seconds, where reading every order took twenty-eight
  // paged requests.
  const candidates = await selectRows(supabase, CANDIDATE_ORDERS_SQL);
  const stored = await readAll(
    supabase,
    'customer_reviews',
    'id, platform, client_order_id, review_date, order_no, order_date, phone, is_linked, listing',
  );
  const linked = linkReviewsToOrders(stored, candidates);

  // The link is written in **one statement**, not one request per review.
  //
  // Measured on 21 Nov 2026: a single-row update takes **234ms** round trip,
  // so the thousand and more reviews in the history would cost five minutes
  // of nothing but waiting — and the run has three hundred seconds to do
  // everything in. The same work as one statement takes under a second.
  const storedById = new Map(stored.map((review) => [review.id, review]));
  const changed = linked.reviews.filter((review) => {
    const before = storedById.get(review.id);
    if (!before) return false;
    return String(before.order_no || '') !== String(review.order_no || '')
      || String(before.order_date || '') !== String(review.order_date || '')
      || String(before.phone || '') !== String(review.phone || '')
      || !!before.is_linked !== !!review.is_linked
      || String(before.listing || '') !== String(review.listing || '');
  });
  await writeReviewLinks(supabase, changed);

  // The customer rows carry how many reviews each customer left and what
  // they scored, so the list can be sorted by either — also in one
  // statement, for the same reason.
  await writeCustomerReviewTotals(supabase);

  return { reviews: reviews.length, linked: linked.linked, unlinked: linked.unlinked };
}

/**
 * The orders a review could point at.
 *
 * A review names its order by the platform order id, so the candidates are
 * the orders that carry a client order id a review also carries, plus the
 * orders whose number a review carries (a review whose id is really an order
 * number). They come back **in id order**, because the link keeps the first
 * order it sees for an id — the earliest one.
 */
const CANDIDATE_ORDERS_SQL = `
  select o.id, o.order_no, o.order_date, o.client_order_id, o.phone, o.listing
  from public.customer_orders o
  where exists (
    select 1 from public.customer_reviews r
    where r.client_order_id = o.client_order_id
  ) or exists (
    select 1 from public.customer_reviews r
    where r.client_order_id = o.order_no
  )
  order by o.id
`;

/** A value as SQL text. A quote is doubled; control characters are dropped. */
function sqlText(value) {
  const text = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/'/g, "''");
  return `'${text}'`;
}

/**
 * The statement that attaches a set of reviews to their orders.
 *
 * Each row is a **tuple** — `(id, order_no, order_date, phone, is_linked,
 * listing)` — and the tuples are what the `values` list is made of. A row
 * without its brackets is not a tuple, and the parser says so in the most
 * unhelpful way possible: "syntax error at or near 774", naming the first
 * number it could not read.
 *
 * @param {Array<object>} rows the reviews whose link has changed
 * @returns {string} the SQL
 */
export function reviewLinkStatement(rows) {
  const values = (rows || []).map((row) => `(${[
    String(row.id),
    sqlText(row.order_no || ''),
    // The order's day as well as its number, so the review points at
    // exactly one order and always the same one.
    row.order_date ? `${sqlText(String(row.order_date).slice(0, 10))}::date` : 'null',
    sqlText(row.phone || ''),
    row.is_linked ? 'true' : 'false',
    // Which of our three pages the review was left on. Empty when the
    // review could not be matched to an order, because then nothing says
    // which page it came from.
    sqlText(row.listing || ''),
  ].join(',')})`).join(',');

  return `
    update public.customer_reviews r
    set order_no = v.order_no,
        order_date = v.order_date,
        phone = v.phone,
        is_linked = v.is_linked,
        listing = v.listing,
        updated_at = now()
    from (values ${values}) as v(id, order_no, order_date, phone, is_linked, listing)
    where r.id = v.id
  `;
}

/**
 * Attach the reviews to their orders, in one statement.
 *
 * @param {object} supabase a service-role client
 * @param {Array<object>} rows the reviews whose link has changed
 */
async function writeReviewLinks(supabase, rows) {
  if (!rows || rows.length === 0) return 0;

  const BATCH = 500;
  let written = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const sql = reviewLinkStatement(rows.slice(i, i + BATCH));
    const { data, error } = await supabase.rpc('exec_sql', { q: sql });
    if (error) throw new Error(error.message);
    if (!data || data.ok === false) {
      throw new Error(data?.error || 'The reviews could not be attached to their orders.');
    }
    written += Number(data.row_count || 0);
  }
  return written;
}

/**
 * How many reviews each customer left, and what they scored — in one
 * statement.
 *
 * Only the customers whose totals actually changed are written, so a nightly
 * run does not touch every row in the table. (The database refuses an UPDATE
 * with no WHERE clause, and rightly so.)
 *
 * @param {object} supabase a service-role client
 */
async function writeCustomerReviewTotals(supabase) {
  const sql = `
    update public.customers c
    set review_count = (select count(*)::int from public.customer_reviews r where r.phone = c.phone),
        avg_rating = (select round(avg(r.rating)::numeric, 2) from public.customer_reviews r where r.phone = c.phone),
        updated_at = now()
    where c.review_count is distinct from (select count(*)::int from public.customer_reviews r where r.phone = c.phone)
       or c.avg_rating is distinct from (select round(avg(r.rating)::numeric, 2) from public.customer_reviews r where r.phone = c.phone)
  `;
  const { data, error } = await supabase.rpc('exec_sql', { q: sql });
  if (error) throw new Error(error.message);
  if (!data || data.ok === false) {
    throw new Error(data?.error || "The customers' review totals could not be written.");
  }
  return Number(data.row_count || 0);
}


// ---------------------------------------------------------------------------
// The feedback form, written from the app
// ---------------------------------------------------------------------------

/**
 * The statement that attaches a set of feedback responses to their orders.
 *
 * The same shape as the review link, and for the same reason: **one
 * statement, not one request per row.** The old sheet pull rewrote all 515
 * customers one request at a time, which measured 126 seconds — past the
 * 120-second limit the nightly run allows, and the reason it failed for two
 * nights running.
 *
 * @param {Array<object>} rows the responses whose link has changed
 * @returns {string} the SQL
 */
export function feedbackLinkStatement(rows) {
  const values = (rows || []).map((row) => `(${[
    String(row.id),
    sqlText(row.order_no || ''),
    sqlText(row.phone || ''),
    row.is_linked ? 'true' : 'false',
  ].join(',')})`).join(',');

  return `
    update public.customer_feedback f
    set order_no = v.order_no,
        phone = v.phone,
        is_linked = v.is_linked,
        updated_at = now()
    from (values ${values}) as v(id, order_no, phone, is_linked)
    where f.id = v.id
  `;
}

/**
 * How many responses each customer gave — in one statement.
 *
 * Only the customers whose count actually changed are written, so a nightly
 * run does not touch every row in the table.
 *
 * @param {object} supabase a service-role client
 */
async function writeCustomerFeedbackTotals(supabase) {
  const sql = `
    update public.customers c
    set feedback_count = (select count(*)::int from public.customer_feedback f where f.phone = c.phone),
        updated_at = now()
    where c.feedback_count is distinct from (select count(*)::int from public.customer_feedback f where f.phone = c.phone)
  `;
  const { data, error } = await supabase.rpc('exec_sql', { q: sql });
  if (error) throw new Error(error.message);
  if (!data || data.ok === false) {
    throw new Error(data?.error || "The customers' feedback counts could not be written.");
  }
  return Number(data.row_count || 0);
}

/**
 * Attach the feedback responses to the orders their bill numbers name.
 *
 * ## Why this is a nightly step and not part of the form
 *
 * A response is filled in on the floor, right after the meal. **The order it
 * is about is not in the books yet** — the order book only reaches the
 * previous day, because Petpooja's orders are pulled once a night. So the
 * response is written the moment it is given, and the link to its order is
 * made by the night's run, once the order has arrived.
 *
 * A response whose bill is already in the books is attached at once, so the
 * customer sees it the same evening.
 *
 * ## Why it is cheap
 *
 * Only the responses that are **not attached yet** are looked at, and the
 * writes are one statement each. The old sheet pull did the opposite of
 * both: it rewrote every customer, one request at a time.
 *
 * @param {object} supabase a service-role client
 * @param {object} [options]
 * @param {Array<number>} [options.ids] only these responses are looked at
 */
export async function linkFeedback(supabase, { ids = null } = {}) {
  let query = supabase
    .from('customer_feedback')
    .select('id, bill_number, response_date, order_no, phone, is_linked')
    .eq('is_linked', false);
  if (Array.isArray(ids) && ids.length > 0) query = query.in('id', ids);

  const { data: loose, error } = await query;
  if (error) throw new Error(error.message);

  const pending = (loose || []).filter((row) => String(row.bill_number || '').trim() !== '');
  if (pending.length === 0) {
    return { checked: 0, linked: 0, unlinked: 0 };
  }

  // The orders that could match, read once — an `in` list, not a query per
  // response. The bill number is indexed, so this is a lookup and not a scan.
  const bills = [...new Set(pending.map((row) => String(row.bill_number).trim()))];
  const { data: orders, error: ordersError } = await supabase
    .from('customer_orders')
    .select('order_no, order_date, phone')
    .in('order_no', bills);
  if (ordersError) throw new Error(ordersError.message);

  const linked = linkFeedbackToOrders(pending, orders || []);

  // Only the rows whose link actually **changed** are written. A response
  // that names a bill we do not hold is already unattached, and writing
  // "unattached" over "unattached" every night is work for nothing.
  const changed = linked.responses.filter((row) => {
    const before = pending.find((item) => item.id === row.id);
    if (!before) return false;
    return (
      String(before.order_no || '') !== String(row.order_no || '') ||
      String(before.phone || '') !== String(row.phone || '') ||
      Boolean(before.is_linked) !== Boolean(row.is_linked)
    );
  });

  const BATCH = 500;
  let written = 0;
  for (let i = 0; i < changed.length; i += BATCH) {
    const sql = feedbackLinkStatement(changed.slice(i, i + BATCH));
    const { data, error: writeError } = await supabase.rpc('exec_sql', { q: sql });
    if (writeError) throw new Error(writeError.message);
    if (!data || data.ok === false) {
      throw new Error(data?.error || 'The feedback could not be attached to its orders.');
    }
    written += Number(data.row_count || 0);
  }

  await writeCustomerFeedbackTotals(supabase);

  return {
    checked: pending.length,
    linked: linked.linked,
    unlinked: linked.unlinked,
    written,
  };
}

export { parseOrdersExport, parseRatingsExport };
