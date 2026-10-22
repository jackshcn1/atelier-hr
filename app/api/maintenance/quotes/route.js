import { createClient } from '@supabase/supabase-js';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const jobIdFilter = searchParams.get('job_id');
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });
  let query = supabase.from('job_quotes').select('*');
  if (jobIdFilter) query = query.eq('job_id', jobIdFilter);
  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ quotes: data || [] });
}

export async function POST(req) {
  const { job_id, vendor_name, quote_type, cost, estimated_delivery, status, line_items, date, poc_id } = await req.json();
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });
  const { data, error } = await supabase.from('job_quotes').insert({
    job_id, vendor_name, quote_type, cost, estimated_delivery, status: status || 'pending',
    line_items: line_items || '[]', date: date || new Date().toISOString(), poc_id: poc_id || null
  }).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ quote: data }, { status: 201 });
}

export async function PATCH(req) {
  const { id, is_approved, status, line_items, date, cost, poc_id } = await req.json();
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });
  const update = {};
  if (is_approved !== undefined) update.is_approved = is_approved;
  if (status !== undefined) update.status = status;
  if (line_items !== undefined) update.line_items = line_items;
  if (date !== undefined) update.date = date;
  if (cost !== undefined) update.cost = cost;
  if (poc_id !== undefined) update.poc_id = poc_id;
  const { data, error } = await supabase.from('job_quotes').update(update).eq('id', id).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ quote: data });
}
