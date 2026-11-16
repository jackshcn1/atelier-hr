// Petpooja Automated Variable Pay Sync Engine
// Runs LOCALLY on the office computer (Petpooja blocks cloud/datacenter IPs).
// Credentials are read from scripts/petpooja-config.json, which is git-ignored.

import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { existsSync, readFileSync, appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  parseCaptainPerformance,
  parsePaxSales,
  parseKitchenPrepTime,
  parseWastage,
  parseB2bGstOrders,
  parseCreditRecovery,
  parseDeliverySales,
  parseCounterSales,
  parseExecutiveOrderTypes
} from '../lib/variablePayParsers.js';
import { parseCustomerFeedback } from '../lib/feedbackParsers.js';
import { fetchGoogleSheetsData } from '../lib/googleSheetsService.js';
import { sendFailureEmail } from '../lib/notificationService.js';
import { parsePurchaseInvoices, parsePurchaseReturns } from '../lib/expenseParsers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load credentials from the local config file, then let real env vars win.
// The config file is gitignored, so it is absent on CI runners and serverless
// functions — in that case the environment must supply everything.
function loadLocalConfig() {
  const cfg = {};
  const cfgPath = join(__dirname, 'petpooja-config.json');
  if (!existsSync(cfgPath)) {
    if (process.env.PETPOOJA_EMAIL && process.env.PETPOOJA_PASSWORD) {
      console.log('ℹ️  No local petpooja-config.json — using environment variables.');
      return cfg;
    }
    console.error('❌ Missing scripts/petpooja-config.json');
    console.error('   Run:  node scripts/setup-petpooja.mjs   (one-time setup)');
    process.exit(1);
  }
  try {
    Object.assign(cfg, JSON.parse(readFileSync(cfgPath, 'utf8')));
  } catch (e) {
    console.error('❌ Could not parse petpooja-config.json:', e.message);
    process.exit(1);
  }
  // Env vars take precedence so the GitHub runner can still use this file.
  for (const [k, v] of Object.entries(cfg)) {
    if (process.env[k] === undefined) process.env[k] = String(v ?? '');
  }
  return cfg;
}

// Report selection. A full sync takes longer than a serverless function's
// maximum duration, so the reports are split into groups that each fit.
// Set SYNC_GROUP=1|2|3, or SYNC_REPORTS=captain,pax for an explicit set.
// With neither set, every report runs — the local computer path is unchanged.
const REPORT_GROUPS = {
  1: ['captain', 'pax', 'item'],
  2: ['gstn', 'due_payment', 'executive', 'kot'],
  3: ['inventory', 'purchase_invoices'],
  4: ['purchase_returns'],
};

function reportEnabled(name) {
  const explicit = process.env.SYNC_REPORTS;
  if (explicit) {
    return explicit.split(',').map((s) => s.trim()).filter(Boolean).includes(name);
  }
  const group = process.env.SYNC_GROUP;
  if (group) {
    const list = REPORT_GROUPS[Number(group)] || [];
    return list.includes(name);
  }
  return true;
}

// The Google Sheets customer-feedback pull is not a Petpooja report, but it
// shares the same pay period and writes to the same metric rows. When the
// run is split into groups it must run only once — the last group — so the
// values are not written over and over.
function feedbackEnabled() {
  if (process.env.SYNC_REPORTS) return false; // an explicit report list means Petpooja only
  const group = process.env.SYNC_GROUP;
  if (!group) return true;
  return Number(group) === 3;
}

// Download timeout for report files. The default suits a local desktop; a
// serverless runner is slower and needs longer for the large Item Report.
const DOWNLOAD_TIMEOUT = Number(process.env.PETPOOJA_DOWNLOAD_TIMEOUT || 35000);

// Debug screenshots are diagnostic only. The working directory is read-only
// on a serverless runtime, so fall back to a temp directory — and never let a
// failed screenshot mask the real error it was meant to capture.
async function saveDebugScreenshot(page, name, options = {}) {
  const file = `debug-${name.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
  const dir = process.env.PETPOOJA_DEBUG_DIR
    || (existsSync(join(process.cwd(), 'scripts')) ? 'scripts' : tmpdir());
  const filePath = join(dir, file);
  try {
    await page.screenshot({ path: filePath, fullPage: true, ...options });
    console.log(`  📸 Saved screenshot to ${filePath}`);
    return filePath;
  } catch (e) {
    console.warn(`  📸 Could not save screenshot to ${filePath}: ${e.message}`);
    return null;
  }
}

// When a downloaded report cannot be parsed, save the raw rows so the parser
// can be fixed against the real file instead of guessing at its shape.
function dumpReportRows(name, rows) {
  const file = join(process.cwd(), 'scripts', `debug-rows-${name.replace(/[^a-zA-Z0-9]/g, '_')}.json`);
  try {
    // A report may carry the interesting table on a sheet other than the
    // first one, so the whole workbook is saved alongside the used rows.
    const sheets = {};
    if (lastWorkbook) {
      for (const sheetName of lastWorkbook.SheetNames) {
        sheets[sheetName] = XLSX.utils.sheet_to_json(lastWorkbook.Sheets[sheetName], {
          header: 1, defval: '', raw: false, blankrows: true
        });
      }
    }
    writeFileSync(file, JSON.stringify({ sheets, usedRows: rows }, null, 2));
    console.log(`  🧾 Saved raw report rows to ${file}`);
  } catch (e) {
    console.warn(`  🧾 Could not save raw report rows: ${e.message}`);
  }
}

// Calculate active 20th–19th payroll cycle (e.g. 2026-09-20 to 2026-10-19 when today is Sep 29)
function getActivePayrollCycle() {
  if (process.env.SYNC_START_DATE && process.env.SYNC_END_DATE) {
    return {
      start: process.env.SYNC_START_DATE.trim(),
      end: process.env.SYNC_END_DATE.trim()
    };
  }
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth(); // 0-indexed (0=Jan, 8=Sep, 9=Oct...)
  const d = today.getDate();

  let startYear = y;
  let startMonth = m;

  if (d < 20) {
    // Before the 20th of the current month, the active cycle started on the 20th of last month
    startMonth -= 1;
    if (startMonth < 0) {
      startMonth = 11;
      startYear -= 1;
    }
  }

  // End of cycle is the 19th of the following month
  let endMonth = startMonth + 1;
  let endYear = startYear;
  if (endMonth > 11) {
    endMonth = 0;
    endYear += 1;
  }

  const startStr = `${startYear}-${String(startMonth + 1).padStart(2, '0')}-20`;
  const endStr = `${endYear}-${String(endMonth + 1).padStart(2, '0')}-19`;
  const todayStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const queryEnd = todayStr < endStr ? todayStr : endStr;

  return {
    start: startStr,
    end: endStr,
    queryEnd: queryEnd
  };
}

// The workbook of the most recently downloaded report, kept so a failed parse
// can be diagnosed against every sheet the file contains.
let lastWorkbook = null;

// Read every sheet of a downloaded report. Petpooja's Executive Sales Report,
// for example, spreads its sections over 17 sheets and the interesting table
// is not the first one.
function parseWorkbookSheets(buffer) {
  if (!buffer || buffer.length === 0) return [];
  let wb;
  try {
    wb = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
  } catch (e) {
    try {
      const str = buffer.toString('utf8');
      wb = XLSX.read(str, { type: 'string', cellDates: true, raw: false });
    } catch (e2) {
      console.error('  ❌ Could not parse report buffer:', e2.message);
      return [];
    }
  }
  lastWorkbook = wb;
  return wb.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json(wb.Sheets[name], {
      header: 1,
      defval: '',
      raw: false,
      blankrows: true
    })
  }));
}

function parseWorkbookBuffer(buffer) {
  return parseWorkbookSheets(buffer)[0]?.rows || [];
}

export async function runPetpoojaSync(options = {}) {
  const cfg = loadLocalConfig();

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wzxswmopfxnucmeygqeg.supabase.co';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY in environment.');
  }

  const email = process.env.PETPOOJA_EMAIL;
  const password = process.env.PETPOOJA_PASSWORD;

  if (!email || !password) {
    throw new Error('Missing PETPOOJA_EMAIL or PETPOOJA_PASSWORD in environment.');
  }

  console.log('🚀 Starting Petpooja Automated Variable Pay Sync...');
  const supabase = createClient(supabaseUrl, supabaseKey);

  // 1. Determine cycle & period
  const cycle = options.cycle || getActivePayrollCycle();
  console.log(`📅 Active Pay Period: ${cycle.start} to ${cycle.end}`);

  let { data: period } = await supabase
    .from('variable_pay_periods')
    .select('*')
    .eq('period_start', cycle.start)
    .eq('period_end', cycle.end)
    .maybeSingle();

  if (!period) {
    const { data: openPeriods } = await supabase
      .from('variable_pay_periods')
      .select('id')
      .eq('status', 'open');
    if (openPeriods && openPeriods.length > 0) {
      const { error: closeErr } = await supabase
        .from('variable_pay_periods')
        .update({ status: 'locked' })
        .in('id', openPeriods.map(p => p.id));
      if (closeErr) throw new Error(`Failed to lock stale periods: ${closeErr.message}`);
      console.log(`✓ Locked ${openPeriods.length} stale open period(s)`);
    }
    const { data: newPeriod, error: pErr } = await supabase
      .from('variable_pay_periods')
      .insert([{ period_start: cycle.start, period_end: cycle.end, status: 'open' }])
      .select()
      .single();
    if (pErr) throw new Error(`Failed to create period: ${pErr.message}`);
    period = newPeriod;
    console.log(`✓ Initialized new open period #${period.id}`);
  } else if (period.status === 'open') {
    console.log(`✓ Period #${period.id} already open; reusing`);
  } else {
    const { data: openPeriods } = await supabase
      .from('variable_pay_periods')
      .select('id')
      .eq('status', 'open');
    if (openPeriods && openPeriods.length > 0) {
      const { error: closeErr } = await supabase
        .from('variable_pay_periods')
        .update({ status: 'locked' })
        .in('id', openPeriods.map(p => p.id));
      if (closeErr) throw new Error(`Failed to lock stale periods: ${closeErr.message}`);
      console.log(`✓ Locked ${openPeriods.length} stale open period(s)`);
    }
    const { error: uErr } = await supabase
      .from('variable_pay_periods')
      .update({ period_start: cycle.start, period_end: cycle.end, status: 'open' })
      .eq('id', period.id);
    if (uErr) throw new Error(`Failed to update period: ${uErr.message}`);
    period = { id: period.id, period_start: cycle.start, period_end: cycle.end, status: 'open' };
    console.log(`✓ Updated period #${period.id} to new cycle`);
  }

  // 2. Fetch employees, schemes, and kitchen categories
  const [empRes, schemeRes, catRes] = await Promise.all([
    supabase.from('employees').select('employee_id, name, designation, department, variable_pay_scheme').is('deleted_at', null),
    supabase.from('variable_pay_schemes').select('*').eq('is_active', true),
    supabase.from('kitchen_menu_categories').select('category').eq('counts_toward_prep_time', true)
  ]);

  const employees = empRes.data || [];
  const schemes = schemeRes.data || [];
  const kitchenCategories = (catRes.data || []).map(c => c.category);

  // Dynamically import playwright.
  // playwright-core is used so a serverless bundle does not pull the full
  // playwright package (and its browser download) — the browser binary itself
  // is supplied via PETPOOJA_CHROMIUM_EXECUTABLE_PATH when running headless
  // outside a desktop.
  const { chromium } = await import('playwright-core');

  // Headed mode (default on local runs) is more reliable — Petpooja is far
  // less likely to challenge a real visible Chrome window than a headless one.
  // Set PETPOOJA_HEADLESS=true in the config to run without a visible window.
  const headless = String(process.env.PETPOOJA_HEADLESS ?? 'false').toLowerCase() === 'true';

  console.log(`🌐 Launching browser (headless=${headless})...`);
  const launchOptions = {
    headless,
    channel: headless ? undefined : 'chrome', // use installed Chrome when headed
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled'
    ]
  };
  // Serverless: point at a provided Chromium binary instead of a bundled one.
  if (process.env.PETPOOJA_CHROMIUM_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PETPOOJA_CHROMIUM_EXECUTABLE_PATH;
    launchOptions.channel = undefined; // Playwright rejects channel + executablePath together
    if (process.env.PETPOOJA_CHROMIUM_ARGS) {
      launchOptions.args = JSON.parse(process.env.PETPOOJA_CHROMIUM_ARGS);
    }
  }
  const browser = await chromium.launch(launchOptions);

  const context = await browser.newContext({
    acceptDownloads: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });
  const page = await context.newPage();

  async function saveMetric(metricId, actual, sourceType, filename, detail, employeeId = null) {
    // A metric that is not a real number is never written. A report that
    // could not be understood must show up as a failure in the log, not as a
    // NULL row that quietly drags the attainment down.
    if (typeof actual !== 'number' || !Number.isFinite(actual)) {
      console.error(`  ❌ Refusing to save metric ${metricId}: value is ${JSON.stringify(actual)}, not a number.`);
      return;
    }

    let query = supabase
      .from('variable_metric_inputs')
      .select('id')
      .eq('period_id', period.id)
      .eq('metric_id', metricId);

    if (employeeId) {
      query = query.eq('employee_id', employeeId);
    } else {
      query = query.is('employee_id', null);
    }

    const { data: existing } = await query.maybeSingle();

    const payload = {
      period_id: period.id,
      scheme_name: detail?.scheme_name || '',
      metric_id: metricId,
      employee_id: employeeId,
      actual_value: actual,
      source_type: sourceType,
      source_filename: filename || 'Petpooja Automated Sync',
      source_detail: detail || {},
      updated_at: new Date().toISOString()
    };

    let saveErr = null;
    // The unique index is (period_id, metric_id, coalesce(employee_id, 'TEAM')).
    // Supabase onConflict requires exact column names matching the index.
    // We normalize employee_id to 'TEAM' in the payload for team metrics
    // so the onConflict clause uses plain column names.
    if (existing?.id) {
      const { error } = await supabase
        .from('variable_metric_inputs')
        .update(payload)
        .eq('id', existing.id);
      saveErr = error;
    } else {
      const { error } = await supabase
        .from('variable_metric_inputs')
        .insert([payload]);
      saveErr = error;
    }

    if (saveErr) {
      console.error(`  ❌ Error saving metric ${metricId}:`, saveErr.message);
    } else {
      console.log(`  💾 Saved metric: ${metricId} = ${actual}${employeeId ? ` (Emp: ${employeeId})` : ' (TEAM)'}`);
    }
  }

  // Write vendor expense rows.
  //
  // The expenses table has no unique index on (vendor_name, invoice_number),
  // so an upsert with onConflict on that pair fails with
  // "there is no unique or exclusion constraint matching the ON CONFLICT
  // specification" — which is why no Petpooja invoice or debit note had ever
  // reached the table. Compare against what is already there instead: rows
  // that exist are updated, new ones are inserted. A unique index is not added
  // because the manual expense entry form allows a repeated vendor/invoice.
  async function syncExpenseRows(rows, label) {
    if (!rows || rows.length === 0) return { inserted: 0, updated: 0 };

    const keyOf = (vendor, invoice) => `${vendor ?? ''}\u0000${invoice ?? ''}`;
    const vendorNames = [...new Set(rows.map(r => r.vendor_name).filter(Boolean))];

    let existing = [];
    if (vendorNames.length > 0) {
      const { data } = await supabase
        .from('expenses')
        .select('id, vendor_name, invoice_number')
        .in('vendor_name', vendorNames);
      existing = data || [];
    }
    const existingByKey = new Map(existing.map(e => [keyOf(e.vendor_name, e.invoice_number), e.id]));

    const toInsert = new Map();
    const toUpdate = [];
    for (const row of rows) {
      const key = keyOf(row.vendor_name, row.invoice_number);
      const id = existingByKey.get(key);
      if (id) {
        toUpdate.push({ id, row });
      } else if (!toInsert.has(key)) {
        toInsert.set(key, row);
      }
    }

    let inserted = 0;
    let updated = 0;

    if (toInsert.size > 0) {
      const batch = [...toInsert.values()];
      const { error } = await supabase.from('expenses').insert(batch);
      if (error) {
        console.error(`  ❌ Failed to insert ${batch.length} ${label}:`, error.message);
      } else {
        inserted = batch.length;
      }
    }

    if (toUpdate.length > 0) {
      const results = await Promise.all(toUpdate.map(({ id, row }) =>
        supabase.from('expenses').update(row).eq('id', id).then(({ error }) => error)
      ));
      const failures = results.filter(Boolean);
      updated = toUpdate.length - failures.length;
      if (failures.length > 0) {
        console.error(`  ❌ Failed to update ${failures.length} ${label}:`, failures[0].message);
      }
    }

    console.log(`  ✓ ${label}: ${inserted} new, ${updated} updated`);
    return { inserted, updated };
  }

  function findEmployeeByName(name, empList) {    if (!name) return null;
    const n = name.trim().toLowerCase();
    // 1. Exact match
    let match = empList.find(e => e.name.toLowerCase() === n);
    if (match) return match;
    // 2. Substring match (e.g. "Chingaap" vs "Chingaap Gangmei")
    match = empList.find(e => {
      const en = e.name.toLowerCase();
      return en.includes(n) || n.includes(en);
    });
    if (match) return match;
    // 3. First name match
    const firstWord = n.split(/\s+/)[0];
    if (firstWord && firstWord.length > 2) {
      match = empList.find(e => e.name.toLowerCase().startsWith(firstWord));
    }
    return match || null;
  }

  try {
    // 3. Login to Petpooja Billing (2-Step Form)
    console.log('🔐 Navigating to Petpooja Billing (https://billing.petpooja.com/)...');
    await page.goto('https://billing.petpooja.com/', { waitUntil: 'load', timeout: 45000 });
    await page.waitForTimeout(3000);

    console.log(`  Current Page URL: ${page.url()}`);
    console.log(`  Current Page Title: "${await page.title()}"`);

    // Diagnostic: find all inputs on the page
    const inputCount = await page.locator('input').count();
    console.log(`  Total input tags found on page: ${inputCount}`);

    // Step 1: Email / Username
    const emailInput = page.locator('#UserEmail, input[name="data[User][email]"], input[placeholder*="Email"]').first();
    await emailInput.waitFor({ state: 'attached', timeout: 20000 });
    await emailInput.fill(email);
    console.log('  ✓ Filled email address.');

    const continueBtn = page.locator('button:has-text("Continue"), button[type="submit"], input[type="submit"]').first();
    await continueBtn.click();
    await page.waitForTimeout(3000);

    // Step 2: Password
    const passInput = page.locator('#UserPassword, input[name="data[User][password]"], input[type="password"]').first();
    await passInput.waitFor({ state: 'attached', timeout: 20000 });
    await passInput.fill(password);
    console.log('  ✓ Filled password.');

    const loginSubmitBtn = page.locator('button:has-text("Sign in"), button:has-text("Login"), button:has-text("Continue"), button[type="submit"], input[type="submit"]').first();
    await loginSubmitBtn.click();

    // Wait for navigation after login
    await page.waitForNavigation({ timeout: 35000 }).catch(() => {});
    await page.waitForTimeout(5000);
    console.log(`✓ Post-login URL: ${page.url()} ("${await page.title()}")`);

    // Helper: download custom report and return sheet rows
    // `sheetMatch` picks the sheet to read when a report spreads its sections
    // over several sheets (matched against the sheet's first cell).
    async function fetchCustomReport(url, reportName, queryCycle = cycle, sheetMatch = null) {
      const readRows = (buffer) => {
        const sheets = parseWorkbookSheets(buffer);
        if (sheetMatch) {
          const wanted = sheetMatch.toLowerCase();
          const hit = sheets.find((s) => String(s.rows?.[0]?.[0] ?? '').toLowerCase().includes(wanted));
          if (hit) {
            console.log(`  ℹ️ Using sheet "${hit.name}" of ${sheets.length} for ${reportName}`);
            return hit.rows;
          }
          console.log(`  ⚠️ No sheet starting with "${sheetMatch}" in ${reportName} — using the first sheet.`);
        }
        return sheets[0]?.rows || [];
      };
      const startedAt = Date.now();
      console.log(`📥 Fetching ${reportName} (${url})...`);
      await page.goto(url, { waitUntil: 'load', timeout: 45000 });
      await page.waitForTimeout(4000);

      // Helper to format date in DD-MM-YYYY, YYYY-MM-DD, DD/MM/YYYY, or DD MMM YYYY
      function formatDates(isoDate) {
        const [y, m, d] = isoDate.split('-');
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthName = monthNames[parseInt(m, 10) - 1];
        return {
          iso: isoDate,                // 2026-08-20
          dmyHyphen: `${d}-${m}-${y}`, // 20-08-2026
          dmySlash: `${d}/${m}/${y}`,   // 20/08/2026
          dmyWords: `${parseInt(d, 10)} ${monthName} ${y}` // 20 Aug 2026
        };
      }

      const startDates = formatDates(queryCycle.start);
      const endDates = formatDates(queryCycle.queryEnd || queryCycle.end);

      // 1. Fill Date Range if datepicker inputs are present
      try {
        const dateInputLocators = await page.locator('input.start_fromdate:visible, input.set-calendar:visible, input.reportsatrtdate:visible, input[name*="date" i]:visible, input[id*="date" i]:visible, input[type="text"]:visible').all();

        if (dateInputLocators.length >= 2) {
          // Remove readonly attribute so inputs can be edited
          await dateInputLocators[0].evaluate(el => el.removeAttribute('readonly'));
          await dateInputLocators[1].evaluate(el => el.removeAttribute('readonly'));

          const val0 = (await dateInputLocators[0].inputValue().catch(() => '')) || (await dateInputLocators[0].getAttribute('placeholder').catch(() => '')) || '';

          let sVal = startDates.iso;
          let eVal = endDates.iso;

          if (val0.match(/[A-Za-z]{3}/)) {
            sVal = startDates.dmyWords;
            eVal = endDates.dmyWords;
          } else if (val0.includes('/') || (val0.includes('-') && val0.split('-')[0].length === 2)) {
            sVal = val0.includes('/') ? startDates.dmySlash : startDates.dmyHyphen;
            eVal = val0.includes('/') ? endDates.dmySlash : endDates.dmyHyphen;
          } else if (val0.includes(':')) {
            sVal = `${startDates.iso} 00:00:00`;
            eVal = `${endDates.iso} 23:59:59`;
          }

          // Visibly type dates into the input fields
          await dateInputLocators[0].click({ force: true });
          await dateInputLocators[0].fill(sVal);
          await dateInputLocators[0].evaluate((el, v) => {
            el.value = v;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            if (window.jQuery) {
              try { window.jQuery(el).datepicker('setDate', v); } catch(e){}
            }
          }, sVal);

          await dateInputLocators[1].click({ force: true });
          await dateInputLocators[1].fill(eVal);
          await dateInputLocators[1].evaluate((el, v) => {
            el.value = v;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            if (window.jQuery) {
              try { window.jQuery(el).datepicker('setDate', v); } catch(e){}
            }
          }, eVal);

          console.log(`  ✓ Set date range: ${sVal} to ${eVal}`);

          // Dismiss calendar popup if it stayed open
          await page.keyboard.press('Escape');
          await page.locator('label, h1, h2, h3, .page-title, th, .card-header').first().click({ force: true }).catch(() => {});
          await page.waitForTimeout(500);
        }

        // If on All Orders / Corporate GSTN summary page, click "Show All" or "Search"
        if (url.includes('all_restaurant_orders')) {
          const showAllBtn = page.locator('button:visible:has-text("Show All"), a:visible:has-text("Show All"), input[value*="Show All" i]:visible, button:visible:has-text("Search")').first();
          if (await showAllBtn.count() > 0) {
            await showAllBtn.click({ force: true });
            console.log('  ✓ Clicked Show All/Search button on Corporate orders.');
            await page.waitForTimeout(5000);
          }
        } else {
          // Look for Filter / Search / Submit button next to dates
          const filterBtn = page.locator('button:visible:has-text("Search"), button:visible:has-text("Filter"), button:visible:has-text("Submit"), button:visible:has-text("View"), input[type="submit"]:visible, input[type="button"]:visible[value*="Search" i], input[type="button"]:visible[value*="Filter" i], .btn-primary:visible:has-text("Search"), .btn-success:visible').first();
          if (await filterBtn.count() > 0) {
            await filterBtn.click({ force: true });
            console.log('  ✓ Clicked Filter/Search button.');
            await page.waitForTimeout(4000);
          }
        }
      } catch (dateErr) {
        console.log('  (Date filter bypassed or not found:', dateErr.message, ')');
      }

      // Special Handler A: Async queue report page (Advance Orders Summary at /reports/order_summary_ho/1)
      if (url.includes('order_summary_ho')) {
        console.log('  Handling Advance Orders / Due Payment Report (From March 04, 2026)...');
        // Click the white box with blue font that says "Export"
        const exportQueueBtn = page.locator('button:visible:has-text("Export"), input[value*="Export" i]:visible, a.btn:visible:has-text("Export"), .btn-primary:visible:has-text("Export")').first();
        if (await exportQueueBtn.count() > 0) {
          await exportQueueBtn.click({ force: true });
          console.log('  ✓ Clicked Export button. Waiting 15s for report generation...');
          await page.waitForTimeout(15000);
          await page.reload({ waitUntil: 'load' }).catch(() => {});
          await page.waitForTimeout(4000);
        }

        // Find the generated row in the table (matching 2026-03-04 or latest)
        const matchRow = page.locator('table tr:has(a:has-text("Download"))').filter({ hasText: '2026-03-04' }).first();
        let downloadLink = null;
        if (await matchRow.count() > 0) {
          downloadLink = matchRow.locator('a:has-text("Download")').first();
        } else {
          const rowsWithDownload = page.locator('table tr:has(a:has-text("Download"))');
          if (await rowsWithDownload.count() > 0) {
            downloadLink = rowsWithDownload.last().locator('a:has-text("Download")');
          } else {
            downloadLink = page.locator('table a:visible:has-text("Download"), a:visible:has-text("Download")').first();
          }
        }

        await downloadLink.waitFor({ state: 'visible', timeout: DOWNLOAD_TIMEOUT });

        console.log('  ✓ Clicking underlined Download link in queue table...');
        const downloadPromise = new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Download timeout')), DOWNLOAD_TIMEOUT);
          page.once('download', dl => { clearTimeout(timer); resolve(dl); });
          context.once('page', async p => {
            p.once('download', dl => { clearTimeout(timer); resolve(dl); });
          });
        });

        await downloadLink.click({ force: true });
        const download = await downloadPromise;

        const downloadStream = await download.createReadStream();
        const chunks = [];
        for await (const chunk of downloadStream) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);
        console.log(`  🎉 Downloaded ${reportName} (${buffer.length} bytes) in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
        return readRows(buffer);
      }

      // Special Handler B: Corporate GSTN Summary (/reports/all_restaurant_orders/all)
      if (url.includes('all_restaurant_orders')) {
        console.log('  Handling Corporate GSTN Orders Export (Export all)...');
        const downloadPromise = new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Download timeout')), DOWNLOAD_TIMEOUT);
          page.once('download', dl => { clearTimeout(timer); resolve(dl); });
          context.once('page', async p => {
            p.once('download', dl => { clearTimeout(timer); resolve(dl); });
          });
        });

        // Trigger native export_csv('all') function directly or click Export All link
        await page.evaluate(() => {
          const allLink = document.querySelector('a[onclick*="export_csv"][onclick*="all"], a[onclick*="export_csv"]');
          if (allLink) {
            allLink.click();
          } else if (typeof window.export_csv === 'function') {
            window.export_csv('all');
          } else {
            const expBtn = document.querySelector('.dropdown-toggle, button:has-text("Export")');
            if (expBtn) expBtn.click();
            const excelBtn = document.querySelector('.dropdown-menu a');
            if (excelBtn) excelBtn.click();
          }
        });

        const download = await downloadPromise;
        const downloadStream = await download.createReadStream();
        const chunks = [];
        for await (const chunk of downloadStream) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);
        console.log(`  🎉 Downloaded ${reportName} (${buffer.length} bytes) in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
        return readRows(buffer);
      }

      // Special Handler C: Petpooja Inventory Exports (Wastage & Purchase Returns)
      if (url.includes('inventory.petpooja.com')) {
        console.log(`  Handling Inventory Export for ${reportName} (Export All)...`);

        // Every inventory list has to be searched before it can be exported.
        const searchBtn = page.locator('button:visible:has-text("Search"), input[type="submit"]:visible[value*="Search"], .btn-primary:visible:has-text("Search"), button.btn-success:visible, input[type="submit"]:visible').first();
        if (await searchBtn.count() > 0 && await searchBtn.isVisible().catch(() => false)) {
          console.log('  ✓ Clicking Search button to load the list...');
          await searchBtn.click({ force: true });
          await page.waitForTimeout(4000);
        } else {
          console.log('  ℹ️ No Search button found, proceeding to look for Export...');
        }

        // Take a debug screenshot before looking for Export
        await saveDebugScreenshot(page, `${reportName}-before-export`, { fullPage: false });

        // An empty list has nothing to export, so no file is ever produced and
        // waiting for the download would only burn the time limit.
        const emptyList = page.locator('text=/no record found|no data found/i').first();
        if (await emptyList.count() > 0 && await emptyList.isVisible().catch(() => false)) {
          console.log(`  ℹ️ ${reportName}: no records for this period — nothing to export.`);
          return [];
        }

        // Look for the Export button (it's a dropdown toggle)
        const exportBtn = page.locator('button:visible:has-text("Export"), .btn-group:visible button:has-text("Export"), a:visible:has-text("Export"), .dropdown-toggle:visible:has-text("Export"), button.btn:visible:has-text("Export"), [role="button"]:visible:has-text("Export"), span:visible:has-text("Export")').first();
        await exportBtn.waitFor({ state: 'visible', timeout: 30000 });
        await exportBtn.click({ force: true });
        console.log('  ✓ Clicked Export dropdown button');
        await page.waitForTimeout(1500);

        const downloadPromise = new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Download timeout')), DOWNLOAD_TIMEOUT);
          page.once('download', dl => { clearTimeout(timer); resolve(dl); });
          context.once('page', async p => {
            p.once('download', dl => { clearTimeout(timer); resolve(dl); });
          });
        });

        // Click "Export All" in dropdown menu - try multiple selectors
        const subOption = page.locator('.dropdown-menu:visible a:has-text("Export all"), .dropdown-menu:visible a:has-text("Export All"), .dropdown-menu:visible li:has-text("Export all"), ul.dropdown-menu:visible a:has-text("all")').first();
        if (await subOption.count() > 0 && await subOption.isVisible().catch(() => false)) {
          console.log('  ✓ Clicking "Export All" in Inventory dropdown...');
          await subOption.click({ force: true });
        } else {
          // Fallback: look for any visible dropdown option
          const anyOption = page.locator('.dropdown-menu:visible a, ul.dropdown-menu:visible a').first();
          if (await anyOption.count() > 0) {
            console.log('  ✓ Clicking first available export option...');
            await anyOption.click({ force: true });
          }
        }

        const download = await downloadPromise;
        const downloadStream = await download.createReadStream();
        const chunks = [];
        for await (const chunk of downloadStream) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);
        console.log(`  🎉 Downloaded ${reportName} (${buffer.length} bytes) in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
        return readRows(buffer);
      }

      // 2. General Case: Locate and trigger "Excel" button / Export Dropdown
      console.log(`  Locating Excel button on ${reportName}...`);

      const excelPrioritySelectors = [
        // Direct text "Excel" matches across any tag or color
        'a:visible:has-text("Excel")',
        'button:visible:has-text("Excel")',
        '.btn:visible:has-text("Excel")',
        '.btn-primary:visible:has-text("Excel")',
        '.btn-info:visible:has-text("Excel")',
        '.btn-default:visible:has-text("Excel")',
        '.btn-secondary:visible:has-text("Excel")',
        '.btn-warning:visible:has-text("Excel")',
        'span:visible:has-text("Excel")',
        'input[value*="Excel" i]:visible',
        '[title*="Excel" i]:visible',
        'a[href*="excel" i]:visible',
        'a[href*="export" i]:visible',
        'a:has(i.fa-file-excel-o):visible',
        'button:has(i.fa-file-excel-o):visible',
        'button:visible:has-text("Export")',
        'a:visible:has-text("Export")',
        '.dropdown-toggle:visible:has-text("Export")',
        'button:visible:has-text("Download")',
        'a:visible:has-text("Download")'
      ];

      let targetBtn = null;
      let matchedSelector = '';

      for (const sel of excelPrioritySelectors) {
        const loc = page.locator(sel).first();
        if (await loc.count() > 0 && await loc.isVisible().catch(() => false)) {
          targetBtn = loc;
          matchedSelector = sel;
          break;
        }
      }

      if (!targetBtn || (await targetBtn.count()) === 0) {
        const debugPath = await saveDebugScreenshot(page, reportName);
        throw new Error(`Excel button not found on ${reportName}.${debugPath ? ` Screenshot saved to ${debugPath}` : ''}`);
      }

      console.log(`  ✓ Found Excel button using selector: "${matchedSelector}"`);
      let download = null;

      try {
        const downloadPromise = page.waitForEvent('download', { timeout: DOWNLOAD_TIMEOUT });
        await targetBtn.click({ force: true });

        // Check if an export sub-menu opened
        await page.waitForTimeout(1000);
        const subOption = page.locator('a:visible:has-text("Excel"), button:visible:has-text("Excel"), a:visible:has-text("CSV"), button:visible:has-text("CSV"), li:visible:has-text("Excel"), li:visible:has-text("Export")').first();
        if (await subOption.count() > 0 && await subOption.isVisible().catch(() => false)) {
          console.log('  ✓ Sub-menu appeared, clicking Excel option...');
          await subOption.click({ force: true });
        }

        download = await downloadPromise;
      } catch (dlErr) {
        await saveDebugScreenshot(page, reportName);
        throw new Error(`Download timed out or failed on ${reportName}: ${dlErr.message}`);
      }

      const downloadStream = await download.createReadStream();
      const chunks = [];
      for await (const chunk of downloadStream) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      console.log(`  🎉 Downloaded ${reportName} (${buffer.length} bytes) in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
      return readRows(buffer);
    }

    let successfulReports = 0;
    let failedReports = 0;

    if (reportEnabled('captain')) {
      try {
        const captainRows = await fetchCustomReport('https://billing.petpooja.com/custom_reports/view_report/27', 'Captain Performance Report');
        const capResult = parseCaptainPerformance(captainRows, cycle);
        if (capResult.ok && capResult.captains) {
          for (const cap of capResult.captains) {
            const emp = findEmployeeByName(cap.name, employees);
            if (emp) {
              await saveMetric('cap_sales', cap.total, 'petpooja', 'Captain Performance Report', {
                scheme_name: 'service_captain',
                captain_name: cap.name
              }, emp.employee_id);
            }
          }
          // Save team total for helpers
          await saveMetric('hlp_team_sales', capResult.teamTotal, 'petpooja', 'Captain Performance Report', {
            scheme_name: 'service_helpers',
            team_total: capResult.teamTotal
          });
          successfulReports++;
        }
      } catch (e) {
        failedReports++;
        console.error('⚠️ Could not sync Captain Performance Report:', e.message);
      }
    }

    if (reportEnabled('pax')) {
      try {
        const paxRows = await fetchCustomReport('https://billing.petpooja.com/custom_reports/view_report/61', 'Pax Sales Report');
        const paxResult = parsePaxSales(paxRows, cycle);
        if (paxResult.ok && paxResult.people) {
          for (const person of paxResult.people) {
            const emp = findEmployeeByName(person.name, employees);
            if (emp) {
              await saveMetric('cap_pax_avg', person.apc, 'petpooja', 'Pax Sales Report', {
                scheme_name: 'service_captain',
                pax: person.pax,
                sales: person.sales
              }, emp.employee_id);
            }
          }
          successfulReports++;
        }
      } catch (e) {
        failedReports++;
        console.error('⚠️ Could not sync Pax Sales Report:', e.message);
      }
    }

    if (reportEnabled('item')) {
      try {
        const itemRows = await fetchCustomReport('https://billing.petpooja.com/custom_reports/view_report/65', 'Item Report (Counter & Delivery Sales)');
  
        // A. Calculate Counter Sales
        const counterResult = parseCounterSales(itemRows, cycle);
        if (counterResult.ok) {
          console.log('  📊 Counter Sales breakdown by category:', JSON.stringify(counterResult.byCategory));
          console.log(`  📊 Total Counter Sales: ₹${counterResult.total} across ${counterResult.itemsCounted || 0} items`);
          await saveMetric('b2b_counter_sales', counterResult.total, 'petpooja', 'Item Report (Counter Sales)', {
            scheme_name: 'b2b_counter',
            byCategory: counterResult.byCategory
          });
          successfulReports++;
        }
  
        // B. Calculate Delivery Sales (Swiggy + Zomato) directly from the same master item report
        const itemDeliveryResult = parseDeliverySales(itemRows, cycle);
        if (itemDeliveryResult.ok && itemDeliveryResult.total > 0) {
          console.log('  📊 Delivery Sales breakdown from Item Report:', JSON.stringify(itemDeliveryResult.byChannel));
          console.log(`  📊 Total Delivery Sales: ₹${itemDeliveryResult.total} across ${itemDeliveryResult.orders || 0} rows`);
          await saveMetric('acc_delivery_sales', itemDeliveryResult.total, 'petpooja', 'Item Report (Delivery Sales)', {
            scheme_name: 'accounting',
            byChannel: itemDeliveryResult.byChannel
          });
          successfulReports++;
        }
      } catch (e) {
        failedReports++;
        console.error('⚠️ Could not sync Counter & Delivery Sales from Item Report:', e.message);
      }
    }

    if (reportEnabled('gstn')) {
      try {
        const today = new Date();
        const past99 = new Date(today);
        past99.setDate(today.getDate() - 99);
        const start99 = past99.toISOString().slice(0, 10);
        const b2bQueryCycle = {
          ...cycle,
          start: start99,
          queryEnd: cycle.queryEnd || cycle.end
        };
  
        console.log(`  Pulling Corporate GSTN summary for 100 days history (${start99} to ${b2bQueryCycle.queryEnd})...`);
        const gstRows = await fetchCustomReport('https://billing.petpooja.com/reports/all_restaurant_orders/all', 'Corporate GSTN Summary', b2bQueryCycle);
        const b2bResult = parseB2bGstOrders(gstRows, cycle);
        if (b2bResult.ok) {
          console.log(`  📊 B2B Revenue in period: ₹${b2bResult.totalRevenue} across ${b2bResult.ordersInPeriod} orders`);
          console.log(`  📊 New B2B Clients: ${b2bResult.newCustomerCount} (historical clients seen: ${b2bResult.historicalGstins})`);
          await saveMetric('b2b_rev', b2bResult.totalRevenue, 'petpooja', 'Corporate GSTN Summary', {
            scheme_name: 'b2b_counter',
            ordersInPeriod: b2bResult.ordersInPeriod
          });
          await saveMetric('b2b_clients', b2bResult.newCustomerCount, 'petpooja', 'Corporate GSTN Summary', {
            scheme_name: 'b2b_counter',
            newCustomers: b2bResult.newCustomers
          });
          successfulReports++;
        }
      } catch (e) {
        failedReports++;
        console.error('⚠️ Could not sync GSTN Orders Report:', e.message);
      }
    }

    if (reportEnabled('due_payment')) {
      try {
        const dueQueryCycle = {
          ...cycle,
          start: '2026-03-04',
          queryEnd: cycle.queryEnd || cycle.end
        };
        console.log(`  Pulling Due Payment report from March 04, 2026 (${dueQueryCycle.start} to ${dueQueryCycle.queryEnd})...`);
        const dueRows = await fetchCustomReport('https://billing.petpooja.com/custom_reports/view_report/73', 'Due Payment Report', dueQueryCycle);
        const creditResult = parseCreditRecovery(dueRows, { end: cycle.end, maxAgeDays: 30 });
        if (creditResult.ok) {
          console.log(`  📊 B2B Credit Recovery: Pass=${creditResult.pass}, Overdue=${creditResult.overdueCount}, Outstanding=₹${creditResult.outstandingAmount}`);
          await saveMetric('b2b_credit', creditResult.pass ? 1 : 0, 'petpooja', 'Due Payment Report', {
            scheme_name: 'b2b_counter',
            overdueCount: creditResult.overdueCount,
            outstandingAmount: creditResult.outstandingAmount
          });
          successfulReports++;
        }
      } catch (e) {
        failedReports++;
        console.error('⚠️ Could not sync Due Payment Report:', e.message);
      }
    }

    
    if (reportEnabled('executive')) {
      try {
        console.log("📥 Fetching Executive Sales Summary...");
        // The Executive Sales Report spreads its sections over 17 sheets;
        // the Order Type table is the one we need.
        const execRows = await fetchCustomReport("https://billing.petpooja.com/reports/executive_sales_summary/all", "Executive Sales Summary", cycle, 'order type');
        const execResult = parseExecutiveOrderTypes(execRows);
        if (execResult.ok) {
          console.log("  📊 Executive Sales breakdown:", JSON.stringify(execResult.data));
          await saveMetric("rev_dine_in", execResult.data.dine_in, "petpooja", "Executive Sales Summary", { scheme_name: "revenue_breakdown" });
          await saveMetric("rev_delivery", execResult.data.delivery, "petpooja", "Executive Sales Summary", { scheme_name: "revenue_breakdown" });
          await saveMetric("rev_pick_up", execResult.data.pick_up, "petpooja", "Executive Sales Summary", { scheme_name: "revenue_breakdown" });
          successfulReports++;
        } else {
          // Never fail silently: the report downloaded but its shape was not
          // understood, so the revenue breakdown metrics were not written.
          console.error(`⚠️ Could not parse Executive Sales Summary: ${execResult.error || 'unknown reason'}`);
          dumpReportRows('executive-sales', execRows);
          failedReports++;
        }
      } catch (e) {
        failedReports++;
        console.error("⚠️ Could not sync Executive Sales Summary:", e.message);
      }
    }
    if (reportEnabled('kot')) {
      try {
        console.log('📥 Fetching Kitchen Prep Time Report...');
  
        // Base Menu cache directory.
        // On a serverless runtime the bundle directory is read-only, so fall
        // back to the temp directory — otherwise writing the cache throws and
        // the kitchen prep-time metric is silently skipped.
        const cacheDir = (() => {
          const preferred = join(__dirname, '../.claude/base-menu-cache');
          try {
            mkdirSync(preferred, { recursive: true });
            return preferred;
          } catch {
            const fallback = join(tmpdir(), 'atelier-base-menu-cache');
            mkdirSync(fallback, { recursive: true });
            return fallback;
          }
        })();
        const cacheFile = join(cacheDir, 'base-menu.json');
        const CACHE_DAYS = 15; // Refresh Base Menu every 15 days
  
        let baseMenuRows = null;
        let usedCache = false;
  
        // Check if cached Base Menu exists and is fresh
        if (existsSync(cacheFile)) {
          try {
            const cache = JSON.parse(readFileSync(cacheFile, 'utf8'));
            const cacheAge = Math.floor((Date.now() - new Date(cache.timestamp)) / (1000 * 60 * 60 * 24));
  
            if (cacheAge < CACHE_DAYS) {
              baseMenuRows = cache.rows;
              usedCache = true;
              console.log(`  ✓ Using cached Base Menu (${cacheAge} days old, ${baseMenuRows.length} rows)`);
            } else {
              console.log(`  ℹ️ Base Menu cache is ${cacheAge} days old (>${CACHE_DAYS} days), will refresh...`);
            }
          } catch (e) {
            console.log('  ⚠️ Could not read Base Menu cache, will download fresh:', e.message);
          }
        }
  
        // Download Base Menu if not cached or cache is stale
        if (!baseMenuRows) {
          try {
            console.log('  📥 Fetching Base Menu export from menu.petpooja.com...');
            await page.goto('https://menu.petpooja.com/menus/menu_item_list_new', { waitUntil: 'load', timeout: 30000 });
            await page.waitForTimeout(3000);
  
            // Step 1: Click "Quick Actions" button
            const quickActionsBtn = page.locator('button:visible:has-text("Quick Actions"), a:visible:has-text("Quick Actions"), .btn:visible:has-text("Quick Actions")').first();
            await quickActionsBtn.waitFor({ state: 'visible', timeout: 15000 });
            await quickActionsBtn.click({ force: true });
            console.log('  ✓ Clicked Quick Actions button');
            await page.waitForTimeout(2000);
  
            // Step 2: Click "Download Base Menu [Backup]"
            const downloadMenuBtn = page.locator('a:visible:has-text("Download Base Menu"), button:visible:has-text("Download Base Menu"), li:visible:has-text("Download Base Menu")').first();
            await downloadMenuBtn.waitFor({ state: 'visible', timeout: 15000 });
            await downloadMenuBtn.click({ force: true });
            console.log('  ✓ Clicked Download Base Menu [Backup]');
            await page.waitForTimeout(3000);
  
            // Step 3: Select all Group Categories - CRITICAL STEP
            // Look for "Select All" checkbox or link
            const selectAllOptions = [
              'input[type="checkbox"][id*="select" i][id*="all" i]:visible',
              'input[type="checkbox"]:visible[value*="all" i]',
              'label:visible:has-text("Select All")',
              'a:visible:has-text("Select All")',
              'button:visible:has-text("Select All")',
              '.select-all:visible',
              '#select_all:visible',
              'input[name="select_all"]:visible'
            ];
  
            let selectAllClicked = false;
            for (const selector of selectAllOptions) {
              const elem = page.locator(selector).first();
              if (await elem.count() > 0 && await elem.isVisible().catch(() => false)) {
                await elem.click({ force: true });
                console.log(`  ✓ Selected all Group Categories using selector: ${selector}`);
                selectAllClicked = true;
                await page.waitForTimeout(1000);
                break;
              }
            }
  
            if (!selectAllClicked) {
              // Fallback: find all checkboxes and click them individually
              const allCheckboxes = page.locator('input[type="checkbox"]:visible');
              const checkboxCount = await allCheckboxes.count();
              if (checkboxCount > 0) {
                console.log(`  ℹ️ Select All not found, clicking ${checkboxCount} checkboxes individually...`);
                for (let i = 0; i < checkboxCount; i++) {
                  await allCheckboxes.nth(i).click({ force: true }).catch(() => {});
                }
                console.log('  ✓ Clicked all category checkboxes');
              }
            }
  
            // Step 4: Click Save/Submit to download the zip
            const saveBtn = page.locator('button:visible:has-text("Save"), button:visible:has-text("Download"), button[type="submit"]:visible, input[type="submit"]:visible[value*="Save"]').first();
  
            // Set up download listener before clicking
            const menuZipPromise = page.waitForEvent('download', { timeout: 45000 });
  
            console.log('  ✓ Clicking Save button, waiting for download...');
            await saveBtn.click({ force: true });
            await page.waitForTimeout(2000);
  
            const menuZipDownload = await menuZipPromise;
            const menuZipPath = await menuZipDownload.path();
            console.log(`  ✓ Downloaded Base Menu zip`);
  
            // Step 5: Unzip and find the "items" file
            const AdmZip = await import('adm-zip').then(m => m.default);
            const zip = new AdmZip(menuZipPath);
            const zipEntries = zip.getEntries();
  
            let itemsFile = null;
            for (const entry of zipEntries) {
              if (entry.entryName.toLowerCase().startsWith('items') && !entry.isDirectory) {
                itemsFile = entry;
                break;
              }
            }
  
            if (itemsFile) {
              const itemsBuffer = itemsFile.getData();
              console.log(`  ✓ Found items file: ${itemsFile.entryName} (${itemsBuffer.length} bytes)`);
              baseMenuRows = parseWorkbookBuffer(itemsBuffer);
              console.log(`  ✓ Parsed Base Menu: ${baseMenuRows.length} rows`);
  
              // Cache the Base Menu for future runs
              const cacheData = {
                timestamp: new Date().toISOString(),
                rows: baseMenuRows
              };
              try {
                writeFileSync(cacheFile, JSON.stringify(cacheData));
                console.log(`  💾 Cached Base Menu for next ${CACHE_DAYS} days`);
              } catch (cacheErr) {
                // A cache that cannot be written is not a reason to fail the report.
                console.log(`  ℹ️ Could not cache Base Menu (${cacheErr.message}) — continuing.`);
              }
            } else {
              console.log('  ⚠️ Could not find "items" file in Base Menu zip');
            }
          } catch (menuErr) {
            console.log('  ⚠️ Could not fetch Base Menu, will skip kitchen prep time:', menuErr.message);
          }
        }
  
        if (baseMenuRows && baseMenuRows.length > 0) {
          // Now fetch the KOT report #78
          const kotRows = await fetchCustomReport('https://billing.petpooja.com/custom_reports/view_report/78', 'KOT Preparation Time Report', cycle);
          const prepResult = parseKitchenPrepTime(kotRows, baseMenuRows, { ...cycle, kitchenCategories });
          if (prepResult.ok && prepResult.averageMinutes !== null) {
            console.log(`  📊 Kitchen Prep Time: ${prepResult.averageMinutes} minutes average across ${prepResult.itemsCounted} items`);
            console.log(`  📊 Breakdown by category:`, JSON.stringify(prepResult.byCategory));
            if (prepResult.skipped.notOnMenu > 0) console.log(`  ℹ️ Skipped ${prepResult.skipped.notOnMenu} items not found in Base Menu`);
            if (prepResult.skipped.nonKitchen > 0) console.log(`  ℹ️ Skipped ${prepResult.skipped.nonKitchen} items not in approved kitchen categories`);
  
            await saveMetric('kit_prep_time', prepResult.averageMinutes, 'petpooja', 'KOT Preparation Time Report', {
              scheme_name: 'kitchen',
              itemsCounted: prepResult.itemsCounted,
              byCategory: prepResult.byCategory,
              skipped: prepResult.skipped,
              usedCachedMenu: usedCache
            });
            successfulReports++;
          }
        }
      } catch (e) {
        failedReports++;
        console.error('⚠️ Could not sync Kitchen Prep Time Report:', e.message);
      }
    }

    // The Inventory module lives behind a single sign-on from the billing
    // dashboard, so every group that needs it has to open it first.
    let inventorySessionReady = false;
    async function openInventoryModule() {
      if (inventorySessionReady) return;
      console.log('🔐 Navigating to Petpooja Inventory via SSO...');
      await page.goto('https://billing.petpooja.com/users/dashboard', { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(2000);

      const invLink = page.locator('a[href*="inventory"], a:has-text("Inventory"), .sidebar-menu a:has-text("Inventory")').first();
      if (await invLink.count() > 0 && await invLink.isVisible().catch(() => false)) {
        console.log('  ✓ Clicking Inventory in sidebar navigation...');
        const [newPage] = await Promise.all([
          context.waitForEvent('page', { timeout: 8000 }).catch(() => null),
          invLink.click({ force: true })
        ]);
        if (newPage) {
          await newPage.waitForLoadState('load').catch(() => {});
          await newPage.waitForTimeout(3000);
        } else {
          await page.waitForURL(/inventory\.petpooja\.com/, { timeout: 15000 }).catch(() => {});
          await page.waitForTimeout(3000);
        }
      }
      inventorySessionReady = true;
    }

    if (reportEnabled('inventory')) {
      try {
        await openInventoryModule();

        // Wastage download
        try {
          const wastageRows = await fetchCustomReport('https://inventory.petpooja.com/inventories/wastage_list/', 'Wastage Report', cycle);
          const wastageResult = parseWastage(wastageRows, cycle);
          if (!wastageRows || wastageRows.length === 0) {
            // Nothing was recorded for this period. The honest value is zero —
            // a missing metric would leave the kitchen scheme with no wastage
            // figure at all.
            console.log('  📊 No wastage recorded for this period — recording 0.');
            await saveMetric('kit_wastage', 0, 'petpooja', 'Wastage Report', {
              scheme_name: 'kitchen',
              entries: 0,
              skippedCancelled: 0
            });
            successfulReports++;
          } else if (wastageResult.ok) {
            console.log(`  📊 Total Kitchen Wastage: ₹${wastageResult.total} across ${wastageResult.entries} entries`);
            if (wastageResult.skippedCancelled > 0) {
              console.log(`  ℹ️ Skipped ${wastageResult.skippedCancelled} cancelled wastage entries`);
            }
            await saveMetric('kit_wastage', wastageResult.total, 'petpooja', 'Wastage Report', {
              scheme_name: 'kitchen',
              entries: wastageResult.entries,
              skippedCancelled: wastageResult.skippedCancelled
            });
            successfulReports++;
          }
        } catch (we) {
          failedReports++;
          console.error('⚠️ Could not sync Wastage List:', we.message);
        }
      } catch (ie) {
        failedReports++;
        console.error('⚠️ Could not access Petpooja Inventory:', ie.message);
      }
    }

    if (reportEnabled('purchase_invoices')) {
      try {
        console.log('\n📥 Fetching Purchase Invoices from Petpooja Inventory...');

        await openInventoryModule();

        // Petpooja's purchase bills live under "Stock Purchase". The old
        // `purchase_invoice_list` address no longer exists and answers
        // "Not found :(".
        const purchaseInvoiceUrl = 'https://inventory.petpooja.com/inventories/purchase_list/';
        const purchaseRows = await fetchCustomReport(purchaseInvoiceUrl, 'Purchase Invoices', cycle);
  
        if (purchaseRows && purchaseRows.length > 0) {
          const purchaseResult = parsePurchaseInvoices(purchaseRows, cycle);
          if (purchaseResult.ok && purchaseResult.invoices.length > 0) {
            console.log(`  📊 Found ${purchaseResult.invoices.length} purchase invoices`);
  
            // Sync each invoice to expenses table.
            const invoicePayloads = purchaseResult.invoices.map((invoice) => ({
              category: 'Vendor',
              cost_type: 'variable',
              entry_type: 'actual',
              status: 'approved', // Petpooja data is auto-approved
              amount: invoice.total_amount,
              debit_note: 0,
              vendor_name: invoice.vendor_name,
              invoice_number: invoice.invoice_number,
              invoice_date: invoice.invoice_date,
              description: invoice.description || 'Petpooja purchase invoice',
              payment_status: invoice.payment_status || 'due',
              payment_date: invoice.payment_date || null,
              payment_mode: invoice.payment_mode || null,
              bank_reference: invoice.bank_reference || null,
              created_by: null, // System-generated
              approved_by: null
            }));
            await syncExpenseRows(invoicePayloads, 'purchase invoice(s)');

            successfulReports++;
          } else {
            console.log('  ℹ️ No purchase invoices found for this period');
            dumpReportRows('purchase-invoices', purchaseRows);
          }
        }
      } catch (pe) {
        failedReports++;
        console.error('⚠️ Could not sync Purchase Invoices:', pe.message);
      }
    }

    if (reportEnabled('purchase_returns')) {
      try {
        console.log('\n📥 Fetching Purchase Returns / Debit Notes from Petpooja Inventory...');

        await openInventoryModule();

        const purchaseReturnUrl = 'https://inventory.petpooja.com/inventories/purchase_return_list/';
        const returnRows = await fetchCustomReport(purchaseReturnUrl, 'Purchase Returns', cycle);

        if (returnRows && returnRows.length > 0) {
          const returnsResult = parsePurchaseReturns(returnRows, cycle);
          if (returnsResult.ok && returnsResult.returns.length > 0) {
            console.log(`  📊 Found ${returnsResult.returns.length} purchase returns (debit notes)`);

            // The `b2b_returns` metric comes from the same report.
            const total = returnsResult.returns.reduce((s, r) => s + Number(r.total_amount || 0), 0);
            console.log(`  📊 Total Purchase Returns: ₹${total} across ${returnsResult.returns.length} debit notes`);
            await saveMetric('b2b_returns', total, 'petpooja', 'Purchase Return Report', {
              scheme_name: 'b2b_counter',
              entries: returnsResult.returns.length,
              skippedCancelled: 0
            });

            // Sync each debit note to expenses table.
            const returnPayloads = returnsResult.returns.map((ret) => ({
              category: 'Vendor',
              cost_type: 'variable',
              entry_type: 'actual',
              status: 'approved',
              amount: ret.total_amount, // Store as positive, debit_note field handles reduction
              debit_note: ret.total_amount,
              vendor_name: ret.vendor_name,
              invoice_number: ret.return_number,
              invoice_date: ret.return_date,
              description: `Debit Note: ${ret.description || 'Purchase return'}`,
              payment_status: 'due',
              payment_date: null,
              payment_mode: null,
              bank_reference: null,
              created_by: null,
              approved_by: null
            }));
            await syncExpenseRows(returnPayloads, 'debit note(s)');

            successfulReports++;
          } else {
            console.log('  ℹ️ No purchase returns found for this period');
            dumpReportRows('purchase-returns', returnRows);
          }
        }
      } catch (re) {
        failedReports++;
        console.error('⚠️ Could not sync Purchase Returns:', re.message);
      }
    }

    console.log('\n=============================================================');
    if (failedReports === 0) {
      console.log(`🎉 Petpooja Sync COMPLETED: All ${successfulReports} reports downloaded and metrics updated!`);
    } else if (successfulReports > 0) {
      console.log(`⚠️ Petpooja Sync PARTIALLY COMPLETED: ${successfulReports} reports succeeded, ${failedReports} failed.`);
    } else {
      console.log(`❌ Petpooja Sync FAILED: 0 of ${failedReports} reports could be fetched. Check logs above.`);
    }
    console.log('=============================================================');

    // If there were fatal failures, trigger failure notification
    if (failedReports > 0) {
      await sendFailureEmail({
        message: `${failedReports} Petpooja report(s) failed during synchronization.`,
        errorDetails: `Successful reports: ${successfulReports}, Failed reports: ${failedReports}`
      });
    }
  } catch (fatal) {
    console.error('❌ Sync failed:', fatal.message);
    await sendFailureEmail({
      message: 'Fatal error occurred during Petpooja Sync execution.',
      errorDetails: fatal.stack || fatal.message
    });
    throw fatal;
  } finally {
    await browser.close();
  }

  // REPORT 9: Customer Feedback Integration (Google Sheets)
  // Runs after the browser closes. When the run is split into groups this
  // runs once only — in the last group — so the same values are not written
  // three times over.
  if (!feedbackEnabled()) {
    console.log('\n📊 Skipping Customer Feedback for this group (it runs once, in the last group).');
  } else {
    try {
      console.log('\n📊 Fetching Customer Feedback from Google Sheets...');

      const feedbackRows = await fetchGoogleSheetsData({
        spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '1M0jVGEh1aekFYnMtVkHSA4oobZq5Pg1i3-D6TenF9kU',
        sheetName: process.env.GOOGLE_SHEETS_SHEET_NAME || 'Sheet1',
        range: process.env.GOOGLE_SHEETS_RANGE || 'A:K'
      });

      const feedbackResult = parseCustomerFeedback(feedbackRows, { start: cycle.start, end: cycle.end });
      if (feedbackResult.ok) {
        console.log(`  📊 Customer Feedback: Processed ${feedbackResult.totalResponses} responses in period`);

        // 1. Kitchen Food Quality & Consistency (Team Target: >= 80% / 0.80)
        if (feedbackResult.kitFoodPercent !== null) {
          await saveMetric('kit_food_quality', feedbackResult.kitFoodPercent, 'feedback_form', 'Guest Feedback Google Sheet', {
            scheme_name: 'kitchen',
            responses: feedbackResult.totalResponses,
            percent: feedbackResult.kitFoodPercent
          });
        }

        // 2. Service Helper Quality Feedback (Team Target: >= 80% / 0.80)
        if (feedbackResult.hlpServicePercent !== null) {
          await saveMetric('hlp_quality', feedbackResult.hlpServicePercent, 'feedback_form', 'Guest Feedback Google Sheet', {
            scheme_name: 'service_helpers',
            responses: feedbackResult.totalResponses,
            percent: feedbackResult.hlpServicePercent
          });
        }

        // 3. Service Captain Quality Feedback (Individual Target: >= 80% / 0.80)
        if (feedbackResult.captains) {
          for (const [capName, cData] of Object.entries(feedbackResult.captains)) {
            const emp = findEmployeeByName(capName, employees);
            if (emp) {
              await saveMetric('cap_quality', cData.percent, 'feedback_form', 'Guest Feedback Google Sheet', {
                scheme_name: 'service_captain',
                captain_name: capName,
                score_avg: cData.scoreAvg,
                entries: cData.entries
              }, emp.employee_id);
            } else {
              console.log(`  ℹ️ Feedback recorded for captain "${capName}" (${cData.percent * 100}%) — no exact employee match.`);
            }
          }
        }
      }
    } catch (e) {
      console.error('⚠️ Could not sync Customer Feedback:', e.message);
    }
  }

  console.log('\n=============================================================');
  console.log(`🎉 Sync Engine Complete: Petpooja + Google Sheets Active!`);
  console.log('=============================================================');

  // Record today's sync completion state
  try {
    const stateFile = join(__dirname, 'last-successful-sync.json');
    const d = new Date();
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const { writeFileSync } = await import('node:fs');
    writeFileSync(stateFile, JSON.stringify({
      lastDate: todayStr,
      status: 'success',
      timestamp: new Date().toLocaleTimeString('en-IN')
    }, null, 2));
  } catch {}
}

// Direct execution from CLI — also mirrors output to a rotating log file so a
// scheduled run can be inspected later without re-running it.
// The basename is compared exactly (not endsWith) so that importing this
// module from a bundled serverless function can never trigger an auto-run.
const cliEntry = process.argv[1]?.split(/[\\/]/).pop();
if (cliEntry === 'petpooja-sync.mjs' || cliEntry === 'petpooja-sync.js') {
  const logPath = join(__dirname, 'petpooja-sync.log');
  const stamp = () => `[${new Date().toISOString()}]`;

  const write = (level) => {
    const original = console[level].bind(console);
    return (...args) => {
      const line = `${stamp()} ${args.join(' ')}`;
      original(...args);
      try {
        appendFileSync(logPath, line + '\n');
      } catch { /* logging must never break the sync */ }
    };
  };
  console.log = write('log');
  console.error = write('error');
  console.warn = write('warn');

  runPetpoojaSync()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Fatal Sync Error:', err.message);
      process.exit(1);
    });
}
