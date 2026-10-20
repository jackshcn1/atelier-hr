import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function PATCH(req, { params }) {
  const { id } = await params;
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: 'Bearer ' + token } }, auth: { persistSession: false }
  });
  const updates = await req.json();
  const { data, error } = await supabase.from('maintenance_jobs').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Auto-set asset status to Maintenance on approval
  if (updates.status === 'Approved') {
    try {
      const { data: jobData } = await supabase.from('maintenance_jobs').select('asset_serial').eq('id', id).single();
      if (jobData && jobData.asset_serial) {
        await supabase.from('assets').update({ status: 'Maintenance' }).eq('asset_number', jobData.asset_serial);
      }
    } catch(_){}
  }
  return NextResponse.json({ job: data });
}
