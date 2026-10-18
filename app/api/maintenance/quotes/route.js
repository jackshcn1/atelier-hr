import { createClient } from '../../../../lib/supabaseClient';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const jobIdFilter = searchParams.get('job_id');
  const supabase visiting = createClient();
  let query = supabase.from('job_quotes').select('*');
  if (jobIdFilter) query = query.eq('job_id', jobIdFilter);
  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ quotes: data || [] });
}

export async function POST(req) {
  const { job_id, vendor_name, quote_type, cost, estimated_delivery, status } = await req.json();
  const supabase = createClient();
  const { data, error } = await supabase.from('job_quotes').insert({
    job_id, vendor_name, quote_type, cost, estimated_delivery, status: status || 'pending'
  }).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ quote: data }, { status: 201 });
}

export async function PATCH(req) {
  const { id } = await req.json();
  const supabase = createClient();
  const { data, error } = await supabase
    .from('job_quotes')
    .update({ is_approved: true })
    .eq('id', id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ quote: data });
}
