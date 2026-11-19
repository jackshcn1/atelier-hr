/**
 * lib/financeRange.js — the finance picture over more than one month.
 *
 * The dashboards answer "how is this month going?". A range answers the
 * question an owner asks over time: "how have the last three months gone?" —
 * the trend, the average month, the year so far.
 *
 * The months are added up the way a person would add them up: the revenue of
 * the months, the costs of the months, the salary of the months. Two things
 * are deliberately **not** added up:
 *
 *   - the money owed by customers. It is a snapshot of where things stand
 *     today, not a monthly flow, so the latest month's figure is the one
 *     that is true now;
 *   - the costs that carry no date. They belong to no month, so a span of
 *     months counts them once, not once for every month in the span.
 */

import { monthLabel, elapsedFraction } from './financePeriod.js';
import { monthCosts } from './financeCosts.js';
import { monthPosition } from './financePosition.js';
import { cycleEndingIn, salaryForCycle } from './financeSalary.js';
import { buildForecast } from './financeForecast.js';

/**
 * The months worth offering on the dropdown.
 *
 * Every month from the earliest one with any figures to the month on the
 * clock — including the months in between, which may have no figures of
 * their own. A month with nothing in it is still a month the owner may want
 * to look at.
 *
 * @param {object} supabase a Supabase service-role client
 * @param {string} currentKey the month on the clock, 'YYYY-MM'
 */
export async function monthsOnRecord(supabase, currentKey) {
  const [expenses, revenue, receivables, petty] = await Promise.all([
    supabase.from('expenses').select('invoice_date')
      .not('invoice_date', 'is', null).order('invoice_date', { ascending: true }).limit(1),
    supabase.from('finance_monthly_revenue').select('month')
      .order('month', { ascending: true }).limit(1),
    supabase.from('finance_receivables').select('month')
      .order('month', { ascending: true }).limit(1),
    supabase.from('petty_cash_ledger').select('date')
      .order('date', { ascending: true }).limit(1),
  ]);

  const earliest = [
    expenses.data?.[0]?.invoice_date?.slice(0, 7),
    revenue.data?.[0]?.month,
    receivables.data?.[0]?.month,
    petty.data?.[0]?.date?.slice(0, 7),
  ].filter(Boolean).sort()[0];

  if (!earliest) return [currentKey];

  const keys = [];
  let key = earliest;
  for (let i = 0; key <= currentKey && i < 600; i += 1) {
    keys.push(key);
    const [year, month] = key.split('-').map(Number);
    key = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
  }
  // Newest first, the way a dropdown reads.
  return keys.reverse();
}

/** What one month holds, in the pieces the range adds up. */
async function monthFacts(supabase, period, includeUndated) {
  const [revenueResult, costs, salary, position, pettyResult] = await Promise.all([
    supabase.from('finance_monthly_revenue').select('*').eq('month', period.key).maybeSingle(),
    monthCosts(supabase, period, { includeUndated }),
    salaryForCycle(supabase, cycleEndingIn(period.key)),
    monthPosition(supabase, period),
    supabase.from('petty_cash_ledger').select('id', { count: 'exact', head: true })
      .gte('date', period.start).lte('date', period.end),
  ]);

  if (revenueResult.error) throw revenueResult.error;

  return {
    period,
    revenue: revenueResult.data || null,
    costs,
    salary,
    position,
    pettyCount: pettyResult.count || 0,
  };
}

/** Add up the rows behind a total, keeping the groups apart. */
function mergeGroups(lists) {
  const map = new Map();
  for (const list of lists) {
    for (const item of list || []) {
      map.set(item.label, (map.get(item.label) || 0) + Number(item.amount || 0));
    }
  }
  return [...map.entries()]
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * The dashboard for a span of months.
 *
 * @param {object} supabase a Supabase service-role client
 * @param {object[]} periods the months, oldest first
 * @param {object} [history] the months on record, for the forecast
 */
export async function rangeDashboard(supabase, periods, history = null) {
  const months = [];
  for (const [index, period] of periods.entries()) {
    // The costs that carry no date are counted once — in the first month of
    // the span — so they are not counted once for every month.
    months.push(await monthFacts(supabase, period, index === 0));
  }

  const first = months[0];
  const last = months[months.length - 1];

  // ---- revenue: the months added up ----------------------------------
  const breakdown = { dine_in: 0, pick_up: 0, delivery: 0 };
  let revenueTotal = 0;
  let asOf = null;
  let missingMonths = [];
  let complete = true;

  for (const month of months) {
    const row = month.revenue;
    if (!row) {
      missingMonths.push(month.period.key);
      complete = false;
      continue;
    }
    breakdown.dine_in += Number(row.dine_in || 0);
    breakdown.pick_up += Number(row.pick_up || 0);
    breakdown.delivery += Number(row.delivery || 0);
    revenueTotal += Number(row.total || 0);
    if (row.window_end && (!asOf || row.window_end > asOf)) asOf = row.window_end;
    if (row.is_complete !== true) complete = false;
  }

  const revenue = {
    breakdown,
    total: revenueTotal,
    asOf,
    isComplete: complete,
    synced: missingMonths.length === 0,
    source: last.revenue?.source || null,
    // The months of the span that have no sales figure yet.
    missingMonths,
  };

  // ---- costs: the months added up -------------------------------------
  const costs = {
    fixed: months.reduce((sum, m) => sum + m.costs.fixed, 0),
    petty: months.reduce((sum, m) => sum + m.costs.petty, 0),
    variable: months.reduce((sum, m) => sum + m.costs.variable, 0),
    total: months.reduce((sum, m) => sum + m.costs.total, 0),
    credit: months.reduce((sum, m) => sum + m.costs.credit, 0),
    // The standing costs themselves are a checklist, not a running total —
    // the latest month's list is the one that is still current.
    standing: last.costs.standing,
    standingOutstanding: last.costs.standingOutstanding,
    breakdown: {
      fixed: mergeGroups(months.map((m) => m.costs.breakdown.fixed)),
      variable: mergeGroups(months.map((m) => m.costs.breakdown.variable)),
      petty: mergeGroups(months.map((m) => m.costs.breakdown.petty)),
    },
  };

  // ---- salary: the salary of each month ------------------------------
  const salaryMonths = months.map((m) => ({
    label: monthLabel(m.period.key),
    amount: m.salary.amount,
    state: m.salary.state,
  }));
  const allActual = months.every((m) => m.salary.state === 'actual');
  const salary = {
    state: allActual ? 'actual' : 'forecast',
    amount: months.reduce((sum, m) => sum + m.salary.amount, 0),
    cycle: last.salary.cycle,
    snapshotDate: last.salary.snapshotDate,
    actual: last.salary.actual,
    forecast: last.salary.forecast,
    // What each month contributed, so a total is never just a total.
    months: salaryMonths,
  };

  // ---- where the business stands --------------------------------------
  // The money owed by customers is a snapshot, so the latest month's figure
  // is the one that is true now. The money owed to suppliers is bills, and
  // bills add up across the span.
  const unpaidVendors = new Set();
  for (const month of months) {
    for (const vendor of month.position.payables.unpaidVendors || []) unpaidVendors.add(vendor);
  }

  const receivables = last.position.receivables;
  const payables = {
    totals: {
      unpaid: months.reduce((sum, m) => sum + m.position.payables.totals.unpaid, 0),
      billCount: months.reduce((sum, m) => sum + m.position.payables.totals.billCount, 0),
      billCountTotal: months.reduce((sum, m) => sum + m.position.payables.totals.billCountTotal, 0),
      vendorCount: unpaidVendors.size,
      credit: months.reduce((sum, m) => sum + m.position.payables.totals.credit, 0),
      creditCount: months.reduce((sum, m) => sum + m.position.payables.totals.creditCount, 0),
    },
  };

  const netProfitOrLoss = revenue.total - costs.total - salary.amount;

  // ---- how much of the picture is filled in ---------------------------
  const billCount = payables.totals.billCountTotal;
  const standingTotal = months.reduce((sum, m) => sum + m.costs.standing.length, 0);
  const standingOutstanding = months.reduce((sum, m) => sum + m.costs.standingOutstanding.length, 0);
  const pettyCount = months.reduce((sum, m) => sum + m.pettyCount, 0);
  const monthsWithRevenue = months.length - missingMonths.length;

  const readiness = [
    {
      key: 'revenue',
      label: 'Revenue',
      state: monthsWithRevenue === 0 ? 'empty' : monthsWithRevenue === months.length ? 'ok' : 'pending',
      detail:
        monthsWithRevenue === 0
          ? 'Not pulled from Petpooja yet'
          : `${monthsWithRevenue} of ${months.length} month(s) pulled from Petpooja`,
      missing: 'The sales figure for some of these months is missing.',
    },
    {
      key: 'bills',
      label: 'Bills',
      state: billCount > 0 ? 'ok' : 'empty',
      detail: billCount > 0 ? `${billCount} bill(s) on record` : 'No bills on record',
      missing: 'No supplier bills are on record for these months.',
    },
    {
      key: 'fixed',
      label: 'Fixed costs',
      state: standingTotal === 0 ? 'empty' : standingOutstanding > 0 ? 'pending' : 'ok',
      detail:
        standingTotal === 0
          ? 'None set up'
          : standingOutstanding > 0
            ? `${standingOutstanding} of ${standingTotal} awaiting their invoice — expected amounts used`
            : 'All received',
      missing:
        standingTotal === 0
          ? 'No standing costs are set up, so the profit shown does not yet include rent, pest control or power.'
          : '',
    },
    {
      key: 'salary',
      label: 'Staff salary',
      state: 'ok',
      detail: `${allActual ? 'Actual' : 'Forecast'} ₹${Math.round(salary.amount).toLocaleString('en-IN')} over ${months.length} month(s)`,
      missing: '',
    },
    {
      key: 'petty',
      label: 'Petty cash',
      state: pettyCount > 0 ? 'ok' : 'empty',
      detail: pettyCount > 0 ? `${pettyCount} entr(y/ies)` : 'No entries',
      missing: 'No petty cash entries for these months.',
    },
    {
      key: 'receivables',
      label: 'Money owed by customers',
      state: receivables.totals.invoiceCount > 0 ? 'ok' : 'pending',
      detail:
        receivables.totals.invoiceCount > 0
          ? `${receivables.totals.invoiceCount} open invoice(s)`
          : 'Waiting for the next sync',
      missing: '',
    },
    {
      key: 'payables',
      label: 'Money owed to suppliers',
      state: payables.totals.billCount > 0 ? 'ok' : 'empty',
      detail: payables.totals.billCount > 0 ? `${payables.totals.billCount} unpaid bill(s)` : 'Nothing unpaid',
      missing: '',
    },
  ];

  const label =
    months.length === 1
      ? monthLabel(first.period.key)
      : `${monthLabel(first.period.key)} – ${monthLabel(last.period.key)}`;

  return {
    period: {
      ...last.period,
      label,
    },
    range: {
      months: months.length,
      from: first.period.key,
      to: last.period.key,
      label,
    },
    revenue,
    costs,
    salary,
    net_pl: netProfitOrLoss,
    // What the span was expected to look like — the months added up, each
    // with its own festival factor — and every month from the first one on
    // record beside what was expected of it.
    forecast: history
      ? buildForecast(
          history,
          { from: first.period.key, to: last.period.key, label },
          {
            // How much of each month has happened — a span that ends in the
            // month on the clock has one month of it still to run.
            elapsed: Object.fromEntries(
              months.map((month) => [month.period.key, elapsedFraction(month.period)])
            ),
          }
        )
      : null,
    receivables,
    payables,
    readiness,
    missing: readiness
      .filter((item) => item.state === 'empty' && item.missing)
      .map((item) => ({ key: item.key, label: item.label, message: item.missing })),
  };
}
