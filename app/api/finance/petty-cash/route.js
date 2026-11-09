import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET() {
  try {
    const { data, error } = await supabase.from('petty_cash_ledger').select('*').order('date', { ascending: false });
    if (error) throw error;
    return Response.json({ success: true, data });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { data, error } = await supabase.from('petty_cash_ledger').insert([body]).select();
    if (error) throw error;
    return Response.json({ success: true, data: data[0] });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
