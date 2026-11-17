import { createClient } from '@supabase/supabase-js';
import { normalizePaymentStatus, PAID } from '../../../../lib/expenseHelpers.js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// The supplier list.
//
// Every bill carries the name of the supplier it came from, and those names
// are the truth about who the restaurant buys from. This route joins the two:
// the vendor list, and what each vendor on it is owed.
//
// GET returns every vendor with its bills summarised — how much is still
// unpaid, how much has been paid, how many bills there are, and the date of
// the newest one.
export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;
    const search = (params.get('search') || '').trim().toLowerCase();

    const [{ data: vendors, error: vendorError }, { data: bills, error: billError }] = await Promise.all([
      supabase.from('vendors').select('*').order('name', { ascending: true }),
      supabase.from('expenses').select('vendor_name, amount, debit_note, payment_status, invoice_date'),
    ]);

    if (vendorError) throw vendorError;
    if (billError) throw billError;

    // What each supplier's bills add up to.
    const summary = new Map();
    for (const bill of bills || []) {
      const name = (bill.vendor_name || '').trim();
      if (!name) continue;

      const amount = Number(bill.amount || 0) - Number(bill.debit_note || 0);
      const line = summary.get(name) || {
        unpaid: 0,
        paid: 0,
        billCount: 0,
        unpaidCount: 0,
        lastBillDate: null,
      };

      line.billCount += 1;
      if (normalizePaymentStatus(bill.payment_status) === PAID) {
        line.paid += amount;
      } else {
        line.unpaid += amount;
        line.unpaidCount += 1;
      }
      if (bill.invoice_date && (!line.lastBillDate || bill.invoice_date > line.lastBillDate)) {
        line.lastBillDate = bill.invoice_date;
      }

      summary.set(name, line);
    }

    const rows = (vendors || []).map((vendor) => {
      const line = summary.get(vendor.name) || {
        unpaid: 0,
        paid: 0,
        billCount: 0,
        unpaidCount: 0,
        lastBillDate: null,
      };
      return {
        ...vendor,
        bills: {
          ...line,
          unpaid: Math.round(line.unpaid * 100) / 100,
          paid: Math.round(line.paid * 100) / 100,
        },
      };
    });

    // Suppliers that have bills but are not on the list yet. They are shown
    // so a bill is never invisible because its supplier was never added.
    const known = new Set(rows.map((vendor) => vendor.name.toLowerCase()));
    const missing = [...summary.keys()].filter((name) => !known.has(name.toLowerCase()));

    const filtered = search
      ? rows.filter((vendor) => vendor.name.toLowerCase().includes(search))
      : rows;

    return Response.json({
      success: true,
      data: filtered,
      totals: {
        vendorCount: rows.length,
        unpaid: Math.round(filtered.reduce((sum, vendor) => sum + vendor.bills.unpaid, 0) * 100) / 100,
      },
      notOnList: missing,
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const name = String(body.name || '').trim();
    if (!name) {
      return Response.json({ success: false, error: 'A vendor needs a name.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('vendors')
      .insert([
        {
          name,
          description: body.description || null,
          contact_person: body.contact_person || null,
          email: body.email || null,
          phone: body.phone || null,
          website: body.website || null,
        },
      ])
      .select();

    if (error) throw error;
    return Response.json({ success: true, data: data[0] });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const id = body.id;
    if (!id) throw new Error('ID is required');

    const updates = {};
    for (const column of ['name', 'description', 'contact_person', 'email', 'phone', 'website']) {
      if (column in body) {
        const value = String(body[column] ?? '').trim();
        updates[column] = value === '' ? null : value;
      }
    }

    const { data, error } = await supabase
      .from('vendors')
      .update(updates)
      .eq('id', id)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      return Response.json({ success: false, error: 'Vendor not found.' }, { status: 404 });
    }

    return Response.json({ success: true, data: data[0] });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const params = new URL(request.url).searchParams;
    const id = params.get('id');
    if (!id) throw new Error('ID is required');

    const { error } = await supabase.from('vendors').delete().eq('id', id);
    if (error) throw error;
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
