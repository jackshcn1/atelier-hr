/**
 * app/api/finance/sync/purchases/route.js — bring the bills up to date, now.
 *
 * The bills' paid state is Petpooja's to say. It is read twice a week by the
 * scheduled refresh, so the list of what is outstanding can be a few days
 * old — and a restaurant pays its suppliers together on one day, so the
 * answer is wanted the same afternoon.
 *
 * This route forces that same refresh on demand: the last 90 days of
 * purchases are re-read from Petpooja and the books are brought into step.
 * It is the run the workflow does, asked for by hand.
 *
 * ## The request is the one the workflow makes
 *
 * `?group=9` is the purchase invoices — the bills. `?refresh=90` is the
 * window. `finance=1` is required, because a refresh must never touch the
 * variable-pay figures or the pay periods: closing a cycle is a payroll
 * decision.
 *
 * The sync route is called **in this process**, with the shared secret read
 * from this server's own environment. The secret never leaves the server and
 * never reaches the browser — the person who pressed the button is already
 * signed in, and this route asks *that* before it does anything.
 *
 * ## What the run leaves behind, and what is put back
 *
 * The sync engine is told its window and its reports through the
 * environment, and it does not clear them when it is done. A serverless
 * instance is reused, so a refresh that set the 90-day window would leave
 * that window behind for the **next** request it served — and the next
 * request may be the nightly pull, which must read the running cycle and
 * not 90 days. So every one of those settings is put back the way it was
 * found.
 */

import { currentProfile, isAdmin } from '../../../../../lib/sessionUser.js';
import { restoreEngineSettings, snapshotEngineSettings } from '../../../../../lib/syncEngineSettings.js';
import { POST as SYNC_POST } from '../../../sync/route.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request) {
  // Who is asking? The button is on the Bills page, and only an administrator
  // can force a run — it opens a browser on Petpooja and writes to the books.
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
    return Response.json(
      { success: false, error: 'Sign in first.' },
      { status: 401 },
    );
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

  // The browser that reads Petpooja is the serverless one — a Linux build
  // that only runs on the hosted site. So this check is for the deployed
  // site, and it says so plainly rather than failing with a browser error.
  if (!process.env.VERCEL) {
    return Response.json(
      {
        success: false,
        error: 'This check runs on the deployed site — Petpooja is only reached from there.',
      },
      { status: 400 },
    );
  }

  // The same request the twice-weekly workflow makes, for the bills only.
  const url = new URL('/api/sync', request.url);
  url.searchParams.set('group', '9');
  url.searchParams.set('refresh', '90');
  url.searchParams.set('finance', '1');

  // Save the engine's settings before the run, so they can be put back after.
  const saved = snapshotEngineSettings();

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
  } finally {
    // Put the engine's settings back the way they were found, so the next
    // request this instance serves is not given the refresh's window.
    restoreEngineSettings(saved);
  }

  // The lines worth reading: what the refresh found, and anything it did not
  // manage to match. The rest of the engine's chatter is left alone.
  const lines = Array.isArray(body?.logs) ? body.logs : [];
  const summary = lines.filter(
    (line) =>
      typeof line === 'string' &&
      (line.includes('Refresh check') ||
        line.includes('do not match') ||
        line.includes('Flagged')),
  );

  if (!body?.ok) {
    return Response.json(
      {
        success: false,
        error: body?.error || 'Petpooja could not be read.',
        lines: summary,
      },
      { status: status >= 400 ? status : 500 },
    );
  }

  return Response.json({
    success: true,
    data: {
      durationMs: body.durationMs ?? null,
      lines: summary,
    },
  });
}
