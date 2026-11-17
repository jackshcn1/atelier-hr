/**
 * lib/financePosition.js — the balance-sheet side of a calendar month, and
 * how much of the picture is actually filled in.
 *
 * Two things live here:
 *
 *  1. The money owed by customers (the receivables) and the money owed to
 *     suppliers (the bills still unpaid). Neither is a cash movement and
 *     neither belongs in the P&L, but both are part of where the business
 *     actually stands.
 *
 *  2. A readiness check: for each part of the finance picture, is it filled
 *     in or is it empty? A page that shows a profit while half its costs
 *     are missing is worse than a page that shows nothing, so the readiness
 *     check travels with the numbers and the pages say which parts are still
 *     empty.
 */

import { normalizePaymentStatus, PAID } from './expenseHelpers.js';

/**
 * The money owed by customers, and the money owed to suppliers, for a month.
 *
 * @param {object} supabase a Supabase service-role client
 * @param {{key: string, start: string, end: string}} period the calendar month
 */
export async function monthPosition(supabase, period) {
  const [receivableResult, billResult] = await Promise.all([
    supabase
      .from('finance_receivables')
      .select('customer_name, invoice_no, remaining_amount, age_days, is_overdue, synced_at')
      .eq('month', period.key),
    supabase
      .from('expenses')
      .select('vendor_name, amount, debit_note, payment_status, invoice_date')
      .gte('invoice_date', period.start)
      .lte('invoice_date', period.end),
  ]);

  if (receivableResult.error) throw receivableResult.error;
  if (billResult.error) throw billResult.error;

  const receivables = receivableResult.data || [];
  const bills = billResult.data || [];

  // What the customers owe.
  const customers = new Map();
  let outstanding = 0;
  let overdue = 0;

  for (const row of receivables) {
    // An invoice with no customer name on it still has an invoice number,
    // and that is what identifies it — so it is filed under its own number
    // rather than lumped in with every other unnamed invoice.
    const name = (row.customer_name || '').trim() || `Invoice ${row.invoice_no || '—'}`;
    const amount = Number(row.remaining_amount || 0);
    outstanding += amount;
    if (row.is_overdue) overdue += amount;

    const line = customers.get(name) || { customer: name, amount: 0, invoices: 0, overdueAmount: 0, oldestDays: 0 };
    line.amount += amount;
    line.invoices += 1;
    if (row.is_overdue) line.overdueAmount += amount;
    line.oldestDays = Math.max(line.oldestDays, Number(row.age_days || 0));
    customers.set(name, line);
  }

  const customerList = [...customers.values()]
    .map((line) => ({
      ...line,
      amount: Math.round(line.amount * 100) / 100,
      overdueAmount: Math.round(line.overdueAmount * 100) / 100,
    }))
    .sort((a, b) => b.amount - a.amount);

  // What the suppliers are owed.
  //
  // What you owe is the invoices you have not paid — the invoice amount,
  // not the amount less a credit note. A purchase return is not something
  // you owe: it is a credit the supplier owes you, or has yet to apply, so
  // it is counted separately rather than quietly reducing the payable.
  let unpaid = 0;
  let unpaidCount = 0;
  let billCount = 0;
  let credit = 0;
  let creditCount = 0;
  const unpaidVendors = new Set();

  for (const bill of bills) {
    const note = Number(bill.debit_note || 0);
    const amount = Number(bill.amount || 0);

    if (note > 0) {
      credit += note;
      creditCount += 1;
      continue;
    }

    billCount += 1;

    if (normalizePaymentStatus(bill.payment_status) === PAID) continue;

    unpaid += amount;
    unpaidCount += 1;
    const name = (bill.vendor_name || '').trim();
    if (name) unpaidVendors.add(name);
  }

  return {
    receivables: {
      customers: customerList,
      totals: {
        outstanding: Math.round(outstanding * 100) / 100,
        overdue: Math.round(overdue * 100) / 100,
        invoiceCount: receivables.length,
        customerCount: customerList.length,
        asOf: receivables[0]?.synced_at || null,
      },
    },
    payables: {
      totals: {
        unpaid: Math.round(unpaid * 100) / 100,
        billCount: unpaidCount,
        // Every bill on record for the month, paid or not — the number the
        // readiness line on the dashboard uses, so the two cannot disagree.
        billCountTotal: billCount,
        vendorCount: unpaidVendors.size,
        credit: Math.round(credit * 100) / 100,
        creditCount,
      },
    },
  };
}

/**
 * How much of the month's picture is actually filled in.
 *
 * Each part gets one of three states:
 *
 *   'ok'      the part is filled in
 *   'empty'   the part is missing — and the page must say so
 *   'pending' the part is on its way (a sync is running)
 *
 * @param {object} input what has been found so far
 */
export function monthReadiness({
  revenueSynced,
  revenueAsOf,
  variableBillCount,
  fixedCostCount,
  pettyEntryCount,
  receivableCount,
  unpaidBillCount,
}) {
  return [
    {
      key: 'revenue',
      label: 'Revenue',
      state: revenueSynced ? 'ok' : 'empty',
      detail: revenueSynced
        ? `Petpooja sales to ${revenueAsOf}`
        : 'Not pulled from Petpooja yet',
      missing: 'The sales figure for this month is missing.',
    },
    {
      key: 'variable',
      label: 'Bills',
      state: variableBillCount > 0 ? 'ok' : 'empty',
      detail: variableBillCount > 0 ? `${variableBillCount} bill(s) on record` : 'No bills on record',
      missing: 'No supplier bills are on record for this month.',
    },
    {
      key: 'fixed',
      label: 'Fixed costs',
      state: fixedCostCount > 0 ? 'ok' : 'empty',
      detail: fixedCostCount > 0 ? `${fixedCostCount} configured` : 'None configured',
      missing:
        'No fixed costs are configured, so the profit shown does not yet include rent, salaries or power.',
    },
    {
      key: 'petty',
      label: 'Petty cash',
      state: pettyEntryCount > 0 ? 'ok' : 'empty',
      detail: pettyEntryCount > 0 ? `${pettyEntryCount} entr(y/ies)` : 'No entries',
      missing: 'No petty cash entries for this month.',
    },
    {
      key: 'receivables',
      label: 'Money owed by customers',
      state: receivableCount > 0 ? 'ok' : 'pending',
      detail: receivableCount > 0 ? `${receivableCount} open invoice(s)` : 'Waiting for the next sync',
      missing: '',
    },
    {
      key: 'payables',
      label: 'Money owed to suppliers',
      state: unpaidBillCount > 0 ? 'ok' : 'empty',
      detail: unpaidBillCount > 0 ? `${unpaidBillCount} unpaid bill(s)` : 'Nothing unpaid',
      missing: '',
    },
  ];
}
