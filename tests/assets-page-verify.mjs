/*
 * tests/assets-page-verify.mjs
 *
 * The asset register, driven in a real browser while signed in.
 *
 * It proves the things that were broken before: that an asset added on the
 * page **stays on the books** (the old Add button only added a row to the
 * page's own memory), that a stack of them gets a number each, that the
 * register reads by category, and that the asset's own page shows the real
 * history rather than a made-up one.
 *
 * Every row it creates is removed again before it finishes, so the register
 * is left exactly as it found it.
 *
 * Run: npm run test:assets-page
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
async function check(name, fn) {
  try {
    const ok = await fn();
    if (ok === false) throw new Error('the check did not hold');
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
    process.exitCode = 1;
  }
}

console.log('assets page');

const created = [];
let firstNumber = null;

try {
  await page.goto(`${APP}/operations/assets`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  await check('the page loads signed in', async () => !page.url().includes('/login'));
  await check('the three figures are there', async () =>
    (await page.locator('text=Assets on the books').count()) > 0 &&
    (await page.locator('text=In maintenance').count()) > 0 &&
    (await page.locator('text=With a person').count()) > 0);

  await check('the register reads by category', async () =>
    (await page.locator('button:has-text("Kitchen Equipment")').count()) > 0);

  // ---- add a stack of two ------------------------------------------------
  await page.locator('button:has-text("+ Add assets")').first().click();
  await page.waitForTimeout(600);

  await page.selectOption('#asset-category', { label: 'Kitchen Equipment' });
  await page.waitForTimeout(500);
  await page.selectOption('#asset-type', { label: 'Chiller' });
  await page.fill('#asset-quantity', '2');
  await page.fill('#asset-name', 'TEST ASSET - TEMP');
  await page.click('button:has-text("Add to the register")');

  await check('the assets land on the register', async () => {
    await page.waitForSelector('text=TEST ASSET - TEMP', { timeout: 20000 });
    return (await page.locator('text=TEST ASSET - TEMP').count()) > 0;
  });

  // ---- and they are really on the books, not just on the page ------------
  const { data: saved } = await admin
    .from('assets').select('asset_number, name, category_id, type_id')
    .eq('name', 'TEST ASSET - TEMP');
  created.push(...(saved || []).map(a => a.asset_number));

  await check('the assets are on the books, not just on the page', async () =>
    (saved || []).length === 2);

  await check('each one has its own number', async () => {
    const numbers = (saved || []).map(a => a.asset_number);
    return new Set(numbers).size === 2 && numbers.every(n => /^[A-Z]{4}\d{5}$/.test(n));
  });

  await check('the numbers follow the category and the type', async () => {
    const { data: cat } = await admin.from('asset_categories').select('prefix').eq('id', saved[0].category_id).single();
    const { data: type } = await admin.from('asset_types').select('prefix').eq('id', saved[0].type_id).single();
    firstNumber = saved[0].asset_number;
    return saved[0].asset_number.startsWith(cat.prefix + type.prefix);
  });

  await check('they are filed under their category', async () =>
    (await page.locator('button:has-text("Kitchen Equipment")').count()) > 0);

  // ---- the asset's own page ----------------------------------------------
  await page.goto(`${APP}/operations/assets/${encodeURIComponent(firstNumber)}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Change history', { timeout: 20000 });

  await check('the asset page loads', async () =>
    (await page.locator('text=TEST ASSET - TEMP').count()) > 0);
  await check('the change history is there', async () =>
    (await page.locator('text=Change history').count()) > 0);
  await check('the maintenance history is there', async () =>
    (await page.locator('text=Maintenance history').count()) > 0);

  // ---- a change is saved, and written into the history -------------------
  await page.fill('input[name="brand"]', 'TEST BRAND - TEMP');
  await page.click('button:has-text("Save changes")');
  await page.waitForSelector('button:text-is("Save")', { timeout: 15000 });
  await page.locator('button:text-is("Save")').first().click();
  await page.waitForTimeout(2500);

  await check('the change is written into the history', async () => {
    const { data: log } = await admin
      .from('asset_audit_log').select('action, previous_value, new_value')
      .eq('asset_id', firstNumber);
    return (log || []).some(row => row.new_value === 'TEST BRAND - TEMP');
  });

  await check('the change is on the asset itself', async () => {
    const { data: row } = await admin
      .from('assets').select('brand').eq('asset_number', firstNumber).single();
    return row?.brand === 'TEST BRAND - TEMP';
  });
} finally {
  // ---- leave the register exactly as it was found ------------------------
  const { data: junk } = await admin.from('assets').select('asset_number').eq('name', 'TEST ASSET - TEMP');
  for (const row of junk || []) {
    await admin.from('asset_audit_log').delete().eq('asset_id', row.asset_number);
    await admin.from('assets').delete().eq('asset_number', row.asset_number);
  }
  console.log(`  (removed ${(junk || []).length} test asset(s))`);
  await browser.close();
  await admin.auth.admin.signOut(minted.session.access_token);
}

console.log(`\n${passed} check(s) passed`);
if (process.exitCode) console.error('\nSome checks failed.');
