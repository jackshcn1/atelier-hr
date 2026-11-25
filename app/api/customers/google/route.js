/**
 * app/api/customers/google/route.js — read the Google reviews, now.
 *
 * The Reviews page shows what guests said about us on our Google listing.
 * The reviews come from the Google Business Profile API, which reads the
 * listing **as a manager of it** — so the reading needs the site's own
 * Google connection, and it is pulled on a schedule like everything else.
 *
 * This route asks for that same pull by hand, for the same reason the Bills
 * page has a "Check Petpooja for payments" button: a restaurant wants the
 * answer the same afternoon, not tomorrow morning.
 *
 * The sync route is called **in this process**, with the shared secret read
 * from this server's own environment. The secret never leaves the server and
 * never reaches the browser — the person who pressed the button is already
 * signed in, and this route asks *that* before it does anything.
 *
 * Only an administrator may press it: the pull reads our listing and writes
 * to the books.
 */

import { currentProfile, isAdmin } from '../../../../lib/sessionUser.js';
import { POST as SYNC_POST } from '../../sync/route.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request) {
  // Who is asking? The button is on the Reviews page, and only an
  // administrator can force a run.
  //
  // The cookie store is not there when this is called outside a request, so a
  // failure to read it is treated as "nobody is signed in" rather than a
  // crash.
  let signedIn = null;
  try {
    signedIn = await currentProfile();
  } catch {
    signedIn = null;
  }
  if (!signedIn?.user) {
    return Response.json({ success: false, error: 'Sign in first.' }, { status: 401 });
  }
  if (!isAdmin(signedIn.profile)) {
    return Response.json(
      { success: false, error: 'Only an administrator can run this.' },
      { status: 403 },
    );
  }

  if (!process.env.SYNC_SECRET) {
    return Response.json(
      { success: false, error: 'The sync secret is not set on this server.' },
      { status: 500 },
    );
  }

  // The same request the nightly run makes, for the Google reviews.
  const url = new URL('/api/sync', request.url);
  url.searchParams.set('google', 'reviews');

  let body;
  let status = 200;
  try {
    const response = await SYNC_POST(
      new Request(url.toString(), {
        method: 'POST',
        headers: { 'x-sync-secret': process.env.SYNC_SECRET },
      }),
    );
    status = response.status;
    body = await response.json();
  } catch (error) {
    body = { ok: false, error: error?.message || String(error) };
    status = 500;
  }

  // The lines worth reading: what was found, and what could not be read.
  const lines = Array.isArray(body?.logs) ? body.logs : [];

  if (!body?.ok) {
    return Response.json(
      {
        success: false,
        error: body?.error || 'The Google reviews could not be read.',
        lines,
      },
      { status: status >= 400 ? status : 500 },
    );
  }

  // Not connected is not a failure — it is a thing to say out loud.
  if (body?.skipped) {
    return Response.json({
      success: false,
      error: body?.reason || 'The Google Business Profile is not connected yet.',
      lines,
    }, { status: 400 });
  }

  return Response.json({
    success: true,
    data: {
      durationMs: body.durationMs ?? null,
      reviews: body.reviews ?? 0,
      averageRating: body.averageRating ?? null,
      totalReviewCount: body.totalReviewCount ?? null,
      lines,
    },
  });
}
