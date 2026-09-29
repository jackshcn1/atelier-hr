// One-time setup for the local Petpooja sync.
// Prompts for credentials and writes scripts/petpooja-config.json (git-ignored).

import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cfgPath = join(__dirname, 'petpooja-config.json');

const rl = createInterface({ input, output });

function ask(question, { hidden = false } = {}) {
  if (hidden) {
    // Suppress echo while typing the password.
    return new Promise(resolve => {
      const stdin = process.stdin;
      const stdout = process.stdout;
      let data = '';
      stdout.write(question);
      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding('utf8');
      const onData = (char) => {
        if (char === '\n' || char === '\r' || char === '') {
          stdout.write('\n');
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          resolve(data.trim());
        } else if (char === '') { // Ctrl+C
          process.exit(0);
        } else if (char === '') { // backspace
          if (data.length > 0) {
            data = data.slice(0, -1);
            stdout.write('\b \b');
          }
        } else {
          data += char;
        }
      };
      stdin.on('data', onData);
    });
  }
  return rl.question(question);
}

console.log('\n🔧 Atelier HRMS — Petpooja Sync Setup\n');
console.log('This stores your Petpooja login and Supabase key on THIS computer only.');
console.log('They are written to scripts/petpooja-config.json, which is never uploaded to GitHub.\n');

const supabaseUrl = await ask('1. Supabase Project URL [https://wzxswmopfxnucmeygqeg.supabase.co]: ');
const supabaseKey = await ask('2. Supabase service_role (secret) key: ', { hidden: true });
const petpoojaEmail = await ask('3. Petpooja login email / username: ');
const petpoojaPassword = await ask('4. Petpooja password: ', { hidden: true });

const headlessAnswer = await ask('\n5. Run the sync with a hidden browser window? (y/N): ');
const headless = /^y(es)?$/i.test(headlessAnswer.trim()) ? 'true' : 'false';

const config = {
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl.trim() || 'https://wzxswmopfxnucmeygqeg.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: supabaseKey.trim(),
  PETPOOJA_EMAIL: petpoojaEmail.trim(),
  PETPOOJA_PASSWORD: petpoojaPassword,
  PETPOOJA_HEADLESS: headless
};

writeFileSync(cfgPath, JSON.stringify(config, null, 2), 'utf8');
rl.close();

console.log('\n✅ Configuration saved to scripts/petpooja-config.json');
console.log('   Hidden browser window:', headless === 'true' ? 'yes' : 'no (you will see Chrome open briefly)');
console.log('\nNext step — install the browser engine once:');
console.log('   npm install playwright');
console.log('\nThen test the sync:');
console.log('   npm run sync:petpooja\n');
