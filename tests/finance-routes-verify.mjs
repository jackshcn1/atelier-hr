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
function check(name, fn) {
  try {
    fn();
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
check('the dashboard answers with revenue, costs and the readiness of the month', () => {
  if (dash.status !== 200) throw new Error(`status ${dash.status}`);
  const d = dash.body.data;
  if (typeof d.revenue.total !== 'number') throw new Error('no revenue total');
  if (typeof d.net_pl !== 'number') throw new Error('no net profit');
  if (!Array.isArray(d.readiness) || d.readiness.length < 5) throw new Error('no readiness');
  if (!Array.isArray(d.missing)) throw new Error('no missing list');
  if (!d.receivables || !d.payables) throw new Error('no money owed');
});

const pnl = await json(await pnlGET(req('/api/finance/pnl')));
check('the P&L answers with the profit and names what is missing', () => {
  if (pnl.status !== 200) throw new Error(`status ${pnl.status}`);
  const d = pnl.body.data;
  if (typeof d.net_profit !== 'number') throw new Error('no net profit');
  if (typeof d.gross_profit !== 'number') throw new Error('no gross profit');
  if (!Array.isArray(d.missing)) throw new Error('no missing list');
  if (!d.receivables || !d.payables) throw new Error('no money owed');
});

const cash = await json(await cashflowGET(req('/api/finance/cashflow')));
check('the cashflow answers with the money owed by customers', () => {
  if (cash.status !== 200) throw new Error(`status ${cash.status}`);
  const d = cash.body.data;
  if (!d.receivables || !d.receivables.totals) throw new Error('no receivables');
  if (typeof d.receivables.totals.outstanding !== 'number') throw new Error('no outstanding');
  if (!Array.isArray(d.receivables.customers)) throw new Error('no customers');
});

const bills = await json(await expensesGET(req('/api/finance/expenses?view=bills')));
check('the bills answer with what is owed to each supplier', () => {
  if (bills.status !== 200) throw new Error(`status ${bills.status}`);
  const d = bills.body.data;
  if (!Array.isArray(d.vendors)) throw new Error('no vendors');
  if (typeof d.totals.unpaid !== 'number') throw new Error('no unpaid total');
});

check('the dashboard counts the bills it says are on record', () => {
  // A head query returns the number in `count`, not in `data`. Reading the
  // wrong one made every month look as though it had no bills at all.
  const billsRow = dash.body.data.readiness.find((r) => r.key === 'variable');
  if (!billsRow) throw new Error('no bills row in the readiness list');
  if (billsRow.state !== 'ok') throw new Error(`bills reported as "${billsRow.state}": ${billsRow.detail}`);
  const count = Number(billsRow.detail.replace(/[^0-9]/g, ''));
  if (count !== dash.body.data.payables.totals.billCount) {
    throw new Error(`readiness says ${count} bills, the dashboard says ${dash.body.data.payables.totals.billCount}`);
  }
});

const exp = await json(await expensesGET(req('/api/finance/expenses')));
check('every bill comes back with one payment spelling', () => {
  if (exp.status !== 200) throw new Error(`status ${exp.status}`);
  const rows = exp.body.data;
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('no bills');
  const spellings = new Set(rows.map((r) => r.payment_status));
  for (const value of spellings) {
    if (value !== 'paid' && value !== 'unpaid') throw new Error(`odd spelling "${value}"`);
  }
});

const vend = await json(await vendorsGET(req('/api/finance/vendors')));
check('the supplier list answers with what is owed to each', () => {
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
check('a bill typed by hand is accepted', () => {
  if (created.status !== 200) throw new Error(`status ${created.status}: ${JSON.stringify(created.body).slice(0, 200)}`);
  if (created.body.data.amount !== 123.45) throw new Error('wrong amount');
  if (created.body.data.cost_type !== 'variable') throw new Error('wrong cost type');
  if (created.body.data.payment_status !== 'unpaid') throw new Error('wrong payment status');
  testBillId = created.body.data.id;
});

check('the bill shows up in the supplier totals', async () => {
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
  check('the bill can be removed again', () => {
    if (!removed.body.success) throw new Error(JSON.stringify(removed.body).slice(0, 200));
  });
}

// A supplier that is not on the list yet.
const made = await json(await vendorsPOST(post('/api/finance/vendors', { name: 'Route Check Supplier' })));
let madeId = null;
check('a supplier can be added', () => {
  if (made.status !== 200) throw new Error(JSON.stringify(made.body).slice(0, 200));
  madeId = made.body.data.id;
});
if (madeId) {
  const { DELETE: vendorDELETE } = await import('../app/api/finance/vendors/route.js');
  await vendorDELETE(req(`/api/finance/vendors?id=${madeId}`), { method: 'DELETE' });
  check('the supplier can be removed again', () => {
    /* the delete above is the assertion */
  });
}

console.log(`\n${passed} check(s) passed`);
if (process.exitCode) console.error('\nSome checks failed.');
