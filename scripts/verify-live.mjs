// scripts/verify-live.mjs — check a page of the app first-hand, signed in.
//
// Every page sits behind the login gate, so a plain fetch only ever sees
// /login. This signs in without a password: the service-role key mints a
// session for an account that already exists, the session goes in as the
// cookie @supabase/ssr writes, and a real browser (Playwright) loads the
// page. The session is revoked when the run ends, so nothing is left behind.
//
//   node scripts/verify-live.mjs                                  # the local app
//   node scripts/verify-live.mjs /operations                      # a path
//   node scripts/verify-live.mjs --url https://atelier-hr-inky.vercel.app/operations
//   node scripts/verify-live.mjs --expect "Maintenance POCs" --expect "Compliance"
//   node scripts/verify-live.mjs --shot /tmp/operations.png
//   node scripts/verify-live.mjs --email someone@example.com
//
// Flags: --url, --email, --expect (repeatable), --shot, --headed.
//
// Exit code 0 means: the page loaded signed in, and every --expect was found.
// Nothing secret is printed: no token, no key.

import fs from 'node:fs';
import { chromium } from 'playwright';

// --- the flags -------------------------------------------------------------
const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const flagAll = (name) =>
  args.reduce((out, a, i) => (a === `--${name}` ? [...out, args[i + 1]] : out), []);

const LOCAL = 'http://localhost:3000';
const PROD = 'https://atelier-hr-inky.vercel.app';
const target = flag('url', `${LOCAL}${flag('path', '') || ''}`);
const expects = flagAll('expect');
const shot = flag('shot');
const headed = args.includes('--headed');

// --- the environment -------------------------------------------------------
function readEnv(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs.readFileSync(file, 'utf8')
      .split('\n')
      .filter(l => l.trim() && !l.trim().startsWith('#'))
      .map(l => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
      })
  );
}
const env = { ...readEnv('.env.local'), ...readEnv('env.local') };
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(2);
}

const { createClient } = await import('@supabase/supabase-js');
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const REF = new URL(SUPABASE_URL).hostname.split('.')[0];

// --- who to sign in as -----------------------------------------------------
async function resolveEmail() {
  const asked = flag('email');
  if (asked) return asked;
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, role, is_super_admin')
    .eq('is_super_admin', true)
    .limit(1);
  const { data: userPage } = await admin.auth.admin.listUsers({ perPage: 200 });
  const users = userPage?.users || [];
  const emailOf = new Map(users.map(u => [u.id, u.email]));
  const id = (profiles || [])[0]?.id || users[0]?.id;
  const email = emailOf.get(id);
  if (!email) {
    console.error('No account found to sign in as. Pass --email.');
    process.exit(2);
  }
  return email;
}

const email = await resolveEmail();

// --- mint a session (no password, no email, no new account) ----------------
const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
  type: 'magiclink',
  email,
});
if (linkErr) {
  console.error('Could not mint a session:', linkErr.message);
  process.exit(2);
}
const { data: minted, error: otpErr } = await admin.auth.verifyOtp({
  token_hash: link.properties.hashed_token,
  type: 'magiclink',
});
if (otpErr) {
  console.error('Could not mint a session:', otpErr.message);
  process.exit(2);
}
const session = minted.session;

// --- the cookie @supabase/ssr writes ---------------------------------------
// name: sb-<projectRef>-auth-token | value: base64- + base64url(JSON(session))
// chunked at 3180 encoded characters into <name>.0, <name>.1, ...
const raw = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url');
const host = new URL(target).hostname;
const cookies = [];
const encoded = encodeURIComponent(raw);
if (encoded.length <= 3180) {
  cookies.push({ name: `sb-${REF}-auth-token`, value: raw });
} else {
  for (let i = 0; i < encoded.length; i += 3180) {
    cookies.push({
      name: `sb-${REF}-auth-token.${i / 3180}`,
      value: decodeURIComponent(encoded.slice(i, i + 3180)),
    });
  }
}

// --- drive the browser -----------------------------------------------------
const browser = await chromium.launch({ headless: !headed });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies(
  cookies.map(c => ({ ...c, domain: host, path: '/', httpOnly: false, sameSite: 'Lax' }))
);
const page = await ctx.newPage();

let failed = false;
try {
  const response = await page.goto(target, { waitUntil: 'networkidle' });
  const landed = new URL(page.url());
  const body = await page.content();
  const signedIn = !landed.pathname.startsWith('/login');

  console.log(`signed in as : ${email}`);
  console.log(`requested    : ${target}`);
  console.log(`landed on    : ${landed.pathname}${landed.search}`);
  console.log(`http status  : ${response ? response.status() : '(none)'}`);
  console.log(`page title   : ${await page.title()}`);

  if (!signedIn) {
    console.log('\nFAIL  the page is the login page — the session did not take');
    failed = true;
  } else {
    console.log('\nPASS  loaded signed in (the login gate was passed)');
  }

  for (const text of expects) {
    const found = body.includes(text);
    console.log(`${found ? 'PASS' : 'FAIL'}  expected "${text}"`);
    if (!found) failed = true;
  }

  if (shot) {
    await page.screenshot({ path: shot, fullPage: true });
    console.log(`\nscreenshot   : ${shot}`);
  }
} finally {
  await browser.close();
  // Leave nothing behind: the session minted for this run is revoked.
  const { error } = await admin.auth.admin.signOut(session.access_token);
  console.log(`session      : revoked${error ? ` (${error.message})` : ''}`);
}

process.exit(failed ? 1 : 0);
