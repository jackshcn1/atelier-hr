/**
 * lib/invoiceSheet.js — the accountant's invoice sheet.
 *
 * The sheet is a **Google Form's response sheet**: one row per entry, and the
 * entry's type decides which block of columns holds it.
 *
 *   A  Timestamp                          when the entry was made
 *   C  Type of Expense                    variable / fixed / petty
 *   D  Variable Cost Type           ┐
 *   E  Amount (Variable Cost)       │
 *   F  Date of Invoice              │  the variable block
 *   G  Invoice Attachment           │
 *   H  Invoice Paid on              ┘
 *   I  Fixed Cost Type              ┐
 *   J  Amount (Fixed Cost)          │
 *   K  Date of Invoice              │  the fixed block
 *   L  Invoice Upload               │
 *   M  Invoice Paid on              ┘
 *   N  Petty expense or Cash top-up?  ┐
 *   O  Date (Petty Expense)            │  the petty block
 *   P  Amount (Petty Expense)          │
 *   Q  Name of Recipient               │
 *   R  Purpose                         │
 *   S  Voucher upload                  ┘
 *   T  Supplier                         the columns this system adds
 *   U  Entry ID
 *   V  Invoice Number
 *   W  Description
 *   X  Payment Mode
 *   Y  Bank Reference
 *
 * **The sheet is the only place an amount is written.** The site writes a row
 * into it; the accountant writes a row into it with the Google Form; either
 * way the row is read back into the books.
 *
 * ## The four rules that stop double counting
 *
 * 1. **A row is identified by its own key, not by what it says.** The key is
 *    the entry id this system writes, or — for a row typed in the Google Form
 *    — the moment the entry was made. The amount and the date are *not* part
 *    of it, because the accountant is allowed to correct those, and a bill
 *    must still be found after it has been corrected.
 * 2. **The type decides where an invoice lands.** Rent is `fixed` and
 *    electricity is `variable`, so they cannot both end up in the same place.
 * 3. **A fixed invoice replaces the standing cost's expected amount** rather
 *    than adding to it, so the same rent is never counted twice. The
 *    matching is by `category` and happens in `lib/financeCosts.js`.
 * 4. **Salary is never typed.** It comes from HRMS, forecast then actual, so
 *    there is no "salary" type.
 *
 * ## The columns are found by name, not by position
 *
 * The Form may add a question, the accountant may add a column, and the
 * columns may be moved. So the heading row is read and each column is looked
 * up **by what its heading says** — "amount" inside the variable block, the
 * same word inside the fixed block. A column that is renamed or moved does
 * not break the pull.
 */

/**
 * The mark on a row the sheet wrote.
 *
 * The sheet is the record for these bills, so it has to be able to tell its
 * own rows from everybody else's. `source` is that mark.
 */
export const SHEET_SOURCE = 'sheet';

// Which spreadsheet, and which tab of it, the accountant's sheet is.
//
// The **whole tab** is read, not a slice of it. The columns are found by their
// heading, so a range that stopped one column short would lose that column
// quietly — and a column that is lost is a bill that is lost.
export const INVOICE_SHEET_SPREADSHEET_ID =
  process.env.INVOICE_SHEET_SPREADSHEET_ID || '1_25bZSbaJHkKosX7RZ4_LPgQp_NwSvpTXJUFwBLSeig';
export const INVOICE_SHEET_NAME = process.env.INVOICE_SHEET_NAME || 'Form Responses 1';
export const INVOICE_SHEET_RANGE = 'A:AZ';

// How many keys go in one query. A long list makes a long address, and a long
// address is refused by the database gateway before it ever reaches the table.
const BATCH = 150;

// The columns this system adds to the sheet, in order. They hold what the
// Form's own questions cannot: who it was paid to, the row's own identity,
// the invoice number when there is one, a line of description, how the bill
// was paid and the bank's reference for it.
export const SHEET_EXTRA_COLUMNS = [
  'Supplier',
  'Entry ID',
  'Invoice Number',
  'Description',
  'Payment Mode',
  'Bank Reference',
];

// The petty categories the site knows about. A sheet purpose that matches one
// of them is filed under it; one that matches none is filed under "Other", so
// the cost breakdown does not end up with a line for every grocery run.
const PETTY_CATEGORIES = [
  'Groceries',
  'Cleaning & supplies',
  'Petty repairs',
  'Transport / delivery',
  'Ice & gas',
  'Packaging',
  'Staff meal',
  'Other',
];

// The month names a date may be written with.
const MONTHS = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9,
  sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};

/**
 * A column heading as a key: lower case, with anything that is not a letter
 * or a digit turned into an underscore.
 *
 * "Invoice No." → "invoice_no"; "  Payment Status " → "payment_status".
 */
export function normaliseHeader(text) {
  return String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * A date as 'YYYY-MM-DD', or null when it is not a date we can read.
 *
 * The sheet holds dates written three ways, and all three have to be read:
 *
 *   "2026-05-01"        a plain date
 *   "April 24, 2026"    written out, the way a person types it
 *   "5/1/2026"          the Form's own date picker
 *
 * The picker writes the **month first** — "3/31/2026" is on the sheet, and a
 * 31 cannot be a month — so a slash date is read as month/day/year. A first
 * number above twelve can only be a day, and is read as one.
 */
export function normaliseDate(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  // yyyy-mm-dd, with or without a time after it.
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return asDate(iso[1], iso[2], iso[3]);

  // "April 24, 2026" and "24 April 2026".
  const words = raw.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length >= 3) {
    const year = words.find((word) => /^\d{4}$/.test(word));
    const month = words.find((word) => MONTHS[word.toLowerCase()]);
    const day = words.find((word) => /^\d{1,2}$/.test(word));
    if (year && month && day) return asDate(year, month, day);
  }

  // 5/1/2026 — the Form's date picker, month first.
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, first, second, year] = slash;
    if (Number(first) > 12) return asDate(year, second, first);
    return asDate(year, first, second);
  }

  return null;
}

/** A year, a month and a day as 'YYYY-MM-DD', or null when they are not one. */
function asDate(year, month, day) {
  const y = Number(year);
  // The month is a number, or the name of one — "April" and "4" are both
  // months, and only the name has to be looked up.
  const m = typeof month === 'string' && !/^\d+$/.test(month)
    ? MONTHS[month.toLowerCase()]
    : Number(month);
  const d = Number(day);
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * The amount as a number, or null when it is not a number.
 *
 * A sheet cell can hold "12,500" or "₹ 12,500.00" — the currency symbol and
 * the thousands separators are not part of the amount.
 */
export function normaliseAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value ?? '').replace(/[₹,\s]/g, '').trim();
  if (!raw) return null;
  const amount = Number(raw);
  return Number.isFinite(amount) ? amount : null;
}

/**
 * The payment state: `paid` or `unpaid`.
 *
 * "Paid", "Settled" and "Cleared" are paid. "Pending", "Unpaid", "Due" and
 * an empty cell are not.
 */
export function normalisePaymentStatus(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (['paid', 'settled', 'cleared'].includes(raw)) return 'paid';
  return 'unpaid';
}

/**
 * Where each column is.
 *
 * The Form's columns are found by what they say, not by where they are: the
 * variable block's "Amount (Variable Cost)" and the fixed block's "Amount
 * (Fixed Cost)" are different columns with the same word in them.
 */
function findColumns(headings) {
  const columns = { variable: {}, fixed: {}, petty: {} };
  const assigned = new Set();

  for (let i = 0; i < headings.length; i += 1) {
    const heading = headings[i];
    if (!heading) continue;

    if (heading === 'timestamp' || heading === 'submitted_on') {
      columns.timestamp = i;
      continue;
    }
    if (heading.includes('type_of_expense') || heading === 'expense_type') {
      columns.bucket = i;
      continue;
    }
    if (heading.includes('supplier') || heading.includes('vendor') || heading.includes('paid_to')) {
      columns.supplier = i;
      continue;
    }
    if (heading.includes('entry_id')) {
      columns.entryId = i;
      continue;
    }
    if (heading.includes('invoice_number') || heading === 'invoice_no' || heading === 'bill_no') {
      columns.invoiceNo = i;
      continue;
    }
    // A description of its own, for the row. It is not part of the petty
    // block — that block has its own purpose column — so it is found here,
    // before the blocks are looked at.
    if (heading === 'description' || heading.endsWith('_description')) {
      columns.description = i;
      continue;
    }
    // How the bill was paid, and the bank's own reference for it. Both are
    // the row's own facts, not the petty block's — a petty entry is cash out
    // of a drawer and carries no bank reference.
    if (heading === 'payment_mode' || heading === 'payment_method') {
      columns.paymentMode = i;
      continue;
    }
    if (heading === 'bank_reference' || heading === 'bank_ref' || heading === 'utr') {
      columns.bankReference = i;
      continue;
    }

    if (heading.includes('variable')) {
      assignColumn(columns.variable, heading, i);
    } else if (heading.includes('fixed')) {
      assignColumn(columns.fixed, heading, i);
    } else if (heading.includes('petty')) {
      assignColumn(columns.petty, heading, i);
    } else if (heading.includes('expense')) {
      // The Form's last three questions say "(only for expense)" rather than
      // naming the petty block, and they are the petty block's own columns.
      assignColumn(columns.petty, heading, i);
    } else {
      continue;
    }
    assigned.add(i);
  }

  return columns;
}

/** Which column inside a block a heading belongs to. */
function assignColumn(block, heading, index) {
  if (heading.endsWith('cost_type')) block.type = index;
  else if (heading.includes('amount')) block.amount = index;
  else if (heading.includes('paid_on')) block.paidOn = index;
  else if (heading.includes('date')) block.date = index;
  else if (heading.includes('attachment') || heading.includes('upload') || heading.includes('voucher')) block.file = index;
  else if (heading.includes('recipient') || heading.includes('supplier')) block.recipient = index;
  else if (heading.includes('purpose') || heading.includes('description')) block.purpose = index;
  else if (heading.includes('cash') || heading.includes('top_up')) block.kind = index;
}

/** The type of an entry: 'variable', 'fixed' or 'petty'. */
function bucketFrom(text) {
  const value = String(text ?? '').toLowerCase();
  if (value.includes('variable')) return 'variable';
  if (value.includes('fixed')) return 'fixed';
  if (value.includes('petty') || value.includes('cash') || value.includes('top')) return 'petty';
  return '';
}

/**
 * Read the sheet rows into invoice entries.
 *
 * The first row is the heading. Every other row is one entry. A row that
 * cannot be read is skipped with the reason, never silently dropped.
 *
 * @param {string[][]} rows the sheet, as the API returns it
 * @returns {{ok: boolean, entries: object[], skipped: object[], error?: string}}
 */
export function parseInvoiceSheet(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, entries: [], skipped: [], error: 'The sheet is empty.' };
  }

  const headings = rows[0].map(normaliseHeader);
  const columns = findColumns(headings);

  if (columns.bucket === undefined) {
    return {
      ok: false,
      entries: [],
      skipped: [],
      error: 'The sheet is missing the column: type of expense.',
    };
  }

  const blocks = { variable: columns.variable, fixed: columns.fixed, petty: columns.petty };
  const entries = [];
  const skipped = [];

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    // An empty trailing row comes back as an empty array.
    if (!row || row.every((cell) => String(cell ?? '').trim() === '')) continue;

    const line = i + 1; // the number the accountant sees
    const cell = (index) => (index === undefined ? '' : String(row[index] ?? '').trim());

    // ---- which type is this entry? --------------------------------------
    const bucketText = cell(columns.bucket);
    let bucket = bucketFrom(bucketText);

    if (!bucket) {
      // The type is not written, so the block that has an amount in it says
      // what the entry is.
      for (const name of ['petty', 'variable', 'fixed']) {
        if (cell(blocks[name].amount)) {
          bucket = name;
          break;
        }
      }
    }

    if (!bucket) {
      skipped.push({
        line,
        reason: `The type of expense ("${bucketText}") is not one of variable, fixed or petty.`,
      });
      continue;
    }

    const block = blocks[bucket];

    // ---- the amount and the date ----------------------------------------
    const amount = normaliseAmount(cell(block.amount));
    if (amount === null || amount <= 0) {
      skipped.push({ line, reason: `The amount ("${cell(block.amount)}") is not a number above zero.` });
      continue;
    }

    const invoiceDate = normaliseDate(cell(block.date));
    if (!invoiceDate) {
      skipped.push({ line, reason: `The date ("${cell(block.date)}") is not a date we can read.` });
      continue;
    }

    // ---- what it is ------------------------------------------------------
    const costType = bucket === 'petty' ? cell(block.purpose) : cell(block.type);
    const purpose = cell(block.purpose);

    // The description of the row. A petty entry keeps its own purpose; a bill
    // keeps the description written against the row, and falls back to the
    // block's purpose when the row has none.
    const description =
      bucket === 'petty'
        ? purpose || 'Petty cash entry'
        : cell(columns.description) || purpose || 'From the accountant invoice sheet';

    // ---- petty: an expense out of the float, or a top-up into it ----------
    let pettyType = 'expense';
    if (bucket === 'petty') {
      const kind = cell(block.kind).toLowerCase();
      if (kind.includes('top') || kind.includes('deposit') || kind.includes('cash in')) pettyType = 'deposit';
    }

    // ---- who it was paid to ------------------------------------------------
    // The Form has no supplier question for the variable and fixed blocks, so
    // the supplier is a column of its own that the accountant fills in. Until
    // they do, the cost type stands in — it says what the bill was for, which
    // is better than an empty supplier.
    const supplier =
      cell(columns.supplier) ||
      (bucket === 'petty' ? cell(block.recipient) : '') ||
      costType ||
      'Unknown';

    if (bucket === 'petty' && pettyType === 'expense' && !cell(block.recipient) && !cell(columns.supplier)) {
      skipped.push({ line, reason: 'No recipient for the petty expense.' });
      continue;
    }

    // ---- was it paid? ------------------------------------------------------
    // The "Invoice Paid on" column holds the date it was paid. Empty means it
    // has not been paid.
    const paidText = cell(block.paidOn);
    const paidDate = normaliseDate(paidText);
    const paymentStatus = paidDate || /paid|settled|cleared/i.test(paidText) ? 'paid' : 'unpaid';

    // ---- the row's own identity --------------------------------------------
    // The entry id is what this system writes. A row typed in the Google Form
    // has none, so the moment it was made stands in — that never changes, even
    // when the amount or the date is corrected.
    const entryId = cell(columns.entryId);
    const timestamp = cell(columns.timestamp);
    const sourceKey = entryId
      ? `id:${entryId.toLowerCase()}`
      : `ts:${(timestamp || `line ${line}`).toLowerCase()}|${bucket}`;

    const attachment = cell(block.file);
    const invoiceNo = cell(columns.invoiceNo);
    // How the bill was paid, and the bank's reference for it. A bill that
    // was paid before it was entered keeps both — that is what tells the
    // payment apart from the other payments of the same amount.
    const paymentMode = cell(columns.paymentMode);
    const bankReference = cell(columns.bankReference);

    entries.push({
      sourceKey,
      // Which line of the sheet this row is on. A row is found again by its
      // line when something has to be written back into it.
      line,
      bucket,
      // The link to the invoice itself, if the row has one.
      attachment: attachment.startsWith('https://') ? attachment : '',
      pettyType,
      // What the books group by.
      costType: bucket === 'variable' ? 'variable' : bucket === 'fixed' ? 'fixed' : 'petty',
      // What the bill is for — "Outlet Rent", "Gas". The standing cost it
      // belongs to is worked out when the row is written.
      costTypeName: costType || 'Other',
      category: costType || 'Other',
      vendor: supplier,
      invoiceNo,
      description,
      amount: Math.round(amount * 100) / 100,
      invoiceDate,
      paymentStatus,
      // A bill marked paid but never dated has no date of its own — the
      // payment date is the date the money left.
      paymentDate: paymentStatus === 'paid' ? (paidDate || invoiceDate) : null,
      paymentMethod: paymentMode,
      bankReference,
      reference: invoiceNo || attachment || null,
    });
  }

  return { ok: true, entries, skipped };
}

/**
 * The cells to write when a bill is marked paid.
 *
 * A bill that was paid before it was entered needs three facts: the **date**
 * it was paid, the **form of payment**, and the **bank's reference** for it.
 * They are written into the bill's own row on the sheet, so the sheet stays
 * the record — and the pull brings them into the books.
 *
 * A bill marked unpaid again has those three cells cleared, so no trace of a
 * payment is left on a bill that is not paid.
 *
 * The cells are found by their heading, like every other column: the block's
 * own "Invoice Paid on" column, and the two columns this system adds.
 *
 * @param {string[][]} rows the sheet, as the API returns it
 * @param {{sourceKey: string, date?: string, mode?: string, reference?: string}[]} targets
 * @returns {{ok: boolean, error?: string, updates: object[], found: object[], missing: string[]}}
 */
export function paymentCellTargets(rows, targets) {
  const parsed = parseInvoiceSheet(rows);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, updates: [], found: [], missing: [] };
  }

  const headings = rows[0].map(normaliseHeader);
  const columns = findColumns(headings);

  const updates = [];
  const found = [];
  const missing = [];

  for (const target of targets || []) {
    const key = String(target?.sourceKey || '').trim().toLowerCase();
    const entry = parsed.entries.find((item) => item.sourceKey === key);
    const block = entry ? columns[entry.bucket] : null;

    // A bill that is not on the sheet cannot be marked paid on the sheet. A
    // bill from Petpooja is not on it at all — it is marked paid in Petpooja.
    if (!entry || !block || block.paidOn === undefined) {
      missing.push(key);
      continue;
    }

    // The cells are named the way the sheet names them: the row the
    // accountant sees, and the column counting from A.
    const column = (index) => index + 1;

    updates.push({ line: entry.line, column: column(block.paidOn), value: String(target.date || '') });
    if (columns.paymentMode !== undefined) {
      updates.push({
        line: entry.line,
        column: column(columns.paymentMode),
        value: String(target.mode || ''),
      });
    }
    if (columns.bankReference !== undefined) {
      updates.push({
        line: entry.line,
        column: column(columns.bankReference),
        value: String(target.reference || ''),
      });
    }

    found.push({
      sourceKey: key,
      line: entry.line,
      vendor: entry.vendor,
      amount: entry.amount,
      bucket: entry.bucket,
    });
  }

  return { ok: true, updates, found, missing };
}

/**
 * The bill fields the sheet owns.
 *
 * These are the fields that come off the sheet. The approval state, the entry
 * type and who created the row are not among them — an update must not
 * quietly reset them.
 */
function billFields(entry) {
  return {
    category: entry.category,
    cost_type: entry.costType,
    amount: entry.amount,
    vendor_name: entry.vendor,
    invoice_number: entry.invoiceNo || null,
    invoice_date: entry.invoiceDate,
    description: entry.description || 'From the accountant invoice sheet',
    payment_status: entry.paymentStatus,
    payment_date: entry.paymentDate,
    payment_mode: entry.paymentMethod || null,
    // The bank's reference for the payment — the UTR. When there is none, the
    // invoice number stands in, so the column is never empty and the two are
    // never mixed up.
    bank_reference: entry.bankReference || entry.invoiceNo || null,
    // The invoice the row points at — the link the accountant put in the
    // sheet's attachment column. This is what "See the invoice" follows.
    invoice_attachment: entry.attachment || null,
    source_key: entry.sourceKey,
  };
}

/**
 * The petty cash fields the sheet owns.
 *
 * The petty ledger has no invoice-number column, so the invoice number — or
 * the voucher link — is kept in `reference`.
 */
function pettyFields(entry) {
  return {
    amount: entry.amount,
    vendor_name: entry.vendor,
    date: entry.invoiceDate,
    description: entry.description || 'From the accountant invoice sheet',
    payment_method: entry.paymentMethod || null,
    category: entry.category,
    reference: entry.reference || null,
    source_key: entry.sourceKey,
  };
}

/** Two values, the same. An empty cell and a null are the same. */
function sameValue(a, b) {
  const empty = (v) => v === null || v === undefined || v === '';
  if (empty(a) || empty(b)) return empty(a) && empty(b);
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
  return String(a) === String(b);
}

/** Has any of the fields the sheet owns actually changed? */
function billChanged(row, fields) {
  return Object.entries(fields).some(([key, value]) => !sameValue(row[key], value));
}

/** Has any of the petty fields the sheet owns actually changed? */
function pettyChanged(row, fields) {
  return Object.entries(fields).some(([key, value]) => !sameValue(row[key], value));
}

/**
 * The rows in the ledger under these sheet keys.
 *
 * More than one row can carry the same key — the site allows a repeated
 * vendor and invoice — so every row is kept.
 *
 * @returns {Promise<Map<string, object[]>>} the rows, keyed by the sheet key
 */
async function findByKey(supabase, table, columns, keys) {
  const found = new Map();
  if (!keys.length) return found;
  for (let i = 0; i < keys.length; i += BATCH) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .in('source_key', keys.slice(i, i + BATCH));
    if (error) throw error;
    for (const row of data || []) {
      const key = String(row.source_key || '').trim().toLowerCase();
      if (!key) continue;
      if (!found.has(key)) found.set(key, []);
      found.get(key).push(row);
    }
  }
  return found;
}

/**
 * The bills already in the ledger under these invoice numbers.
 *
 * This is the rule that stops the same bill being counted twice: if a bill
 * with this number is already on record and it is not the sheet's own row,
 * the sheet does not write it again.
 */
async function findExpensesByInvoice(supabase, invoiceNumbers) {
  const found = new Map();
  if (!invoiceNumbers.length) return found;
  for (let i = 0; i < invoiceNumbers.length; i += BATCH) {
    const { data, error } = await supabase
      .from('expenses')
      .select('id, invoice_number, source')
      .in('invoice_number', invoiceNumbers.slice(i, i + BATCH));
    if (error) throw error;
    for (const row of data || []) {
      const key = String(row.invoice_number || '').trim().toLowerCase();
      if (!key) continue;
      if (!found.has(key)) found.set(key, []);
      found.get(key).push(row);
    }
  }
  return found;
}

/**
 * Write the sheet's invoices into the books.
 *
 * The sheet is the record for these bills, so a row it wrote has to be found
 * again and **updated** when the sheet changes — otherwise ticking a bill
 * "Paid" in the sheet would never reach the books, and the sheet could only
 * ever add, never correct.
 *
 * Which row is whose is settled by two things:
 *
 *   - the `source_key`, the row's own identity in the sheet, which finds the
 *     sheet's own row again after a correction;
 *   - the `source` column, which says who wrote a row. A row somebody else
 *     wrote — the Petpooja pull, or a person on the site — is left alone, so
 *     a Petpooja bill that was also typed into the sheet is counted once, and
 *     the Petpooja one stays the record.
 *
 * @param {object} supabase a Supabase service-role client
 * @param {object[]} entries the rows from `parseInvoiceSheet`
 */
export async function writeInvoiceSheet(supabase, entries) {
  const result = {
    expensesWritten: 0,
    expensesUpdated: 0,
    pettyWritten: 0,
    pettyUpdated: 0,
    skippedExisting: 0,
    unchanged: 0,
    skipped: [],
  };
  if (!entries || entries.length === 0) return result;

  const keys = [...new Set(entries.map((entry) => entry.sourceKey).filter(Boolean))];
  const invoiceNumbers = [...new Set(entries.map((entry) => entry.invoiceNo).filter(Boolean))];

  // The standing costs, so a cost type can be filed under the standing cost
  // it is the invoice for. "Airtel Broadband Monthly" is the invoice for
  // "Airtel Broadband", and the checklist matches on the category.
  const { data: standingRows, error: standingError } = await supabase
    .from('fixed_costs')
    .select('name, category');
  if (standingError) throw standingError;
  const standingCosts = standingRows || [];

  /** The category this entry is filed under. */
  const categoryOf = (entry) =>
    entry.bucket === 'petty'
      ? resolvePettyCategory(entry.description)
      : resolveCostCategory(entry.costTypeName || entry.costType, standingCosts);

  // What is already in the books: the sheet's own rows, by key, and every
  // bill under an invoice number, for the rule that stops double counting.
  const [expenseRows, pettyRows, byInvoice] = await Promise.all([
    findByKey(
      supabase,
      'expenses',
      'id, source_key, source, category, cost_type, amount, vendor_name, invoice_number, invoice_date, ' +
        'description, payment_status, payment_date, payment_mode, bank_reference, invoice_attachment',
      keys,
    ),
    findByKey(
      supabase,
      'petty_cash_ledger',
      'id, source_key, source, type, amount, vendor_name, date, description, payment_method, category, reference',
      keys,
    ),
    findExpensesByInvoice(supabase, invoiceNumbers),
  ]);

  const toInsertBills = [];
  const toUpdateBills = [];
  const toInsertPetty = [];
  const toUpdatePetty = [];
  const toDeleteExpenses = [];
  const toDeletePetty = [];

  for (const entry of entries) {
    const isBill = entry.bucket === 'variable' || entry.bucket === 'fixed';
    const isPetty = entry.bucket === 'petty';
    if (!isBill && !isPetty) continue;

    const key = String(entry.sourceKey || '').trim().toLowerCase();
    const billRows = expenseRows.get(key) || [];
    const pettyRowsForKey = pettyRows.get(key) || [];

    // The sheet's own rows, and everybody else's.
    const mine = [...billRows, ...pettyRowsForKey].filter((row) => row.source === SHEET_SOURCE);

    // A bill with this invoice number is already on record and it is not the
    // sheet's. The sheet does not write it again — the bill is counted once,
    // and theirs is the record.
    const claimed = (byInvoice.get(String(entry.invoiceNo || '').trim().toLowerCase()) || [])
      .filter((row) => row.source !== SHEET_SOURCE);
    if (claimed.length > 0 && mine.length === 0) {
      result.skippedExisting += 1;
      continue;
    }

    if (isBill) {
      const mineBills = billRows.filter((row) => row.source === SHEET_SOURCE);
      const minePetty = pettyRowsForKey.filter((row) => row.source === SHEET_SOURCE);

      // The row is in the wrong ledger — the type was changed on the sheet.
      for (const row of minePetty) toDeletePetty.push(row.id);

      const billFieldsForEntry = { ...entry, category: categoryOf(entry) };

      if (mineBills.length === 0) {
        toInsertBills.push({
          ...billFields(billFieldsForEntry),
          entry_type: 'actual',
          status: 'approved',
          debit_note: 0,
          created_by: null,
          approved_by: null,
          source: SHEET_SOURCE,
        });
        continue;
      }

      const fields = billFields(billFieldsForEntry);
      for (const row of mineBills) {
        if (!billChanged(row, fields)) {
          result.unchanged += 1;
        } else {
          toUpdateBills.push({ id: row.id, row: fields });
        }
      }
    } else {
      const minePetty = pettyRowsForKey.filter((row) => row.source === SHEET_SOURCE);
      const mineBills = billRows.filter((row) => row.source === SHEET_SOURCE);

      for (const row of mineBills) toDeleteExpenses.push(row.id);

      const pettyFieldsForEntry = { ...entry, category: categoryOf(entry) };

      if (minePetty.length === 0) {
        toInsertPetty.push({
          ...pettyFields(pettyFieldsForEntry),
          type: entry.pettyType === 'deposit' ? 'deposit' : 'expense',
          source: SHEET_SOURCE,
        });
        continue;
      }

      const fields = pettyFields(pettyFieldsForEntry);
      for (const row of minePetty) {
        if (!pettyChanged(row, fields)) {
          result.unchanged += 1;
        } else {
          toUpdatePetty.push({ id: row.id, row: fields });
        }
      }
    }
  }

  if (toInsertBills.length > 0) {
    const { error } = await supabase.from('expenses').insert(toInsertBills);
    if (error) throw error;
    result.expensesWritten = toInsertBills.length;
  }

  if (toUpdateBills.length > 0) {
    for (const { id, row } of toUpdateBills) {
      const { error } = await supabase.from('expenses').update(row).eq('id', id);
      if (error) throw error;
    }
    result.expensesUpdated = toUpdateBills.length;
  }

  if (toInsertPetty.length > 0) {
    const { error } = await supabase.from('petty_cash_ledger').insert(toInsertPetty);
    if (error) throw error;
    result.pettyWritten = toInsertPetty.length;
  }

  if (toUpdatePetty.length > 0) {
    for (const { id, row } of toUpdatePetty) {
      const { error } = await supabase.from('petty_cash_ledger').update(row).eq('id', id);
      if (error) throw error;
    }
    result.pettyUpdated = toUpdatePetty.length;
  }

  // A row that moved from one ledger to the other is removed from the old one
  // only after the new one is in, so a failure never leaves the books empty.
  if (toDeleteExpenses.length > 0) {
    const { error } = await supabase.from('expenses').delete().in('id', toDeleteExpenses);
    if (error) throw error;
  }
  if (toDeletePetty.length > 0) {
    const { error } = await supabase.from('petty_cash_ledger').delete().in('id', toDeletePetty);
    if (error) throw error;
  }

  return result;
}

/**
 * The category a cost type belongs to.
 *
 * The sheet's cost types are named for the cost — "Airtel Broadband Monthly",
 * "Pest Control", "Outlet Rent" — and the standing costs are named for the
 * thing they are. The two are matched by name, with the noise words left out
 * ("monthly", "annual") and "rental" folded into "rent", so:
 *
 *   Airtel Broadband Monthly  →  Airtel Broadband
 *   Pest Control              →  Sequire Pest Control
 *   Internal Signage Rent     →  Internal Signage Rental
 *   Outlet Electricity        →  Outlet Electricity   (no standing cost)
 *
 * The standing cost's own category is what comes back, because that is what
 * the standing-cost checklist matches on.
 *
 * @param {string} costType the sheet's cost type
 * @param {object[]} standingCosts the standing costs, from `fixedCosts()`
 */
export function resolveCostCategory(costType, standingCosts) {
  const wanted = normaliseName(costType);
  if (!wanted) return costType || 'Other';

  const candidates = (standingCosts || [])
    .map((row) => ({ category: row.category || row.name, name: normaliseName(row.category || row.name) }))
    .filter((row) => row.name);

  // An exact name first.
  for (const row of candidates) {
    if (row.name === wanted) return row.category;
  }
  // Then the standing cost's name carrying the cost type inside it. Only one
  // way round — "Outlet Electricity" is not the standing cost "Outlet Rent".
  for (const row of candidates) {
    if (row.name.includes(wanted)) return row.category;
  }

  return costType || 'Other';
}

/** A name with the noise words left out, for matching one to another. */
function normaliseName(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/\brental\b/g, 'rent')
    .replace(/\b(monthly|annual)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The petty category a purpose belongs to.
 *
 * A purpose that names one of the known categories is filed under it; one
 * that names none is filed under "Other", so the cost breakdown does not end
 * up with a line for every grocery run.
 */
export function resolvePettyCategory(purpose) {
  const text = String(purpose ?? '').toLowerCase();
  if (!text) return 'Other';
  for (const category of PETTY_CATEGORIES) {
    if (category === 'Other') continue;
    const words = category.toLowerCase().split(/[^a-z]+/).filter(Boolean);
    if (words.some((word) => word.length > 2 && text.includes(word))) return category;
  }
  return 'Other';
}
