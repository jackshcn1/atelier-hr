// One-time setup for the local Petpooja sync.
// Prompts for credentials and writes scripts/petpooja-config.json (git-ignored).

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stdin, stdout } from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cfgPath = join(__dirname, 'petpooja-config.json');

// Read lines from stdin ourselves rather than using readline.
//
// readline/promises consumes and closes its input after the first question
// when stdin is a pipe, and muting output to hide a password corrupts the
// line state. Doing it by hand behaves identically in a real console window
// and under piping, and lets us hide typed characters cleanly.
let buffer = '';
let pendingResolve = null;
let ended = false;

// Hand a line to whoever is waiting, if one is available. This is re-checked
// on every read because data can arrive before a question is even asked.
function deliverLine() {
  if (!pendingResolve) return;
  const nl = buffer.indexOf('\n');
  if (nl !== -1) {
    const line = buffer.slice(0, nl).replace(/\r$/, '');
    buffer = buffer.slice(nl + 1);
    const r = pendingResolve;
    pendingResolve = null;
    r(line);
  } else if (ended) {
    const r = pendingResolve;
    pendingResolve = null;
    r(buffer);
    buffer = '';
  }
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { buffer += chunk; deliverLine(); });
process.stdin.on('end', () => { ended = true; deliverLine(); });
process.stdin.resume();

function readLine() {
  return new Promise((resolve) => { pendingResolve = resolve; deliverLine(); });
}

async function ask(question, { hidden = false } = {}) {
  process.stdout.write(question);

  if (hidden) {
    // Show a fixed-width mask so it's obvious the terminal is live.
    const onData = (chunk) => {
      const printable = chunk.replace(/[\r\n]/g, '').length;
      if (printable > 0) process.stdout.write('*'.repeat(printable));
    };
    process.stdin.on('data', onData);
    const answer = await readLine();
    process.stdin.off('data', onData);
    process.stdout.write('\n');
    return answer;
  }

  return (await readLine()).replace(/\r$/, '');
}

console.log('\n🔧 Atelier HRMS — Petpooja Sync Setup\n');
console.log('This stores your Petpooja login and Supabase key on THIS computer only.');
console.log('They are written to scripts/petpooja-config.json, which is never uploaded to GitHub.\n');

const supabaseUrl = await ask('1. Supabase Project URL [https://wzxswmopfxnucmeygqeg.supabase.co]: ');
const supabaseKey = await ask('2. Supabase service_role (secret) key: ', { hidden: true });
const petpoojaEmail = await ask('3. Petpooja login email / username: ');
const petpoojaPassword = await ask('4. Petpooja password: ', { hidden: true });
const headlessAnswer = await ask('\n5. Run the sync with a hidden browser window? (y/N): ');

if (!supabaseKey.trim() || !petpoojaEmail.trim() || !petpoojaPassword) {
  console.error('\n❌ Setup was interrupted — some answers were empty, so nothing was saved.');
  console.error('   Close this window and double-click SETUP-PETPOOJA-SYNC.bat again.');
  process.exit(1);
}

const headless = /^y(es)?$/i.test(headlessAnswer.trim()) ? 'true' : 'false';

const config = {
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl.trim() || 'https://wzxswmopfxnucmeygqeg.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: supabaseKey.trim(),
  PETPOOJA_EMAIL: petpoojaEmail.trim(),
  PETPOOJA_PASSWORD: petpoojaPassword,
  PETPOOJA_HEADLESS: headless
};

writeFileSync(cfgPath, JSON.stringify(config, null, 2), 'utf8');
process.stdin.pause();

console.log('\n✅ Configuration saved to scripts/petpooja-config.json');
console.log('   Hidden browser window:', headless === 'true' ? 'yes' : 'no (you will see Chrome open briefly)');
console.log('\nNext step — test the sync by double-clicking:');
console.log('   scripts\\RUN-SYNC-NOW.bat\n');
