/**
 * lib/financeForecast.js — what a month is expected to look like.
 *
 * The finance pages answer "how is this month going?". This answers the
 * question behind it: "how is this month going *against what we expected*?"
 *
 * The forecast is deliberately simple, so that every figure on the page can be
 * traced back to something an owner can see:
 *
 *   - a **level** for each revenue channel: the median of what that channel
 *     earned in the complete months on record, after taking out that month's
 *     festival effect. The median rather than the average, so one unusual
 *     month cannot swing the whole forecast.
 *
 *   - a **season factor** for each calendar month: how far that month is
 *     expected to move against a normal month, because of Kerala and Indian
 *     festivals. These are judgement calls, not measurements — the business
 *     opened in March 2026, so there is one year of trading and no month can
 *     be compared with another year. The months that have no history behind
 *     them at all — December, January, February — rest on the festival
 *     calendar alone.
 *
 *   - a **variable cost ratio**: the share of the revenue that the variable
 *     costs ran at over the last few complete months. Variable costs are
 *     forecast as that share of the forecast revenue.
 *
 *   - **fixed costs** are a known commitment: the standing-cost list says what
 *     the month costs, so that list is the forecast.
 *
 *   - **petty cash** is a blanket figure — there is nothing to learn from an
 *     empty ledger.
 *
 *   - **staff salary** is what the payroll for that cycle was forecast to
 *     cost, and the current run-rate for a month that has not happened yet.
 *
 * The two windows were chosen by testing the method against the four months
 * where the answer is already known (July to October 2026):
 *
 *   - the festival factors nearly halved the error — 5.6% against the actual
 *     revenue, where the same forecast without them was out by 9.5%;
 *   - the variable cost ratio had to follow the business down. The share has
 *     fallen every month since May, from 63% to 45%, so a ratio taken over
 *     every month on record was out by 20%; the last four months brought it
 *     to 15%.
 *
 * Nothing here reads or writes the database on its own except
 * `forecastHistory()`, which assembles the months on record for the engine to
 * work from. The rest are pure functions, so the forecast can be tested
 * without a database and the same numbers can be produced anywhere.
 */

import { readAllRows } from './supabaseServer.js';
import { todayInIST, monthLabel } from './financePeriod.js';
import {
  cycleEndingIn,
  snapshotDateFor,
  forecastFromRoster,
  actualFromRuns,
} from './financeSalary.js';
import { monthlyAmount } from './financeCosts.js';

/** Petty cash is forecast as a blanket figure for every month. */
export const PETTY_FORECAST_MONTHLY = 15000;

/**
 * How long the months on record are held before they are read again.
 *
 * Reading every cost row there is costs about a second, and the forecast
 * does not change minute by minute — the bills it is built from are entered
 * by hand, or pulled by the nightly sync. So the months are held for a few
 * minutes and the second visit to the page is answered straight away.
 *
 * The client itself is kept in the module for the same reason, so one
 * serverless instance serves many requests from one set of reads.
 */
const HISTORY_TTL_MS = 5 * 60 * 1000;

let cachedHistory = null;
let cachedAt = 0;

/**
 * How many complete months the variable cost ratio is taken from.
 *
 * The share of the revenue that the variable costs run at has been falling —
 * the business grew while its purchases did not — so a ratio taken over every
 * month on record is stale, and one taken over a single month is jumpy. The
 * last four complete months is one full quarter.
 */
export const RATIO_WINDOW = 4;

/**
 * How far each calendar month is expected to move against a normal month.
 *
 * Kerala and Indian festivals, from the 2026 gazette:
 *
 *   20 Mar Ramzan · 2–5 Apr Maundy Thursday, Good Friday, Easter ·
 *   15 Apr Vishu · 1 May May Day · 27 May Bakrid · 25 Jun Muharram ·
 *   12 Aug Karkidaka Vavu · 15 Aug Independence · 25–28 Aug Onam
 *   (Thiruvonam 26 Aug) · 4 Sep Sreekrishna Jayanthi · 21 Sep Guru Samadhi ·
 *   2 Oct Gandhi Jayanthi · 20–21 Oct Mahanavami, Vijayadasami ·
 *   8 Nov Deepavali · 25 Dec Christmas
 *
 * The multipliers are the restaurant's own judgement about how much footfall
 * each of those is worth. They are the one part of the forecast that no
 * measurement here supports, so they are kept together, in one place, with
 * the reason for each.
 */
const SEASON = {
  1: { factor: 1.02, note: 'New Year' },
  2: { factor: 0.98, note: '' },
  3: { factor: 1.00, note: 'Ramzan, 20 March' },
  4: { factor: 1.02, note: 'Vishu, 15 April, and Easter' },
  5: { factor: 1.00, note: 'Bakrid, 27 May' },
  6: { factor: 0.96, note: 'the monsoon lull' },
  7: { factor: 1.00, note: '' },
  8: { factor: 1.10, note: 'Onam, 25–28 August' },
  9: { factor: 0.92, note: 'the weeks after Onam' },
  10: { factor: 1.04, note: 'Vijayadasami, 21 October' },
  11: { factor: 1.05, note: 'Deepavali, 8 November' },
  12: { factor: 1.30, note: 'Christmas and New Year' },
};

/** The festival season factor of a calendar month. */
export function seasonFactor(monthKey) {
  const month = Number(String(monthKey || '').split('-')[1]);
  return (SEASON[month] || { factor: 1 }).factor;
}

/** What is going on in that calendar month, in a few words. */
export function seasonNote(monthKey) {
  const month = Number(String(monthKey || '').split('-')[1]);
  return (SEASON[month] || { note: '' }).note;
}

/**
 * The middle of a set of numbers. The average of the two middle ones when
 * there are an even number of them.
 */
export function median(values) {
  const numbers = (values || [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!numbers.length) return 0;
  const middle = Math.floor(numbers.length / 2);
  return numbers.length % 2 ? numbers[middle] : (numbers[middle - 1] + numbers[middle]) / 2;
}

/**
 * The complete months the forecast is built from.
 *
 * A month still running is left out — a half-month of sales would pull the
 * level down — and so is a month with no sales figure at all.
 *
 * @param {object} history the months on record
 * @param {number|'all'} window how many of the most recent months to use
 */
export function completeMonths(history, window = 'all') {
  const rows = (history?.months || [])
    .filter((month) => month.complete && Number(month.revenue?.total || 0) > 0)
    .sort((a, b) => (a.key < b.key ? -1 : 1));
  if (window === 'all' || !Number.isFinite(Number(window))) return rows;
  return rows.slice(-Math.max(1, Number(window)));
}

/**
 * What a normal month looks like, for each revenue channel.
 *
 * Each channel's actual is divided by that month's festival factor before the
 * median is taken, so a strong Onam does not read as a permanent lift. The
 * forecast for a month is the level put back together with that month's
 * factor.
 *
 * The total is the sum of the three channels rather than a median of its own,
 * so the parts always add up to the whole.
 */
export function revenueLevel(history, { window = 'all' } = {}) {
  const rows = completeMonths(history, window);
  const level = { dine_in: 0, pick_up: 0, delivery: 0, total: 0 };
  if (!rows.length) return level;

  for (const channel of ['dine_in', 'pick_up', 'delivery']) {
    level[channel] = median(
      rows.map((month) => Number(month.revenue?.[channel] || 0) / seasonFactor(month.key))
    );
  }
  level.total = level.dine_in + level.pick_up + level.delivery;
  return level;
}

/**
 * The variable costs as a share of the revenue.
 *
 * Variable costs are what move with the business — the supplier bills, the
 * electricity, the marketing — so they are forecast as a share of the revenue
 * rather than as a fixed number.
 */
export function variableRatio(history, { window = RATIO_WINDOW } = {}) {
  const rows = completeMonths(history, window);
  if (!rows.length) return 0;
  return median(
    rows.map((month) => Number(month.variable || 0) / Number(month.revenue?.total || 1))
  );
}

/**
 * The salary expected for a month.
 *
 * A month that has been through payroll keeps the figure the payroll produced.
 * A month that has not is forecast from the roster as it stood on the day
 * that cycle was settled — the same frozen forecast the payroll page used.
 */
function salaryFor(history, monthKey) {
  const row = (history?.months || []).find((month) => month.key === monthKey);
  if (row && Number.isFinite(Number(row.salaryForecast))) return Number(row.salaryForecast);
  if (row && Number.isFinite(Number(row.salaryActual))) return Number(row.salaryActual);
  return Number(history?.salaryMonthly || 0);
}

/**
 * The forecast for one month.
 *
 * @param {object} history the months on record
 * @param {string} monthKey 'YYYY-MM'
 * @param {object} [options]
 * @param {number|'all'} [options.levelWindow] how many complete months the
 *   level is taken from
 * @param {number|'all'} [options.ratioWindow] how many complete months the
 *   variable cost ratio is taken from
 * @param {number} [options.pettyMonthly] the petty cash forecast
 * @param {object} [options.level] a level already worked out
 * @param {number} [options.ratio] a ratio already worked out
 */
export function forecastMonth(history, monthKey, options = {}) {
  const {
    levelWindow = 'all',
    ratioWindow = RATIO_WINDOW,
    pettyMonthly = PETTY_FORECAST_MONTHLY,
  } = options;

  const level = options.level || revenueLevel(history, { window: levelWindow });
  const ratio = options.ratio ?? variableRatio(history, { window: ratioWindow });
  const factor = seasonFactor(monthKey);

  const revenue = {
    dine_in: level.dine_in * factor,
    pick_up: level.pick_up * factor,
    delivery: level.delivery * factor,
  };
  revenue.total = revenue.dine_in + revenue.pick_up + revenue.delivery;

  const fixed = Number(history?.standingMonthly || 0);
  const petty = Number(pettyMonthly || 0);
  const salary = salaryFor(history, monthKey);
  const variable = revenue.total * ratio;

  return {
    key: monthKey,
    factor,
    note: seasonNote(monthKey),
    revenue,
    costs: {
      variable,
      fixed,
      petty,
      salary,
      total: variable + fixed + petty + salary,
    },
    level,
    ratio,
  };
}

/**
 * The forecast for a run of months.
 *
 * The same level is used for every month in the run — it is one idea of what
 * a normal month is worth, and each month carries its own festival factor on
 * top of it.
 */
export function forecastSeries(history, fromKey, toKey, options = {}) {
  const level = options.level || revenueLevel(history, { window: options.levelWindow || 'all' });
  const ratio = options.ratio ?? variableRatio(history, { window: options.ratioWindow || RATIO_WINDOW });

  const months = [];
  let key = fromKey;
  // The guard is there so a bad key cannot spin for ever.
  for (let i = 0; key <= toKey && i < 600; i += 1) {
    months.push(forecastMonth(history, key, { ...options, level, ratio }));
    const [year, month] = key.split('-').map(Number);
    key = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
  }
  return months;
}

/**
 * The whole forecast, as the pages consume it.
 *
 * Three things come out of here:
 *
 *   - `basis`  — what the forecast is built on, so the page can say so.
 *   - `view`   — the forecast for the month (or the span of months) on screen.
 *   - `series` — every month from the first one on record to the month after
 *     this one, with what actually happened beside what was expected.
 *
 * @param {object} history the months on record
 * @param {object} view the month or span on screen
 * @param {object} [options]
 */
export function buildForecast(history, view, options = {}) {
  const levelWindow = options.levelWindow || 'all';
  const ratioWindow = options.ratioWindow || RATIO_WINDOW;
  const pettyMonthly = options.pettyMonthly ?? PETTY_FORECAST_MONTHLY;

  const level = revenueLevel(history, { window: levelWindow });
  const ratio = variableRatio(history, { window: ratioWindow });

  const used = completeMonths(history, 'all');
  const ratioUsed = completeMonths(history, ratioWindow);

  // The forecast for the month or the span on screen. A span of months is
  // the months added up, each with its own festival factor on top of the
  // same level.
  const viewForecast = forecastSeries(history, view.from, view.to, {
    level,
    ratio,
    pettyMonthly,
  });

  // How much of each month has happened.
  //
  // A month in progress has only part of its sales in it, so a forecast for
  // it is compared with what should have been reached by now. The costs that
  // are booked for the whole month — the standing costs, the salary — are not
  // put on that footing: they are already counted in full on the first day.
  const elapsed = options.elapsed || {};
  const elapsedFor = (key) => (elapsed[key] === undefined ? 1 : Number(elapsed[key]));

  const summed = viewForecast.reduce(
    (totals, month) => ({
      revenue: {
        dine_in: totals.revenue.dine_in + month.revenue.dine_in,
        pick_up: totals.revenue.pick_up + month.revenue.pick_up,
        delivery: totals.revenue.delivery + month.revenue.delivery,
        total: totals.revenue.total + month.revenue.total,
      },
      costs: {
        variable: totals.costs.variable + month.costs.variable,
        fixed: totals.costs.fixed + month.costs.fixed,
        petty: totals.costs.petty + month.costs.petty,
        salary: totals.costs.salary + month.costs.salary,
        total: totals.costs.total + month.costs.total,
      },
    }),
    {
      revenue: { dine_in: 0, pick_up: 0, delivery: 0, total: 0 },
      costs: { variable: 0, fixed: 0, petty: 0, salary: 0, total: 0 },
    }
  );

  // Every month from the first one on record to the month after this one.
  const first = history.months.map((month) => month.key).sort()[0] || view.to;
  const [year, month] = view.to.split('-').map(Number);
  const last = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;

  const series = forecastSeries(history, first, last, { level, ratio, pettyMonthly }).map((forecast) => {
    const actual = (history.months || []).find((row) => row.key === forecast.key);
    const actualRevenue = actual ? Number(actual.revenue.total || 0) : 0;
    const actualVariable = actual ? Number(actual.variable || 0) : 0;
    const actualFixed = actual ? Number(actual.fixed || 0) : 0;
    const actualPetty = actual ? Number(actual.petty || 0) : 0;
    const actualSalary = actual ? Number(actual.salaryAmount || 0) : 0;
    const actualCosts = actualVariable + actualFixed + actualPetty + actualSalary;

    // A month that is still running is also projected: the sales that have
    // happened, carried forward at the same rate. The standing costs and the
    // salary are booked for the whole month, so they are not carried forward.
    const part = elapsedFor(forecast.key);
    const running = part < 1 && (actualRevenue > 0 || actualVariable > 0);
    const projected = running
      ? {
          revenue: actualRevenue / part,
          variable: actualVariable / part,
          costs: actualVariable / part + actualFixed + actualPetty + actualSalary,
        }
      : null;

    return {
      key: forecast.key,
      label: monthLabel(forecast.key),
      complete: !!actual?.complete,
      note: forecast.note,
      factor: forecast.factor,
      actual: {
        revenue: actualRevenue,
        variable: actualVariable,
        fixed: actualFixed,
        petty: actualPetty,
        salary: actualSalary,
        costs: actualCosts,
      },
      forecast: {
        revenue: forecast.revenue.total,
        variable: forecast.costs.variable,
        fixed: forecast.costs.fixed,
        petty: forecast.costs.petty,
        salary: forecast.costs.salary,
        costs: forecast.costs.total,
      },
      projected,
    };
  });

  // What should have been reached by now — the figure a bar in a month in
  // progress is measured against.
  const expected = viewForecast.reduce(
    (totals, month) => {
      const part = elapsedFor(month.key);
      totals.revenue.dine_in += month.revenue.dine_in * part;
      totals.revenue.pick_up += month.revenue.pick_up * part;
      totals.revenue.delivery += month.revenue.delivery * part;
      totals.revenue.total += month.revenue.total * part;
      // The purchases come in through the month, so the variable costs are
      // expected on the same footing as the sales. The standing costs and the
      // salary are booked for the whole month, so they are already counted.
      totals.costs.variable += month.costs.variable * part;
      totals.costs.fixed += month.costs.fixed;
      totals.costs.petty += month.costs.petty;
      totals.costs.salary += month.costs.salary;
      return totals;
    },
    {
      revenue: { dine_in: 0, pick_up: 0, delivery: 0, total: 0 },
      costs: { variable: 0, fixed: 0, petty: 0, salary: 0, total: 0 },
    }
  );
  expected.costs.total =
    expected.costs.variable +
    expected.costs.fixed +
    expected.costs.petty +
    expected.costs.salary;

  return {
    basis: {
      label: used.length ? `${monthLabel(used[0].key)} – ${monthLabel(used[used.length - 1].key)}` : '',
      months: used.map((month) => month.key),
      levelWindow,
      ratioWindow,
      ratio,
      level,
      standingMonthly: Number(history?.standingMonthly || 0),
      pettyMonthly,
    },
    view: {
      key: view.to,
      label: view.label,
      months: viewForecast.length,
      from: view.from,
      to: view.to,
      factor: viewForecast[0]?.factor || 1,
      note: viewForecast[0]?.note || '',
      revenue: summed.revenue,
      costs: summed.costs,
      expected,
    },
    series,
  };
}

/**
 * The months on record, assembled for the engine to work from.
 *
 * Everything is read once and grouped here: the sales figures, the costs, the
 * petty cash, the standing-cost list and the roster. The salary of each month
 * is worked out from the roster as it stood on the day that cycle was
 * settled, which is the frozen forecast the payroll page used — so the
 * forecast can be rebuilt later without changing.
 *
 * The fixed costs of a month are worked out the way the P&L works them out:
 * the standing-cost list, with the month's invoice replacing the expected
 * amount where there is one.
 *
 * @param {object} supabase a Supabase service-role client
 */
export async function forecastHistory(supabase) {
  if (cachedHistory && Date.now() - cachedAt < HISTORY_TTL_MS) return cachedHistory;

  const [
    { data: revenueRows },
    { data: pettyRows },
    { data: standingRows },
    { data: people },
    { data: payrollRuns },
    { data: payrollItems },
  ] = await Promise.all([
    supabase.from('finance_monthly_revenue').select('*').order('month'),
    supabase.from('petty_cash_ledger').select('date, amount, type'),
    supabase.from('fixed_costs').select('id, name, category, amount, billing_cycle'),
    supabase.from('employees')
      .select('employee_id, name, department, current_fixed_salary, current_variable_salary, date_of_joining, date_of_leaving, status')
      .order('name'),
    supabase.from('payroll_runs').select('id, run_type, status, period_start, period_end, total_amount'),
    supabase.from('payroll_line_items')
      .select('payroll_run_id, employee_id, fixed_pay, variable_pay, bonus_pay, gross_pay, deductions, net_pay, total_pay, payment_status, salary_paid_date'),
  ]);

  // Every cost row there is, not the first thousand — the database stops a
  // plain read at a thousand rows and says nothing when it does.
  const expenses = await readAllRows((from, to) =>
    supabase
      .from('expenses')
      .select('id, invoice_date, amount, debit_note, cost_type, category')
      .order('id')
      .range(from, to)
  );

  // The costs of each month, kept as rows so that the standing costs can be
  // matched to their invoice the way the P&L matches them.
  const rowsByMonth = new Map();
  for (const row of expenses) {
    if (!row.invoice_date) continue;
    const key = String(row.invoice_date).slice(0, 7);
    if (!rowsByMonth.has(key)) rowsByMonth.set(key, []);
    rowsByMonth.get(key).push(row);
  }

  // The standing-cost list is the fixed-cost forecast: what the month is
  // expected to cost, whether or not the invoice has arrived.
  const standingMonthly = (standingRows || []).reduce(
    (sum, row) => sum + monthlyAmount(row),
    0
  );

  const pettyByMonth = new Map();
  for (const row of pettyRows || []) {
    if (!row.date || row.type !== 'expense') continue;
    const key = String(row.date).slice(0, 7);
    pettyByMonth.set(key, (pettyByMonth.get(key) || 0) + Number(row.amount || 0));
  }

  // The salary of each month: the frozen forecast for the cycle, and the
  // payroll that actually ran for it.
  const salaryMonthly = (people || [])
    .filter((row) => !row.date_of_leaving || row.date_of_leaving > todayInIST())
    .reduce(
      (sum, row) =>
        sum + Number(row.current_fixed_salary || 0) + Number(row.current_variable_salary || 0),
      0
    );

  const months = [];
  for (const row of revenueRows || []) {
    const key = row.month;
    const cycle = cycleEndingIn(key);
    const rows = rowsByMonth.get(key) || [];

    const fixedExpenses = rows.filter((expense) => expense.cost_type === 'fixed');
    const variableExpenses = rows.filter(
      (expense) => expense.cost_type === 'variable' || !expense.cost_type
    );
    const net = (expense) => Number(expense.amount || 0) - Number(expense.debit_note || 0);

    // The standing costs, and the month's invoice for each of them. The
    // invoice replaces the expected amount rather than adding to it.
    const claimed = new Set();
    let fixedTotal = 0;
    for (const standing of standingRows || []) {
      const standingKey = String(standing.category || standing.name || '').trim().toLowerCase();
      const invoices = fixedExpenses.filter(
        (invoice) => String(invoice.category || '').trim().toLowerCase() === standingKey
      );
      for (const invoice of invoices) claimed.add(invoice.id);
      const invoiceTotal = invoices.reduce((sum, invoice) => sum + net(invoice), 0);
      fixedTotal += invoices.length ? invoiceTotal : monthlyAmount(standing);
    }
    // A fixed cost that is not on the standing list still counts.
    for (const invoice of fixedExpenses) {
      if (!claimed.has(invoice.id)) fixedTotal += net(invoice);
    }

    const cycleRuns = (payrollRuns || []).filter((run) => run.period_start === cycle.start);
    const cycleRunIds = new Set(cycleRuns.map((run) => run.id));
    const cycleItems = (payrollItems || []).filter((item) => cycleRunIds.has(item.payroll_run_id));
    const actual = actualFromRuns(cycleRuns, cycleItems);
    const forecast = forecastFromRoster(people || [], snapshotDateFor(cycle));

    months.push({
      key,
      complete: row.is_complete === true,
      revenue: {
        dine_in: Number(row.dine_in || 0),
        pick_up: Number(row.pick_up || 0),
        delivery: Number(row.delivery || 0),
        total: Number(row.total || 0),
      },
      variable: variableExpenses.reduce((sum, expense) => sum + net(expense), 0),
      fixed: fixedTotal,
      petty: pettyByMonth.get(key) || 0,
      salaryForecast: forecast.amount,
      salaryActual: actual.amount,
      // What the payroll page shows: the payroll that ran, or the forecast
      // for the cycle where there is not one yet.
      salaryAmount: actual.processed ? actual.amount : forecast.amount,
      salaryState: actual.processed ? 'actual' : 'forecast',
    });
  }

  cachedHistory = { months, standingMonthly, salaryMonthly };
  cachedAt = Date.now();
  return cachedHistory;
}
