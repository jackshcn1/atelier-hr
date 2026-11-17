import { createClient } from '@supabase/supabase-js';
import { cleanExpensePatch } from '../../../../../lib/expenseHelpers.js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// One bill.
//
// The review page approves and rejects bills here. The route was missing
// before, so every Approve and Reject button on that page failed with a
// 404 — the bill was never marked.
export async function GET(request, { params }) {
  try {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('id', params.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return Response.json({ success: false, error: 'Bill not found.' }, { status: 404 });

    return Response.json({ success: true, data });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const body = await request.json();

    // Only the fields the request mentions are changed.
    const row = cleanExpensePatch(body);

    if (Object.keys(row).length === 0) {
      return Response.json({ success: false, error: 'Nothing to change.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('expenses')
      .update(row)
      .eq('id', params.id)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      return Response.json({ success: false, error: 'Bill not found.' }, { status: 404 });
    }

    return Response.json({ success: true, data: data[0] });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { error } = await supabase.from('expenses').delete().eq('id', params.id);
    if (error) throw error;
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
