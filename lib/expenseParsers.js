// Parsers for Petpooja's inventory exports (purchase bills and debit notes).
//
// These exports are spreadsheets whose columns are named in the header row,
// and the layout has changed over time (the purchase bill list moved from
// `purchase_invoice_list` to `purchase_list`, for one). So the columns are
// located by their header text rather than by a fixed position — a fixed
// position silently reads the wrong cells and yields nothing.

import { cleanVendorName, normalizePaymentStatus } from './expenseHelpers.js';

/**
 * Find the header row of an inventory export and map its columns.
 * Returns null when the sheet does not look like an inventory export.
 */
function readInventoryExport(rows, aliases) {
  if (!rows || rows.length === 0) return null;

  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const rowStr = (rows[i] || []).join(' ').toLowerCase();
    const hasAmount = rowStr.includes('total') || rowStr.includes('amount');
    const hasIdentity = rowStr.includes('invoice') || rowStr.includes('return') || rowStr.includes('debit note');
    if (hasAmount && hasIdentity) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return null;

  const header = (rows[headerIdx] || []).map(c => String(c || '').trim().toLowerCase());
  const columns = {};
  for (const [key, names] of Object.entries(aliases)) {
    columns[key] = header.findIndex(h => names.some(n => h.includes(n)));
  }
  if (columns.total === -1 || columns.vendor === -1) return null;

  return { headerIdx, columns };
}

/**
 * A cancelled document never happened. It is not a bill.
 *
 * Petpooja keeps cancelled documents in the Purchase List the sync reads, and
 * their payment column says "Unpaid" — because a cancelled document was never
 * paid. Petpooja's own Purchase Report leaves them out, so the two never
 * agreed: every cancelled document came into the books as money the restaurant
 * owes, for goods that were never bought.
 *
 * They are nearly always the first attempt at a bill that was entered
 * wrongly, cancelled, and entered again — the same amount, the same day, the
 * invoice number with a stray " b" on the end.
 */
function isCancelled(status) {
  return String(status ?? '').trim().toLowerCase() === 'cancelled';
}

/** Petpooja writes dates as MM/DD/YY (and sometimes YYYY-MM-DD). */
function parseExportDate(value) {
  const s = String(value ?? '').trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`;
  }

  const mdy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (mdy) {
    const year = mdy[3].length === 2 ? 2000 + Number(mdy[3]) : Number(mdy[3]);
    return `${year}-${String(mdy[1]).padStart(2, '0')}-${String(mdy[2]).padStart(2, '0')}`;
  }

  return null;
}

const INVOICE_COLUMNS = {
  vendor: ['from', 'vendor', 'supplier', 'to'],
  invoice_number: ['invoice no', 'invoice number', 'bill no', 'bill number'],
  po_reference: ['po reference', 'purchase order', 'po no'],
  total: ['total'],
  paid_amount: ['paid amount'],
  payment_status: ['payment'],
  invoice_date: ['invoice date', 'bill date'],
  status: ['status'],
  created_by: ['created by']
};

const RETURN_COLUMNS = {
  vendor: ['to', 'from', 'vendor', 'supplier'],
  return_number: ['return no', 'debit note no', 'note no', 'return number'],
  po_reference: ['po reference', 'purchase order', 'po no'],
  total: ['total'],
  paid_amount: ['paid amount'],
  payment_status: ['payment'],
  return_date: ['debit note date', 'return date', 'note date', 'invoice date'],
  status: ['status'],
  created_by: ['created by']
};

/**
 * The exports contain every bill ever, but the expenses table has no period
 * column — the finance dashboard sums the whole table as the current period's
 * variable costs. So only the bills that fall inside the active pay cycle are
 * taken, otherwise the dashboard would show the restaurant's entire history.
 */
function withinCycle(dateValue, cycle) {
  if (!cycle || !cycle.start) return true;
  if (!dateValue) return false;
  const from = cycle.start;
  const to = cycle.queryEnd && cycle.queryEnd < cycle.end ? cycle.queryEnd : cycle.end;
  return dateValue >= from && dateValue <= to;
}

export function parsePurchaseInvoices(rows, cycle) {
  if (!rows || rows.length === 0) {
    return { ok: true, invoices: [], cancelled: 0, cancelledDocs: [] };
  }

  try {
    const layout = readInventoryExport(rows, INVOICE_COLUMNS);
    if (!layout) {
      return { ok: false, error: 'Could not find the invoice header row', invoices: [], cancelled: 0, cancelledDocs: [] };
    }
    const { headerIdx, columns } = layout;
    const invoices = [];
    const cancelledDocs = [];
    const liveKeys = new Set();

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      if (!row.length) continue;

      const at = (key) => (columns[key] === -1 ? undefined : row[columns[key]]);
      const invoice = {
        vendor_name: cleanVendorName(at('vendor')),
        invoice_number: String(at('invoice_number') ?? '').trim(),
        po_reference: String(at('po_reference') ?? '').trim(),
        total_amount: parseFloat(at('total')) || 0,
        paid_amount: parseFloat(at('paid_amount')) || 0,
        payment_status: normalizePaymentStatus(at('payment_status')),
        invoice_date: parseExportDate(at('invoice_date')),
        status: String(at('status') ?? '').trim(),
        created_by: String(at('created_by') ?? '').trim(),
        description: 'Petpooja purchase bill'
      };

      // A cancelled document is not a bill.
      if (isCancelled(invoice.status)) {
        cancelledDocs.push(invoice);
        continue;
      }

      if (invoice.vendor_name && invoice.total_amount > 0) {
        liveKeys.add(`${invoice.vendor_name}|${invoice.invoice_number}|${invoice.invoice_date}`);
      }

      // A real bill has a vendor and a positive total.
      if (invoice.vendor_name && invoice.total_amount > 0 && withinCycle(invoice.invoice_date, cycle)) {
        invoices.push(invoice);
      }
    }

    // A document that was cancelled and then entered again under the same
    // number is one bill, and the live one is the bill. Only a cancelled
    // document with no live twin is a document to take out of the books.
    const onlyCancelled = cancelledDocs.filter(
      (doc) => !liveKeys.has(`${doc.vendor_name}|${doc.invoice_number}|${doc.invoice_date}`)
    );

    return { ok: true, invoices, cancelled: onlyCancelled.length, cancelledDocs: onlyCancelled };
  } catch (e) {
    return { ok: false, error: e.message, invoices: [], cancelled: 0, cancelledDocs: [] };
  }
}

export function parsePurchaseReturns(rows, cycle) {
  if (!rows || rows.length === 0) {
    return { ok: true, returns: [], total: 0, entries: 0 };
  }

  try {
    const layout = readInventoryExport(rows, RETURN_COLUMNS);
    if (!layout) {
      return { ok: false, error: 'Could not find the debit note header row', returns: [], total: 0, entries: 0 };
    }
    const { headerIdx, columns } = layout;
    const returns = [];
    const cancelledDocs = [];
    const liveKeys = new Set();

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      if (!row.length) continue;

      const at = (key) => (columns[key] === -1 ? undefined : row[columns[key]]);
      const ret = {
        vendor_name: cleanVendorName(at('vendor')),
        return_number: String(at('return_number') ?? '').trim(),
        po_reference: String(at('po_reference') ?? '').trim(),
        total_amount: parseFloat(at('total')) || 0,
        payment_status: normalizePaymentStatus(at('payment_status')),
        return_date: parseExportDate(at('return_date')),
        status: String(at('status') ?? '').trim(),
        created_by: String(at('created_by') ?? '').trim(),
        description: 'Purchase return'
      };

      // A cancelled return never happened, so it is not a credit either.
      if (isCancelled(ret.status)) {
        cancelledDocs.push(ret);
        continue;
      }

      if (ret.vendor_name && ret.total_amount > 0) {
        liveKeys.add(`${ret.vendor_name}|${ret.return_number}|${ret.return_date}`);
      }

      if (ret.vendor_name && ret.total_amount > 0 && withinCycle(ret.return_date, cycle)) {
        returns.push(ret);
      }
    }

    const onlyCancelled = cancelledDocs.filter(
      (doc) => !liveKeys.has(`${doc.vendor_name}|${doc.return_number}|${doc.return_date}`)
    );

    return {
      ok: true,
      returns,
      total: returns.reduce((s, r) => s + Number(r.total_amount || 0), 0),
      entries: returns.length,
      cancelled: onlyCancelled.length,
      cancelledDocs: onlyCancelled
    };
  } catch (e) {
    return { ok: false, error: e.message, returns: [], total: 0, entries: 0, cancelled: 0, cancelledDocs: [] };
  }
}
