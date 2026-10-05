import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !anonKey || !serviceKey) {
      return NextResponse.json(
        { error: 'Server configuration error: missing Supabase credentials.' },
        { status: 500 }
      );
    }

    // Verify caller authentication & permissions
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');

    if (!token) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false }
    });

    const { data: { user: caller }, error: callerAuthErr } = await userClient.auth.getUser();
    if (callerAuthErr || !caller) {
      return NextResponse.json({ error: 'Invalid authentication session.' }, { status: 401 });
    }

    const { data: callerProfile } = await userClient
      .from('profiles')
      .select('*')
      .eq('id', caller.id)
      .maybeSingle();

    const isAuthorized =
      callerProfile?.is_super_admin ||
      callerProfile?.role === 'super_admin' ||
      callerProfile?.role === 'admin' ||
      callerProfile?.permissions?.manage_users;

    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Forbidden: only administrators can create new users.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      email,
      password,
      role = 'employee',
      department_scope = 'own_department',
      department = null,
      is_super_admin = false,
      permissions = {},
      display_name = ''
    } = body;

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email address is required.' }, { status: 400 });
    }

    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters long.' },
        { status: 400 }
      );
    }

    // Only existing super admin can create a new super admin
    if (is_super_admin && !callerProfile?.is_super_admin) {
      return NextResponse.json(
        { error: 'Only a Super Admin can create or promote Super Admin accounts.' },
        { status: 403 }
      );
    }

    // Admin Supabase Client with service_role key
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const cleanedEmail = email.trim().toLowerCase();
    const finalDisplayName = (display_name || cleanedEmail.split('@')[0]).trim();

    // 1. Create user in Supabase Auth
    let authUserId = null;
    const { data: newAuthUser, error: createAuthErr } = await adminClient.auth.admin.createUser({
      email: cleanedEmail,
      password: password,
      email_confirm: true,
      user_metadata: {
        display_name: finalDisplayName
      }
    });

    if (createAuthErr) {
      // If user already exists in auth, try to find them to link/update profile
      if (createAuthErr.message?.toLowerCase().includes('already') || createAuthErr.status === 422) {
        const { data: listData } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const existingAuth = (listData?.users || []).find(u => u.email?.toLowerCase() === cleanedEmail);
        if (existingAuth) {
          authUserId = existingAuth.id;
        } else {
          return NextResponse.json({ error: createAuthErr.message }, { status: 400 });
        }
      } else {
        return NextResponse.json({ error: `Auth error: ${createAuthErr.message}` }, { status: 400 });
      }
    } else {
      authUserId = newAuthUser.user.id;
    }

    // 2. Upsert profile row in `profiles` table
    const profilePayload = {
      id: authUserId,
      email: cleanedEmail,
      display_name: finalDisplayName,
      role: is_super_admin ? 'super_admin' : role,
      department: department || null,
      department_scope,
      is_super_admin: !!is_super_admin,
      permissions: permissions || {},
      access_status: 'active',
      updated_at: new Date().toISOString()
    };

    const { data: savedProfile, error: profileErr } = await adminClient
      .from('profiles')
      .upsert(profilePayload, { onConflict: 'id' })
      .select()
      .single();

    if (profileErr) {
      return NextResponse.json(
        { error: `User authenticated, but failed to save profile: ${profileErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: `User ${cleanedEmail} created successfully.`,
      user: savedProfile
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
