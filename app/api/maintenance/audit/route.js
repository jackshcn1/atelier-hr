import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(req) {
  const { job_id, user_name, action, details, comment } = await req.json();
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
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
