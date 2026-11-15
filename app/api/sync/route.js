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
import chromium from '@sparticuz/chromium';
import { runPetpoojaSync } from '../../../scripts/petpooja-sync.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function authorized(req) {
  const expected = process.env.SYNC_SECRET;
  if (!expected) return false;
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const header = (req.headers['x-sync-secret'] || '').trim();
  return bearer === expected || header === expected;
}

async function run(req, res) {
  const started = Date.now();

  if (!process.env.SYNC_SECRET) {
    return res.status(500).json({ ok: false, error: 'SYNC_SECRET is not configured' });
  }
  if (!authorized(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
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
    const src = { ...(req.query || {}), ...(req.body || {}) };
    const start = src.start || src.periodStart;
    const end = src.end || src.periodEnd;
    if (start && end) {
      process.env.SYNC_START_DATE = String(start);
      process.env.SYNC_END_DATE = String(end);
      push(`📅 Overriding period: ${start} → ${end}`);
    }

    push('🌐 Starting Petpooja sync on Vercel...');
    const result = await runPetpoojaSync();

    return res.status(200).json({
      ok: true,
      durationMs: Date.now() - started,
      result,
      logs: logs.slice(-80),
    });
  } catch (err) {
    console.error('Sync failed:', err);
    return res.status(500).json({
      ok: false,
      durationMs: Date.now() - started,
      error: err?.message || String(err),
      logs: logs.slice(-80),
    });
  }
}

export async function GET(req, res) {
  return run(req, res);
}

export async function POST(req, res) {
  return run(req, res);
}
