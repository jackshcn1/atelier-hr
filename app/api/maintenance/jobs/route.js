import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, token ? { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } } : undefined);

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get('status');
  const assetSerial = searchParams.get('asset_serial');

  let query = supabase.from('maintenance_jobs').select('*, maintenance_pocs(name), asset_name').order('requested_at', { ascending: false });
  if (statusFilter) query = query.eq('status', statusFilter);
  if (assetSerial) query = query.eq('asset_serial', assetSerial);
  const { data: jobs, error: jobsErr } = await query;
  if (jobsErr) return Response.json({ error: jobsErr.message }, { status: 500 });

  // Use raw SQL via RPC or fallback to a query that works with schema cache.
  // The table exists but 'assets' isn't visible via .from('assets').
  // Try fetching asset names from the assets table with public schema explicitly.
  const { data: assets, error: assetsErr } = await supabase.from('assets').select('serial_number, name');

  // If failed, return jobs without asset info to allow dashboard to load.
  const assetMap = assets ? new Map(assets.map(a => [a.serial_number, a.name])) : new Map();
  const combinedData = jobs.map(j => ({
    ...j,
    assets: assetMap.has(j.asset_serial) ? { name: assetMap.get(j.asset_serial) } : null
  }));

  return Response.json({ jobs: combinedData || [] });
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

    const { id, asset_serial, asset_name, service_type, priority, status, issues, comments, requested_by } = await req.json();
    let jobId = id;
    if (!jobId) {
      const { data: seqRows, error: seqErr } = await supabase.from('maintenance_jobs').select('id').like('id', 'MNT-0%').order('id', { ascending: false });
      let nextNum = 1;
      if (seqRows && seqRows.length > 0) {
        const lastId = seqRows[0].id;
        if (/^MNT-0+\d+$/.test(lastId)) {
          nextNum = parseInt(lastId.replace('MNT-', ''), 10) + 1;
        }
      }
      jobId = 'MNT-' + String(nextNum).padStart(6, '0');
    }
    const insertJob = (theId) => supabase.from('maintenance_jobs').insert({
        id: theId, asset_serial, service_type, priority: priority || 'normal', status: status || 'pending_approval', issues, comments, requested_by, requested_at: new Date().toISOString(), asset_name: asset_name || null
      }).select().single();

    let { data, error } = await insertJob(jobId);

    if (error && error.code === '23505') {
      const nextId = 'MNT-' + String(parseInt(jobId.replace('MNT-', ''), 10) + 1).padStart(6, '0');
      ({ data, error } = await insertJob(nextId));
    }

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ job: data }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
