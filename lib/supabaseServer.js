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

/**
 * Read every row of a query, page by page.
 *
 * **A plain read stops at a thousand rows.** The database answers a query
 * with at most a thousand rows unless it is asked for more, and it says
 * nothing when it does: no error, no warning, just the first thousand.
 *
 * The bills table passed a thousand in November 2026, and the pages that
 * read it whole — the bills page and the suppliers page — were quietly
 * showing a fraction of the bills and a fraction of what was owed. A total
 * that is missing half its bills is not a total.
 *
 * So a read that is meant to be whole says so.
 *
 * The query must be **ordered**. A paged read without an order is a read
 * with no fixed sequence, so a row can be served on two pages and another
 * can be missed altogether.
 *
 * @param {(from: number, to: number) => object} build a function that returns
 *   the query for a page, with `.range(from, to)` already applied
 * @param {number} [pageSize] how many rows to ask for at a time
 */
export async function readAllRows(build, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}
