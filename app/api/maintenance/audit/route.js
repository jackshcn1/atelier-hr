import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');

    if (!token) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false }
    });

    const { job_id, user_name, action, details, comment } = await req.json();
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
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
