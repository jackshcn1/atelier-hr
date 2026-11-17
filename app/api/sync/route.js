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
 */
import { NextResponse } from 'next/server';
import { mkdirSync } from 'node:fs';
import chromium from '@sparticuz/chromium';
import { runPetpoojaSync, REPORT_GROUPS, REPORT_NAMES } from '../../../scripts/petpooja-sync.mjs';
import { closeFinishedCycles } from '../../../scripts/close-variable-pay-cycles.mjs';

// One folder for everything the browser writes: its profile, its cache, the
// files it downloads, and the browser itself.
const RUN_TMP_DIR = '/tmp/atelier-petpooja';

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
    try {
      mkdirSync(RUN_TMP_DIR, { recursive: true });
      process.env.TMPDIR = RUN_TMP_DIR;
    } catch {
      // No permission — the system folder will have to do.
    }

    // The software graphics stack (SwiftShader) is not needed to fill in a
    // login form or read a report, and on a single serverless CPU it is
    // expensive enough to stop the page from ever painting. Turning it off
    // also skips unpacking it.
    chromium.setGraphicsMode = false;
    process.env.PETPOOJA_CHROMIUM_EXECUTABLE_PATH = await chromium.executablePath();

    // Optional period override for backfills: ?start=YYYY-MM-DD&end=YYYY-MM-DD
    const params = new URL(req.url).searchParams;
    const start = params.get('start');
    const end = params.get('end');
    if (start && end) {
      process.env.SYNC_START_DATE = start;
      process.env.SYNC_END_DATE = end;
      push(`📅 Overriding period: ${start} → ${end}`);
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
    const group = params.get('group');
    const reports = params.get('reports');

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

    push('🌐 Starting Petpooja sync on Vercel...');
    // The engine returns only counts of what it fetched. The live session
    // stays in the database and never travels in the response, which the
    // workflow prints into its log.
    const outcome = await runPetpoojaSync({ keepSession });

    // A pay cycle that has ended must be locked with its figures frozen.
    // The office-computer runner did this after every sync; the hosted run
    // has to do it too, or the closed cycles would never get a snapshot.
    let closed = null;
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
