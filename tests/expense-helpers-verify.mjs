/**
 * tests/expense-helpers-verify.mjs
 *
 * The manual expense entry form was broken for a long time and nothing
 * caught it: every hand-written bill was rejected by the database, silently,
 * because the form sent a column the table never had, never sent a column
 * the table required, and sent empty strings where dates belong.
 *
 * These checks pin down the three behaviours that were wrong, so the form
 * cannot quietly break again.
 *
 * Run: npm run test:finance
 */

import assert from 'node:assert/strict';
import {
  cleanAttachment,
  cleanExpense,
  cleanExpensePatch,
  cleanVendorName,
  mergePetpoojaBill,
  normalizePaymentStatus,
} from '../lib/expenseHelpers.js';

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

console.log('expense helpers');

check('a column the table does not have is dropped, not sent', () => {
  const row = cleanExpense({
    category: 'Rent',
    amount: '500',
    vendor_id: '1', // the column that broke the form
    vendor_name: 'Ambrosia',
  });
  assert.equal('vendor_id' in row, false);
  assert.equal(row.vendor_name, 'Ambrosia');
});

check('cost_type is always present and is one of the two kinds', () => {
  assert.equal(cleanExpense({ category: 'Rent', amount: '1' }).cost_type, 'variable');
  assert.equal(cleanExpense({ category: 'Rent', amount: '1', cost_type: 'fixed' }).cost_type, 'fixed');
  assert.equal(cleanExpense({ category: 'Rent', amount: '1', cost_type: 'FIXED' }).cost_type, 'fixed');
  assert.equal(cleanExpense({ category: 'Rent', amount: '1', cost_type: 'nonsense' }).cost_type, 'variable');
});

check('an empty date is no date, and a bad date is dropped', () => {
  const row = cleanExpense({
    category: 'Rent',
    amount: '1',
    invoice_date: '',
    payment_date: '',
  });
  assert.equal(row.invoice_date, null);
  assert.equal(row.payment_date, null);

  const bad = cleanExpense({ category: 'Rent', amount: '1', invoice_date: 'not-a-date' });
  assert.equal(bad.invoice_date, null);
});

check('a real date survives', () => {
  const row = cleanExpense({ category: 'Rent', amount: '1', invoice_date: '2026-11-17' });
  assert.equal(row.invoice_date, '2026-11-17');
});

check('the payment state has one spelling', () => {
  assert.equal(normalizePaymentStatus('Paid'), 'paid');
  assert.equal(normalizePaymentStatus('paid'), 'paid');
  assert.equal(normalizePaymentStatus('Unpaid'), 'unpaid');
  assert.equal(normalizePaymentStatus('due'), 'unpaid');
  assert.equal(normalizePaymentStatus(''), 'unpaid');
  assert.equal(normalizePaymentStatus(null), 'unpaid');
});

check('a bill marked paid keeps the payment date it was given', () => {
  const row = cleanExpense({
    category: 'Rent',
    amount: '1',
    payment_status: 'Paid',
    payment_date: '2026-11-16',
  });
  assert.equal(row.payment_status, 'paid');
  assert.equal(row.payment_date, '2026-11-16');
});

check('a bill marked paid with no date of its own falls back to the invoice date', () => {
  const row = cleanExpense({
    category: 'Rent',
    amount: '1',
    payment_status: 'Paid',
    invoice_date: '2026-11-10',
    payment_date: '',
  });
  assert.equal(row.payment_date, '2026-11-10');
});

check('the amount is a number, and a missing amount is zero', () => {
  assert.equal(cleanExpense({ category: 'Rent', amount: '1,250.50' }).amount, 0); // not a number
  assert.equal(cleanExpense({ category: 'Rent', amount: '1250.50' }).amount, 1250.5);
  assert.equal(cleanExpense({ category: 'Rent' }).amount, 0);
});

check('a patch touches only the fields it was given', () => {
  const row = cleanExpensePatch({ payment_status: 'Paid' });
  assert.deepEqual(Object.keys(row), ['payment_status']);
  assert.equal(row.payment_status, 'paid');
});

check('a patch does not reset the amount or the approval status', () => {
  const row = cleanExpensePatch({ status: 'approved' });
  assert.equal('amount' in row, false);
  assert.equal('cost_type' in row, false);
  assert.equal(row.status, 'approved');
});

check('the link to the invoice is only ever a link', () => {
  assert.equal(
    cleanAttachment('https://drive.google.com/file/d/abc/view'),
    'https://drive.google.com/file/d/abc/view',
  );
  assert.equal(cleanAttachment('javascript:alert(1)'), null);
  assert.equal(cleanAttachment('http://drive.google.com/file/d/abc/view'), null);
  assert.equal(cleanAttachment(''), null);
  assert.equal(cleanAttachment(null), null);
});

check('the supplier name loses its tag and its extra spaces', () => {
  assert.equal(
    cleanVendorName('Ambrosia - The Classic Bakehouse [Supplier]'),
    'Ambrosia - The Classic Bakehouse'
  );
  assert.equal(cleanVendorName('  Wholegrains   - The Baker\'s Hub  '), "Wholegrains - The Baker's Hub");
  assert.equal(cleanVendorName(null), '');
});

check('a pull keeps the category a person set on a bill', () => {
  // Petpooja knows the facts of a bill, not how it is classified. A bill the
  // accountant filed as "Digital Marketing Retainer" must stay filed that way,
  // because that is what matches it to its standing cost.
  const merged = mergePetpoojaBill(
    {
      category: 'Digital Marketing Retainer',
      cost_type: 'fixed',
      entry_type: 'actual',
      status: 'approved',
      description: 'From the accountant invoice sheet',
      amount: 15000,
    },
    {
      category: 'Vendor',
      cost_type: 'variable',
      entry_type: 'actual',
      status: 'approved',
      description: 'Petpooja purchase bill',
      amount: 15000,
      invoice_number: '0369',
    }
  );
  assert.equal(merged.category, 'Digital Marketing Retainer');
  assert.equal(merged.cost_type, 'fixed');
  assert.equal(merged.description, 'From the accountant invoice sheet');
  // The facts still come from Petpooja.
  assert.equal(merged.invoice_number, '0369');
  assert.equal(merged.amount, 15000);
});

check('a bill with no category yet takes the one the pull brings', () => {
  const merged = mergePetpoojaBill(
    { category: null, cost_type: null, description: '' },
    { category: 'Vendor', cost_type: 'variable', description: 'Petpooja purchase bill' }
  );
  assert.equal(merged.category, 'Vendor');
  assert.equal(merged.cost_type, 'variable');
  assert.equal(merged.description, 'Petpooja purchase bill');
});

check('a pull that changed nothing else keeps everything', () => {
  const merged = mergePetpoojaBill(
    { category: 'Outlet Rent', cost_type: 'fixed', created_by: 'rishab', approved_by: 'rishab' },
    { category: 'Vendor', cost_type: 'variable', amount: 90000, created_by: null, approved_by: null }
  );
  assert.equal(merged.amount, 90000);
  assert.equal(merged.category, 'Outlet Rent');
  assert.equal(merged.cost_type, 'fixed');
  assert.equal(merged.created_by, 'rishab');
  assert.equal(merged.approved_by, 'rishab');
});

console.log(`\n${passed} check(s) passed`);
if (process.exitCode) console.error('\nSome checks failed.');
