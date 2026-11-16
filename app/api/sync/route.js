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
import chromium from '@sparticuz/chromium';
import { runPetpoojaSync, REPORT_GROUPS, REPORT_NAMES } from '../../../scripts/petpooja-sync.mjs';

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
    process.env.PETPOOJA_CHROMIUM_EXECUTABLE_PATH = await chromium.executablePath();
    process.env.PETPOOJA_CHROMIUM_ARGS = JSON.stringify([
      ...chromium.args,
      '--disable-blink-features=AutomationControlled',
    ]);

    // Optional period override for backfills: ?start=YYYY-MM-DD&end=YYYY-MM-DD
    const params = new URL(req.url).searchParams;
    const start = params.get('start');
    const end = params.get('end');
    if (start && end) {
      process.env.SYNC_START_DATE = start;
      process.env.SYNC_END_DATE = end;
      push(`📅 Overriding period: ${start} → ${end}`);
    }

    // A full sync is longer than a serverless function may run, so the
    // reports are split into groups that each fit. ?group=1|2|3|4 runs one
    // group; ?reports=captain,pax runs an explicit set; no parameter runs
    // everything (the local-computer path).
    const group = params.get('group');
    const reports = params.get('reports');

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
    const result = await runPetpoojaSync();

    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - started,
      result,
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
