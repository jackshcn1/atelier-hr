import { createClient } from '../../../../lib/supabaseClient';

export async function POST(req) {
  const { job_id, user_name, action, details, comment } = await req.json();
  const supabase = createClient();
  const { data, error } = await supabase
    .from('maintenance_audit_logs')
    .insert({
      job_id,
      user_name,
      action,
      details,
      comment,
      timestamp: new Date().toISOString()
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ entry: data }, { status: 201 });
}
