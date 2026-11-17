import { getSupabase } from '../../../../lib/supabaseServer.js';

// The petty cash ledger — the cash float.
//
// Two kinds of entry:
//   deposit  money loaded into the float — it goes up
//   expense  money spent out of the float — it comes down
//
// The balance is the running difference between the two: the money actually
// in the drawer.

// The columns a person is allowed to fill in. Anything else is dropped, so
// a field the table does not have can never break the insert.
const WRITABLE = [
  'type',
  'amount',
  'vendor_name',
  'date',
  'description',
  'payment_method',
  'category',
  'reference',
  'receipt_url',
  'chellan_url',
];

export async function GET() {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('petty_cash_ledger')
      .select('*')
      .order('date', { ascending: false });
    if (error) throw error;

    const rows = data || [];
    const balance = rows.reduce(
      (sum, row) => (row.type === 'deposit' ? sum + Number(row.amount || 0) : sum - Number(row.amount || 0)),
      0
    );

    return Response.json({ success: true, data: rows, balance });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = getSupabase();
    const body = await request.json();

    const row = {};
    for (const column of WRITABLE) {
      if (column in body) row[column] = body[column];
    }

    // A cash entry is money in; everything else is money out.
    row.type = row.type === 'deposit' ? 'deposit' : 'expense';

    const amount = Number(row.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return Response.json({ success: false, error: 'An amount above zero is needed.' }, { status: 400 });
    }
    row.amount = amount;

    if (!row.date) row.date = new Date().toISOString().slice(0, 10);

    // An expense must say who it was paid to — that is what the float is
    // spent on, and what the cost breakdown groups by.
    if (row.type === 'expense' && !String(row.vendor_name || '').trim()) {
      return Response.json({ success: false, error: 'Say who it was paid to.' }, { status: 400 });
    }

    const { data, error } = await supabase.from('petty_cash_ledger').insert([row]).select();
    if (error) throw error;

    return Response.json({ success: true, data: data[0] });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
