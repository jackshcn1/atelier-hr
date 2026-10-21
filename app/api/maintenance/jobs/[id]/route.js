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
  const body = await req.json();
  // asset_status is a UI-only field: which status the asset gets when the job completes.
  const { asset_status: assetStatus, ...updates } = body;
  const { data, error } = await supabase.from('maintenance_jobs').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (updates.status === 'Approved' || updates.status === 'Rejected' || updates.status === 'Completed') {
    try {
      const adminSupabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false }
      });
      const { data: jobData } = await adminSupabase.from('maintenance_jobs').select('asset_serial').eq('id', id).single();
      if (jobData && jobData.asset_serial) {
        const { data: assetRow } = await adminSupabase
          .from('assets')
          .select('status, pre_maintenance_status')
          .eq('asset_number', jobData.asset_serial)
          .maybeSingle();

        if (assetRow) {
          if (updates.status === 'Approved') {
            // Remember the status the asset had before maintenance so it can be restored on rejection.
            const pre = assetRow.pre_maintenance_status || (assetRow.status && assetRow.status !== 'Maintenance' ? assetRow.status : null);
            await adminSupabase
              .from('assets')
              .update({ status: 'Maintenance', pre_maintenance_status: pre })
              .eq('asset_number', jobData.asset_serial);
          } else if (updates.status === 'Rejected') {
            // Rejected: revert to the status the asset had before maintenance.
            await adminSupabase
              .from('assets')
              .update({ status: assetRow.pre_maintenance_status || 'Available', pre_maintenance_status: null })
              .eq('asset_number', jobData.asset_serial);
          } else if (updates.status === 'Completed') {
            // Completed: the user picks the status the asset now carries.
            await adminSupabase
              .from('assets')
              .update({ status: assetStatus || assetRow.pre_maintenance_status || 'Available', pre_maintenance_status: null })
              .eq('asset_number', jobData.asset_serial);
          }
        }
      }
    } catch (e) {
      console.error('Asset status sync error:', e);
    }
  }
  return NextResponse.json({ job: data });
}
