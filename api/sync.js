/**
 * api/sync.js — Vercel serverless entry point for the Petpooja daily sync.
 *
 * Why this exists:
 *   Petpooja's edge blocks datacenter IP ranges with a raw nginx 403, so a
 *   GitHub Actions runner cannot reach billing.petpooja.com. Vercel (AWS
 *   egress) is allowed, so the browser work happens here and the scheduler
 *   calls this function.
 *
 * Security: the endpoint runs a payroll-affecting job, so it requires a
 * shared secret header (SYNC_SECRET). Without it the call is rejected.
 *
 * NOTE: the filename matters. scripts/petpooja-sync.mjs only auto-runs when
 * its own basename is the CLI entry, so importing it from here is safe.
 */
import chromium from '@sparticuz/chromium';
import { runPetpoojaSync } from '../scripts/petpooja-sync.mjs';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  const started = Date.now();

  // ---- authenticate ----
  const expected = process.env.SYNC_SECRET;
  const provided = req.headers['x-sync-secret'];
  if (!expected) {
    return res.status(500).json({ ok: false, error: 'SYNC_SECRET is not configured' });
  }
  if (provided !== expected) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const logs = [];
  const push = (...args) => {
    const line = args.join(' ');
    logs.push(line);
    console.log(line);
  };

  try {
    // ---- serverless browser setup ----
    process.env.PETPOOJA_HEADLESS = 'true';
    process.env.PETPOOJA_CHROMIUM_EXECUTABLE_PATH = await chromium.executablePath();
    process.env.PETPOOJA_CHROMIUM_ARGS = JSON.stringify([
      ...chromium.args,
      '--disable-blink-features=AutomationControlled',
    ]);

    // Optional period override for backfills: ?start=YYYY-MM-DD&end=YYYY-MM-DD
    const start = req.query?.start || req.body?.start;
    const end = req.query?.end || req.body?.end;
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
