/**
 * tests/invoice-sheet-verify.mjs
 *
 * Checks the accountant's invoice sheet — the parser that turns the sheet's
 * rows into invoices, and the rule that a bill is counted once.
 *
 * The parser is checked on its own here, against rows shaped like a Google
 * Form's sheet. The writing into the books is checked by
 * tests/finance-routes-verify.mjs, which works against the live database.
 *
 * Run: node tests/invoice-sheet-verify.mjs
 */

import {
  parseInvoiceSheet,
  normaliseHeader,
  normaliseDate,
  normaliseAmount,
  normalisePaymentStatus,
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
  assert(normaliseHeader('Vendor Name') === 'vendor_name', 'Vendor Name');
  assert(normaliseHeader('Amount') === 'amount', 'Amount');
});

check('a date is read whether it is dd/mm/yyyy or yyyy-mm-dd', () => {
  assert(normaliseDate('05/11/2026') === '2026-11-05', 'dd/mm/yyyy');
  assert(normaliseDate('2026-11-05') === '2026-11-05', 'yyyy-mm-dd');
  assert(normaliseDate('5/11/2026') === '2026-11-05', 'a single-digit day');
  assert(normaliseDate('2026-11-05T10:00:00Z') === '2026-11-05', 'with a time after it');
  assert(normaliseDate('not a date') === null, 'rubbish');
  assert(normaliseDate('') === null, 'empty');
  assert(normaliseDate('32/11/2026') === null, 'a day that does not exist');
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

// ---- reading the sheet -------------------------------------------------

// A sheet shaped like a Google Form's: the questions, then the answers, with
// the Form's own timestamp column at the end.
const HEADINGS = [
  'Timestamp',
  'Invoice Date',
  'Vendor',
  'Invoice No',
  'Description',
  'Amount',
  'Bucket',
  'Category',
  'Payment Status',
  'Payment Date',
  'Payment Method',
  'Reference',
];

const sheet = [
  HEADINGS,
  ['2026-11-17 09:12', '17/11/2026', 'KSEB', 'ELEC-1001', 'Electricity bill', '4,250.00', 'Variable', 'Electricity', 'Paid', '17/11/2026', 'NEFT', 'UTR123'],
  ['2026-11-17 09:20', '17/11/2026', 'Outlet Landlords', 'RENT-NOV', 'Outlet rent for November', '₹ 262663.00', 'Fixed', 'Outlet Rent', 'Pending', '', 'NEFT', ''],
  ['2026-11-17 09:31', '17/11/2026', 'Petpooja', 'PET-998', 'Software subscription', '40000', 'Fixed', 'Petpooja Annual Bill', 'Paid', '17/11/2026', 'Card', ''],
  ['2026-11-17 09:40', '17/11/2026', 'Stationery', 'PETTY-77', 'Cleaning materials', '350', 'Petty', 'Cleaning', 'Paid', '17/11/2026', 'Cash', ''],
  ['2026-11-17 09:45', '17/11/2026', 'Capital purchase', 'CAP-1', 'New freezer', '75000', 'Exclude', 'Equipment', 'Pending', '', '', ''],
];

check('the sheet is read into one invoice per row', () => {
  const parsed = parseInvoiceSheet(sheet);
  assert(parsed.ok, parsed.error);
  assert(parsed.entries.length === 5, `read ${parsed.entries.length} invoices, expected 5`);
  assert(parsed.skipped.length === 0, `skipped ${parsed.skipped.length} rows: ${JSON.stringify(parsed.skipped)}`);
});

check('the invoice is found even with the Form timestamp column in front', () => {
  const parsed = parseInvoiceSheet(sheet);
  const entry = parsed.entries[0];
  assert(entry.invoiceNo === 'ELEC-1001', `invoice number is ${entry.invoiceNo}`);
  assert(entry.vendor === 'KSEB', `vendor is ${entry.vendor}`);
  assert(entry.amount === 4250, `amount is ${entry.amount}`);
  assert(entry.invoiceDate === '2026-11-17', `date is ${entry.invoiceDate}`);
});

check('the bucket decides where the invoice lands', () => {
  const parsed = parseInvoiceSheet(sheet);
  const byNo = Object.fromEntries(parsed.entries.map((e) => [e.invoiceNo, e]));

  assert(byNo['ELEC-1001'].costType === 'variable', 'electricity is a variable cost');
  assert(byNo['RENT-NOV'].costType === 'fixed', 'rent is a fixed cost');
  assert(byNo['PET-998'].costType === 'fixed', 'the annual bill is a fixed cost');
  assert(byNo['PETTY-77'].bucket === 'petty', 'the petty entry stays petty');
  assert(byNo['CAP-1'].bucket === 'exclude', 'the capital purchase is excluded');
});

check('the category is carried over, so the invoice can match a standing cost', () => {
  const parsed = parseInvoiceSheet(sheet);
  const rent = parsed.entries.find((e) => e.invoiceNo === 'RENT-NOV');
  assert(rent.category === 'Outlet Rent', `category is ${rent.category}`);
});

check('a pending invoice has no payment date, and a paid one falls back to its own date', () => {
  const parsed = parseInvoiceSheet(sheet);
  const rent = parsed.entries.find((e) => e.invoiceNo === 'RENT-NOV');
  const electricity = parsed.entries.find((e) => e.invoiceNo === 'ELEC-1001');
  assert(rent.paymentStatus === 'unpaid', `rent is ${rent.paymentStatus}`);
  assert(rent.paymentDate === null, `rent payment date is ${rent.paymentDate}`);
  assert(electricity.paymentStatus === 'paid', `electricity is ${electricity.paymentStatus}`);
  assert(electricity.paymentDate === '2026-11-17', `electricity payment date is ${electricity.paymentDate}`);
});

check('a row that cannot be read is skipped with the reason, not dropped', () => {
  const bad = [
    HEADINGS,
    ['2026-11-17', '17/11/2026', 'KSEB', 'ELEC-1002', '', '4250', 'Variable', 'Electricity', 'Paid', '', '', ''],
    ['2026-11-17', '17/11/2026', 'KSEB', '', 'No number', '4250', 'Variable', 'Electricity', 'Paid', '', '', ''],
    ['2026-11-17', '17/11/2026', 'KSEB', 'ELEC-1003', 'Bad amount', 'abc', 'Variable', 'Electricity', 'Paid', '', '', ''],
    ['2026-11-17', 'not a date', 'KSEB', 'ELEC-1004', 'Bad date', '4250', 'Variable', 'Electricity', 'Paid', '', '', ''],
    ['2026-11-17', '17/11/2026', 'KSEB', 'ELEC-1005', 'Bad bucket', '4250', 'Nonsense', 'Electricity', 'Paid', '', '', ''],
  ];
  const parsed = parseInvoiceSheet(bad);
  assert(parsed.ok, parsed.error);
  assert(parsed.entries.length === 1, `read ${parsed.entries.length}, expected 1`);
  assert(parsed.skipped.length === 4, `skipped ${parsed.skipped.length}, expected 4`);
  for (const row of parsed.skipped) {
    assert(typeof row.reason === 'string' && row.reason.length > 0, 'a skipped row says why');
    assert(typeof row.line === 'number', 'a skipped row says which line');
  }
});

check('the same invoice typed twice on the sheet is counted once', () => {
  const twice = [
    HEADINGS,
    ['2026-11-17', '17/11/2026', 'KSEB', 'ELEC-1001', 'Electricity bill', '4250', 'Variable', 'Electricity', 'Paid', '', '', ''],
    ['2026-11-17', '17/11/2026', 'KSEB', 'ELEC-1001', 'Electricity bill', '4250', 'Variable', 'Electricity', 'Paid', '', '', ''],
  ];
  const parsed = parseInvoiceSheet(twice);
  assert(parsed.entries.length === 1, `read ${parsed.entries.length}, expected 1`);
  assert(parsed.skipped.length === 1, `skipped ${parsed.skipped.length}, expected 1`);
});

check('an empty sheet is reported, not read as nothing found', () => {
  const empty = parseInvoiceSheet([]);
  assert(empty.ok === false, 'an empty sheet is not ok');
  assert(empty.entries.length === 0, 'no entries');
});

check('a sheet missing a needed column is reported by name', () => {
  const short = [['Invoice Date', 'Vendor', 'Amount', 'Bucket'], ['17/11/2026', 'KSEB', '4250', 'Variable']];
  const parsed = parseInvoiceSheet(short);
  assert(parsed.ok === false, 'a short sheet is not ok');
  assert(/invoice_no/.test(parsed.error), `the error names the missing column: ${parsed.error}`);
});

check('the columns are found by name, so their order does not matter', () => {
  const shuffled = [
    ['Bucket', 'Amount', 'Vendor', 'Invoice No', 'Invoice Date', 'Category'],
    ['Variable', '4250', 'KSEB', 'ELEC-1001', '17/11/2026', 'Electricity'],
  ];
  const parsed = parseInvoiceSheet(shuffled);
  assert(parsed.ok, parsed.error);
  assert(parsed.entries.length === 1, `read ${parsed.entries.length}, expected 1`);
  assert(parsed.entries[0].invoiceNo === 'ELEC-1001', `invoice number is ${parsed.entries[0].invoiceNo}`);
});

console.log(`\n${passed} check(s) passed`);
if (process.exitCode) console.error('\nSome checks failed.');
