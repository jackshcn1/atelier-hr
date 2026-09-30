// Petpooja Automated Variable Pay Sync Engine
// Runs LOCALLY on the office computer (Petpooja blocks cloud/datacenter IPs).
// Credentials are read from scripts/petpooja-config.json, which is git-ignored.

import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseCaptainPerformance,
  parsePaxSales,
  parseKitchenPrepTime,
  parseWastage,
  parseB2bGstOrders,
  parseCreditRecovery,
  parsePurchaseReturns,
  parseDeliverySales,
  parseCounterSales
} from '../lib/variablePayParsers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load credentials from the local config file, then let real env vars win.
function loadLocalConfig() {
  const cfg = {};
  const cfgPath = join(__dirname, 'petpooja-config.json');
  if (!existsSync(cfgPath)) {
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

function parseWorkbookBuffer(buffer) {
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
  const sheetName = wb?.SheetNames?.[0];
  if (!sheetName || !wb.Sheets[sheetName]) return [];
  const sheet = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: true
  });
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
    const { data: newPeriod, error: pErr } = await supabase
      .from('variable_pay_periods')
      .insert([{ period_start: cycle.start, period_end: cycle.end, status: 'open' }])
      .select()
      .single();
    if (pErr) throw new Error(`Failed to create period: ${pErr.message}`);
    period = newPeriod;
    console.log(`✓ Initialized new open period #${period.id}`);
  } else {
    console.log(`✓ Loaded period #${period.id} (Status: ${period.status})`);
    if (period.status === 'locked' || period.status === 'paid') {
      console.log(`🔒 Period #${period.id} is ${period.status}. Automated sync will not overwrite locked data.`);
      return { skipped: true, reason: `Period is ${period.status}` };
    }
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

  // Dynamically import playwright
  const { chromium } = await import('playwright');

  // Headed mode (default on local runs) is more reliable — Petpooja is far
  // less likely to challenge a real visible Chrome window than a headless one.
  // Set PETPOOJA_HEADLESS=true in the config to run without a visible window.
  const headless = String(process.env.PETPOOJA_HEADLESS ?? 'false').toLowerCase() === 'true';

  console.log(`🌐 Launching browser (headless=${headless})...`);
  const browser = await chromium.launch({
    headless,
    channel: headless ? undefined : 'chrome', // use installed Chrome when headed
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled'
    ]
  });

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

    function findEmployeeByName(name, empList) {
      if (!name) return null;
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

    // Helper: download custom report and return sheet rows
    async function fetchCustomReport(url, reportName, queryCycle = cycle) {
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

        await downloadLink.waitFor({ state: 'visible', timeout: 35000 });

        console.log('  ✓ Clicking underlined Download link in queue table...');
        const downloadPromise = new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Download timeout')), 35000);
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
        console.log(`  🎉 Downloaded ${reportName} (${buffer.length} bytes)`);
        return parseWorkbookBuffer(buffer);
      }

      // Special Handler B: Corporate GSTN Summary (/reports/all_restaurant_orders/all)
      if (url.includes('all_restaurant_orders')) {
        console.log('  Handling Corporate GSTN Orders Export (Export all)...');
        const downloadPromise = new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Download timeout')), 35000);
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
        console.log(`  🎉 Downloaded ${reportName} (${buffer.length} bytes)`);
        return parseWorkbookBuffer(buffer);
      }

      // Special Handler C: Petpooja Inventory Exports (Wastage & Purchase Returns)
      if (url.includes('inventory.petpooja.com')) {
        console.log(`  Handling Inventory Export for ${reportName} (Export All)...`);
        const exportBtn = page.locator('.btn-group:visible button:has-text("Export"), button:visible:has-text("Export"), a:visible:has-text("Export"), .dropdown-toggle:visible:has-text("Export")').first();
        await exportBtn.waitFor({ state: 'visible', timeout: 25000 });
        await exportBtn.click({ force: true });
        await page.waitForTimeout(1000);

        const downloadPromise = new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Download timeout')), 35000);
          page.once('download', dl => { clearTimeout(timer); resolve(dl); });
          context.once('page', async p => {
            p.once('download', dl => { clearTimeout(timer); resolve(dl); });
          });
        });

        // Click "Export All" in dropdown menu
        const subOption = page.locator('.dropdown-menu a:visible:has-text("Export All"), .dropdown-menu a:visible:has-text("Export all"), .dropdown-menu a:visible:has-text("All"), .dropdown-menu a:visible:has-text("Excel"), .dropdown-menu a:visible').first();
        if (await subOption.count() > 0 && await subOption.isVisible().catch(() => false)) {
          console.log('  ✓ Clicking "Export All" in Inventory dropdown...');
          await subOption.click({ force: true });
        }

        const download = await downloadPromise;
        const downloadStream = await download.createReadStream();
        const chunks = [];
        for await (const chunk of downloadStream) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);
        console.log(`  🎉 Downloaded ${reportName} (${buffer.length} bytes)`);
        return parseWorkbookBuffer(buffer);
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
        const debugPath = `scripts/debug-${reportName.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
        await page.screenshot({ path: debugPath, fullPage: true });
        console.error(`  ❌ Excel button not found with any selector. Saved screenshot to ${debugPath}`);
        throw new Error(`Excel button not found on ${reportName}. Screenshot saved to ${debugPath}`);
      }

      console.log(`  ✓ Found Excel button using selector: "${matchedSelector}"`);
      let download = null;

      try {
        const downloadPromise = page.waitForEvent('download', { timeout: 35000 });
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
        const debugPath = `scripts/debug-${reportName.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
        await page.screenshot({ path: debugPath, fullPage: true });
        throw new Error(`Download timed out or failed on ${reportName}: ${dlErr.message}`);
      }

      const downloadStream = await download.createReadStream();
      const chunks = [];
      for await (const chunk of downloadStream) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      console.log(`  🎉 Downloaded ${reportName} (${buffer.length} bytes)`);
      return parseWorkbookBuffer(buffer);
    }

    let successfulReports = 0;
    let failedReports = 0;

    // REPORT 1: Captain Performance Report (#27)
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

    // REPORT 2: Pax Sales Report (#61)
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

    // REPORT 3: Counter Sales & Delivery Sales / Item Report (#65)
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

    // REPORT 5: All Restaurant Orders with GSTN (pulled for T-99 days to verify new unique clients)
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

    // REPORT 6: Due Payment Report (Advance Orders from March 04, 2026 to check aged unpaid invoices)
    try {
      const dueQueryCycle = {
        ...cycle,
        start: '2026-03-04',
        queryEnd: cycle.queryEnd || cycle.end
      };
      console.log(`  Pulling Due Payment report from March 04, 2026 (${dueQueryCycle.start} to ${dueQueryCycle.queryEnd})...`);
      const dueRows = await fetchCustomReport('https://billing.petpooja.com/reports/order_summary_ho/1', 'Due Payment Report', dueQueryCycle);
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

    // REPORT 7: Petpooja Inventory (Wastage & Purchase Returns)
    try {
      console.log('🔐 Navigating to Petpooja Inventory via SSO...');
      await page.goto('https://billing.petpooja.com/users/dashboard', { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(2000);

      let invPage = page;
      const invLink = page.locator('a[href*="inventory"], a:has-text("Inventory"), .sidebar-menu a:has-text("Inventory")').first();
      if (await invLink.count() > 0 && await invLink.isVisible().catch(() => false)) {
        console.log('  ✓ Clicking Inventory in sidebar navigation...');
        const [newPage] = await Promise.all([
          context.waitForEvent('page', { timeout: 8000 }).catch(() => null),
          invLink.click({ force: true })
        ]);
        if (newPage) {
          invPage = newPage;
          await invPage.waitForLoadState('load').catch(() => {});
        } else {
          await page.waitForURL(/inventory\.petpooja\.com/, { timeout: 15000 }).catch(() => {});
        }
        await page.waitForTimeout(4000);
      }

      // Wastage download
      try {
        const wastageRows = await fetchCustomReport('https://inventory.petpooja.com/inventories/wastage_list/', 'Wastage Report', cycle, invPage);
        const wastageResult = parseWastage(wastageRows, cycle);
        if (wastageResult.ok) {
          console.log(`  📊 Total Kitchen Wastage: ₹${wastageResult.total} across ${wastageResult.entries} entries`);
          await saveMetric('kit_wastage', wastageResult.total, 'petpooja', 'Wastage Report', {
            scheme_name: 'kitchen',
            entries: wastageResult.entries
          });
          successfulReports++;
        }
      } catch (we) {
        failedReports++;
        console.error('⚠️ Could not sync Wastage List:', we.message);
      }

      // Purchase returns download
      try {
        const returnRows = await fetchCustomReport('https://inventory.petpooja.com/inventories/purchase_return_list/', 'Purchase Returns', cycle, invPage);
        const returnsResult = parsePurchaseReturns(returnRows, cycle);
        if (returnsResult.ok) {
          console.log(`  📊 Total Purchase Returns: ₹${returnsResult.total} across ${returnsResult.entries} debit notes`);
          await saveMetric('b2b_returns', returnsResult.total, 'petpooja', 'Purchase Return Report', {
            scheme_name: 'b2b_counter',
            entries: returnsResult.entries
          });
          successfulReports++;
        }
      } catch (re) {
        failedReports++;
        console.error('⚠️ Could not sync Purchase Returns:', re.message);
      }
    } catch (ie) {
      failedReports++;
      console.error('⚠️ Could not access Petpooja Inventory:', ie.message);
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
  } catch (fatal) {
    console.error('❌ Sync failed:', fatal.message);
    throw fatal;
  } finally {
    await browser.close();
  }
}

// Direct execution from CLI — also mirrors output to a rotating log file so a
// scheduled run can be inspected later without re-running it.
if (process.argv[1]?.endsWith('petpooja-sync.mjs') || process.argv[1]?.endsWith('petpooja-sync.js')) {
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
