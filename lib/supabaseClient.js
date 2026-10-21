import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wzxswmopfxnucmeygqeg.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key',
    {
      global: {
        headers: { 'Accept': 'application/json', 'Prefer': 'return=representation' }
      }
    }
  );
}
