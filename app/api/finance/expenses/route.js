import { getSupabase, readAllRows } from '../../../../lib/supabaseServer.js';
import { financePeriod } from '../../../../lib/financePeriod.js';
import { cleanExpense, cleanExpensePatch, normalizePaymentStatus, PAID } from '../../../../lib/expenseHelpers.js';

// The expenses are the bills — what the restaurant has bought and what it
// still owes for it.
//
// GET answers two questions at once:
//
//   /api/finance/expenses
//       every bill, newest first
//
//   /api/finance/expenses?view=bills
//       the bills payable: what is still unpaid, grouped by vendor, with the
//       total owed to each supplier. This is the mirror image of the money
//       owed by customers (the receivables on the cashflow page).
//
//   /api/finance/expenses?month=2026-11
//       only the bills of one calendar month
//
// The write side goes through cleanExpense(), so a field the table does not
// have can never break the insert again.
export async function GET(request) {
  try {
    const supabase = getSupabase();
    const params = new URL(request.url).searchParams;
    const view = params.get('view');
    const month = params.get('month');
    const status = params.get('status');
    const paymentStatus = params.get('payment_status');
    const costType = params.get('cost_type');
    const vendor = params.get('vendor');

    let query = supabase
      .from('expenses')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });

    if (status) query = query.eq('status', status);
    if (costType) query = query.eq('cost_type', costType);
    if (vendor) query = query.ilike('vendor_name', `%${vendor}%`);

    // A month bounds the bill by its invoice date. The bills that have no
    // date at all are included too — a bill entered by hand without a date
    // still belongs in the books.
    let period = null;
    if (month) {
      period = financePeriod(month);
      query = query
        .gte('invoice_date', period.start)
        .lte('invoice_date', period.end);
    }

    // Every bill, not the first thousand. A plain read stops at a thousand
    // rows and says nothing when it does, so the page was quietly showing a
    // fraction of the bills and a fraction of what was owed.
    const rows = await readAllRows((from, to) => query.range(from, to));

    // The payment filter is applied here rather than in the query, because
    // the values in the table have not always used the same spelling.
    const filtered = rows.filter((row) => {
      if (!paymentStatus) return true;
      return normalizePaymentStatus(row.payment_status) === paymentStatus;
    });

    if (view === 'bills') {
      return Response.json({
        success: true,
        data: {
          period: period
            ? { key: period.key, label: period.label, start: period.start, end: period.end, through: period.through }
            : null,
          vendors: billsByVendor(filtered),
          totals: billTotals(filtered),
        },
      });
    }

    return Response.json({ success: true, data: filtered });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

// How much is owed to each supplier, and how long it has been owed.
function billsByVendor(rows) {
  const map = new Map();

  for (const row of rows) {
    const name = (row.vendor_name || '').trim() || 'Unknown vendor';
    const amount = Number(row.amount || 0);
    const credit = Number(row.debit_note || 0);
    const paid = normalizePaymentStatus(row.payment_status) === PAID;

    const line = map.get(name) || {
      vendor: name,
      unpaid: 0,
      paid: 0,
      credit: 0,
      billCount: 0,
      unpaidCount: 0,
      oldestDays: 0,
      oldestDate: null,
    };

    // A credit note is not a bill — it is goods sent back to the supplier.
    // It is money coming back, so it is kept apart from what is owed.
    if (credit > 0) {
      line.credit += credit;
      map.set(name, line);
      continue;
    }

    line.billCount += 1;
    if (paid) {
      line.paid += amount;
    } else {
      line.unpaid += amount;
      line.unpaidCount += 1;

      if (row.invoice_date) {
        const age = Math.floor((Date.now() - new Date(`${row.invoice_date}T00:00:00Z`)) / 86400000);
        if (age > line.oldestDays) {
          line.oldestDays = age;
          line.oldestDate = row.invoice_date;
        }
      }
    }

    map.set(name, line);
  }

  return [...map.values()]
    .map((line) => ({
      ...line,
      unpaid: Math.round(line.unpaid * 100) / 100,
      paid: Math.round(line.paid * 100) / 100,
      credit: Math.round(line.credit * 100) / 100,
    }))
    .sort((a, b) => b.unpaid - a.unpaid);
}

// The totals the bills page shows across every supplier.
function billTotals(rows) {
  let unpaid = 0;
  let paid = 0;
  let credit = 0;
  let unpaidCount = 0;
  let billCount = 0;

  for (const row of rows) {
    const note = Number(row.debit_note || 0);
    const amount = Number(row.amount || 0);

    if (note > 0) {
      credit += note;
      continue;
    }

    billCount += 1;
    if (normalizePaymentStatus(row.payment_status) === PAID) {
      paid += amount;
    } else {
      unpaid += amount;
      unpaidCount += 1;
    }
  }

  const vendors = new Set(
    rows.filter((row) => Number(row.debit_note || 0) <= 0).map((row) => (row.vendor_name || '').trim() || 'Unknown vendor')
  );

  return {
    unpaid: Math.round(unpaid * 100) / 100,
    paid: Math.round(paid * 100) / 100,
    credit: Math.round(credit * 100) / 100,
    total: Math.round((unpaid + paid) * 100) / 100,
    billCount,
    unpaidCount,
    vendorCount: vendors.size,
  };
}

export async function POST(request) {
  try {
    const supabase = getSupabase();
    const body = await request.json();
    const row = cleanExpense(body);
    // A bill typed in by a person is not the sheet's, so the sheet leaves it
    // alone — the two are counted once, and the bill in the ledger is the
    // record.
    row.source = 'manual';

    if (!row.amount) {
      return Response.json({ success: false, error: 'An amount is needed.' }, { status: 400 });
    }

    const { data, error } = await supabase.from('expenses').insert([row]).select();

    if (error) throw error;

    return Response.json({ success: true, data: data[0] });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const supabase = getSupabase();
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) throw new Error('ID is required');

    // Only the fields on the list are touched, and the ones that have a
    // house spelling are put into it. A field the request did not mention is
    // left exactly as it was.
    const row = cleanExpensePatch(updates);

    const { data, error } = await supabase
      .from('expenses')
      .update(row)
      .eq('id', id)
      .select();

    if (error) throw error;

    return Response.json({ success: true, data: data[0] });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
