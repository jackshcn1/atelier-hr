/**
 * lib/invoiceSheet.js — the accountant's invoice sheet.
 *
 * The bills that Petpooja does not know about — electricity, gas, water,
 * rent, pest control, marketing — come in through a Google Sheet. **The sheet
 * is the only place an amount is written.** A `bucket` column decides where
 * each line lands:
 *
 *   Variable  a cost of making a sale — electricity, gas, water, marketing
 *   Fixed     a standing cost — rent, pest control, the broadband
 *   Petty     spent out of the petty cash float
 *   Exclude   nowhere — a capital purchase, a loan, a duplicate
 *
 * ## The four rules that stop double counting
 *
 * 1. **A bill is identified by its invoice number.** A row the sheet wrote is
 *    updated when the sheet changes, so ticking it "Paid" reaches the books.
 *    A row anybody else wrote — the Petpooja pull, or a person on the site —
 *    is left alone, so even if the accountant types a Petpooja bill in, it is
 *    counted once — the Petpooja one. No reliance on everyone remembering not
 *    to.
 * 2. **The bucket decides where an invoice lands.** Rent is `Fixed` and
 *    electricity is `Variable`, so they cannot both end up in the same place.
 * 3. **A fixed invoice replaces the standing cost's expected amount** rather
 *    than adding to it, so the same rent is never counted twice. The
 *    matching is by `category` and happens in `lib/financeCosts.js`.
 * 4. **Salary is never typed.** It comes from HRMS, forecast then actual, so
 *    there is no "salary" bucket.
 *
 * ## The columns are found by name, not by position
 *
 * A Google Form adds its own timestamp column, and the accountant may add
 * another one. So the header row is read and each column is looked up **by
 * its name**. A column that is renamed or moved does not break the pull —
 * it has to be spelled one of the names below.
 */

/**
 * The columns of the sheet, and the names each one may be written as.
 *
 * The first name in each list is the one to use. The others are accepted so
 * a sheet that says "Supplier" or "Bill No" still works.
 */
export const SHEET_COLUMNS = {
  invoiceDate: ['invoice_date', 'invoice date', 'date'],
  vendor: ['vendor', 'supplier', 'vendor_name', 'paid_to'],
  invoiceNo: ['invoice_no', 'invoice number', 'invoice_number', 'bill_no', 'bill number'],
  description: ['description', 'details', 'notes'],
  amount: ['amount', 'total', 'value'],
  bucket: ['bucket', 'cost_type', 'cost type'],
  category: ['category'],
  paymentStatus: ['payment_status', 'payment status', 'status'],
  paymentDate: ['payment_date', 'payment date', 'paid_on'],
  paymentMethod: ['payment_method', 'payment method', 'paid_via'],
  reference: ['reference', 'utr', 'transaction_reference'],
};

// The buckets, and where each one lands.
export const BUCKETS = {
  variable: 'variable',
  fixed: 'fixed',
  petty: 'petty',
  exclude: 'exclude',
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
 * A Google Form gives a date as dd/mm/yyyy. A spreadsheet cell gives
 * something that is already a date. Both are accepted.
 */
export function normaliseDate(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  // dd/mm/yyyy — the Google Form's own format.
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    if (Number(m) < 1 || Number(m) > 12 || Number(d) < 1 || Number(d) > 31) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // yyyy-mm-dd, with or without a time after it.
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, y, m, d] = iso;
    if (Number(m) < 1 || Number(m) > 12 || Number(d) < 1 || Number(d) > 31) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  return null;
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
 * Read the sheet rows into invoice entries.
 *
 * The first row is the heading. Every other row is one invoice. A row that
 * cannot be read is skipped with the reason, never silently dropped.
 *
 * @param {string[][]} rows the sheet, as the API returns it
 * @returns {{ok: boolean, entries: object[], skipped: object[], error?: string}}
 */
export function parseInvoiceSheet(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, entries: [], skipped: [], error: 'The sheet is empty.' };
  }
  if (rows.length === 1) {
    return { ok: false, entries: [], skipped: [], error: 'The sheet has a heading but no invoices.' };
  }

  const headings = rows[0].map(normaliseHeader);

  // Where each column is. A column that is not in the sheet is simply absent.
  const indexOf = {};
  for (const [key, names] of Object.entries(SHEET_COLUMNS)) {
    for (const name of names) {
      const at = headings.indexOf(normaliseHeader(name));
      if (at !== -1) {
        indexOf[key] = at;
        break;
      }
    }
  }

  // The columns without which a row is not an invoice.
  const missing = ['invoiceDate', 'vendor', 'invoiceNo', 'amount', 'bucket'].filter((key) => indexOf[key] === undefined);
  if (missing.length > 0) {
    const names = missing.map((key) => SHEET_COLUMNS[key][0]).join(', ');
    return { ok: false, entries: [], skipped: [], error: `The sheet is missing the column(s): ${names}.` };
  }

  const cell = (row, key) => {
    const at = indexOf[key];
    return at === undefined ? '' : String(row[at] ?? '').trim();
  };

  const entries = [];
  const skipped = [];
  const seen = new Set();

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    // A Form's empty trailing row comes back as an empty array.
    if (!row || row.every((cell) => String(cell ?? '').trim() === '')) continue;

    const line = i + 1; // the number the accountant sees

    const invoiceNo = cell(row, 'invoiceNo');
    if (!invoiceNo) {
      skipped.push({ line, reason: 'No invoice number.' });
      continue;
    }

    const amount = normaliseAmount(cell(row, 'amount'));
    if (amount === null || amount <= 0) {
      skipped.push({ line, reason: `The amount ("${cell(row, 'amount')}") is not a number above zero.` });
      continue;
    }

    const invoiceDate = normaliseDate(cell(row, 'invoiceDate'));
    if (!invoiceDate) {
      skipped.push({ line, reason: `The date ("${cell(row, 'invoiceDate')}") is not a date.` });
      continue;
    }

    const bucket = cell(row, 'bucket').trim().toLowerCase();
    if (!BUCKETS[bucket]) {
      skipped.push({ line, reason: `The bucket ("${cell(row, 'bucket')}") is not one of ${Object.keys(BUCKETS).join(', ')}.` });
      continue;
    }

    const vendor = cell(row, 'vendor');
    if (!vendor) {
      skipped.push({ line, reason: 'No vendor.' });
      continue;
    }

    // The same sheet row typed twice is counted once.
    const key = invoiceNo.toLowerCase();
    if (seen.has(key)) {
      skipped.push({ line, reason: `Invoice ${invoiceNo} appears twice on the sheet.` });
      continue;
    }
    seen.add(key);

    const paymentStatus = normalisePaymentStatus(cell(row, 'paymentStatus'));
    const paymentDate = normaliseDate(cell(row, 'paymentDate'));

    entries.push({
      bucket,
      costType: BUCKETS[bucket],
      category: cell(row, 'category') || 'Other',
      vendor,
      invoiceNo,
      description: cell(row, 'description'),
      amount: Math.round(amount * 100) / 100,
      invoiceDate,
      paymentStatus,
      // A bill marked paid but never dated has no date of its own — the
      // payment date is the date the money left.
      paymentDate: paymentStatus === 'paid' ? (paymentDate || invoiceDate) : paymentDate,
      paymentMethod: cell(row, 'paymentMethod'),
      reference: cell(row, 'reference'),
    });
  }

  return { ok: true, entries, skipped };
}

/**
 * The mark on a row the sheet wrote.
 *
 * The sheet is the record for these bills, so it has to be able to tell its
 * own rows from everybody else's. `source` is that mark.
 */
export const SHEET_SOURCE = 'sheet';

// How many invoice numbers go in one query. A long list of numbers makes a
// long address, and a long address is refused by the database gateway before
// it ever reaches the table.
const BATCH = 150;

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
    invoice_number: entry.invoiceNo,
    invoice_date: entry.invoiceDate,
    description: entry.description || 'From the accountant invoice sheet',
    payment_status: entry.paymentStatus,
    payment_date: entry.paymentDate,
    payment_mode: entry.paymentMethod || null,
    bank_reference: entry.reference || null,
  };
}

/**
 * The petty cash fields the sheet owns.
 *
 * The petty ledger has no invoice-number column, so the invoice number is
 * kept in `reference` — that is what makes the entry recognisable and stops
 * it being counted twice.
 */
function pettyFields(entry) {
  return {
    amount: entry.amount,
    vendor_name: entry.vendor,
    date: entry.invoiceDate,
    description: entry.description || 'From the accountant invoice sheet',
    payment_method: entry.paymentMethod || null,
    category: entry.category,
    reference: entry.invoiceNo,
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
 * The invoice numbers to look for, in every spelling worth trying.
 *
 * The comparison itself ignores capitalisation, so the query asks for the
 * number as it is written and in lower case. Anything stranger than that is
 * a bill that was never written here.
 */
function spellings(invoiceNumbers) {
  const out = new Set();
  for (const number of invoiceNumbers) {
    out.add(number);
    out.add(number.toLowerCase());
  }
  return [...out];
}

/**
 * The bills already in the ledger under these invoice numbers.
 *
 * More than one row can carry the same invoice number — the site allows a
 * repeated vendor and invoice — so every row is kept.
 *
 * @returns {Promise<Map<string, object[]>>} the rows, keyed by the invoice
 *   number in lower case
 */
async function findExpensesByInvoice(supabase, invoiceNumbers) {
  const found = new Map();
  const wanted = spellings(invoiceNumbers);
  for (let i = 0; i < wanted.length; i += BATCH) {
    const { data, error } = await supabase
      .from('expenses')
      .select(
        'id, invoice_number, source, category, cost_type, amount, vendor_name, invoice_date, ' +
          'description, payment_status, payment_date, payment_mode, bank_reference',
      )
      .in('invoice_number', wanted.slice(i, i + BATCH));
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
 * The petty cash entries already in the ledger under these invoice numbers.
 *
 * @returns {Promise<Map<string, object[]>>} the rows, keyed by the reference in
 *   lower case
 */
async function findPettyByReference(supabase, invoiceNumbers) {
  const found = new Map();
  const wanted = spellings(invoiceNumbers);
  for (let i = 0; i < wanted.length; i += BATCH) {
    const { data, error } = await supabase
      .from('petty_cash_ledger')
      .select('id, reference, source, type, amount, vendor_name, date, description, payment_method, category')
      .in('reference', wanted.slice(i, i + BATCH));
    if (error) throw error;
    for (const row of data || []) {
      const key = String(row.reference || '').trim().toLowerCase();
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
 * Which row is whose is settled by the `source` column:
 *
 *   - a row the sheet wrote (`source = 'sheet'`) is updated;
 *   - a row anybody else wrote — the Petpooja pull, or a person on the site —
 *     is left alone, so a Petpooja bill that was also typed into the sheet is
 *     still counted once, and the Petpooja one stays the record.
 *
 * A bill is identified by its invoice number, and the number is compared
 * without regard to capitalisation.
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

  const invoiceNumbers = [...new Set(
    entries.map((entry) => String(entry.invoiceNo || '').trim()).filter(Boolean),
  )];
  if (invoiceNumbers.length === 0) return result;

  // What is already in the books under those numbers.
  const [expenseRows, pettyRows] = await Promise.all([
    findExpensesByInvoice(supabase, invoiceNumbers),
    findPettyByReference(supabase, invoiceNumbers),
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
    // An "Exclude" row — a capital purchase, a loan — goes nowhere.
    if (!isBill && !isPetty) continue;

    const key = entry.invoiceNo.trim().toLowerCase();
    const billRows = expenseRows.get(key) || [];
    const pettyRowsForKey = pettyRows.get(key) || [];

    // The rows somebody else wrote. A row the sheet wrote is updated; a row
    // anybody else wrote is never written over.
    const theirs = [...billRows, ...pettyRowsForKey].filter((row) => row.source !== SHEET_SOURCE);

    if (isBill) {
      const mineBills = billRows.filter((row) => row.source === SHEET_SOURCE);
      const minePetty = pettyRowsForKey.filter((row) => row.source === SHEET_SOURCE);

      // A bill somebody else wrote is already in the books. The sheet does not
      // write it again — the bill is counted once, and theirs is the record.
      if (mineBills.length === 0 && theirs.length > 0) {
        result.skippedExisting += 1;
        continue;
      }

      // The row is in the wrong ledger — the bucket was changed on the sheet.
      for (const row of minePetty) toDeletePetty.push(row.id);

      if (mineBills.length === 0) {
        toInsertBills.push({
          ...billFields(entry),
          entry_type: 'actual',
          status: 'approved',
          debit_note: 0,
          created_by: null,
          approved_by: null,
          source: SHEET_SOURCE,
        });
        continue;
      }

      const fields = billFields(entry);
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

      // A petty entry somebody else wrote is already in the float. The sheet
      // does not write it again.
      if (minePetty.length === 0 && theirs.length > 0) {
        result.skippedExisting += 1;
        continue;
      }

      for (const row of mineBills) toDeleteExpenses.push(row.id);

      if (minePetty.length === 0) {
        toInsertPetty.push({
          ...pettyFields(entry),
          type: 'expense',
          source: SHEET_SOURCE,
        });
        continue;
      }

      const fields = pettyFields(entry);
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
