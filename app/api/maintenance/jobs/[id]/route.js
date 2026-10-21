import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET(req, { params }) {
  const { id } = await params;

  // Use service role to bypass RLS for audit logs
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  // 1. Fetch job
  const { data: job, error: jobErr } = await supabase
    .from('maintenance_jobs')
    .select('id, asset_serial, asset_name, service_type, priority, status, issues, comments, requested_by, requested_at, assigned_poc_id')
    .eq('id', id)
    .single();

  if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 });

  // 2. Fetch relations
  const [{ data: pocs }, { data: quotes }, { data: logs }] = await Promise.all([
    job.assigned_poc_id ? supabase.from('maintenance_pocs').select('*').eq('id', job.assigned_poc_id).maybeSingle() : { data: null },
    supabase.from('job_quotes').select('*').eq('job_id', id),
    supabase.from('maintenance_audit_logs').select('*').eq('job_id', id)
  ]);

  return NextResponse.json({ job: { ...job, maintenance_pocs: pocs, job_quotes: quotes, maintenance_audit_logs: logs } });
}

export async function PATCH(req, { params }) {
  const { id } = await params;
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: 'Bearer ' + token } },
    auth: { persistSession: false }
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
