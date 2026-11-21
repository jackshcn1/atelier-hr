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

  client = createClient(url, key, {
    global: {
      /**
       * **Next.js caches a GET fetch unless it is told not to.**
       *
       * A read of the books must show what is in them *now*. Next.js keeps
       * its fetch cache on disk, so it survives a restart and a deployment —
       * and a route marked `dynamic = 'force-dynamic'` does not switch it
       * off: that makes the *route* dynamic, not the fetch inside it.
       *
       * Measured on 21 Nov 2026: the Customer overview read the reviews
       * through a table read and got **420** rows — the number of reviews on
       * the books before the history pull — while the same route's other
       * read, which asks Postgres through an RPC (a POST, and POSTs are
       * never cached), returned the **1,349** that were really there. The
       * customers' listing column was missing for the same reason: the
       * cached copy was written before the column was filled in.
       *
       * `cache: 'no-store'` is the documented way out, and it is put on
       * every request the client makes.
       */
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
  });
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

/**
 * Run a read-only SQL query and get the rows back.
 *
 * The PostgREST API **cannot aggregate** — `sum()` is refused with "Use of
 * aggregate functions is not allowed" — so a total over a table that runs to
 * tens of thousands of rows has to be worked out by Postgres itself rather
 * than in JavaScript. The `exec_sql_select` RPC does that.
 *
 * Two things make this safe to use from a page route:
 *
 *   1. **Only the service role can run it.** `anon` and `authenticated` are
 *      revoked on the function, and the client this module builds is the
 *      service-role one.
 *   2. **The query is always a constant.** Nothing a visitor sends is ever
 *      put into the SQL text. A visitor's own words go through the query
 *      builder (`.eq(...)`), never through string interpolation.
 *
 * The function runs with `search_path = ''`, so every table in the query has
 * to be named in full — `public.customer_orders`, not `customer_orders`.
 *
 * @param {object} supabase a service-role client
 * @param {string} sql the query to run
 * @returns {Promise<Array<object>>} the rows
 */
export async function selectRows(supabase, sql) {
  const { data, error } = await supabase.rpc('exec_sql_select', { q: sql });
  if (error) throw new Error(error.message);
  if (!data || data.ok === false) {
    throw new Error(data?.error || 'The query failed.');
  }
  return data.rows || [];
}
