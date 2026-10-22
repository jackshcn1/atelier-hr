import { createClient } from '@supabase/supabase-js';

function formatQuote(q) {
  if (!q) return q;
  try {
    if (q.estimated_delivery && q.estimated_delivery.startsWith('{')) {
      const parsed = JSON.parse(q.estimated_delivery);
      let items = parsed.line_items;
      if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch (_) { items = []; }
      }
      return {
        ...q,
        line_items: Array.isArray(items) ? items : [],
        date: parsed.date || q.created_at,
        poc_id: parsed.poc_id || null,
        estimated_delivery: parsed.estimated_delivery || ''
      };
    }
  } catch (_) {}

  if (q.line_items && typeof q.line_items === 'string') {
    try { q.line_items = JSON.parse(q.line_items); } catch (_) { q.line_items = []; }
  }
  return q;
}

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
  return Response.json({ quotes: (data || []).map(formatQuote) });
}

export async function POST(req) {
  const { job_id, vendor_name, quote_type, cost, estimated_delivery, status, line_items, date, poc_id } = await req.json();
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  // Try standard insert first
  let result = await supabase.from('job_quotes').insert({
    job_id, vendor_name, quote_type, cost, estimated_delivery, status: status || 'pending',
    line_items: line_items || '[]', date: date || new Date().toISOString(), poc_id: poc_id || null
  }).select().single();

  if (result.error && (result.error.message.includes('column') || result.error.code === 'PGRST204')) {
    // Fallback serialization due to missing columns in schema cache
    const fallbackVal = JSON.stringify({
      line_items: line_items || '[]',
      date: date || new Date().toISOString(),
      poc_id: poc_id || null,
      estimated_delivery: estimated_delivery || ''
    });
    result = await supabase.from('job_quotes').insert({
      job_id, vendor_name, quote_type, cost, estimated_delivery: fallbackVal, status: status || 'pending'
    }).select().single();
  }

  if (result.error) return Response.json({ error: result.error.message }, { status: 500 });
  return Response.json({ quote: formatQuote(result.data) }, { status: 201 });
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

  let result = await supabase.from('job_quotes').update(update).eq('id', id).select().single();

  if (result.error && (result.error.message.includes('column') || result.error.code === 'PGRST204')) {
    // Missing columns, need fallback strategy
    const { data: current } = await supabase.from('job_quotes').select('*').eq('id', id).single();
    let currentParsed = {};
    if (current && current.estimated_delivery && current.estimated_delivery.startsWith('{')) {
      try { currentParsed = JSON.parse(current.estimated_delivery); } catch (_) {}
    } else if (current) {
      currentParsed = {
        line_items: current.line_items || '[]',
        date: current.date || new Date().toISOString(),
        poc_id: current.poc_id || null,
        estimated_delivery: current.estimated_delivery || ''
      };
    }

    const fallbackVal = JSON.stringify({
      line_items: line_items !== undefined ? line_items : (currentParsed.line_items || '[]'),
      date: date !== undefined ? date : (currentParsed.date || new Date().toISOString()),
      poc_id: poc_id !== undefined ? poc_id : (currentParsed.poc_id || null),
      estimated_delivery: currentParsed.estimated_delivery || ''
    });

    const fallbackUpdate = { estimated_delivery: fallbackVal };
    if (is_approved !== undefined) fallbackUpdate.is_approved = is_approved;
    if (status !== undefined) fallbackUpdate.status = status;
    if (cost !== undefined) fallbackUpdate.cost = cost;

    result = await supabase.from('job_quotes').update(fallbackUpdate).eq('id', id).select().single();
  }

  if (result.error) return Response.json({ error: result.error.message }, { status: 500 });
  return Response.json({ quote: formatQuote(result.data) });
}
