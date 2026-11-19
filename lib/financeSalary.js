/**
 * lib/financeSalary.js — staff salary as a cost: a forecast until the
 * payroll has been processed, the real figure after.
 *
 * There is one line on the Costs page for staff salary, and it carries two
 * figures:
 *
 *   forecast  what the cycle will cost if every active employee is paid a
 *             full month. This is what the pages show until the payroll
 *             for that cycle has been run.
 *
 *   actual    what the payroll run actually cost — the salary, the variable
 *             pay and the bonus, for the people on it.
 *
 * The forecast is **frozen**. It is computed from the roster on the
 * snapshot date and does not change afterwards, so a joiner next month does
 * not quietly rewrite last month's forecast and make the two months
 * incomparable.
 *
 * The snapshot date for a cycle is the first day of the month after the
 * cycle ends: for the 20 Oct – 19 Nov cycle that is 1 Dec 2026. It is the
 * moment the roster for that cycle is settled.
 *
 * Two things are deliberately not counted here:
 *
 *   - an off-cycle salary advance is cash out, not cost. It comes off the
 *     forecast when the regular run settles it, through the payroll's own
 *     prior-payout deduction. It is reported here as "already advanced" so
 *     the cashflow page can show it, but it is not added to the cost.
 *
 *   - variable pay is not forecasted. It depends on the month's results,
 *     which are not known until the month is over, and it is paused anyway.
 */

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * The pay cycle that ends in a calendar month.
 *
 * The cycle runs from the 20th of one month to the 19th of the next, so the
 * cycle ending in November 2026 is 2026-10-20 → 2026-11-19.
 *
 * @param {string} monthKey 'YYYY-MM'
 */
export function cycleEndingIn(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month || month < 1 || month > 12) return null;

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;

  const start = `${prevYear}-${pad2(prevMonth)}-20`;
  const end = `${year}-${pad2(month)}-19`;

  return { start, end, monthKey };
}

/**
 * The day the roster for a cycle is settled: the first day of the month
 * after the cycle ends.
 */
export function snapshotDateFor(cycle) {
  const [year, month] = cycle.end.split('-').map(Number);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${nextYear}-${pad2(nextMonth)}-01`;
}

/**
 * What the cycle will cost if every active employee is paid a full month.
 *
 * "Active on the snapshot date" means: on the staff today, and not already
 * gone by then. Someone who joined after the snapshot is not in this
 * forecast, and someone who left before it is not either.
 *
 * This is the pure part — the roster and the date in, the forecast out — so
 * that the same roster can be worked out for many cycles without asking the
 * database again for each one.
 *
 * @param {object[]} people the staff
 * @param {string} snapshotDate 'YYYY-MM-DD'
 */
export function forecastFromRoster(people, snapshotDate) {
  const active = (people || []).filter((row) => {
    // Joined by the snapshot date...
    if (row.date_of_joining && row.date_of_joining > snapshotDate) return false;
    // ...and had not left by it.
    if (row.date_of_leaving && row.date_of_leaving <= snapshotDate) return false;
    return true;
  });

  const lines = active.map((row) => ({
    id: row.employee_id,
    name: row.name,
    department: row.department,
    amount: Number(row.current_fixed_salary || 0) + Number(row.current_variable_salary || 0),
    fixed: Number(row.current_fixed_salary || 0),
    variable: Number(row.current_variable_salary || 0),
  }));

  const total = lines.reduce((sum, row) => sum + row.amount, 0);

  return {
    amount: Math.round(total * 100) / 100,
    employeeCount: lines.length,
    lines,
    snapshotDate,
  };
}

/**
 * What the cycle will cost if every active employee is paid a full month.
 *
 * @param {object} supabase a Supabase service-role client
 * @param {string} snapshotDate 'YYYY-MM-DD'
 */
export async function salaryForecast(supabase, snapshotDate) {
  const { data, error } = await supabase
    .from('employees')
    .select('employee_id, name, department, current_fixed_salary, current_variable_salary, date_of_joining, date_of_leaving, status')
    .order('name');

  if (error) throw error;

  return forecastFromRoster(data || [], snapshotDate);
}

/**
 * What the payroll for a cycle actually cost.
 *
 * This is the pure part — the runs and their line items in, the cost out — so
 * that every cycle on record can be worked out from one read of the payroll
 * tables.
 *
 * The actual comes from the **regular** run for that cycle — the one the
 * payroll page produces. An off-cycle advance has no salary of its own
 * (its fixed pay is zero), so it is not the cycle's cost.
 *
 * @param {object[]} allRuns the payroll runs for the cycle
 * @param {object[]} allItems the line items of those runs
 */
export function actualFromRuns(allRuns, allItems) {
  const runs = allRuns || [];
  const regular = runs.find((run) => run.run_type === 'regular');
  const adhoc = runs.filter((run) => run.run_type !== 'regular');

  if (!regular) {
    // No regular run yet — the salary is still a forecast.
    return {
      processed: false,
      amount: 0,
      employeeCount: 0,
      runId: null,
      lines: [],
      // Cash already out the door on off-cycle advances, so the cashflow
      // page can show it. It is not part of the cost.
      advanced: adhoc.reduce((sum, run) => sum + Number(run.total_amount || 0), 0),
    };
  }

  const items = (allItems || []).filter((item) => item.payroll_run_id === regular.id);

  const lines = items.map((row) => {
    const cost = Number(row.fixed_pay || 0) + Number(row.variable_pay || 0) + Number(row.bonus_pay || 0);
    return {
      employeeId: row.employee_id,
      cost,
      fixed: Number(row.fixed_pay || 0),
      variable: Number(row.variable_pay || 0),
      bonus: Number(row.bonus_pay || 0),
      paid: Number(row.total_pay || 0),
      paymentStatus: row.payment_status,
      salaryPaidDate: row.salary_paid_date,
    };
  });

  return {
    processed: true,
    amount: Math.round(lines.reduce((sum, row) => sum + row.cost, 0) * 100) / 100,
    paid: Math.round(lines.reduce((sum, row) => sum + row.paid, 0) * 100) / 100,
    employeeCount: lines.length,
    runId: regular.id,
    runStatus: regular.status,
    lines,
    advanced: adhoc.reduce((sum, run) => sum + Number(run.total_amount || 0), 0),
  };
}

/**
 * What the payroll for a cycle actually cost.
 *
 * @param {object} supabase a Supabase service-role client
 * @param {string} cycleStart 'YYYY-MM-DD'
 */
export async function salaryActual(supabase, cycleStart) {
  const { data: runs, error: runError } = await supabase
    .from('payroll_runs')
    .select('id, run_type, status, period_start, period_end, total_amount, generated_on')
    .eq('period_start', cycleStart);

  if (runError) throw runError;

  const allRuns = runs || [];
  const regular = allRuns.find((run) => run.run_type === 'regular');

  let items = [];
  if (regular) {
    const { data: itemRows, error: itemError } = await supabase
      .from('payroll_line_items')
      .select('employee_id, fixed_pay, variable_pay, bonus_pay, gross_pay, deductions, net_pay, total_pay, payment_status, salary_paid_date')
      .eq('payroll_run_id', regular.id);

    if (itemError) throw itemError;
    items = itemRows || [];
  }

  return actualFromRuns(allRuns, items);
}

/**
 * The one figure the pages show, with the other one beside it.
 *
 * @param {object} supabase a Supabase service-role client
 * @param {{start: string, end: string}} cycle the pay cycle
 */
export async function salaryForCycle(supabase, cycle) {
  const snapshotDate = snapshotDateFor(cycle);
  const actual = await salaryActual(supabase, cycle.start);

  if (actual.processed) {
    return {
      state: 'actual',
      amount: actual.amount,
      cycle,
      snapshotDate,
      actual,
      forecast: null,
    };
  }

  const forecast = await salaryForecast(supabase, snapshotDate);

  return {
    state: 'forecast',
    amount: forecast.amount,
    cycle,
    snapshotDate,
    actual,
    forecast,
  };
}
