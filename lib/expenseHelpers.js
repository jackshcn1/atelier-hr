/**
 * lib/expenseHelpers.js — the one place that knows what an expense row is.
 *
 * Three things were broken before this file existed, and all three failed
 * silently at the database rather than in the browser:
 *
 *   - the manual entry form sent `vendor_id`, a column the table has never
 *     had, so every hand-written expense was rejected outright;
 *   - it never sent `cost_type`, which the table requires, so the insert
 *     failed even after the vendor was fixed;
 *   - it sent an empty string where a date belongs, and "" is not a date.
 *
 * So the writable columns are listed once, here, and every write goes
 * through `cleanExpense()`. A field that is not on the list is dropped
 * instead of breaking the insert, and the values are put into the same
 * vocabulary the Petpooja parser uses.
 */

// The columns a person is allowed to fill in. Anything else is dropped.
const WRITABLE = [
  'category',
  'cost_type',
  'entry_type',
  'status',
  'amount',
  'debit_note',
  'vendor_name',
  'invoice_number',
  'invoice_date',
  'description',
  'payment_status',
  'payment_date',
  'payment_mode',
  'bank_reference',
];

// The payment states, spelled one way everywhere.
export const PAID = 'paid';
export const UNPAID = 'unpaid';

/**
 * Put a payment state into the house vocabulary.
 *
 * Petpooja writes "Paid" and "Unpaid"; the old manual form wrote "due".
 * All three mean the same thing here.
 */
export function normalizePaymentStatus(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return UNPAID;
  if (raw === 'paid' || raw === 'settled' || raw === 'cleared') return PAID;
  return UNPAID;
}

/**
 * A date field.
 *
 * An empty string means "not filled in", not the year zero. A value that is
 * not a date at all is dropped rather than sent on to be rejected.
 */
export function cleanDate(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

/** A number, or null when the field is not a number. */
export function cleanNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** A trimmed string, or null when it is empty. */
function cleanText(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  return raw === '' ? null : raw;
}

/**
 * The supplier name, cleaned up.
 *
 * The Petpooja reports write "Ambrosia - The Classic Bakehouse [Supplier]",
 * and the same supplier turns up both with that tag and without it. The tag
 * is noise, and the two spellings are one supplier — so both are reduced to
 * the same name and counted once.
 */
export function cleanVendorName(value) {
  return String(value ?? '')
    .replace(/\s*\[Supplier\]\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Turn whatever the browser sent into a row the table will accept.
 *
 * @param {object} input the request body
 * @param {object} [defaults] values to use when the body leaves them out
 */
export function cleanExpense(input = {}, defaults = {}) {
  const body = { ...defaults, ...input };
  const row = {};

  for (const column of WRITABLE) {
    if (!(column in body)) continue;
    row[column] = body[column];
  }

  row.category = cleanText(row.category) || 'Other';
  row.description = cleanText(row.description);
  row.vendor_name = cleanText(row.vendor_name);
  row.invoice_number = cleanText(row.invoice_number);
  row.payment_mode = cleanText(row.payment_mode);
  row.bank_reference = cleanText(row.bank_reference);

  // 'variable' and 'fixed' are the two kinds of cost the P&L understands.
  const costType = String(row.cost_type ?? '').trim().toLowerCase();
  row.cost_type = costType === 'fixed' ? 'fixed' : 'variable';

  row.entry_type = String(row.entry_type ?? 'actual').trim().toLowerCase() || 'actual';
  row.status = String(row.status ?? 'pending').trim().toLowerCase() || 'pending';

  const amount = cleanNumber(row.amount);
  row.amount = amount === null ? 0 : amount;

  const debitNote = cleanNumber(row.debit_note);
  row.debit_note = debitNote === null ? 0 : debitNote;

  row.invoice_date = cleanDate(row.invoice_date);
  row.payment_date = cleanDate(row.payment_date);
  row.payment_status = normalizePaymentStatus(row.payment_status);

  // A bill marked paid but never dated has no date of its own — the payment
  // date is the date the money left.
  if (row.payment_status === PAID && !row.payment_date) {
    row.payment_date = row.invoice_date;
  }

  return row;
}

/**
 * The same cleaning, but for a partial update.
 *
 * Only the fields the request actually mentions are touched. A request that
 * says "mark this bill paid" must not quietly reset the amount, the cost
 * type or the approval status of that bill.
 *
 * @param {object} input the request body
 */
export function cleanExpensePatch(input = {}) {
  const row = {};

  for (const column of WRITABLE) {
    if (!(column in input)) continue;

    const value = input[column];

    if (column === 'invoice_date' || column === 'payment_date') {
      row[column] = cleanDate(value);
    } else if (column === 'payment_status') {
      row[column] = normalizePaymentStatus(value);
    } else if (column === 'cost_type') {
      const costType = String(value ?? '').trim().toLowerCase();
      row[column] = costType === 'fixed' ? 'fixed' : 'variable';
    } else if (column === 'amount' || column === 'debit_note') {
      const n = cleanNumber(value);
      row[column] = n === null ? 0 : n;
    } else if (column === 'category') {
      row[column] = cleanText(value) || 'Other';
    } else if (column === 'status') {
      row[column] = String(value ?? '').trim().toLowerCase() || 'pending';
    } else if (column === 'entry_type') {
      row[column] = String(value ?? '').trim().toLowerCase() || 'actual';
    } else {
      row[column] = cleanText(value);
    }
  }

  return row;
}
