/**
 * tests/invoice-sheet-verify.mjs
 *
 * Checks the accountant's invoice sheet — the parser that turns the sheet's
 * rows into entries, and the rule that a bill is counted once.
 *
 * The sheet is a Google Form's response sheet: one row per entry, and the
 * entry's type decides which block of columns holds it. The fixture below is
 * the **real sheet** — its actual headings and its actual rows — so a change
 * to the sheet's shape shows up here first.
 *
 * The writing into the books is checked by tests/finance-routes-verify.mjs,
 * which works against the live database.
 *
 * Run: node tests/invoice-sheet-verify.mjs
 */

import {
  parseInvoiceSheet,
  normaliseHeader,
  normaliseDate,
  normaliseAmount,
  normalisePaymentStatus,
  resolveCostCategory,
  resolvePettyCategory,
} from '../lib/invoiceSheet.js';

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

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

console.log('invoice sheet');

// ---- the small helpers -------------------------------------------------

check('a column heading is found however it is written', () => {
  assert(normaliseHeader('Invoice No.') === 'invoice_no', 'Invoice No.');
  assert(normaliseHeader('  Payment Status ') === 'payment_status', 'Payment Status');
  assert(normaliseHeader('Amount (Variable Cost)') === 'amount_variable_cost', 'Amount (Variable Cost)');
  assert(normaliseHeader('Entry ID') === 'entry_id', 'Entry ID');
});

check('a date is read however it is written', () => {
  assert(normaliseDate('05/11/2026') === '2026-05-11', 'the date picker writes the month first');
  assert(normaliseDate('3/31/2026') === '2026-03-31', 'a day of 31 can only be a day');
  assert(normaliseDate('12/25/2026') === '2026-12-25', 'a day of 25 can only be a day');
  assert(normaliseDate('2026-11-05') === '2026-11-05', 'yyyy-mm-dd');
  assert(normaliseDate('2026-11-05T10:00:00Z') === '2026-11-05', 'with a time after it');
  assert(normaliseDate('April 24, 2026') === '2026-04-24', 'the month written out');
  assert(normaliseDate('May 1, 2026') === '2026-05-01', 'a one-digit day, written out');
  assert(normaliseDate('24 April 2026') === '2026-04-24', 'the day first, written out');
  assert(normaliseDate('not a date') === null, 'rubbish');
  assert(normaliseDate('') === null, 'empty');
});

check('an amount is read without the rupee sign or the separators', () => {
  assert(normaliseAmount('12,500.50') === 12500.5, 'with separators');
  assert(normaliseAmount('₹ 942.82') === 942.82, 'with the rupee sign');
  assert(normaliseAmount(12500.5) === 12500.5, 'as a number');
  assert(normaliseAmount('abc') === null, 'rubbish');
  assert(normaliseAmount('') === null, 'empty');
});

check('the payment state has two spellings', () => {
  assert(normalisePaymentStatus('Paid') === 'paid', 'Paid');
  assert(normalisePaymentStatus('Settled') === 'paid', 'Settled');
  assert(normalisePaymentStatus('Pending') === 'unpaid', 'Pending');
  assert(normalisePaymentStatus('due') === 'unpaid', 'due');
  assert(normalisePaymentStatus('') === 'unpaid', 'empty');
});

// ---- the sheet, as it really is ----------------------------------------

// The real spreadsheet: "Expense Entries (Responses)", tab "Form Responses 1".
const HEADINGS = [
  'Timestamp',
  'Email Address',
  'Type of Expense',
  'Variable Cost Type',
  'Amount (Variable Cost)',
  'Date of Invoice (Variable Cost)',
  'Invoice Attachment (if available) (Variable Cost)',
  'Invoice Paid on (ignore if not paid) (Variable Cost)',
  'Fixed Cost Type',
  'Amount (Fixed Cost)',
  'Date of Invoice (Fixed Cost)',
  'Invoice Upload (if available) (Fixed Cost)',
  'Invoice Paid on (ignore if not paid) (Fixed Cost)',
  'Petty expense or Cash top-up?',
  'Date (Petty Expense)',
  'Amount (Petty Expense)',
  'Name of Recipient (only for expense)',
  'Purpose (only for expense)',
  'Voucher upload (only for expense)',
  'Supplier',
  'Entry ID',
  'Invoice Number',
];

// The real rows, as they were on the sheet.
const sheet = [
  HEADINGS,
  ['11/18/2026 9:53:52', 'ateliernextplate@gmail.com', 'Fixed Cost', '', '', '', '', '', 'Airtel Broadband Monthly', '1060.82', 'April 24, 2026', '', 'May 1, 2026'],
  ['11/18/2026 9:55:51', 'ateliernextplate@gmail.com', 'Fixed Cost', '', '', '', '', '', 'Outlet Rent', '262663', 'May 1, 2026', 'https://drive.google.com/open?id=1cPMD4yMDu28r_CIwr4HJTYdLt-jEqyUW', 'May 18, 2026'],
  ['11/18/2026 10:23:38', 'ateliernextplate@gmail.com', 'Variable Cost', 'Outlet Electricity', '139799', '5/1/2026', 'https://drive.google.com/open?id=1I_H3eY8GBRrXG6Vrl2r9q3sheBFVBdsN', '5/21/2026'],
  ['11/18/2026 10:32:02', 'ateliernextplate@gmail.com', 'Variable Cost', 'Gas', '6400', '5/23/2026', 'https://drive.google.com/open?id=1MRIghv6yD382vdYk6owaCyMBMpJS6aEl', '5/23/2026'],
  ['11/18/2026 10:41:43', 'ateliernextplate@gmail.com', 'Fixed Cost', '', '', '', '', '', 'Pest Control', '4012', '5/31/2026', 'https://drive.google.com/open?id=18pcd4Tc8hh1YjJn95E-6DqbA3N2ry5tF', '6/25/2026'],
];

check('the sheet is read into one entry per row', () => {
  const parsed = parseInvoiceSheet(sheet);
  assert(parsed.ok, parsed.error);
  assert(parsed.entries.length === 5, `read ${parsed.entries.length} entries, expected 5`);
  assert(parsed.skipped.length === 0, `skipped ${parsed.skipped.length} rows: ${JSON.stringify(parsed.skipped)}`);
});

check('the type of expense decides which block holds the entry', () => {
  const parsed = parseInvoiceSheet(sheet);
  const byNo = Object.fromEntries(parsed.entries.map((e) => [e.costTypeName + '|' + e.amount, e]));

  assert(byNo['Airtel Broadband Monthly|1060.82'].bucket === 'fixed', 'the broadband bill is fixed');
  assert(byNo['Outlet Rent|262663'].bucket === 'fixed', 'the rent is fixed');
  assert(byNo['Outlet Electricity|139799'].bucket === 'variable', 'the electricity is variable');
  assert(byNo['Gas|6400'].bucket === 'variable', 'the gas is variable');
  assert(byNo['Pest Control|4012'].bucket === 'fixed', 'the pest control is fixed');

  // And the books group it the same way.
  assert(byNo['Outlet Rent|262663'].costType === 'fixed', 'the rent is a fixed cost in the books');
  assert(byNo['Gas|6400'].costType === 'variable', 'the gas is a variable cost in the books');
  assert(byNo['Outlet Rent|262663'].costTypeName === 'Outlet Rent', 'the rent is the outlet rent');
});

check('the amount and the date come from the right block', () => {
  const parsed = parseInvoiceSheet(sheet);
  const rent = parsed.entries.find((e) => e.costTypeName === 'Outlet Rent');

  assert(rent.amount === 262663, `the amount is ${rent.amount}`);
  assert(rent.invoiceDate === '2026-05-01', `the date is ${rent.invoiceDate}`);
  assert(String(rent.reference).includes('drive.google.com'), `the invoice link is kept: ${rent.reference}`);
});

check('a date written out is read as that date', () => {
  const parsed = parseInvoiceSheet(sheet);
  const broadband = parsed.entries.find((e) => e.costTypeName === 'Airtel Broadband Monthly');
  assert(broadband.invoiceDate === '2026-04-24', `the date is ${broadband.invoiceDate}`);
});

check('the paid-on date says the bill was paid', () => {
  const parsed = parseInvoiceSheet(sheet);
  const rent = parsed.entries.find((e) => e.costTypeName === 'Outlet Rent');
  assert(rent.paymentStatus === 'paid', `the rent is ${rent.paymentStatus}`);
  assert(rent.paymentDate === '2026-05-18', `the rent was paid on ${rent.paymentDate}`);
});

check('a bill with no paid-on date is unpaid', () => {
  const parsed = parseInvoiceSheet([
    HEADINGS,
    ['11/18/2026 10:00:00', 'a@b.com', 'Variable Cost', 'Gas', '6400', '5/23/2026', '', ''],
  ]);
  assert(parsed.entries.length === 1, `read ${parsed.entries.length}, expected 1`);
  assert(parsed.entries[0].paymentStatus === 'unpaid', `it is ${parsed.entries[0].paymentStatus}`);
  assert(parsed.entries[0].paymentDate === null, `it was paid on ${parsed.entries[0].paymentDate}`);
});

check('a row typed in the form is identified by the moment it was made', () => {
  const parsed = parseInvoiceSheet(sheet);
  const rent = parsed.entries.find((e) => e.costTypeName === 'Outlet Rent');
  assert(rent.sourceKey === 'ts:11/18/2026 9:55:51|fixed', `the key is ${rent.sourceKey}`);
});

check('the key does not change when the amount is corrected', () => {
  const before = parseInvoiceSheet(sheet).entries.find((e) => e.costTypeName === 'Gas');
  const corrected = parseInvoiceSheet([
    HEADINGS,
    ['11/18/2026 10:32:02', 'a@b.com', 'Variable Cost', 'Gas', '9999', '5/23/2026', '', ''],
  ]).entries[0];

  assert(corrected.sourceKey === before.sourceKey, 'the same row is found again');
  assert(corrected.amount === 9999, `the amount is ${corrected.amount}`);
});

check('a row this system wrote is identified by its entry id', () => {
  const parsed = parseInvoiceSheet([
    HEADINGS,
    ['11/18/2026 10:32:02', 'a@b.com', 'Variable Cost', 'Gas', '6400', '5/23/2026', '', '', '', '', '', '', '', '', '', '', '', '', '', 'Indrapastha Gas', 'AT-1732000000-ab12', 'GAS-991'],
  ]);
  const entry = parsed.entries[0];
  assert(entry.sourceKey === 'id:at-1732000000-ab12', `the key is ${entry.sourceKey}`);
  assert(entry.vendor === 'Indrapastha Gas', `the supplier is ${entry.vendor}`);
  assert(entry.invoiceNo === 'GAS-991', `the invoice number is ${entry.invoiceNo}`);
});

check('the supplier is the column the accountant fills in', () => {
  const parsed = parseInvoiceSheet([
    HEADINGS,
    ['11/18/2026 10:32:02', 'a@b.com', 'Variable Cost', 'Gas', '6400', '5/23/2026', '', '', '', '', '', '', '', '', '', '', '', '', '', 'Indrapastha Gas', '', ''],
  ]);
  assert(parsed.entries[0].vendor === 'Indrapastha Gas', `the supplier is ${parsed.entries[0].vendor}`);
});

check('without a supplier the cost type stands in, so the bill is not nameless', () => {
  const parsed = parseInvoiceSheet(sheet);
  const gas = parsed.entries.find((e) => e.costTypeName === 'Gas');
  assert(gas.vendor === 'Gas', `the supplier is ${gas.vendor}`);
});

check('a petty expense is read from the petty block', () => {
  const parsed = parseInvoiceSheet([
    HEADINGS,
    ['11/18/2026 11:10:00', 'a@b.com', 'Petty Expense', '', '', '', '', '', '', '', '', '', '', 'Expense', '11/18/2026', '350', 'Stationery', 'Cleaning materials', 'https://drive.google.com/open?id=abc'],
  ]);
  assert(parsed.ok, parsed.error);
  assert(parsed.entries.length === 1, `read ${parsed.entries.length}, expected 1`);

  const petty = parsed.entries[0];
  assert(petty.bucket === 'petty', `it is a ${petty.bucket} entry`);
  assert(petty.pettyType === 'expense', `it is a ${petty.pettyType}`);
  assert(petty.amount === 350, `the amount is ${petty.amount}`);
  assert(petty.invoiceDate === '2026-11-18', `the date is ${petty.invoiceDate}`);
  assert(petty.vendor === 'Stationery', `the recipient is ${petty.vendor}`);
  assert(petty.description === 'Cleaning materials', `the purpose is ${petty.description}`);
});

check('a cash top-up is money in, not money out', () => {
  const parsed = parseInvoiceSheet([
    HEADINGS,
    ['11/18/2026 11:15:00', 'a@b.com', 'Petty Expense', '', '', '', '', '', '', '', '', '', '', 'Cash top-up', '11/18/2026', '5000', '', '', ''],
  ]);
  assert(parsed.entries.length === 1, `read ${parsed.entries.length}, expected 1`);
  assert(parsed.entries[0].pettyType === 'deposit', `it is a ${parsed.entries[0].pettyType}`);
});

check('a row that cannot be read is skipped with the reason, not dropped', () => {
  const bad = [
    HEADINGS,
    ['11/18/2026 9:00:00', 'a@b.com', 'Variable Cost', 'Gas', 'abc', '5/1/2026', '', ''],
    ['11/18/2026 9:01:00', 'a@b.com', 'Variable Cost', 'Gas', '6400', 'not a date', '', ''],
    ['11/18/2026 9:02:00', 'a@b.com', 'Nonsense', '', '', '', '', ''],
  ];
  const parsed = parseInvoiceSheet(bad);
  assert(parsed.ok, parsed.error);
  assert(parsed.entries.length === 0, `read ${parsed.entries.length}, expected 0`);
  assert(parsed.skipped.length === 3, `skipped ${parsed.skipped.length}, expected 3`);
  for (const row of parsed.skipped) {
    assert(typeof row.reason === 'string' && row.reason.length > 0, 'a skipped row says why');
    assert(typeof row.line === 'number', 'a skipped row says which line');
  }
});

check('a sheet without the type of expense column is reported by name', () => {
  const short = [['Invoice Date', 'Vendor', 'Amount', 'Bucket'], ['17/11/2026', 'KSEB', '4250', 'Variable']];
  const parsed = parseInvoiceSheet(short);
  assert(parsed.ok === false, 'a short sheet is not ok');
  assert(/type of expense/.test(parsed.error), `the error names the missing column: ${parsed.error}`);
});

check('an empty sheet is reported, not read as nothing found', () => {
  const empty = parseInvoiceSheet([]);
  assert(empty.ok === false, 'an empty sheet is not ok');
  assert(empty.entries.length === 0, 'no entries');
});

check('the columns are found by name, so their order does not matter', () => {
  const shuffled = [
    ['Amount (Variable Cost)', 'Type of Expense', 'Date of Invoice (Variable Cost)', 'Variable Cost Type'],
    ['6400', 'Variable Cost', '5/23/2026', 'Gas'],
  ];
  const parsed = parseInvoiceSheet(shuffled);
  assert(parsed.ok, parsed.error);
  assert(parsed.entries.length === 1, `read ${parsed.entries.length}, expected 1`);
  assert(parsed.entries[0].amount === 6400, `the amount is ${parsed.entries[0].amount}`);
  assert(parsed.entries[0].costTypeName === 'Gas', `the cost type is ${parsed.entries[0].costTypeName}`);
});

// ---- the cost type and the standing cost --------------------------------

const STANDING = [
  { name: 'Airtel Broadband', category: 'Airtel Broadband' },
  { name: 'Digital Marketing Retainer', category: 'Digital Marketing Retainer' },
  { name: 'Internal Signage Rental', category: 'Internal Signage Rental' },
  { name: 'Outlet Rent', category: 'Outlet Rent' },
  { name: 'Sequire Pest Control', category: 'Sequire Pest Control' },
  { name: 'Staff Accommodation Rent', category: 'Staff Accommodation Rent' },
];

check('a cost type finds the standing cost it is the invoice for', () => {
  assert(resolveCostCategory('Airtel Broadband Monthly', STANDING) === 'Airtel Broadband', 'broadband');
  assert(resolveCostCategory('Digital Marketing Monthly', STANDING) === 'Digital Marketing Retainer', 'marketing');
  assert(resolveCostCategory('Internal Signage Rent', STANDING) === 'Internal Signage Rental', 'signage');
  assert(resolveCostCategory('Pest Control', STANDING) === 'Sequire Pest Control', 'pest control');
  assert(resolveCostCategory('Outlet Rent', STANDING) === 'Outlet Rent', 'rent');
});

check('a cost type with no standing cost keeps its own name', () => {
  assert(resolveCostCategory('Outlet Electricity', STANDING) === 'Outlet Electricity', 'electricity');
  assert(resolveCostCategory('Gas', STANDING) === 'Gas', 'gas');
  assert(resolveCostCategory('Waste Collection', STANDING) === 'Waste Collection', 'waste');
});

check('a petty purpose is filed under a known category', () => {
  assert(resolvePettyCategory('Monthly groceries') === 'Groceries', 'groceries');
  assert(resolvePettyCategory('Cleaning materials') === 'Cleaning & supplies', 'cleaning');
  assert(resolvePettyCategory('Something else entirely') === 'Other', 'anything else');
});

console.log(`\n${passed} check(s) passed`);
if (process.exitCode) console.error('\nSome checks failed.');
