import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Regenerate the frozen attainment snapshot for one pay cycle.
//
// Closed cycles are meant to be immutable, but if a snapshot was taken before
// the last sync landed, or the admin corrects a figure by hand, the snapshot
// needs rebuilding. The database function wipes and rewrites the period, so
// pressing this twice is safe.

export async function POST(req) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !anonKey || !serviceKey) {
      return NextResponse.json({ error: 'Server is missing Supabase configuration.' }, { status: 500 });
    }

    const { periodId } = await req.json();
    if (!periodId) {
      return NextResponse.json({ error: 'periodId is required.' }, { status: 400 });
    }

    // Check the caller with their own session first — the service role key
    // bypasses RLS entirely, so the privilege check must happen before it is
    // used for anything.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
      auth: { persistSession: false }
    });

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
    }

    const { data: profile } = await userClient
      .from('profiles')
      .select('role, permissions, access_status')
      .eq('id', user.id)
      .maybeSingle();

    const perms = profile?.permissions || {};
    const isPrivileged =
      profile?.access_status !== 'inactive' &&
      (
        profile?.role === 'super_admin' ||
        profile?.role === 'admin' ||
        perms.manage_settings === true ||
        perms.view_payroll === true ||
        perms.finalize_payroll === true
      );

    if (!isPrivileged) {
      return NextResponse.json({ error: 'You do not have permission to regenerate snapshots.' }, { status: 403 });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const { data, error } = await admin.rpc('generate_variable_pay_snapshot', {
      p_period_id: Number(periodId),
      p_generated_by: user.email || 'admin'
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, rows: data ?? 0 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}