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
import { runPetpoojaSync } from '../../../scripts/petpooja-sync.mjs';

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
    console.log(line);
  };

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
    // reports are split into groups that each fit. ?group=1|2|3 runs one
    // group; ?reports=captain,pax runs an explicit set; no parameter runs
    // everything (the local-computer path).
    const group = params.get('group');
    const reports = params.get('reports');
    if (group) {
      process.env.SYNC_GROUP = group;
      push(`📦 Report group: ${group}`);
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
      logs: logs.slice(-80),
    });
  } catch (err) {
    console.error('Sync failed:', err);
    return NextResponse.json(
      {
        ok: false,
        durationMs: Date.now() - started,
        error: err?.message || String(err),
        logs: logs.slice(-80),
      },
      { status: 500 },
    );
  }
}

export async function GET(req) {
  return handle(req);
}

export async function POST(req) {
  return handle(req);
}
