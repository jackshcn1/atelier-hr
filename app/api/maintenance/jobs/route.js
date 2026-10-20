import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, token ? { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } } : undefined);

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get('status');

  let query = supabase.from('maintenance_jobs').select('*, maintenance_pocs(name), assets(name)').order('requested_at', { ascending: false });
  if (statusFilter) query = query.eq('status', statusFilter);
  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ jobs: data || [] });
}

export async function POST(req) {
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');

    if (!token) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false }
    });

    const { id, asset_serial, service_type, priority, status, issues, comments, requested_by } = await req.json();
        // Sequential MNT-000001 style
    let jobId = id;
    if (!jobId) {
      const { data: maxRow, error: seqErr } = await supabase.from('maintenance_jobs').select('id').order('requested_at', { ascending: false }).limit(1).maybeSingle();
      let nextNum = 1;
      if (maxRow && maxRow.id && /^MNT-\d+$/.test(maxRow.id)) {
        nextNum = parseInt(maxRow.id.replace('MNT-', ''), 10) + 1;
      } else if (maxRow && maxRow.id && /^MNT-0+\d+$/.test(maxRow.id)) {
         nextNum = parseInt(maxRow.id.replace('MNT-', ''), 10) + 1;
      }
      jobId = 'MNT-' + String(nextNum).padStart(6, '0');
    }
    const { data, error } = await supabase.from('maintenance_jobs').insert({
        id: jobId, asset_serial, service_type, priority: priority || 'normal', status: status || 'pending_approval', issues, comments, requested_by, requested_at: new Date().toISOString()
      }).select().single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ job: data }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
