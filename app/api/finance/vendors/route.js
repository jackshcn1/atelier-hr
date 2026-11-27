import { getSupabase, readAllRows } from '../../../../lib/supabaseServer.js';
import { normalizePaymentStatus, PAID } from '../../../../lib/expenseHelpers.js';
import { findDuplicateVendor, vendorNameKey } from '../../../../lib/vendorName.js';

// The supplier list.
//
// Every bill carries the name of the supplier it came from, and those names
// are the truth about who the restaurant buys from. This route joins the two:
// the vendor list, and what each vendor on it is owed.
//
// The join is by the vendor's NORMALISED name (see `lib/vendorName.js`), not
// by the text as typed. One supplier can be spelled more than one way — a
// branch tag in brackets, a missing apostrophe — and a bill that arrives
// under the other spelling belongs to the same row. Joining on the exact
// text split that supplier's money across two rows, and showed a row as
// owing nothing while its bills sat elsewhere.
export async function GET(request) {
  try {
    const supabase = getSupabase();
    const params = new URL(request.url).searchParams;
    const search = (params.get('search') || '').trim().toLowerCase();

    // Every bill, not the first thousand. A plain read stops at a thousand
    // rows and says nothing when it does, so a supplier could be shown as
    // owing less than it does.
    const [vendorResult, bills] = await Promise.all([
      supabase.from('vendors').select('*').order('name', { ascending: true }),
      readAllRows((from, to) =>
        supabase
          .from('expenses')
          .select('vendor_name, amount, debit_note, payment_status, invoice_date')
          .order('id')
          .range(from, to),
      ),
    ]);

    if (vendorResult.error) throw vendorResult.error;
    const vendors = vendorResult.data || [];

    // What each supplier's bills add up to. Keyed by the normalised name, so
    // every spelling of one supplier lands on one row. The label kept beside
    // it is the name as written on the bill, which is what a person reads.
    const summary = new Map();
    const labelByKey = new Map();
    for (const bill of bills || []) {
      const name = (bill.vendor_name || '').trim();
      if (!name) continue;

      const key = vendorNameKey(name);
      if (!key) continue;
      if (!labelByKey.has(key)) labelByKey.set(key, name);

      const amount = Number(bill.amount || 0) - Number(bill.debit_note || 0);
      const line = summary.get(key) || {
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

      summary.set(key, line);
    }

    const rows = (vendors || []).map((vendor) => {
      const line = summary.get(vendorNameKey(vendor.name)) || {
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
    const known = new Set(rows.map(vendor => vendorNameKey(vendor.name)));
    const missing = [...summary.keys()]
      .filter(key => !known.has(key))
      .map(key => labelByKey.get(key));

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
    const supabase = getSupabase();
    const body = await request.json();
    const name = String(body.name || '').trim();
    if (!name) {
      return Response.json({ success: false, error: 'A vendor needs a name.' }, { status: 400 });
    }

    // A supplier can be spelled more than one way, and two spellings of one
    // supplier are two rows — the money splits, and a certificate filed
    // against one is invisible on the other. So the same supplier is
    // refused here, and the one already on the list is named.
    const { data: existing, error: readError } = await supabase
      .from('vendors')
      .select('id, name');
    if (readError) throw readError;

    const twin = findDuplicateVendor(existing || [], name);
    if (twin) {
      return Response.json(
        {
          success: false,
          error: `"${twin.name}" is already on the list — that is the same supplier. Edit that one instead of adding a second.`,
          duplicate: twin,
        },
        { status: 409 }
      );
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
    const supabase = getSupabase();
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

    // A rename must not turn one vendor into two either.
    if (updates.name) {
      const { data: existing, error: readError } = await supabase
        .from('vendors')
        .select('id, name')
        .neq('id', id);
      if (readError) throw readError;

      const twin = findDuplicateVendor(existing || [], updates.name);
      if (twin) {
        return Response.json(
          {
            success: false,
            error: `"${twin.name}" is already on the list — that is the same supplier. Rename this one to "${twin.name}" only after the two are merged.`,
            duplicate: twin,
          },
          { status: 409 }
        );
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
    const supabase = getSupabase();
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
