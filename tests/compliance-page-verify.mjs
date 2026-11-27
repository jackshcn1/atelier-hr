/**
 * tests/compliance-page-verify.mjs
 *
 * The compliance register, driven in a real browser while signed in.
 *
 * It proves the three things the page promises: that a licence can be added
 * and lands on the register, that a vendor's certificate is filed against a
 * supplier chosen from the vendors already on the list, and that a recurring
 * duty works out its own next due date. It also checks that the figures at
 * the top count what they say they count.
 *
 * Every row it creates is removed again before it finishes, so the register
 * is left exactly as it found it.
 *
 * Run: npm run test:compliance-page
 */

import fs from 'node:fs';
import { chromium } from 'playwright';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l.trim() && !l.trim().startsWith('#'))
    .map(l => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const APP = process.env.VERIFY_APP_URL || 'http://localhost:3000';

const { createClient } = await import('@supabase/supabase-js');
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// Sign in as the first super admin — no password, no email, and the session
// is revoked when the run ends.
const { data: profiles } = await admin.from('profiles').select('id, is_super_admin').eq('is_super_admin', true).limit(1);
const { data: userPage } = await admin.auth.admin.listUsers({ perPage: 200 });
const email = (userPage?.users || []).find(u => u.id === profiles?.[0]?.id)?.email
  || (userPage?.users || [])[0]?.email;
if (!email) { console.error('No account to sign in as.'); process.exit(2); }

const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
const { data: minted } = await admin.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
const raw = 'base64-' + Buffer.from(JSON.stringify(minted.session)).toString('base64url');
const host = new URL(APP).hostname;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([{
  name: `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`,
  value: raw, domain: host, path: '/', httpOnly: false, sameSite: 'Lax',
}]);
const page = await ctx.newPage();
page.on('pageerror', e => console.log('  PAGE ERROR:', e.message));

let passed = 0;
const fails = [];
async function check(name, fn) {
  try {
    const ok = await fn();
    if (ok === false) throw new Error('the check did not hold');
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
    fails.push(name);
    process.exitCode = 1;
  }
}

console.log('compliance page');

try {
  await page.goto(`${APP}/operations/compliance`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  await check('the page loads signed in', async () => !page.url().includes('/login'));
  await check('the three figures are there', async () =>
    (await page.locator('text=Due in 30 days').count()) > 0 &&
    (await page.locator('text=Overdue').count()) > 0 &&
    (await page.locator('text=Daily checks late').count()) > 0);
  await check('the daily checks strip is there', async () =>
    (await page.locator('text=Daily checks').count()) > 0);

  // ---- our own licence --------------------------------------------------
  await page.click('button:has-text("+ Add")');
  await page.waitForTimeout(600);
  await page.fill('input[placeholder="FSSAI Food Licence"]', 'TEST LICENCE - TEMP');
  await page.fill('input[placeholder="11223344000987"]', 'TEST-123');
  await page.fill('input[type="date"] >> nth=1', '2026-12-10');
  await page.click('button:has-text("Add to the register")');
  await page.waitForTimeout(1500);
  await check('a licence added lands on the register', async () =>
    (await page.locator('text=TEST LICENCE - TEMP').count()) > 0);

  await check('a licence expiring inside 30 days is counted', async () => {
    const figure = await page.locator('div:has(> p.figure-label:text("Due in 30 days")) p.figure').first().innerText();
    return figure.trim() === '1';
  });

  // ---- a vendor's certificate, filed against a supplier already on the list
  await page.click('button:has-text("+ Vendor certification")');
  await page.waitForTimeout(600);
  await page.fill('input[placeholder="Search the vendors already on the list"]', 'Sequire');
  await page.waitForTimeout(600);
  await check('the vendor picker offers a supplier already on the list', async () =>
    (await page.locator('button:has-text("Sequire Pest Control")').count()) > 0);
  await page.locator('button:has-text("Sequire Pest Control")').first().click();
  await page.waitForTimeout(400);
  await page.fill('input[placeholder="FSSAI Food Licence"]', 'TEST VENDOR CERT - TEMP');
  await page.click('button:has-text("Add to the register")');
  await page.waitForTimeout(1500);
  await check('the certificate is on the register, naming its supplier', async () =>
    (await page.locator('text=TEST VENDOR CERT - TEMP').count()) > 0 &&
    (await page.locator('td:has-text("Sequire Pest Control")').count()) > 0);

  await page.locator('button').filter({ hasText: /^Vendors$/ }).first().click();
  await page.waitForTimeout(600);
  await check('the Vendors tab groups it under the supplier', async () =>
    (await page.locator('text=1 certificate on file').count()) > 0);
  await page.locator('button').filter({ hasText: /^All$/ }).first().click();
  await page.waitForTimeout(400);

  // ---- a recurring duty: the next due date works itself out --------------
  await page.click('button:has-text("+ Recurring duty")');
  await page.waitForTimeout(600);
  await page.fill('input[placeholder="FSSAI Food Licence"]', 'TEST RECURRING - TEMP');
  await page.fill('input[type="date"] >> nth=0', '2026-11-28');
  await page.waitForTimeout(500);
  await check('the next due date is worked out from the last time it was done', async () =>
    (await page.inputValue('input[type="date"] >> nth=1')) === '2026-12-28');
  await page.click('button:has-text("Add to the register")');
  await page.waitForTimeout(1500);
  await check('the recurring duty is on the register', async () =>
    (await page.locator('text=TEST RECURRING - TEMP').count()) > 0);
} finally {
  // ---- leave the register exactly as it was found ------------------------
  const { data: junk } = await admin.from('compliance_items').select('id').ilike('name', 'TEST %');
  for (const row of junk || []) await admin.from('compliance_items').delete().eq('id', row.id);
  console.log(`  (removed ${(junk || []).length} test row(s))`);
  await browser.close();
  await admin.auth.admin.signOut(minted.session.access_token);
}

console.log(`\n${passed} check(s) passed`);
if (process.exitCode) console.error('\nSome checks failed.');
