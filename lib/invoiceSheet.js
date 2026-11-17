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
 * 1. **A bill is identified by its invoice number.** If the number is already
 *    in the ledger, the sheet row is skipped. So even if the accountant types
 *    a Petpooja bill in, it is counted once — the Petpooja one.
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
 * Write the sheet's invoices into the books.
 *
 * A bill is identified by its invoice number, so a row whose number is
 * already in the ledger is left alone. That is what stops a Petpooja bill
 * that was also typed into the sheet from being counted twice.
 *
 * @param {object} supabase a Supabase service-role client
 * @param {object[]} entries the rows from `parseInvoiceSheet`
 */
export async function writeInvoiceSheet(supabase, entries) {
  const result = {
    expensesWritten: 0,
    pettyWritten: 0,
    skippedExisting: 0,
    skipped: [],
  };
  if (!entries || entries.length === 0) return result;

  const bills = entries.filter((entry) => entry.bucket === 'variable' || entry.bucket === 'fixed');
  const petty = entries.filter((entry) => entry.bucket === 'petty');

  // ---- the bills -------------------------------------------------------
  if (bills.length > 0) {
    const invoiceNumbers = [...new Set(bills.map((entry) => entry.invoiceNo))];
    const existing = new Set();
    const batchSize = 150;
    for (let i = 0; i < invoiceNumbers.length; i += batchSize) {
      const { data, error } = await supabase
        .from('expenses')
        .select('invoice_number')
        .in('invoice_number', invoiceNumbers.slice(i, i + batchSize));
      if (error) throw error;
      for (const row of data || []) {
        existing.add(String(row.invoice_number || '').trim().toLowerCase());
      }
    }

    const toInsert = [];
    for (const entry of bills) {
      if (existing.has(entry.invoiceNo.trim().toLowerCase())) {
        result.skippedExisting += 1;
        continue;
      }
      toInsert.push({
        category: entry.category,
        cost_type: entry.costType,
        entry_type: 'actual',
        status: 'approved',
        amount: entry.amount,
        debit_note: 0,
        vendor_name: entry.vendor,
        invoice_number: entry.invoiceNo,
        invoice_date: entry.invoiceDate,
        description: entry.description || 'From the accountant invoice sheet',
        payment_status: entry.paymentStatus,
        payment_date: entry.paymentDate,
        payment_mode: entry.paymentMethod || null,
        bank_reference: entry.reference || null,
        created_by: null,
        approved_by: null,
      });
    }

    if (toInsert.length > 0) {
      const { error } = await supabase.from('expenses').insert(toInsert);
      if (error) throw error;
      result.expensesWritten = toInsert.length;
    }
  }

  // ---- the petty cash --------------------------------------------------
  //
  // The petty ledger has no invoice-number column, so the invoice number is
  // kept in `reference` — that is what makes the entry recognisable and stops
  // it being counted twice.
  if (petty.length > 0) {
    const references = [...new Set(petty.map((entry) => entry.invoiceNo))];
    const existing = new Set();
    const batchSize = 150;
    for (let i = 0; i < references.length; i += batchSize) {
      const { data, error } = await supabase
        .from('petty_cash_ledger')
        .select('reference')
        .in('reference', references.slice(i, i + batchSize));
      if (error) throw error;
      for (const row of data || []) {
        existing.add(String(row.reference || '').trim().toLowerCase());
      }
    }

    const toInsert = [];
    for (const entry of petty) {
      if (existing.has(entry.invoiceNo.trim().toLowerCase())) {
        result.skippedExisting += 1;
        continue;
      }
      toInsert.push({
        type: 'expense',
        amount: entry.amount,
        vendor_name: entry.vendor,
        date: entry.invoiceDate,
        description: entry.description || 'From the accountant invoice sheet',
        payment_method: entry.paymentMethod || null,
        category: entry.category,
        reference: entry.invoiceNo,
      });
    }

    if (toInsert.length > 0) {
      const { error } = await supabase.from('petty_cash_ledger').insert(toInsert);
      if (error) throw error;
      result.pettyWritten = toInsert.length;
    }
  }

  return result;
}
