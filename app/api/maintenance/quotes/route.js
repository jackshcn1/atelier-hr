import { createClient } from '../../../../lib/supabaseClient';

export async function POST(req) {
  const { job_id, vendor_name, quote_type, cost, estimated_delivery, status } = await req.json();
  const supabase = createClient();
  const { data, error } = await supabase.from('job_quotes').insert({
    job_id, vendor_name, quote_type, cost, estimated_delivery, status: status || 'pending'
  }).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ quote: data }, { status: 201 });
}
