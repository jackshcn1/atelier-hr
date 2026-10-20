import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
export async function PATCH(req) {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: 'Bearer ' + token } }, auth: { persistSession: false }
  });
  const { asset_serial, status } = await req.json();
  const { data, error } = await supabase.from('assets').update({ status }).eq('asset_number', asset_serial).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ assets: data });
}
