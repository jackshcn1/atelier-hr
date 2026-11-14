/**
 * ci-write-petpooja-config.mjs
 *
 * Builds scripts/petpooja-config.json from environment variables so the sync
 * engine can run on a CI runner (GitHub Actions), where that file is gitignored
 * and therefore absent.
 *
 * The sync engine reads the config file and lets real env vars win, so values
 * here are a fallback for anything not already exported.
 *
 * Required env (GitHub Actions secrets):
 *   PETPOOJA_EMAIL, PETPOOJA_PASSWORD
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional env:
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL      + GOOGLE_PRIVATE_KEY_B64 (base64 of the
 *                                    service-account JSON; decoded to a temp
 *                                    file and referenced via GOOGLE_PRIVATE_KEY_PATH)
 *   GOOGLE_SHEETS_SPREADSHEET_ID, GOOGLE_SHEETS_SHEET_NAME, GOOGLE_SHEETS_RANGE
 *   SMTP_USER, SMTP_PASS, NOTIFICATION_EMAIL
 *   PETPOOJA_HEADLESS                 'true' to force headless (default false)
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const CONFIG_PATH = path.join('scripts', 'petpooja-config.json');

const env = process.env;
const missing = [];

for (const key of ['PETPOOJA_EMAIL', 'PETPOOJA_PASSWORD']) {
  if (!env[key]) missing.push(key);
}
if (!env.SUPABASE_SERVICE_ROLE_KEY && !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  missing.push('SUPABASE_SERVICE_ROLE_KEY');
}

if (missing.length) {
  console.error(`❌ Missing required environment: ${missing.join(', ')}`);
  process.exit(1);
}

const cfg = {
  NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL || 'https://wzxswmopfxnucmeygqeg.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY || '',
  PETPOOJA_EMAIL: env.PETPOOJA_EMAIL,
  PETPOOJA_PASSWORD: env.PETPOOJA_PASSWORD,
  PETPOOJA_HEADLESS: env.PETPOOJA_HEADLESS || 'false',
  GOOGLE_SHEETS_SPREADSHEET_ID: env.GOOGLE_SHEETS_SPREADSHEET_ID || '1M0jVGEh1aekFYnMtVkHSA4oobZq5Pg1i3-D6TenF9kU',
  GOOGLE_SHEETS_SHEET_NAME: env.GOOGLE_SHEETS_SHEET_NAME || 'Sheet1',
  GOOGLE_SHEETS_RANGE: env.GOOGLE_SHEETS_RANGE || 'A:K',
  NOTIFICATION_EMAIL: env.NOTIFICATION_EMAIL || '',
};

// Google service-account key: decode the base64 secret to a temp file.
if (env.GOOGLE_PRIVATE_KEY_B64) {
  try {
    const keyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcloud-key-'));
    const keyPath = path.join(keyDir, 'service-account.json');
    fs.writeFileSync(keyPath, Buffer.from(env.GOOGLE_PRIVATE_KEY_B64, 'base64'));
    fs.chmodSync(keyPath, 0o600);
    cfg.GOOGLE_SERVICE_ACCOUNT_EMAIL = env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '';
    cfg.GOOGLE_PRIVATE_KEY_PATH = keyPath;
    console.log('✓ Google service-account key decoded to a temp file');
  } catch (e) {
    console.error('⚠️  Could not decode GOOGLE_PRIVATE_KEY_B64:', e.message);
  }
} else {
  console.log('ℹ️  GOOGLE_PRIVATE_KEY_B64 not set — Customer Feedback sync will be skipped');
}

// SMTP: only include when both halves are present, otherwise the engine skips alerting.
if (env.SMTP_USER && env.SMTP_PASS) {
  cfg.SMTP_USER = env.SMTP_USER;
  cfg.SMTP_PASS = env.SMTP_PASS;
} else {
  console.log('ℹ️  SMTP not configured — failure email alerts will be skipped');
}

fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
fs.chmodSync(CONFIG_PATH, 0o600);

console.log(`✓ Wrote ${CONFIG_PATH}`);
console.log(`  headless: ${cfg.PETPOOJA_HEADLESS}`);
console.log(`  supabase: ${cfg.NEXT_PUBLIC_SUPABASE_URL}`);
