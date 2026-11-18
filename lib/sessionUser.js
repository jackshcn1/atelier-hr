/**
 * lib/sessionUser.js — who is making this request.
 *
 * The routes that connect the restaurant's Google account are opened in a
 * browser, so there is no bearer token to check — the Supabase session
 * cookie is what says who is asking. The cookie is read here, and the
 * person's profile is looked up, so a route can ask "is this an
 * administrator?" the same way the other admin routes do.
 */

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getSupabase } from './supabaseServer.js';

/**
 * The signed-in person and their profile.
 *
 * @returns {Promise<{user: object, profile: object|null}|null>}
 */
export async function currentProfile() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const jar = await cookies();
  const client = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => jar.getAll(),
      // Nothing is written here — this is a read, and a route that wants to
      // set a cookie does it with its own response.
      setAll: () => {},
    },
  });

  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;

  const { data: profile } = await getSupabase()
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  return { user, profile: profile || null };
}

/** Is this person allowed to change the system's own settings? */
export function isAdmin(profile) {
  if (!profile) return false;
  return Boolean(
    profile.is_super_admin ||
      profile.role === 'super_admin' ||
      profile.role === 'admin' ||
      profile.permissions?.manage_users,
  );
}
