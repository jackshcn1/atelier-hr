/**
 * tests/expense-parsers-verify.mjs
 *
 * Petpooja keeps cancelled documents in the Purchase List the sync reads, and
 * their payment column says "Unpaid" — a cancelled document was never paid.
 * Petpooja's own Purchase Report leaves them out, so every cancelled
 * document came into the books as money the restaurant owes, for goods that
 * were never bought.
 *
 * These checks pin down that a cancelled document is not a bill and not a
 * credit, and that a real one still reads correctly.
 *
 * Run: npm run test:parsers
 */

import assert from 'node:assert/strict';
import { parsePurchaseInvoices, parsePurchaseReturns } from '../lib/expenseParsers.js';

let passed = 0;
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

// The shape of a real Petpooja Purchase List export.
const INVOICE_HEADER = [
  'Name:', 'Purchase', '', '', '', '', '', '', '', '',
];
const INVOICE_COLUMNS = [
  'From', 'Invoice No.', 'PO Reference No.', 'Type', 'Total (₹)',
  'Payment', 'Paid Amount (₹)', 'Invoice Date', 'Status', 'Created By',
];

const invoiceRow = (vendor, number, total, payment, paid, date, status) => [
  vendor, number, '', 'Normal', total, payment, paid, date, status, 'Nayana',
];

const MAY = { start: '2026-05-01', end: '2026-05-31' };

console.log('expense parsers');

const rows = [
  INVOICE_HEADER,
  INVOICE_COLUMNS,
  // A bill that was entered wrongly, cancelled, and entered again.
  invoiceRow('Ambrosia - The Classic Bakehouse [Supplier]', 'CBC-1042/26-27', '910', 'Paid', '910', '5/28/26', 'Saved'),
  invoiceRow('PSELVAMANI AND BROTHERS [Supplier]', 'CBC-1042/26-27', '910', 'Unpaid', '0', '5/28/26', 'Cancelled'),
  // A stock transfer that was cancelled.
  invoiceRow('Ambrosia - The Classic Bakehouse [Supplier]', 'Trf-STR/0345/26-27', '5000', 'Unpaid', '0', '5/18/26', 'Cancelled'),
  // A bill that was entered, cancelled, and entered again with the number fixed.
  invoiceRow('BSP VEGETABLES AND FRUITS [Supplier]', '48543 b', '1891', 'Unpaid', '0', '5/9/26', 'Cancelled'),
  invoiceRow('BSP VEGETABLES AND FRUITS [Supplier]', '48543', '1891', 'Paid', '1891', '5/9/26', 'Saved'),
];

const parsed = parsePurchaseInvoices(rows, MAY);

await check('a real bill is read as a bill', () => {
  if (!parsed.ok) throw new Error(parsed.error);
  const bill = parsed.invoices.find((i) => i.invoice_number === 'CBC-1042/26-27');
  if (!bill) throw new Error('the saved bill was not read');
  if (bill.vendor_name !== 'Ambrosia - The Classic Bakehouse') throw new Error(`vendor "${bill.vendor_name}"`);
  if (bill.total_amount !== 910) throw new Error(`amount ${bill.total_amount}`);
  if (bill.invoice_date !== '2026-05-28') throw new Error(`date ${bill.invoice_date}`);
  if (bill.payment_status !== 'paid') throw new Error(`payment "${bill.payment_status}"`);
});

await check('a cancelled document is not a bill', () => {
  const numbers = parsed.invoices.map((i) => i.invoice_number);
  if (numbers.includes('Trf-STR/0345/26-27')) throw new Error('the cancelled stock transfer was taken as a bill');
  if (numbers.includes('48543 b')) throw new Error('the cancelled bill was taken as a bill');
  if (numbers.length !== 2) throw new Error(`${numbers.length} bills were read: ${numbers.join(', ')}`);
});

await check('the cancelled documents are counted, not lost', () => {
  if (parsed.cancelled !== 3) throw new Error(`${parsed.cancelled} cancelled documents were counted, expected 3`);
});

await check('a cancelled document with no live twin is named, so it can be taken out', () => {
  const numbers = parsed.cancelledDocs.map((d) => d.invoice_number).sort();
  const expected = ['48543 b', 'CBC-1042/26-27', 'Trf-STR/0345/26-27'];
  if (JSON.stringify(numbers) !== JSON.stringify(expected)) {
    throw new Error(`${JSON.stringify(numbers)}, expected ${JSON.stringify(expected)}`);
  }
});

await check('a bill cancelled and entered again under the same number is left alone', () => {
  // Petpooja keeps the cancelled attempt and the live bill side by side, with
  // the same number, the same amount and the same day. The live one is the
  // bill, so the cancelled one must not be treated as a document to remove.
  const both = [
    invoiceRow('BSP VEGETABLES AND FRUITS [Supplier]', '48515', '930', 'Unpaid', '0', '3/31/26', 'Cancelled'),
    invoiceRow('BSP VEGETABLES AND FRUITS [Supplier]', '48515', '930', 'Paid', '930', '3/31/26', 'Saved'),
  ];
  const result = parsePurchaseInvoices([INVOICE_HEADER, INVOICE_COLUMNS, ...both], { start: '2026-03-01', end: '2026-03-31' });
  if (!result.ok) throw new Error(result.error);
  if (result.cancelled !== 0) throw new Error(`${result.cancelled} cancelled documents were named`);
  if (result.invoices.length !== 1) throw new Error(`${result.invoices.length} bills were read`);
  if (result.invoices[0].payment_status !== 'paid') throw new Error(`the live bill reads "${result.invoices[0].payment_status}"`);
});

await check('a bill entered again keeps both numbers apart', () => {
  const both = parsed.invoices.filter((i) => ['48543', '48543 b'].includes(i.invoice_number));
  if (both.length !== 1) throw new Error(`${both.length} of the two BSP bills were read`);
  if (both[0].invoice_number !== '48543') throw new Error(`read "${both[0].invoice_number}"`);
});

const returnRows = [
  INVOICE_HEADER,
  ['To', 'Debit Note No.', 'Purchase Invoice No.', 'Type', 'Total (₹)', 'Payment', 'Paid Amount (₹)', 'Debit Note Date', 'Status', 'Created By'],
  ['Ambrosia - The Classic Bakehouse', '242', '', 'Purchase Return', '2237', 'Unpaid', '0', '5/15/26', 'Saved', 'Nayana'],
  ['Ambrosia - The Classic Bakehouse', '241', '', 'Purchase Return', '1806', 'Unpaid', '0', '5/11/26', 'Cancelled', 'Nayana'],
];

await check('a cancelled debit note is not a credit', () => {
  const result = parsePurchaseReturns(returnRows, MAY);
  if (!result.ok) throw new Error(result.error);
  if (result.entries !== 1) throw new Error(`${result.entries} debit notes were read`);
  if (result.return_number !== undefined && result.returns[0].return_number !== '242') {
    throw new Error(`read "${result.returns[0].return_number}"`);
  }
  if (result.cancelled !== 1) throw new Error(`${result.cancelled} cancelled debit notes were counted`);
  if (result.total !== 2237) throw new Error(`credit of ${result.total}`);
});

console.log(`\n${passed} check(s) passed`);
