import { createClient } from '../../../../../lib/supabaseClient';

export async function GET(req, { params }) {
  const { id } = await params;
  const supabase = createClient();
  const { data, error } = await supabase
    .from('maintenance_jobs')
    .select('*, maintenance_pocs(*), job_quotes(*), maintenance_audit_logs(*)')
    .eq('id', id)
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ job: data });
}

export async function PATCH(req, { params }) {
  const { id } = await params;
  const updates = await req.json();
  const supabase = createClient();
  const { data, error } = await supabase
    .from('maintenance_jobs')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ job: data });
}
