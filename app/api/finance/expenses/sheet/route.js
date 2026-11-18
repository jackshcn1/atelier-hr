import { getSupabase } from '../../../../../lib/supabaseServer.js';
import {
  appendGoogleSheetRowByHeading,
  fetchGoogleSheetsData,
  googleSheetsConfigured,
} from '../../../../../lib/googleSheetsService.js';
import { parseInvoiceSheet, writeInvoiceSheet } from '../../../../../lib/invoiceSheet.js';

// The site's own expense form.
//
// The sheet is the record, so this route **writes a row into the sheet** and
// then pulls it into the books — the same pull the nightly run does. One way
// into the books, and the entry is there the moment the form is submitted
// rather than the next morning.
//
// GET answers with the cost types the sheet already uses, so the form offers
// what is already in use instead of a list that has to be kept up by hand.

const SPREADSHEET_ID =
  process.env.INVOICE_SHEET_SPREADSHEET_ID || '1_25bZSbaJHkKosX7RZ4_LPgQp_NwSvpTXJUFwBLSeig';
const SHEET_NAME = process.env.INVOICE_SHEET_NAME || 'Form Responses 1';
const RANGE = process.env.INVOICE_SHEET_RANGE || 'A:V';

// The stamp the sheet's own rows carry, in the shape the Form writes it.
function sheetTimestamp() {
  const now = new Date();
  const hours = now.getHours() % 12 || 12;
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()} ${hours}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

/**
 * A short id of its own, so the row can be found again after a correction.
 *
 * In lower case, because that is how the key is written in the books.
 */
function entryId() {
  const stamp = Date.now().toString(36);
  const tail = Math.random().toString(36).slice(2, 6);
  return `at-${stamp}-${tail}`;
}

/**
 * The row to write, for the type of entry.
 *
 * Each type has its own block of columns on the sheet, and the cell values
 * are placed by the heading they belong to — so a question added to the Form
 * cannot shift them into the wrong column.
 */
function sheetFields(body) {
  const type = body.type;
  const common = {
    Timestamp: sheetTimestamp(),
    Supplier: body.vendor,
    'Entry ID': body.entryId,
    'Invoice Number': body.invoiceNo || '',
  };

  if (type === 'variable' || type === 'fixed') {
    const label = type === 'variable' ? 'Variable' : 'Fixed';
    return {
      ...common,
      'Type of Expense': `${label} Cost`,
      [`${label} Cost Type`]: body.costType,
      [`Amount (${label} Cost)`]: body.amount,
      [`Date of Invoice (${label} Cost)`]: body.invoiceDate,
      [`Invoice Paid on (ignore if not paid) (${label} Cost)`]: body.paidOn || '',
    };
  }

  return {
    ...common,
    'Type of Expense': 'Petty Expense',
    'Petty expense or Cash top-up?': body.pettyKind === 'deposit' ? 'Cash top-up' : 'Expense',
    'Date (Petty Expense)': body.invoiceDate,
    'Amount (Petty Expense)': body.amount,
    'Name of Recipient (only for expense)': body.vendor,
    'Purpose (only for expense)': body.description || '',
  };
}

export async function GET() {
  if (!googleSheetsConfigured()) {
    return Response.json({ success: true, data: { costTypes: { variable: [], fixed: [] }, configured: false } });
  }

  try {
    const rows = await fetchGoogleSheetsData({ spreadsheetId: SPREADSHEET_ID, sheetName: SHEET_NAME, range: RANGE });
    const parsed = parseInvoiceSheet(rows);

    // The cost types the sheet already uses, and the petty categories.
    const variable = new Set();
    const fixed = new Set();
    for (const entry of parsed.entries) {
      if (!entry.costTypeName) continue;
      if (entry.bucket === 'variable') variable.add(entry.costTypeName);
      else if (entry.bucket === 'fixed') fixed.add(entry.costTypeName);
    }

    return Response.json({
      success: true,
      data: {
        configured: true,
        costTypes: { variable: [...variable].sort(), fixed: [...fixed].sort() },
      },
    });
  } catch (error) {
    // The form still works without this — the cost type can be typed.
    return Response.json({ success: true, data: { configured: false, costTypes: { variable: [], fixed: [] }, error: error.message } });
  }
}

export async function POST(request) {
  try {
    if (!googleSheetsConfigured()) {
      return Response.json(
        { success: false, error: 'The invoice sheet is not set up on the server yet.' },
        { status: 503 },
      );
    }

    const body = await request.json();
    const type = String(body.type || '').toLowerCase();
    if (!['variable', 'fixed', 'petty'].includes(type)) {
      return Response.json({ success: false, error: 'Say what kind of cost this is.' }, { status: 400 });
    }

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return Response.json({ success: false, error: 'An amount above zero is needed.' }, { status: 400 });
    }

    const invoiceDate = String(body.invoiceDate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) {
      return Response.json({ success: false, error: 'A date is needed — the date of the invoice.' }, { status: 400 });
    }

    const vendor = String(body.vendor || '').trim();
    if (!vendor) {
      return Response.json({ success: false, error: 'Say who it was paid to.' }, { status: 400 });
    }

    const costType = String(body.costType || '').trim();
    if (type !== 'petty' && !costType) {
      return Response.json({ success: false, error: 'Say what the cost was for.' }, { status: 400 });
    }

    const paidOn = String(body.paidOn || '').trim();
    if (paidOn && !/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) {
      return Response.json({ success: false, error: 'The paid-on date is not a date.' }, { status: 400 });
    }

    const row = {
      type,
      costType,
      vendor,
      amount,
      invoiceDate,
      paidOn,
      invoiceNo: String(body.invoiceNo || '').trim(),
      description: String(body.description || '').trim(),
      pettyKind: body.pettyKind === 'deposit' ? 'deposit' : 'expense',
      entryId: entryId(),
    };

    // 1. The row goes into the sheet. The sheet is the record.
    const written = await appendGoogleSheetRowByHeading({
      spreadsheetId: SPREADSHEET_ID,
      sheetName: SHEET_NAME,
      fields: sheetFields(row),
      required: ['Type of Expense', 'Timestamp', 'Supplier', 'Entry ID'],
    });

    // 2. The sheet is pulled into the books — the same pull the nightly run
    //    does, so there is one way into the books and not two.
    const supabase = getSupabase();
    const rows = await fetchGoogleSheetsData({ spreadsheetId: SPREADSHEET_ID, sheetName: SHEET_NAME, range: RANGE });
    const parsed = parseInvoiceSheet(rows);
    if (!parsed.ok) {
      return Response.json(
        { success: false, error: `The sheet could not be read back: ${parsed.error}` },
        { status: 500 },
      );
    }
    const result = await writeInvoiceSheet(supabase, parsed.entries);

    // 3. The bill that was written, so the page can show it.
    const { data: bill } = await supabase
      .from('expenses')
      .select('id, vendor_name, category, amount, invoice_date, payment_status, cost_type')
      .eq('source_key', `id:${row.entryId.toLowerCase()}`)
      .maybeSingle();

    return Response.json({
      success: true,
      data: {
        bill: bill || null,
        petty: type === 'petty',
        entryId: row.entryId,
        sheetRange: written.updatedRange,
        unmatched: written.unmatched,
        written: result,
      },
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
