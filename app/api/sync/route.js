/**
 * app/api/sync/route.js — Vercel-hosted Petpooja daily sync.
 *
 * Why this exists:
 *   Petpooja's edge blocks datacenter IP ranges with a raw nginx 403, so a
 *   GitHub Actions runner cannot reach billing.petpooja.com - the request
 *   never reaches the application. Verified from both sides:
 *     GitHub Actions runner (Azure egress) -> 403 Forbidden (nginx)
 *     Vercel function        (AWS egress)   -> 200 OK, login form present
 *   So the browser work runs here, on a host Petpooja accepts, and a free
 *   scheduler calls this route.
 *
 * Authentication: this route writes payroll metrics, so it requires a shared
 * secret. Two accepted forms:
 *   GET  with  Authorization: Bearer <SYNC_SECRET>   (Vercel Cron sends this)
 *   POST with  x-sync-secret: <SYNC_SECRET>           (GitHub Actions / manual)
 *
 * How it has to be called:
 *   ?group=<n>   one report group. This is how the nightly workflow calls it —
 *                one request per group, each with its own serverless run.
 *   ?sheet=1     the accountant's invoice sheet on its own (no browser).
 *   ?sheet=feedback  the customer feedback sheet on its own (no browser).
 *   ?google=reviews  the Google Business Profile's reviews (no browser).
 *   finance=1    writes the finance figures only. WITHOUT it the run also
 *                writes the variable-pay metrics, which are paused.
 *
 * A backfill — filling in months that are long gone — asks for the history
 * explicitly:
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD   the window the purchase and
 *                purchase-return reports are read for.
 *   ?revenueMonth=YYYY-MM   one calendar month of sales.
 * Both are only allowed together with finance=1: a window change moves the
 * pay cycle, and the pay cycle belongs to payroll.
 *
 * A bare request — no group, no sheet — runs EVERY group in ONE function
 * invocation. That is longer than a serverless function is allowed to run, so
 * it ends in FUNCTION_INVOCATION_TIMEOUT at the 300s mark, and it writes the
 * variable-pay metrics on the way, which are meant to stay frozen. Never call
 * it that way, not even to "see if it works".
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
// The browser's temporary folder has to be decided BEFORE the browser package
// is loaded, so this import comes before it on purpose: loading it sets the
// folder, and the browser package then records the same one for the browser's
// shared libraries and fonts.
import { useBrowserTempDir, writeFontConfig } from '../../../lib/browserTempDir.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import chromium from '@sparticuz/chromium';
import { runPetpoojaSync, REPORT_GROUPS, REPORT_NAMES } from '../../../scripts/petpooja-sync.mjs';
import { closeFinishedCycles } from '../../../scripts/close-variable-pay-cycles.mjs';
import { fetchGoogleSheetsData, googleSheetsConfigured } from '../../../lib/googleSheetsService.js';
import { parseInvoiceSheet, writeInvoiceSheet } from '../../../lib/invoiceSheet.js';
import { parseBackfillRequest } from '../../../lib/syncBackfill.js';
import { parseRefreshRequest } from '../../../lib/purchaseRefresh.js';
import { getSupabase } from '../../../lib/supabaseServer.js';
import {
  FEEDBACK_SHEET_ID,
  FEEDBACK_SHEET_NAME,
  FEEDBACK_SHEET_RANGE,
  parseFeedbackSheet,
  syncFeedback,
} from '../../../lib/feedbackSheet.js';
import { pullGoogleReviews } from '../../../lib/googleReviews.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function isAuthorized(req) {
  const expected = process.env.SYNC_SECRET;
  if (!expected) return false;
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const header = (req.headers.get('x-sync-secret') || '').trim();
  return bearer === expected || header === expected;
}

// Console capture.
//
// The sync engine reports its progress with plain console.log calls, and
// those lines are the only record of which reports were fetched. They are
// teed into the response so a scheduled run's summary is meaningful.
//
// This is patched ONCE at module scope, not per request. A serverless
// instance can be serving two requests at the same time (a manual trigger
// while the schedule fires), and a per-request patch would have the second
// request hijack the first one's capture — one request's log lines landing
// in the other's response. One shared slot is safe: in the worst case two
// overlapping runs share a log array, which is harmless, instead of one
// run's output being silently lost or the console left permanently patched.
const capture = { logs: null };

const originalLog = console.log;

const stringify = (a) => {
  if (typeof a === 'string') return a;
  try {
    return JSON.stringify(a);
  } catch {
    return String(a);
  }
};

const tee = (sink) => (...args) => {
  const line = args.map(stringify).join(' ');
  const target = capture.logs;
  if (target) {
    target.push(line);
    // Keep the array bounded — a long run can log a lot.
    if (target.length > 1000) target.splice(0, target.length - 1000);
  }
  sink(line);
};

console.log = tee(console.log);
console.warn = tee(console.warn);
console.error = tee(console.error);

// Chromium's own output goes straight to stderr — it does not use the
// console — so it is captured here as well. When the browser dies, that
// output is the only thing that says why: the signal, the failed check, the
// missing file.
const originalStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = (chunk, ...rest) => {
  const text = typeof chunk === 'string' ? chunk : String(chunk);
  const target = capture.logs;
  if (target) {
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      target.push(line);
    }
    if (target.length > 1000) target.splice(0, target.length - 1000);
  }
  return originalStderrWrite(chunk, ...rest);
};

async function handle(req) {
  const started = Date.now();

  if (!process.env.SYNC_SECRET) {
    return NextResponse.json(
      { ok: false, error: 'SYNC_SECRET is not configured' },
      { status: 500 },
    );
  }
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const logs = [];
  const push = (...args) => {
    const line = args.join(' ');
    logs.push(line);
    originalLog(line);
  };

  // The accountant's invoice sheet.
  //
  // It is a Google Sheet, not a Petpooja report, so it needs no browser and
  // no login — it is one API call. `?sheet=1` pulls it and stops there.
  //
  // It is its own request on purpose. The Petpooja groups each take a
  // serverless call of their own, and this one takes about a second, so
  // giving it its own call keeps it clear of the browser work and clear of
  // the time limit.
  if (new URL(req.url).searchParams.get('sheet') === '1') {
    return await pullInvoiceSheet(push, started);
  }

  // The Customer Feedback Form sheet.
  //
  // The sheet is the record — the same arrangement as the accountant's
  // invoice sheet. It is a Google Sheet, so it needs no browser and no
  // login: one API call.
  //
  // The site's own form writes into this sheet and then pulls it in, so a
  // response is in the books the moment it is saved. This step is the same
  // pull, for the rows that were typed into the sheet by hand.
  if (new URL(req.url).searchParams.get('sheet') === 'feedback') {
    return await pullFeedbackSheet(push, started);
  }

  // The Google reviews.
  //
  // They come from the Google Business Profile API, which reads the listing
  // **as a manager of it** — so this needs the site's own Google connection,
  // not the service account, and no browser at all.
  //
  // A listing that is not connected yet is **skipped**, not a failure: the
  // nightly run has to keep working whether or not the Business Profile is
  // set up.
  if (new URL(req.url).searchParams.get('google') === 'reviews') {
    return await pullGoogleReviewList(push, started);
  }

  // The sync engine writes its progress straight to the console. Tee it into
  // the response so the scheduler's summary shows which reports were fetched,
  // instead of only "ok: true".
  capture.logs = logs;
  try {
    // Serverless has no bundled browser and no display.
    process.env.PETPOOJA_HEADLESS = 'true';

    // Everything the browser writes goes into one folder of our own, and
    // that folder is set BEFORE the browser is unpacked.
    //
    // The order matters. The browser is unpacked into the system's temporary
    // folder, and on the serverless host that folder is only 512MB. If the
    // folder changes later, the browser is unpacked a SECOND time — and
    // `TMPDIR` survives between requests on a reused instance, so that second
    // copy happened on the next request and stayed there. Two copies of the
    // browser is ~300MB of a 512MB disk, and a full disk is what killed the
    // browser in the middle of a report.
    //
    // The folder also has to be the one the browser package recorded when it
    // was loaded, because that is where the browser will look for its shared
    // libraries (`libnspr4.so` and friends).
    //
    // `?tmp=legacy` leaves the browser in the system's own folder instead.
    // That is the arrangement that worked before, so it is the yardstick the
    // new one is measured against.
    const legacyTmp = new URL(req.url).searchParams.get('tmp') === 'legacy';
    if (legacyTmp) {
      // The arrangement that worked before the browser was given a folder of
      // its own: the browser, its libraries and its fonts all in /tmp.
      process.env.TMPDIR = '/tmp';
      process.env.HOME = '/tmp';
      process.env.FONTCONFIG_PATH = '/tmp/fonts';
      process.env.LD_LIBRARY_PATH = '/tmp/al2023/lib';
      push('🧪 Legacy temporary folder — the browser stays in /tmp.');
    } else {
      useBrowserTempDir();
    }

    // The software graphics stack (SwiftShader) is not needed to fill in a
    // login form or read a report, and on a single serverless CPU it is
    // expensive enough to stop the page from ever painting. Turning it off
    // also skips unpacking it.
    chromium.setGraphicsMode = false;
    const browserBinary = await chromium.executablePath();

    // The fonts have just been unpacked, so the font configuration is written
    // now — the one that came with them points at `/tmp/fonts`, which is not
    // where they are, and a browser with no fonts stops dead.
    writeFontConfig();

    // Chromium writes a core dump when it dies, and on this host that dump is
    // about 900MB on a 512MB disk. One crash fills the disk, and then every
    // browser after it fails for the wrong reason — it looks like the browser
    // cannot start, when in fact there is simply no room left.
    //
    // The dump is switched off by starting the browser through a one-line
    // wrapper that sets the core limit to zero. The wrapper replaces itself
    // with the browser, so the browser keeps its own process id.
    let browserPath = browserBinary;
    try {
      const launcher = join('/tmp/atelier-petpooja', 'chromium-no-core');
      // The browser's own path is written into the script: `exec "$@"` would
      // read the browser's first flag as an option of `exec` and refuse.
      writeFileSync(
        launcher,
        `#!/bin/sh\nulimit -c 0\nexec ${JSON.stringify(browserBinary)} "$@"\n`,
        { mode: 0o755 },
      );
      browserPath = launcher;
    } catch {
      // No permission or no shell — the browser is started as it is.
    }
    process.env.PETPOOJA_CHROMIUM_EXECUTABLE_PATH = browserPath;

    // Optional period override for backfills: ?start=YYYY-MM-DD&end=YYYY-MM-DD
    const params = new URL(req.url).searchParams;
    const start = params.get('start');
    const end = params.get('end');
    if (start && end) {
      process.env.SYNC_START_DATE = start;
      process.env.SYNC_END_DATE = end;
      push(`📅 Overriding period: ${start} → ${end}`);
    }

    // Which reports this run is asked for.
    //
    // ?group=<n>   one report group — this is how the nightly workflow calls it,
    //               one request per group, each with its own serverless run.
    // ?reports=a,b an explicit set of report names.
    // Neither one runs EVERY group in ONE function invocation. That is longer
    // than a serverless function is allowed to run, so it ends in
    // FUNCTION_INVOCATION_TIMEOUT at the 300s mark, and it writes the
    // variable-pay metrics on the way, which are meant to stay frozen. Never
    // call it that way, not even to "see if it works".
    const group = params.get('group');
    const reports = params.get('reports');

    // ?debug=1 makes the browser say out loud why it died. Chromium's own
    // output names the signal and the check that failed, which is the only
    // way to tell a crash from an out-of-memory kill.
    if (params.get('debug') === '1') {
      process.env.PETPOOJA_BROWSER_DEBUG = '1';
      push('🔎 Browser debug output is on.');
    }

    // The twice-weekly refresh of the last 90 days of purchases.
    //
    // The nightly run pulls the pay cycle that is running, so a bill is looked
    // at for a month after its date and never again. Petpooja lets a bill be
    // edited or cancelled up to 90 days after its date, so the books drift.
    // The refresh re-reads that window and puts them right.
    //
    // It is a finance run by definition: it must not touch the variable-pay
    // figures, the pay periods or the sales report, so it forces finance-only
    // on itself rather than trusting the caller to remember.
    const refresh = parseRefreshRequest(params, {
      groupReports: group ? REPORT_GROUPS[Number(group)] : null,
    });
    if (!refresh.ok) {
      return NextResponse.json(
        { ok: false, error: refresh.error, expected: refresh.expected },
        { status: refresh.status || 400 },
      );
    }

    // ?finance=1 runs the finance side only.
    //
    // The variable-pay metrics are paused, so a finance run writes nothing to
    // them: only the revenue split, the vendor bills and the money owed by
    // customers. The pay periods are left alone too — closing a cycle is a
    // payroll decision, and it is not one this run is allowed to make.
    //
    // A refresh is a finance run whether or not the caller said so.
    const financeOnly = params.get('finance') === '1' || refresh.refresh;
    if (financeOnly) {
      process.env.SYNC_FINANCE_ONLY = '1';
      push('💼 Finance-only run — the variable-pay figures are left alone.');
    }

    // A backfill asks for a window of history.
    //
    // The nightly run pulls the month that is running and the pay cycle that
    // is running; the months before them are never looked at. A backfill
    // names the window it wants, so the purchase and purchase-return reports
    // can be read for a month that is long gone, and the sales report can be
    // pulled for one calendar month by name.
    //
    // The rules are in lib/syncBackfill.js — a window change moves the pay
    // cycle, and the pay cycle belongs to payroll, so a backfill is only
    // ever allowed on a finance-only run.
    const backfill = parseBackfillRequest(params, { financeOnly });
    if (!backfill.ok) {
      return NextResponse.json(
        { ok: false, error: backfill.error, expected: backfill.expected },
        { status: backfill.status || 400 },
      );
    }
    if (backfill.backfill) {
      process.env.SYNC_START_DATE = backfill.from;
      process.env.SYNC_END_DATE = backfill.to;
      if (backfill.revenueMonth) process.env.SYNC_REVENUE_MONTH = backfill.revenueMonth;
      push(
        `🕰️ Backfill window: ${backfill.from} → ${backfill.to}` +
        `${backfill.revenueMonth ? ` (sales for ${backfill.revenueMonth})` : ''}.`,
      );
    }

    // Chromium flags.
    //
    // The @sparticuz/chromium default is `--single-process` + `--no-zygote`:
    // the browser, the GPU and the renderer all run in ONE process, so a
    // fault anywhere in it takes the whole browser down ("Target page,
    // context or browser has been closed").
    //
    // Removing `--single-process` is NOT an option here: this is a headless
    // *shell* build, and without it the renderer cannot start at all
    // ("browserContext.newPage: Target crashed"). The two have to go
    // together, and this build cannot do without the single process.
    //
    // `--disable-dev-shm-usage` was missing from the serverless args (the
    // local run has always passed it). The serverless container has a tiny
    // /dev/shm, and Chromium is unhappy when it runs out.
    //
    // The modes below exist so the flags can be measured on the server
    // rather than argued about. `?chromium=<mode>` picks one.
    const chromiumMode = params.get('chromium') || 'default';
    const args = chromium.args.slice();
    if (chromiumMode === 'zygote') {
      // Both process flags removed — the "normal" Chromium process model.
      const i = args.indexOf('--single-process');
      if (i !== -1) args.splice(i, 1);
      const j = args.indexOf('--no-zygote');
      if (j !== -1) args.splice(j, 1);
    }
    if (chromiumMode !== 'no-shm') {
      args.push('--disable-dev-shm-usage');
    }

    // The disk cache is the biggest thing a browser leaves behind. The
    // bundled default is 32MB, and the serverless host gives the whole
    // temporary folder 512MB — so ten report groups' worth of profiles fill
    // the disk, and then the browser cannot even start. Two megabytes is
    // plenty for reading a report.
    const cacheArg = args.findIndex((a) => a.startsWith('--disk-cache-size='));
    const smallCache = '--disk-cache-size=2097152';
    if (cacheArg !== -1) args[cacheArg] = smallCache;
    else args.push(smallCache);

    process.env.PETPOOJA_CHROMIUM_ARGS = JSON.stringify([
      ...args,
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
    ]);
    push(`🧭 Chromium mode: ${chromiumMode}`);

    // A full sync is longer than a serverless function may run, so the
    // reports are split into groups that each fit. ?group=1..10 runs one
    // group; ?reports=captain,pax runs an explicit set; no parameter runs
    // everything (the local-computer path).
    //
    // The group and the report list are read further up, because the refresh
    // has to know which reports it is being asked to pull.

    // Session hand-over between groups.
    //
    // The run is split into ten serverless calls, and Petpooja turns away a
    // login from an address it does not recognise as the one holding the
    // live session — which every group after the first is, because serverless
    // invocations do not share an egress address.
    //
    // So the first group logs in and leaves its session behind; the next
    // group restores it and goes straight to the dashboard. The session lives
    // in the database, so any group can pick it up — including the first
    // group of a run that was interrupted.
    //
    // `?keepSession=1` asks this group to leave the session alive for its
    // successor. The last group of the run leaves it out, so the account is
    // logged out and free for tomorrow.
    const keepSession = params.get('keepSession') === '1';

    // An unknown group or report name is rejected outright. Silently running
    // nothing would answer 200 with "0 reports" — a scheduler would call that
    // a successful run while no metric was ever fetched.
    if (group && !REPORT_GROUPS[Number(group)]) {
      return NextResponse.json(
        {
          ok: false,
          error: `Unknown report group "${group}".`,
          knownGroups: Object.keys(REPORT_GROUPS),
        },
        { status: 400 },
      );
    }
    if (reports) {
      const unknown = reports.split(',').map((s) => s.trim()).filter(Boolean)
        .filter((name) => !REPORT_NAMES.includes(name));
      if (unknown.length > 0) {
        return NextResponse.json(
          {
            ok: false,
            error: `Unknown report(s): ${unknown.join(', ')}.`,
            knownReports: REPORT_NAMES,
          },
          { status: 400 },
        );
      }
    }

    if (group) {
      process.env.SYNC_GROUP = group;
      push(`📦 Report group: ${group} (${REPORT_GROUPS[Number(group)].join(', ')})`);
    }
    if (reports) {
      process.env.SYNC_REPORTS = reports;
      push(`📦 Reports: ${reports}`);
    }

    // Which group is the LAST of this run.
    //
    // A couple of things happen once per run rather than once per group — the
    // Google Sheets customer-feedback pull, for one. They belong to the last
    // group, and "the last group" depends on which groups the run includes:
    // the nightly run does not include group 13, so its last group is 12.
    //
    // The scheduler says which group is last. Without that, the highest group
    // number would be used, and a run that stopped short of it would never
    // do the once-per-run work.
    const lastGroup = params.get('lastGroup');
    if (lastGroup && REPORT_GROUPS[Number(lastGroup)]) {
      process.env.SYNC_LAST_GROUP = lastGroup;
      push(`🏁 Last group of this run: ${lastGroup}`);
    }

    // The refresh sets its own window and its own reports.
    //
    // The reports are set because a refresh with no group named would
    // otherwise run every report in one function invocation — which is longer
    // than a serverless function may run, and which would pull the sales
    // report that a refresh must never touch.
    if (refresh.refresh) {
      process.env.SYNC_START_DATE = refresh.from;
      process.env.SYNC_END_DATE = refresh.to;
      process.env.SYNC_PURCHASE_REFRESH = '1';
      process.env.SYNC_REPORTS = refresh.reports.join(',');
      push(`🔄 Refresh: the last ${refresh.days} days of purchases (${refresh.from} → ${refresh.to}).`);
      push(`🔄 Reports: ${refresh.reports.join(', ')}.`);
    }

    push('🌐 Starting Petpooja sync on Vercel...');
    // The engine returns only counts of what it fetched. The live session
    // stays in the database and never travels in the response, which the
    // workflow prints into its log.
    const outcome = await runPetpoojaSync({ keepSession });

    // A pay cycle that has ended must be locked with its figures frozen.
    // The office-computer runner did this after every sync; the hosted run
    // has to do it too, or the closed cycles would never get a snapshot.
    //
    // A finance-only run does not do it: closing a cycle freezes the
    // variable-pay figures, and the variable pay side is paused — that
    // decision belongs to a person.
    let closed = null;
    if (financeOnly) {
      push('⏸️ The pay cycles are left alone — closing one is a payroll decision.');
    } else {
      try {
        closed = await closeFinishedCycles({ generatedBy: 'hosted-sync' });
        if (closed?.closed > 0) {
          push(`🔒 Closed ${closed.closed} finished pay cycle(s).`);
        }
      } catch (closeErr) {
        // The figures synced fine — a cycle that could not be closed can be
        // closed by hand from the attainment dashboard.
        console.error(`⚠️ Could not close finished pay cycles: ${closeErr.message}`);
      }
    }

    // A group that fetched nothing must not look like a success. The
    // scheduler retries on a failing status, so the answer has to be
    // truthful about what actually happened.
    if (outcome && outcome.successfulReports === 0) {
      return NextResponse.json(
        {
          ok: false,
          durationMs: Date.now() - started,
          error: `No report could be fetched (${outcome.failedReports} failed).`,
          closedCycles: closed?.closed ?? 0,
          logs: logs.slice(-200),
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - started,
      closedCycles: closed?.closed ?? 0,
      logs: logs.slice(-200),
    });
  } catch (err) {
    console.error('Sync failed:', err);
    return NextResponse.json(
      {
        ok: false,
        durationMs: Date.now() - started,
        error: err?.message || String(err),
        logs: logs.slice(-200),
      },
      { status: 500 },
    );
  } finally {
    capture.logs = null;
  }
}

export async function GET(req) {
  return handle(req);
}

export async function POST(req) {
  return handle(req);
}

/**
 * Pull the customer feedback sheet and write it into the books.
 *
 * The sheet is the record — the same arrangement as the accountant's invoice
 * sheet. The site's own form writes into it and then pulls it in, so a
 * response is in the books the moment it is saved; this step is the same
 * pull, for the rows typed into the sheet by hand.
 *
 * @see lib/feedbackSheet.js
 */
async function pullFeedbackSheet(push, started) {
  // Not configured is not a failure — the same rule as the invoice sheet. The
  // nightly run has to keep working whether or not the sheet is set up yet.
  if (!googleSheetsConfigured()) {
    push('📝 The customer feedback sheet is not set up yet — nothing was pulled.');
    push('   It needs GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY on the server.');
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'Google Sheets is not configured.',
      durationMs: Date.now() - started,
    });
  }

  try {
    push('📝 Reading the customer feedback sheet...');
    // The whole tab. The columns are found **by heading**, so a range that
    // stopped one column short would lose that column quietly.
    const rows = await fetchGoogleSheetsData({
      spreadsheetId: FEEDBACK_SHEET_ID,
      sheetName: FEEDBACK_SHEET_NAME,
      range: FEEDBACK_SHEET_RANGE,
    });

    const parsed = parseFeedbackSheet(rows);
    if (!parsed.ok) {
      push(`❌ The feedback sheet could not be read: ${parsed.error}`);
      return NextResponse.json(
        { ok: false, error: parsed.error, durationMs: Date.now() - started },
        { status: 500 },
      );
    }

    // The server's own client, which asks for **no-store** on every read.
    //
    // A bare client would let Next.js cache the GETs on disk — and the cache
    // survives a restart and a deployment. A pull that reads a stale copy of
    // the orders would attach a response to the wrong order, or to none.
    const supabase = getSupabase();
    const written = await syncFeedback(supabase, parsed.responses);

    push(
      `✓ Feedback sheet: ${written.responses} response(s) written — ` +
        `${written.linked} matched to an order, ${written.unlinked} without one.`,
    );

    // A row that could not be identified is **reported**, not quietly dropped
    // and not quietly written again every night. It says which line, so it
    // can be found and fixed.
    for (const row of parsed.skipped || []) {
      push(`↷ Line ${row.line} was not counted — ${row.reason}.`);
    }

    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - started,
      ...written,
      skipped: parsed.skipped || [],
    });
  } catch (err) {
    const message = err?.message || String(err);
    push(`❌ The feedback sheet could not be pulled: ${message}`);
    return NextResponse.json(
      { ok: false, error: message, durationMs: Date.now() - started },
      { status: 500 },
    );
  }
}

/**
 * Pull the Google reviews and write them into the books.
 *
 * The listing is read **as a manager of it**, through the site's own Google
 * connection. Nothing here is a Petpooja report, so there is no browser and
 * no login.
 *
 * A Business Profile that is not connected is **skipped**: the nightly run
 * must keep working whether or not it has been set up.
 */
async function pullGoogleReviewList(push, started) {
  const supabase = getSupabase();

  try {
    push('⭐ Reading the Google reviews...');
    const written = await pullGoogleReviews(supabase);

    push(
      `✓ Google: ${written.reviews} review(s) written — Google's own rating ` +
        `${written.averageRating ?? '—'} from ${written.totalReviewCount ?? '—'} ratings ` +
        `on "${written.listing}".`,
    );
    if (written.account) push(`   Read as the account "${written.account}".`);

    // A review that could not be identified is **reported**, not quietly
    // dropped and not quietly written again every night.
    for (const row of written.refused || []) {
      push(`↷ One review was not counted — ${row.reason}.`);
    }

    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - started,
      ...written,
    });
  } catch (err) {
    const message = err?.message || String(err);

    // Not connected is not a failure — it is the same rule as the sheets.
    if (err?.code === 'NOT_CONNECTED' || err?.code === 'NO_BUSINESS_SCOPE') {
      push(`↷ The Google reviews were not pulled — ${message}`);
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: message,
        durationMs: Date.now() - started,
      });
    }

    push(`❌ The Google reviews could not be pulled: ${message}`);
    return NextResponse.json(
      { ok: false, error: message, durationMs: Date.now() - started },
      { status: 500 },
    );
  }
}

/**
 * Pull the accountant's invoice sheet and write it into the books.
 *
 * The sheet is the only place an amount is written. A line that is already
 * in the ledger — the same invoice number — is left alone, so a bill that
 * exists both in Petpooja and in the sheet is counted once.
 *
 * The service account and the sheet's own settings are read from the
 * environment:
 *
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL   the service account
 *   GOOGLE_PRIVATE_KEY             its key (the PEM content) — or
 *   GOOGLE_PRIVATE_KEY_PATH        its key (a file on a local machine)
 *   INVOICE_SHEET_SPREADSHEET_ID   the sheet — or GOOGLE_SHEETS_SPREADSHEET_ID
 *   INVOICE_SHEET_NAME             the tab — default 'Invoices'
 */
async function pullInvoiceSheet(push, started) {
  // Not configured is not a failure. The nightly run has to keep working
  // whether or not the sheet has been set up yet, and the log line says
  // plainly that the sheet was skipped.
  if (!googleSheetsConfigured()) {
    push('📄 The invoice sheet is not set up yet — nothing was pulled.');
    push('   It needs GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY on the server.');
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'The invoice sheet is not configured.',
      durationMs: Date.now() - started,
    });
  }

  const spreadsheetId =
    process.env.INVOICE_SHEET_SPREADSHEET_ID || process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const sheetName = process.env.INVOICE_SHEET_NAME || 'Invoices';
  // The whole tab, not a slice of it. The columns are found **by heading**, so
  // a range that stopped one column short would lose that column quietly —
  // and a column that is lost is a bill that is lost.
  const range = 'A:AZ';

  if (!spreadsheetId) {
    push('📄 The invoice sheet has no spreadsheet id — nothing was pulled.');
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'INVOICE_SHEET_SPREADSHEET_ID is not set.',
      durationMs: Date.now() - started,
    });
  }

  try {
    push('📄 Reading the accountant invoice sheet...');
    const rows = await fetchGoogleSheetsData({ spreadsheetId, sheetName, range });

    const parsed = parseInvoiceSheet(rows);
    if (!parsed.ok) {
      push(`❌ The invoice sheet could not be read: ${parsed.error}`);
      return NextResponse.json(
        { ok: false, error: parsed.error, durationMs: Date.now() - started },
        { status: 500 },
      );
    }

    push(`📄 ${parsed.entries.length} invoice(s) on the sheet, ${parsed.skipped.length} row(s) skipped.`);
    for (const row of parsed.skipped) {
      push(`   ↷ Row ${row.line}: ${row.reason}`);
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
    const written = await writeInvoiceSheet(supabase, parsed.entries);

    push(
      `✓ Invoice sheet: ${written.expensesWritten} bill(s) and ${written.pettyWritten} petty entr(ies) written, ` +
        `${written.expensesUpdated + written.pettyUpdated} updated, ` +
        `${written.skippedExisting} already on record.`,
    );

    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - started,
      invoices: parsed.entries.length,
      skippedRows: parsed.skipped,
      ...written,
    });
  } catch (err) {
    const message = err?.message || String(err);
    push(`❌ The invoice sheet could not be pulled: ${message}`);
    return NextResponse.json(
      { ok: false, error: message, durationMs: Date.now() - started },
      { status: 500 },
    );
  }
}
