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
    return { ok: true, invoices: [] };
  }

  try {
    const layout = readInventoryExport(rows, INVOICE_COLUMNS);
    if (!layout) {
      return { ok: false, error: 'Could not find the invoice header row', invoices: [] };
    }
    const { headerIdx, columns } = layout;
    const invoices = [];

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

      // A real bill has a vendor and a positive total.
      if (invoice.vendor_name && invoice.total_amount > 0 && withinCycle(invoice.invoice_date, cycle)) {
        invoices.push(invoice);
      }
    }

    return { ok: true, invoices };
  } catch (e) {
    return { ok: false, error: e.message, invoices: [] };
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

      if (ret.vendor_name && ret.total_amount > 0 && withinCycle(ret.return_date, cycle)) {
        returns.push(ret);
      }
    }

    return {
      ok: true,
      returns,
      total: returns.reduce((s, r) => s + Number(r.total_amount || 0), 0),
      entries: returns.length
    };
  } catch (e) {
    return { ok: false, error: e.message, returns: [], total: 0, entries: 0 };
  }
}
