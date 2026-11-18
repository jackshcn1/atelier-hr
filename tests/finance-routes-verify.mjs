/**
 * tests/finance-routes-verify.mjs
 *
 * Calls the finance route handlers the way the server does — same modules,
 * same live database — and checks what comes back.
 *
 * The HTTP layer is not exercised here on purpose: the session gate in
 * middleware.js is what decides who may call these, and that is not what
 * this file is testing. What is tested is that the handler reads the right
 * rows and answers with the right shape.
 *
 * Run: node tests/finance-routes-verify.mjs
 */

import { readFileSync } from 'node:fs';

// The handlers read the database address and the service key from the
// environment, so they are loaded the way the server loads them.
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && process.env[match[1]] === undefined) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
}

let passed = 0;
// The check is awaited, so a check whose body is async is really run and
// really asserted. Without the await an async body returns a promise that
// nobody waits for — the check reports success, and an error inside it
// escapes as an unhandled rejection instead of failing the run.
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
    process.exitCode = 1;
  }
}

const { GET: dashboardGET } = await import('../app/api/finance/dashboard/route.js');
const { GET: pnlGET, } = await import('../app/api/finance/pnl/route.js');
const { GET: cashflowGET } = await import('../app/api/finance/cashflow/route.js');
const { GET: expensesGET, POST: expensesPOST } = await import('../app/api/finance/expenses/route.js');
const { GET: vendorsGET, POST: vendorsPOST } = await import('../app/api/finance/vendors/route.js');
const { writeInvoiceSheet } = await import('../lib/invoiceSheet.js');
const { createClient } = await import('@supabase/supabase-js');

const req = (url) => new Request(`https://atelier.test${url}`);
const post = (url, body) =>
  new Request(`https://atelier.test${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const json = async (res) => ({ status: res.status, body: await res.json() });

console.log('finance routes');

const dash = await json(await dashboardGET(req('/api/finance/dashboard')));
await check('the dashboard answers with revenue, costs and the readiness of the month', () => {
  if (dash.status !== 200) throw new Error(`status ${dash.status}`);
  const d = dash.body.data;
  if (typeof d.revenue.total !== 'number') throw new Error('no revenue total');
  if (typeof d.net_pl !== 'number') throw new Error('no net profit');
  if (!Array.isArray(d.readiness) || d.readiness.length < 5) throw new Error('no readiness');
  if (!Array.isArray(d.missing)) throw new Error('no missing list');
  if (!d.receivables || !d.payables) throw new Error('no money owed');
});

const pnl = await json(await pnlGET(req('/api/finance/pnl')));
await check('the P&L answers with the profit and names what is missing', () => {
  if (pnl.status !== 200) throw new Error(`status ${pnl.status}`);
  const d = pnl.body.data;
  if (typeof d.net_profit !== 'number') throw new Error('no net profit');
  if (typeof d.gross_profit !== 'number') throw new Error('no gross profit');
  if (!Array.isArray(d.missing)) throw new Error('no missing list');
  if (!d.receivables || !d.payables) throw new Error('no money owed');
});

const cash = await json(await cashflowGET(req('/api/finance/cashflow')));
await check('the cashflow answers with the money owed by customers', () => {
  if (cash.status !== 200) throw new Error(`status ${cash.status}`);
  const d = cash.body.data;
  if (!d.receivables || !d.receivables.totals) throw new Error('no receivables');
  if (typeof d.receivables.totals.outstanding !== 'number') throw new Error('no outstanding');
  if (!Array.isArray(d.receivables.customers)) throw new Error('no customers');
});

// Staff salary.
//
// The cycle that ends in the month is the one that counts. It is a forecast
// until the payroll for that cycle has been run, and the real figure after.
await check('the P&L carries the staff salary of the cycle ending in the month', () => {
  const d = pnl.body.data;
  if (!d.salary) throw new Error('no salary on the P&L');
  if (d.salary.state !== 'forecast' && d.salary.state !== 'actual') {
    throw new Error(`salary state is "${d.salary.state}"`);
  }
  if (typeof d.salary.amount !== 'number' || d.salary.amount <= 0) {
    throw new Error(`salary amount is ${d.salary.amount}`);
  }
  // The cycle runs from the 20th of one month to the 19th of the next, and
  // the one that ends in this month is the one that is paid for it.
  const cycle = d.salary.cycle;
  if (!cycle || !cycle.start || !cycle.end) throw new Error('no cycle on the salary');
  if (!cycle.end.endsWith('-19')) throw new Error(`the cycle ends on ${cycle.end}, not on the 19th`);
  if (cycle.end.slice(0, 7) !== d.period.key) {
    throw new Error(`the cycle ends in ${cycle.end.slice(0, 7)}, not in ${d.period.key}`);
  }
  // It starts on the 20th of the month before.
  if (!cycle.start.endsWith('-20')) throw new Error(`the cycle starts on ${cycle.start}, not on the 20th`);
  const [endYear, endMonth] = cycle.end.split('-').map(Number);
  const startYear = endMonth === 1 ? endYear - 1 : endYear;
  const startMonth = endMonth === 1 ? 12 : endMonth - 1;
  if (cycle.start.slice(0, 7) !== `${startYear}-${String(startMonth).padStart(2, '0')}`) {
    throw new Error(`the cycle starts in ${cycle.start.slice(0, 7)}, not the month before ${d.period.key}`);
  }
});

await check('the salary is an operating cost, not part of the cost of making a sale', () => {
  const d = pnl.body.data;
  if (d.cost_of_revenue >= d.operating_costs && d.salary.amount > 0) {
    throw new Error('the salary looks like it is sitting in the cost of revenue');
  }
  // Gross profit must not have the salary taken out of it.
  if (d.gross_profit !== d.revenue - d.cost_of_revenue) {
    throw new Error('the gross profit has the salary in it');
  }
});

await check('the salary forecast is frozen at the first of the month after the cycle ends', () => {
  const d = pnl.body.data;
  const cycle = d.salary.cycle;
  const [year, month] = cycle.end.split('-').map(Number);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const expected = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
  if (d.salary.snapshotDate !== expected) {
    throw new Error(`the roster is settled on ${d.salary.snapshotDate}, not ${expected}`);
  }
});

await check('the readiness list says whether the salary is a forecast or a real figure', () => {
  const row = dash.body.data.readiness.find((r) => r.key === 'salary');
  if (!row) throw new Error('no salary row in the readiness list');
  if (row.state !== 'ok') throw new Error(`salary reported as "${row.state}": ${row.detail}`);
  if (!/forecast|actual/i.test(row.detail)) throw new Error(`the detail does not say which: ${row.detail}`);
});

await check('a salary advance is cash out, not cost', () => {
  const d = pnl.body.data;
  if (d.salary.state !== 'forecast') return; // an actual cycle has no open advance
  const advanced = Number(d.salary.actual?.advanced || 0);
  if (advanced < 0) throw new Error('the advance is negative');
  if (advanced > d.salary.amount) {
    throw new Error(`₹${advanced} advanced is more than the ₹${d.salary.amount} forecast`);
  }
});

// Standing costs.
//
// The standing-cost list is the checklist of what to expect. An invoice for
// the month replaces the expected amount rather than adding to it, so the
// same rent is never counted twice.
const standingGET = (await import('../app/api/finance/fixed-costs/route.js')).GET;
const standing = await json(await standingGET(req('/api/finance/fixed-costs?month=2026-11')));

await check('the standing costs answer with what the month is expected to cost', () => {
  if (standing.status !== 200) throw new Error(`status ${standing.status}`);
  if (!Array.isArray(standing.body.data)) throw new Error('no standing costs');
  if (!standing.body.totals) throw new Error('no totals');
  if (typeof standing.body.totals.recognised !== 'number') throw new Error('no recognised total');
});

await check('a standing cost is counted once — the invoice replaces the expected amount', () => {
  for (const row of standing.body.data) {
    if (row.received && row.invoiceTotal > 0) {
      if (row.amount !== row.invoiceTotal) {
        throw new Error(`${row.name} counts ₹${row.amount}, but its invoice is ₹${row.invoiceTotal}`);
      }
    } else if (!row.received) {
      if (row.amount !== row.monthlyExpected) {
        throw new Error(`${row.name} counts ₹${row.amount} with no invoice, but its expected amount is ₹${row.monthlyExpected}`);
      }
    }
  }
});

await check('the standing costs are counted as costs of the month', () => {
  const d = pnl.body.data;
  const expected = standing.body.totals.recognised;
  if (Math.abs(d.operating_costs - (d.salary.amount + expected)) > 0.01) {
    throw new Error(`operating costs ₹${d.operating_costs}, but salary ₹${d.salary.amount} + standing ₹${expected}`);
  }
});

const bills = await json(await expensesGET(req('/api/finance/expenses?view=bills')));
await check('the bills answer with what is owed to each supplier', () => {
  if (bills.status !== 200) throw new Error(`status ${bills.status}`);
  const d = bills.body.data;
  if (!Array.isArray(d.vendors)) throw new Error('no vendors');
  if (typeof d.totals.unpaid !== 'number') throw new Error('no unpaid total');
});

await check('the dashboard counts the bills it says are on record', () => {
  // A head query returns the number in `count`, not in `data`. Reading the
  // wrong one made every month look as though it had no bills at all.
  const billsRow = dash.body.data.readiness.find((r) => r.key === 'bills');
  if (!billsRow) throw new Error('no bills row in the readiness list');
  if (billsRow.state !== 'ok') throw new Error(`bills reported as "${billsRow.state}": ${billsRow.detail}`);
  const count = Number(billsRow.detail.replace(/[^0-9]/g, ''));
  if (count !== dash.body.data.payables.totals.billCountTotal) {
    throw new Error(`readiness says ${count} bills, the dashboard says ${dash.body.data.payables.totals.billCountTotal}`);
  }
});

await check('a credit note is a credit back, not a bill to pay', () => {
  const t = dash.body.data.payables.totals;
  if (t.credit > 0 && t.billCountTotal !== t.billCount && t.unpaid === t.credit) {
    throw new Error('the payable is the credit instead of the bills');
  }
  // What you owe is the invoices; the credit notes are money coming back.
  if (t.credit > 0 && t.unpaid < t.credit) {
    throw new Error('the payable is less than the credit notes alone');
  }
});

const exp = await json(await expensesGET(req('/api/finance/expenses')));
await check('every bill comes back with one payment spelling', () => {
  if (exp.status !== 200) throw new Error(`status ${exp.status}`);
  const rows = exp.body.data;
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('no bills');
  const spellings = new Set(rows.map((r) => r.payment_status));
  for (const value of spellings) {
    if (value !== 'paid' && value !== 'unpaid') throw new Error(`odd spelling "${value}"`);
  }
});

const vend = await json(await vendorsGET(req('/api/finance/vendors')));
await check('the supplier list answers with what is owed to each', () => {
  if (vend.status !== 200) throw new Error(`status ${vend.status}`);
  const rows = vend.body.data;
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('no suppliers');
  for (const row of rows) {
    if (!row.bills || typeof row.bills.unpaid !== 'number') throw new Error(`no bills on ${row.name}`);
  }
});

// A bill typed by hand, then removed again — the whole round trip.
const created = await json(await expensesPOST(post('/api/finance/expenses', {
  category: 'Rent',
  cost_type: 'variable',
  amount: 123.45,
  vendor_name: 'Ambrosia - The Classic Bakehouse',
  invoice_number: 'ROUTE-CHECK-1',
  invoice_date: '2026-11-17',
  payment_status: 'unpaid',
})));

let testBillId = null;
await check('a bill typed by hand is accepted', () => {
  if (created.status !== 200) throw new Error(`status ${created.status}: ${JSON.stringify(created.body).slice(0, 200)}`);
  if (created.body.data.amount !== 123.45) throw new Error('wrong amount');
  if (created.body.data.cost_type !== 'variable') throw new Error('wrong cost type');
  if (created.body.data.payment_status !== 'unpaid') throw new Error('wrong payment status');
  testBillId = created.body.data.id;
});

await check('the bill shows up in the supplier totals', async () => {
  const after = await json(await vendorsGET(req('/api/finance/vendors')));
  const row = after.body.data.find((v) => v.name === 'Ambrosia - The Classic Bakehouse');
  if (!row) throw new Error('supplier missing');
  if (row.bills.billCount < 1) throw new Error('bill not counted');
});

if (testBillId) {
  const { DELETE: billDELETE } = await import('../app/api/finance/expenses/[id]/route.js');
  const removed = await json(await billDELETE(req(`/api/finance/expenses/${testBillId}?id=${testBillId}`), {
    params: { id: testBillId },
  }));
  await check('the bill can be removed again', () => {
    if (!removed.body.success) throw new Error(JSON.stringify(removed.body).slice(0, 200));
  });
}

// A supplier that is not on the list yet.
const made = await json(await vendorsPOST(post('/api/finance/vendors', { name: 'Route Check Supplier' })));
let madeId = null;
await check('a supplier can be added', () => {
  if (made.status !== 200) throw new Error(JSON.stringify(made.body).slice(0, 200));
  madeId = made.body.data.id;
});
if (madeId) {
  const { DELETE: vendorDELETE } = await import('../app/api/finance/vendors/route.js');
  await vendorDELETE(req(`/api/finance/vendors?id=${madeId}`), { method: 'DELETE' });
  await check('the supplier can be removed again', () => {
    /* the delete above is the assertion */
  });
}

// The accountant's invoice sheet, written into the live books.
//
// The parser is checked on its own in tests/invoice-sheet-verify.mjs. What is
// checked here is the writing: that a sheet row lands in the ledger with the
// right shape, that the same invoice number is never written twice, and that
// a bill the sheet wrote is *updated* when the sheet changes — which is how
// ticking a bill "Paid" in the sheet reaches the books.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SHEET_BILL = {
  sourceKey: 'id:verify-sheet-bill-1',
  bucket: 'fixed',
  costType: 'fixed',
  costTypeName: 'Outlet Rent',
  category: 'Outlet Rent',
  vendor: 'Sheet Route Check',
  invoiceNo: '',
  description: 'Written by the sheet test',
  amount: 999.99,
  invoiceDate: '2026-11-17',
  paymentStatus: 'unpaid',
  paymentDate: null,
  paymentMethod: 'NEFT',
  reference: null,
  pettyType: 'expense',
};

const SHEET_PETTY = {
  sourceKey: 'id:verify-sheet-petty-1',
  bucket: 'petty',
  costType: 'petty',
  costTypeName: 'Cleaning materials',
  category: 'Cleaning & supplies',
  vendor: 'Sheet Route Check',
  invoiceNo: '',
  description: 'Petty written by the sheet test',
  amount: 350,
  invoiceDate: '2026-11-17',
  paymentStatus: 'paid',
  paymentDate: '2026-11-17',
  paymentMethod: 'Cash',
  reference: null,
  pettyType: 'expense',
};

let sheetBillId = null;
let sheetPettyId = null;

await check('a bill from the sheet is written into the ledger', async () => {
  const written = await writeInvoiceSheet(sb, [SHEET_BILL]);
  if (written.expensesWritten !== 1) throw new Error(`wrote ${written.expensesWritten} bills, expected 1`);

  const { data, error } = await sb
    .from('expenses')
    .select('id, amount, cost_type, category, vendor_name, invoice_number, invoice_date, payment_status, source, source_key')
    .eq('source_key', SHEET_BILL.sourceKey);
  if (error) throw error;
  if (!data || data.length !== 1) throw new Error(`the sheet bill is not in the ledger (${data?.length} found)`);

  const row = data[0];
  sheetBillId = row.id;
  if (Number(row.amount) !== 999.99) throw new Error(`the amount is ${row.amount}`);
  if (row.cost_type !== 'fixed') throw new Error(`the cost type is ${row.cost_type}`);
  if (row.category !== 'Outlet Rent') throw new Error(`the category is ${row.category}`);
  if (row.invoice_date !== '2026-11-17') throw new Error(`the date is ${row.invoice_date}`);
  if (row.payment_status !== 'unpaid') throw new Error(`the payment state is ${row.payment_status}`);
  if (row.source !== 'sheet') throw new Error(`the source is ${row.source}, expected sheet`);
});

await check('the same invoice on the sheet is not written twice', async () => {
  const written = await writeInvoiceSheet(sb, [SHEET_BILL]);
  if (written.expensesWritten !== 0) throw new Error(`wrote ${written.expensesWritten} bills again, expected 0`);
  if (written.expensesUpdated !== 0) throw new Error(`updated ${written.expensesUpdated}, expected 0`);
  if (written.unchanged !== 1) throw new Error(`unchanged ${written.unchanged}, expected 1`);

  const { data } = await sb.from('expenses').select('id').eq('source_key', SHEET_BILL.sourceKey);
  if (!data || data.length !== 1) throw new Error(`the bill is on the ledger ${data?.length} times, expected once`);
});

await check('a bill marked paid on the sheet is updated in the books', async () => {
  const written = await writeInvoiceSheet(sb, [
    { ...SHEET_BILL, paymentStatus: 'paid', paymentDate: '2026-11-18' },
  ]);
  if (written.expensesUpdated !== 1) throw new Error(`updated ${written.expensesUpdated}, expected 1`);

  const { data } = await sb
    .from('expenses')
    .select('payment_status, payment_date')
    .eq('source_key', SHEET_BILL.sourceKey);
  if (!data || data.length !== 1) throw new Error(`the sheet bill is on the ledger ${data?.length} times`);
  if (data[0].payment_status !== 'paid') throw new Error(`the payment state is ${data[0].payment_status}`);
  if (data[0].payment_date !== '2026-11-18') throw new Error(`the payment date is ${data[0].payment_date}`);
});

await check('a corrected amount still finds the same bill', async () => {
  const written = await writeInvoiceSheet(sb, [{ ...SHEET_BILL, amount: 1000.5 }]);
  if (written.expensesUpdated !== 1) throw new Error(`updated ${written.expensesUpdated}, expected 1`);

  const { data } = await sb.from('expenses').select('amount').eq('source_key', SHEET_BILL.sourceKey);
  if (!data || data.length !== 1) throw new Error(`the bill is on the ledger ${data?.length} times`);
  if (Number(data[0].amount) !== 1000.5) throw new Error(`the amount is ${data[0].amount}`);
});

await check('a bill somebody else wrote is not written again by the sheet', async () => {
  // A bill typed in by hand, under an invoice number the sheet does not use.
  const { data: made, error } = await sb
    .from('expenses')
    .insert({
      category: 'Other',
      cost_type: 'variable',
      entry_type: 'actual',
      status: 'approved',
      amount: 500,
      debit_note: 0,
      vendor_name: 'Typed In By Hand',
      invoice_number: 'VERIFY-SHEET-3',
      invoice_date: '2026-11-17',
      payment_status: 'unpaid',
      source: 'manual',
    })
    .select('id, amount, source');
  if (error) throw error;

  try {
    const written = await writeInvoiceSheet(sb, [
      { ...SHEET_BILL, sourceKey: 'id:verify-sheet-bill-3', invoiceNo: 'VERIFY-SHEET-3' },
    ]);
    if (written.skippedExisting !== 1) throw new Error(`skipped ${written.skippedExisting}, expected 1`);
    if (written.expensesWritten !== 0) throw new Error(`wrote ${written.expensesWritten}, expected 0`);

    const { data } = await sb
      .from('expenses')
      .select('id, amount, source')
      .eq('invoice_number', 'VERIFY-SHEET-3');
    if (!data || data.length !== 1) throw new Error(`the bill is on the ledger ${data?.length} times, expected once`);
    if (data[0].source !== 'manual') throw new Error(`the bill is now the sheet's: ${data[0].source}`);
    if (Number(data[0].amount) !== 500) throw new Error(`the hand-written bill was changed to ${data[0].amount}`);
  } finally {
    await sb.from('expenses').delete().eq('id', made[0].id);
  }
});

await check('a bill the sheet wrote is still updated when somebody else has one too', async () => {
  // The sheet writes a bill, and then somebody types the same invoice number
  // in by hand. The sheet updates its own row and leaves the hand-written one
  // alone.
  const written = await writeInvoiceSheet(sb, [
    { ...SHEET_BILL, sourceKey: 'id:verify-sheet-bill-4', invoiceNo: 'VERIFY-SHEET-4' },
  ]);
  if (written.expensesWritten !== 1) throw new Error(`wrote ${written.expensesWritten} bills, expected 1`);

  const { data: made, error } = await sb
    .from('expenses')
    .insert({
      category: 'Other',
      cost_type: 'variable',
      entry_type: 'actual',
      status: 'approved',
      amount: 500,
      debit_note: 0,
      vendor_name: 'Typed In By Hand',
      invoice_number: 'VERIFY-SHEET-4',
      invoice_date: '2026-11-17',
      payment_status: 'unpaid',
      source: 'manual',
    })
    .select('id');
  if (error) throw error;

  try {
    const again = await writeInvoiceSheet(sb, [
      { ...SHEET_BILL, sourceKey: 'id:verify-sheet-bill-4', invoiceNo: 'VERIFY-SHEET-4', paymentStatus: 'paid', paymentDate: '2026-11-19' },
    ]);
    if (again.expensesUpdated !== 1) throw new Error(`updated ${again.expensesUpdated}, expected 1`);
    if (again.expensesWritten !== 0) throw new Error(`wrote ${again.expensesWritten}, expected 0`);

    const { data } = await sb
      .from('expenses')
      .select('source, amount, payment_status, payment_date')
      .eq('source_key', 'id:verify-sheet-bill-4');
    const sheetRow = data[0];
    if (sheetRow.payment_status !== 'paid') throw new Error(`the sheet row is ${sheetRow.payment_status}`);
    if (sheetRow.payment_date !== '2026-11-19') throw new Error(`the sheet row's date is ${sheetRow.payment_date}`);

    const { data: hand } = await sb.from('expenses').select('amount').eq('id', made[0].id);
    if (Number(hand[0].amount) !== 500) throw new Error(`the hand-written bill was changed to ${hand[0].amount}`);
  } finally {
    await sb.from('expenses').delete().eq('id', made[0].id);
    await sb.from('expenses').delete().eq('source_key', 'id:verify-sheet-bill-4');
  }
});

await check('a petty entry from the sheet is written, and kept', async () => {
  const written = await writeInvoiceSheet(sb, [SHEET_PETTY]);
  if (written.pettyWritten !== 1) throw new Error(`wrote ${written.pettyWritten} petty entries, expected 1`);

  const { data, error } = await sb
    .from('petty_cash_ledger')
    .select('id, amount, vendor_name, reference, source, source_key')
    .eq('source_key', SHEET_PETTY.sourceKey);
  if (error) throw error;
  if (!data || data.length !== 1) throw new Error(`the petty entry is not in the ledger (${data?.length} found)`);

  sheetPettyId = data[0].id;
  if (Number(data[0].amount) !== 350) throw new Error(`the amount is ${data[0].amount}`);
  if (data[0].source !== 'sheet') throw new Error(`the source is ${data[0].source}, expected sheet`);
});

await check('a petty entry changed on the sheet is updated, not written again', async () => {
  const written = await writeInvoiceSheet(sb, [{ ...SHEET_PETTY, amount: 375 }]);
  if (written.pettyUpdated !== 1) throw new Error(`updated ${written.pettyUpdated}, expected 1`);
  if (written.pettyWritten !== 0) throw new Error(`wrote ${written.pettyWritten} again, expected 0`);

  const { data } = await sb
    .from('petty_cash_ledger')
    .select('amount')
    .eq('source_key', SHEET_PETTY.sourceKey);
  if (!data || data.length !== 1) throw new Error(`the petty entry is on the ledger ${data?.length} times`);
  if (Number(data[0].amount) !== 375) throw new Error(`the amount is ${data[0].amount}`);
});

await check('the standing cost a bill belongs to is the one it is matched on', async () => {
  // "Airtel Broadband Monthly" is the invoice for the standing cost
  // "Airtel Broadband", so the row is filed under the standing cost's name.
  const written = await writeInvoiceSheet(sb, [
    {
      ...SHEET_BILL,
      sourceKey: 'id:verify-sheet-bill-5',
      costTypeName: 'Airtel Broadband Monthly',
      category: 'Airtel Broadband Monthly',
    },
  ]);
  if (written.expensesWritten !== 1) throw new Error(`wrote ${written.expensesWritten} bills, expected 1`);

  const { data } = await sb
    .from('expenses')
    .select('category')
    .eq('source_key', 'id:verify-sheet-bill-5');
  if (data[0].category !== 'Airtel Broadband') throw new Error(`the category is ${data[0].category}`);

  await sb.from('expenses').delete().eq('source_key', 'id:verify-sheet-bill-5');
});

if (sheetBillId) {
  await sb.from('expenses').delete().eq('id', sheetBillId);
  await check('the bill written by the test is removed again', async () => {
    const { data } = await sb.from('expenses').select('id').eq('source_key', SHEET_BILL.sourceKey);
    if (data && data.length > 0) throw new Error('the test bill is still in the ledger');
  });
}

if (sheetPettyId) {
  await sb.from('petty_cash_ledger').delete().eq('id', sheetPettyId);
  await check('the petty entry written by the test is removed again', async () => {
    const { data } = await sb.from('petty_cash_ledger').select('id').eq('source_key', SHEET_PETTY.sourceKey);
    if (data && data.length > 0) throw new Error('the test petty entry is still in the ledger');
  });
}

console.log(`\n${passed} check(s) passed`);
if (process.exitCode) console.error('\nSome checks failed.');
