/**
 * lib/supabaseServer.js — the server's Supabase client.
 *
 * The client is made on first use, not when the module is loaded.
 *
 * Next.js loads every route while it builds, to check that they load. A
 * client made at module scope throws the moment it is loaded without a
 * service key — and the preview environment has no service key, so every
 * preview build failed with "supabaseKey is required" and the Vercel check
 * on every pull request was red whatever the change was. A check that is
 * always red carries no information: a real break in a route cannot be told
 * apart from the missing key.
 *
 * Made on first use, a route loads fine and fails only when it is actually
 * called — which is the truth about a preview that has no database
 * credentials. Production has the key, so nothing changes there.
 *
 * The client is kept in the module, so one serverless instance makes one
 * client however many requests it serves.
 */

import { createClient } from '@supabase/supabase-js';

let client = null;

export function getSupabase() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Supabase is not configured: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set.'
    );
  }

  client = createClient(url, key);
  return client;
}
