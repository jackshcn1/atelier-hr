import { createClient } from '../../../../lib/supabaseClient';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get('status');
  const supabase = createClient();
  let query = supabase.from('maintenance_jobs').select('*, maintenance_pocs(name)').order('requested_at', { ascending: false });
  if (statusFilter) query = query.eq('status', statusFilter);
  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ jobs: data || [] });
}

export async function POST(req) {
  const { id, asset_serial, service_type, priority, status, issues, comments, requested_by } = await req.json();
  const supabase = createClient();
  const jobId = id || 'MNT-' + Date.now();
  const { data, error } = await supabase.from('maintenance_jobs').insert({
    id: jobId, asset_serial, service_type, priority: priority || 'normal', status: status || 'pending_approval', issues, comments, requested_by, requested_at: new Date().toISOString()
  }).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ job: data }, { status: 201 });
}
