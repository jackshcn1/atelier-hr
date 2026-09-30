// Close finished variable pay cycles and freeze their attainment figures.
//
// A cycle runs from the 20th to the 19th. Once the 19th has passed, the cycle's
// numbers should stop moving: we lock the period and write a snapshot so the
// employee and admin dashboards always show the same figures for a closed
// cycle, no matter what is synced or edited afterwards.
//
// Runs on the office PC right after the Petpooja sync, so the snapshot is taken
// from data that is already up to date. The admin can still regenerate any
// cycle's snapshot by hand from the attainment dashboard.

import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadLocalConfig() {
  const cfgPath = join(__dirname, 'petpooja-config.json');
  if (!existsSync(cfgPath)) {
    console.error('❌ Missing scripts/petpooja-config.json');
    process.exit(1);
  }
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
  for (const [k, v] of Object.entries(cfg)) {
    if (process.env[k] === undefined) process.env[k] = String(v ?? '');
  }
  return cfg;
}

// The 19th is the last day of a cycle, so a period may be closed once today is
// strictly past period_end. Everything is compared in UTC to stay stable
// regardless of the machine's timezone.
function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

export async function closeFinishedCycles(options = {}) {
  const cfg = loadLocalConfig();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase URL or service role key.');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const today = todayUtc();
  const generatedBy = options.generatedBy || 'office-pc-auto-close';

  console.log(`📆 Checking for cycles to close (today is ${today})...`);

  const { data: periods, error } = await supabase
    .from('variable_pay_periods')
    .select('id, period_start, period_end, status, snapshot_at')
    .lt('period_end', today)          // cycle has fully ended
    .eq('status', 'open');             // never locked or paid

  if (error) throw new Error(`Could not read periods: ${error.message}`);
  if (!periods || periods.length === 0) {
    console.log('  ✓ No cycles waiting to be closed.');
    return { closed: 0, details: [] };
  }

  const details = [];
  for (const p of periods) {
    console.log(`  🔒 Closing cycle ${p.period_start} → ${p.period_end}...`);

    // Snapshot first, so a failed write can never leave a locked period with
    // no frozen figures behind it.
    const { data: rows, error: snapErr } = await supabase.rpc(
      'generate_variable_pay_snapshot',
      { p_period_id: p.id, p_generated_by: generatedBy }
    );

    if (snapErr) {
      console.error(`     ❌ Snapshot failed for period #${p.id}: ${snapErr.message}`);
      details.push({ period_id: p.id, ok: false, error: snapErr.message });
      continue;
    }

    const { error: lockErr } = await supabase
      .from('variable_pay_periods')
      .update({
        status: 'locked',
        locked_at: new Date().toISOString(),
        locked_by: generatedBy
      })
      .eq('id', p.id);

    if (lockErr) {
      console.error(`     ❌ Could not lock period #${p.id}: ${lockErr.message}`);
      details.push({ period_id: p.id, ok: false, error: lockErr.message });
      continue;
    }

    console.log(`     ✓ Snapshot written (${rows ?? 0} metric rows) and period locked.`);
    details.push({ period_id: p.id, ok: true, rows: rows ?? 0 });
  }

  const closed = details.filter(d => d.ok).length;
  console.log(`  ${closed === 0 ? '✓ Nothing to close.' : `✅ Closed ${closed} cycle(s).`}`);
  return { closed, details };
}

if (process.argv[1]?.endsWith('close-variable-pay-cycles.mjs')) {
  closeFinishedCycles()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Fatal error while closing cycles:', err.message);
      process.exit(1);
    });
}