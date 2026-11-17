import { getSupabase } from '../../../../lib/supabaseServer.js';
import { financePeriod } from '../../../../lib/financePeriod.js';
import { monthCosts } from '../../../../lib/financeCosts.js';

// The standing costs — the checklist of what the restaurant expects to pay
// every month: rent, pest control, the broadband.
//
// The amount here is what the month is **expected** to cost. When the
// invoice for that month arrives it replaces the expected amount rather
// than adding to it, so the same rent is never counted twice.
//
// GET with a month answers "which of these have their invoice in yet".
export async function GET(request) {
  try {
    const supabase = getSupabase();
    const params = new URL(request.url).searchParams;
    const period = financePeriod(params.get('month'));

    const costs = await monthCosts(supabase, period);

    return Response.json({
      success: true,
      data: costs.standing,
      period: { key: period.key, label: period.label, through: period.through, isCurrentMonth: period.isCurrentMonth },
      totals: {
        // What the month counts, and what it would count if every invoice
        // came in at the expected amount.
        recognised: Math.round(costs.fixed * 100) / 100,
        expected: Math.round(
          costs.standing.reduce((sum, row) => sum + row.monthlyExpected, 0) * 100
        ) / 100,
        standingCount: costs.standing.length,
        awaitingInvoice: costs.standingOutstanding.length,
      },
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
      return Response.json({ success: false, error: 'A standing cost needs a name.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('fixed_costs')
      .insert([
        {
          name,
          category: String(body.category || body.name || '').trim(),
          amount: Number(body.amount || 0),
          billing_cycle: body.billing_cycle === 'annual' ? 'annual' : 'monthly',
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
    const { id } = body;
    if (!id) throw new Error('ID is required');

    const updates = {};
    if ('name' in body) updates.name = String(body.name || '').trim();
    if ('category' in body) updates.category = String(body.category || '').trim();
    if ('amount' in body) updates.amount = Number(body.amount || 0);
    if ('billing_cycle' in body) updates.billing_cycle = body.billing_cycle === 'annual' ? 'annual' : 'monthly';

    const { data, error } = await supabase
      .from('fixed_costs')
      .update(updates)
      .eq('id', id)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      return Response.json({ success: false, error: 'Standing cost not found.' }, { status: 404 });
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

    const { error } = await supabase.from('fixed_costs').delete().eq('id', id);
    if (error) throw error;
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
