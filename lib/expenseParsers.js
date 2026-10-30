export function parsePurchaseInvoices(rows, cycle) {
  if (!rows || rows.length === 0) {
    return { ok: true, invoices: [] };
  }

  try {
    // Find header row
    let headerRow = -1;
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;
      const rowStr = row.join(' ').toLowerCase();
      if (rowStr.includes('invoice') && rowStr.includes('vendor')) {
        headerRow = i;
        break;
      }
    }

    if (headerRow === -1) {
      // Try to find any row with invoice-like data
      for (let i = 0; i < Math.min(10, rows.length); i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        const rowStr = row.join(' ').toLowerCase();
        if (rowStr.includes('amount') || rowStr.includes('total')) {
          headerRow = i;
          break;
        }
      }
    }

    if (headerRow === -1) headerRow = 0;

    const headers = rows[headerRow] || [];
    const invoices = [];

    for (let i = headerRow + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      // Try to parse invoice data
      const invoice = {
        vendor_name: row[0] || '',
        invoice_number: row[1] || '',
        invoice_date: row[2] || '',
        total_amount: parseFloat(row[3]) || 0,
        description: row[4] || '',
        payment_status: row[5] || 'due',
        payment_date: row[6] || null,
        payment_mode: row[7] || null,
        bank_reference: row[8] || null
      };

      // Filter out empty rows
      if (invoice.vendor_name && invoice.total_amount > 0) {
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
    return { ok: true, returns: [] };
  }

  try {
    // Find header row
    let headerRow = -1;
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;
      const rowStr = row.join(' ').toLowerCase();
      if (rowStr.includes('return') && rowStr.includes('vendor')) {
        headerRow = i;
        break;
      }
    }

    if (headerRow === -1) {
      for (let i = 0; i < Math.min(10, rows.length); i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        const rowStr = row.join(' ').toLowerCase();
        if (rowStr.includes('debit') || rowStr.includes('credit note')) {
          headerRow = i;
          break;
        }
      }
    }

    if (headerRow === -1) headerRow = 0;

    const headers = rows[headerRow] || [];
    const returns = [];

    for (let i = headerRow + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const ret = {
        vendor_name: row[0] || '',
        return_number: row[1] || '',
        return_date: row[2] || '',
        total_amount: parseFloat(row[3]) || 0,
        description: row[4] || '',
        payment_status: 'due'
      };

      if (ret.vendor_name && ret.total_amount > 0) {
        returns.push(ret);
      }
    }

    return { ok: true, returns };
  } catch (e) {
    return { ok: false, error: e.message, returns: [] };
  }
}