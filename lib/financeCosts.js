/**
 * lib/financeCosts.js — the costs of a calendar month, for the finance pages.
 *
 * Everything the finance dashboards show about costs comes through here, so
 * the dashboard and the P&L can never disagree about a month.
 *
 * A note on how the window is applied. The obvious way to say "the costs of
 * this month, and also the ones that have no date yet" is a single PostgREST
 * `or` filter:
 *
 *   .or('invoice_date.gte.X,invoice_date.lte.Y,invoice_date.is.null')
 *
 * That does not work. PostgREST **drops the whole `or` filter when it holds
 * an `lte`**, and the query then answers with every row in the table — no
 * error, no warning, just an unfiltered result. The old dashboard used
 * exactly that filter, so "costs in the pay cycle" was really "every cost
 * ever recorded".
 *
 * So the window is applied as two plain queries that PostgREST handles
 * correctly: the rows inside the window, and the rows with no date at all.
 */

/**
 * The expenses of a window: the dated ones that fall inside it, plus the
 * ones with no date (a manually entered cost that has not been dated yet).
 *
 * @param {object} supabase a Supabase service-role client
 * @param {{start: string, end: string}} window 'YYYY-MM-DD' bounds
 * @param {string[]} columns the columns to read
 */
export async function expensesInWindow(supabase, window, columns = 'amount, debit_note, cost_type, category, vendor_name') {
  const [dated, undated] = await Promise.all([
    supabase.from('expenses').select(columns)
      .gte('invoice_date', window.start)
      .lte('invoice_date', window.end),
    supabase.from('expenses').select(columns)
      .is('invoice_date', null),
  ]);

  if (dated.error) throw dated.error;
  if (undated.error) throw undated.error;

  return [...(dated.data || []), ...(undated.data || [])];
}

/**
 * What a document costs.
 *
 * `amount` is what the document is worth; `debit_note` is a credit against
 * it. A purchase invoice carries no credit, so it costs its full amount. A
 * purchase return — goods sent back to the supplier — carries the whole
 * value as a credit, so it costs the negative of that.
 *
 * The return used to be stored as an amount with the same value as its own
 * credit note, which made it cost nothing at all: the goods that went back
 * to the supplier were still counted as a cost.
 */
export function netAmount(row) {
  return Number(row?.amount || 0) - Number(row?.debit_note || 0);
}

/**
 * The petty cash of a window.
 *
 * @param {object} supabase a Supabase service-role client
 * @param {{start: string, end: string}} window 'YYYY-MM-DD' bounds
 */
export async function pettyCashInWindow(supabase, window) {
  const { data, error } = await supabase
    .from('petty_cash_ledger')
    .select('amount, type, date, vendor_name')
    .gte('date', window.start)
    .lte('date', window.end);
  if (error) throw error;
  return data || [];
}

/**
 * The standing costs of a month.
 *
 * A fixed cost carries no date — it is the cost of running the month, so it
 * counts in full in every month. The billing cycle decides how much of an
 * annual cost is recognised in a month.
 */
export async function fixedCosts(supabase) {
  const { data, error } = await supabase.from('fixed_costs').select('name, amount, billing_cycle');
  if (error) throw error;
  return data || [];
}

/** The monthly cost of one standing cost. */
export function monthlyAmount(fixedCost) {
  const amount = Number(fixedCost?.amount || 0);
  return fixedCost?.billing_cycle === 'annual' ? amount / 12 : amount;
}

/**
 * Group rows by a label and add them up, biggest first.
 *
 * A row's worth is what it costs — an amount less any credit note against
 * it — so a purchase return lands as a negative figure and pulls its
 * supplier's total down.
 */
export function groupBy(rows, keyOf, fallback) {
  const map = new Map();
  for (const row of rows) {
    const label = keyOf(row) || fallback;
    map.set(label, (map.get(label) || 0) + netAmount(row));
  }
  return [...map.entries()]
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Every cost of a calendar month, in one place.
 *
 * Returns the totals the dashboards use and the rows behind them, so the
 * drilldown shows the real rows and not a made-up split.
 */
export async function monthCosts(supabase, period) {
  const [fixedRows, pettyRows, expenseRows] = await Promise.all([
    fixedCosts(supabase),
    pettyCashInWindow(supabase, period),
    expensesInWindow(supabase, period),
  ]);

  const fixed = fixedRows.map((row) => ({ ...row, amount: monthlyAmount(row) }));
  const pettyExpenses = pettyRows.filter((row) => row.type === 'expense');
  const variableExpenses = expenseRows.filter((row) => row.cost_type === 'variable' || !row.cost_type);

  const fixedTotal = fixed.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const pettyTotal = pettyExpenses.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const variableTotal = variableExpenses.reduce((sum, row) => sum + netAmount(row), 0);

  // The credit notes in the month — goods sent back to a supplier. They
  // reduce the cost, and they are money the supplier owes back, so the
  // pages say so rather than quietly netting them away.
  const creditTotal = expenseRows.reduce((sum, row) => sum + Number(row.debit_note || 0), 0);

  return {
    fixed: fixedTotal,
    petty: pettyTotal,
    variable: variableTotal,
    total: fixedTotal + pettyTotal + variableTotal,
    credit: creditTotal,
    breakdown: {
      fixed: groupBy(fixed, (row) => row.name, 'Fixed cost'),
      variable: groupBy(variableExpenses, (row) => row.category || row.vendor_name, 'Other'),
      petty: groupBy(pettyExpenses, (row) => row.vendor_name, 'Petty cash'),
    },
  };
}
