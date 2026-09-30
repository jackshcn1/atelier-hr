// Failsafe Daily Sync Runner
// Checks if today's sync has already completed successfully.
// If already done (e.g. at system boot), it skips without doing unnecessary work.
// If not done by 12:00 PM (or when triggered), it runs the sync engine.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPetpoojaSync } from './petpooja-sync.mjs';
import { closeFinishedCycles } from './close-variable-pay-cycles.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const stateFile = join(__dirname, 'last-successful-sync.json');

function getTodayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function main() {
  const today = getTodayStr();
  console.log(`\n======================================================`);
  console.log(`⏰ Atelier Smart Daily Sync Trigger [${new Date().toLocaleTimeString('en-IN')}]`);
  console.log(`======================================================`);

  if (existsSync(stateFile)) {
    try {
      const state = JSON.parse(readFileSync(stateFile, 'utf8'));
      if (state.lastDate === today && state.status === 'success') {
        console.log(`✅ Sync has ALREADY succeeded today (${today}) at ${state.timestamp}.`);
        console.log(`⚡ Skipping 12 PM redundant run to preserve resources.`);
        process.exit(0);
      }
    } catch {}
  }

  console.log(`🚀 No successful sync recorded for today (${today}). Starting sync now...`);
  try {
    await runPetpoojaSync();

    // Now that today's numbers are in, lock and snapshot any cycle that has
    // already ended. Doing it here rather than on a timer means a closed cycle
    // is always frozen against the same data the sync just pulled.
    try {
      await closeFinishedCycles();
    } catch (closeErr) {
      // A failed close must not mark the whole run as failed — the data itself
      // synced fine and the admin can close or regenerate the cycle by hand.
      console.error('⚠️ Could not close finished pay cycles:', closeErr.message);
    }

    writeFileSync(stateFile, JSON.stringify({
      lastDate: today,
      status: 'success',
      timestamp: new Date().toLocaleTimeString('en-IN')
    }, null, 2));
    console.log(`💾 Recorded successful sync state for ${today}.`);
    process.exit(0);
  } catch (err) {
    console.error(`❌ Sync encountered an error:`, err.message);
    process.exit(1);
  }
}

main();
