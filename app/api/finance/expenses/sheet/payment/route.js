import { getSupabase } from '../../../../../../lib/supabaseServer.js';
import { fetchGoogleSheetsData, writeSheetCells } from '../../../../../../lib/googleSheetsService.js';
import {
  INVOICE_SHEET_NAME,
  INVOICE_SHEET_RANGE,
  INVOICE_SHEET_SPREADSHEET_ID,
  parseInvoiceSheet,
  paymentCellTargets,
  writeInvoiceSheet,
} from '../../../../../../lib/invoiceSheet.js';

// Marking a bill paid.
//
// **The sheet is the record, so the payment is written into the sheet** —
// the date it was paid, the form of payment and the bank's reference for it —
// and the sheet is then pulled into the books. A bill marked paid only in the
// database would be marked *unpaid* again by the next pull, because the sheet
// would still say it had not been paid.
//
// A bill that came from Petpooja is **not** marked here. Its paid state is
// Petpooja's to say, and it is read from the purchase report.
//
// One call can carry several bills, because several bills closed under one
// transfer share one date, one form of payment and one bank reference.

export async function POST(request) {
  try {
    const body = await request.json();
    const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
    const action = String(body.action || '').toLowerCase();

    if (ids.length === 0) {
      return Response.json({ success: false, error: 'Choose a bill first.' }, { status: 400 });
    }
    if (!['paid', 'unpaid'].includes(action)) {
      return Response.json({ success: false, error: 'Say whether the bill is paid.' }, { status: 400 });
    }

    const paymentDate = String(body.paymentDate || '').trim();
    const paymentMode = String(body.paymentMode || '').trim();
    const bankReference = String(body.bankReference || '').trim();

    if (action === 'paid') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
        return Response.json(
          { success: false, error: 'The date the bill was paid is needed.' },
          { status: 400 },
        );
      }
      if (!paymentMode) {
        return Response.json(
          { success: false, error: 'Say how it was paid — UPI, cash, a transfer.' },
          { status: 400 },
        );
      }
    }

    const supabase = getSupabase();

    // The bills themselves. The sheet is found from the row's own key, so the
    // key is read here rather than taken from the request.
    const { data: bills, error: billsError } = await supabase
      .from('expenses')
      .select('id, source, source_key, vendor_name, amount, invoice_number, payment_status')
      .in('id', ids);
    if (billsError) throw billsError;

    if (!bills || bills.length === 0) {
      return Response.json({ success: false, error: 'That bill is not in the books.' }, { status: 404 });
    }

    // A bill from Petpooja is marked paid in Petpooja. It has no row on the
    // sheet, so it cannot be marked here — and the books must not say
    // otherwise.
    const petpooja = bills.find((bill) => bill.source !== 'sheet');
    if (petpooja) {
      return Response.json(
        {
          success: false,
          error:
            'A bill from Petpooja is marked paid in Petpooja, not here. ' +
            'The books pick that up twice a week.',
        },
        { status: 409 },
      );
    }

    // The sheet, and the cells each bill's payment is written into.
    const rows = await fetchGoogleSheetsData({
      spreadsheetId: INVOICE_SHEET_SPREADSHEET_ID,
      sheetName: INVOICE_SHEET_NAME,
      range: INVOICE_SHEET_RANGE,
    });

    const targets = bills.map((bill) => ({
      sourceKey: bill.source_key,
      date: action === 'paid' ? paymentDate : '',
      mode: action === 'paid' ? paymentMode : '',
      reference: action === 'paid' ? bankReference : '',
    }));

    const cells = paymentCellTargets(rows, targets);
    if (!cells.ok) {
      return Response.json(
        { success: false, error: `The sheet could not be read: ${cells.error}` },
        { status: 500 },
      );
    }
    if (cells.missing.length > 0) {
      return Response.json(
        {
          success: false,
          error:
            'That bill is not on the accountant’s sheet, so the payment cannot be recorded there. ' +
            'A bill from Petpooja is marked paid in Petpooja.',
        },
        { status: 409 },
      );
    }

    // 1. The payment is written into the sheet.
    await writeSheetCells({
      spreadsheetId: INVOICE_SHEET_SPREADSHEET_ID,
      sheetName: INVOICE_SHEET_NAME,
      cells: cells.updates,
    });

    // 2. The sheet is pulled into the books — the same pull the nightly run
    //    does, so there is one way into the books.
    const after = await fetchGoogleSheetsData({
      spreadsheetId: INVOICE_SHEET_SPREADSHEET_ID,
      sheetName: INVOICE_SHEET_NAME,
      range: INVOICE_SHEET_RANGE,
    });
    const parsed = parseInvoiceSheet(after);
    if (!parsed.ok) {
      return Response.json(
        { success: false, error: `The sheet could not be read back: ${parsed.error}` },
        { status: 500 },
      );
    }
    const result = await writeInvoiceSheet(supabase, parsed.entries);

    return Response.json({
      success: true,
      data: {
        action,
        bills: cells.found,
        payment: { date: paymentDate, mode: paymentMode, reference: bankReference },
        written: result,
      },
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
