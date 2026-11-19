// Petpooja Automated Variable Pay Sync Engine
// Runs LOCALLY on the office computer (Petpooja blocks cloud/datacenter IPs).
// Credentials are read from scripts/petpooja-config.json, which is git-ignored.

import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { existsSync, readFileSync, appendFileSync, mkdirSync, writeFileSync, readdirSync, rmSync, statfsSync, statSync } from 'node:fs';
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
import { cleanVendorName, mergePetpoojaBill } from '../lib/expenseHelpers.js';
import { applyRefreshMisses, describeRefresh } from '../lib/purchaseRefresh.js';
import { readAllRows } from '../lib/supabaseServer.js';
import { monthKeyOf, previousMonthKey, petpoojaMonthWindow, repeatsAnotherMonth } from '../lib/financePeriod.js';
import { RUN_TMP_DIR as BROWSER_TMP_DIR } from '../lib/browserTempDir.js';

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
// Set SYNC_GROUP=1..10, or SYNC_REPORTS=captain,pax for an explicit set.
// With neither set, every report runs — the local computer path is unchanged.
//
// The groups are sized for a *slow* day, not a fast one: Petpooja's pages can
// take twice as long to load, and a group that fits on a good day but not on a
// bad one fails the whole nightly run.
//
// There is now one report per group. A serverless function may run for at most
// 300 seconds, and a slow Petpooja afternoon pushed the old two-report groups
// past that ceiling — the run came back with HTTP 504 for the groups that were
// too big. One report per group keeps every request well inside the limit and
// costs only one extra login.
export const REPORT_GROUPS = {
  1: ['captain'],
  2: ['pax'],
  3: ['item'],
  4: ['gstn'],
  5: ['due_payment'],
  6: ['executive'],
  7: ['kot'],
  8: ['inventory'],
  9: ['purchase_invoices'],
  10: ['purchase_returns'],
};

// The login gets one time budget for every attempt it makes. A serverless
// function may run for 300 seconds in total and the reports need most of that,
// so the login may not spend the whole request.
const LOGIN_BUDGET_MS = 150000;

// The Petpooja session lives in three cookies on the `.petpooja.com` domain.
//
// Closing the browser does NOT end the session — Petpooja keeps it alive on
// its side, and while it is alive the next login is refused (the email step is
// accepted, the password box never appears). The old workaround was to log
// out after every report group, which cost one login per group.
//
// Handing these cookies to the next serverless invocation is what lets the
// whole nightly run share ONE login: the next group restores the session and
// goes straight to work.
const SESSION_COOKIE_NAMES = ['user_id', 'user_key', 'PETPOOJA_CO'];
const DASHBOARD_URL = 'https://billing.petpooja.com/users/dashboard';
const LOGOUT_URL = 'https://billing.petpooja.com/users/logout';

// Analytics and advertising hosts. Their scripts are never needed to read a
// report, and they are expensive: on the serverless CPU they are part of
// what makes a page too slow to finish, and a page that never finishes is a
// browser that gets killed.
const TRACKING_HOSTS = /google-analytics\.com|googletagmanager\.com|doubleclick\.net|facebook\.net|facebook\.com|hotjar|clarity\.ms|mixpanel|intercom\.io|hotjar\.com|optimizely|segment\.(io|com)|clarity\.ms/i;

// The live session is kept in a one-row table, so any report group can pick
// it up and a run that is killed half way does not leave the account holding
// a session that turns away the next run.
const SESSION_TABLE = 'petpooja_sync_session';

// Every report the engine knows about, used to reject a bad group or report
// name instead of quietly running nothing.
export const REPORT_NAMES = [...new Set(Object.values(REPORT_GROUPS).flat())];

// ---------------------------------------------------------------------------
// What the machine is actually doing when the browser dies.
//
// The browser on the serverless host dies at random, and the reason changes
// the fix: a browser killed for want of memory looks exactly like one that
// crashed. Node's own numbers say nothing about the browser — the browser is
// a separate process — so this reads the container's own limit and the real
// footprint of every browser process straight from the kernel.
//
// On a laptop there is no /proc and no cgroup, so the numbers simply are not
// there. Nothing depends on them; they only explain a crash.
// ---------------------------------------------------------------------------

// Find the browser process.
//
// Playwright does not hand the browser's process over, but the browser is a
// direct child of this process, so the kernel can be asked. This is the only
// way to read the browser's real memory — Node's own numbers say nothing
// about a separate process — and to tell an out-of-memory kill (SIGKILL)
// from a crash (SIGSEGV).
//
// The command line is read in full: the browser's own folder is at the very
// end of it, and a shortened command line loses it.
function findBrowserPid() {
  try {
    const pids = readdirSync('/proc').filter((n) => /^\d+$/.test(n));
    for (const pid of pids) {
      if (Number(pid) === process.pid) continue;
      try {
        const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
        const ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
        if (ppid !== process.pid) continue;
        const cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ').trim();
        if (!cmd || !/chromium|chrome|headless_shell/i.test(cmd)) continue;
        return { pid: Number(pid), cmd: cmd.slice(0, 4000) };
      } catch {
        // The process ended while we were looking at it.
      }
    }
  } catch {
    // No /proc — not a Linux box.
  }
  return null;
}

// A one-off look at what this machine will let us see. It is the first thing
// to read when the browser dies and the reason is not obvious.
function environmentReport() {
  const lines = [];
  try {
    lines.push(`proc pids: ${readdirSync('/proc').filter((n) => /^\d+$/.test(n)).length}`);
  } catch {
    lines.push('proc: not readable');
  }
  try {
    lines.push(`cgroup: ${readdirSync('/sys/fs/cgroup').slice(0, 12).join(', ')}`);
  } catch {
    lines.push('cgroup: not readable');
  }
  try {
    const mem = readFileSync('/proc/meminfo', 'utf8');
    lines.push(`meminfo: ${(mem.match(/MemTotal:\s*(\d+)/) || [])[1] || '?'} kB total`);
  } catch {
    lines.push('meminfo: not readable');
  }
  lines.push(`tmp: ${tempSpace()}`);
  return lines.join(' | ');
}

// How much room is left where the browser keeps its temporary files.
//
// The browser is unpacked into /tmp, keeps its profile and its cache there,
// and the serverless host gives it very little room. When /tmp fills up the
// browser starts failing in confusing ways — pages whose scripts arrive out
// of order, exports that silently do nothing — and the warning it prints
// says almost nothing.
function tempSpace() {
  try {
    const s = statfsSync('/tmp');
    const free = Math.round((s.bavail * s.bsize) / 1048576);
    const total = Math.round((s.blocks * s.bsize) / 1048576);
    let profiles = 0;
    try {
      profiles = readdirSync('/tmp').filter((n) => n.startsWith('playwright_chromiumdev_profile')).length;
    } catch {
      // No listing — the space is what matters.
    }
    let ours = '';
    try {
      const s2 = statfsSync(RUN_TMP_DIR);
      ours = `, run folder ${Math.round((s2.bavail * s2.bsize) / 1048576)}MB free`;
    } catch {
      // The run folder may not exist yet.
    }
    const biggest = biggestTempItems();
    return `${free}MB free of ${total}MB (${profiles} leftover browser profile(s)${ours})`
      + (biggest ? ` | biggest: ${biggest}` : '');
  } catch {
    return 'unknown';
  }
}

// Clear the browser profiles left behind by a browser that died.
//
// A profile is a folder in /tmp with the browser's cache in it. When the
// browser dies, nobody removes it, and the serverless host reuses the same
// instance for the next group — so the dead profiles pile up until /tmp is
// full and the next browser starts misbehaving. Only profiles that have been
// idle for a while are removed, so a run happening at the same time is never
// disturbed.
// A live browser writes to its profile all the time, so a profile that has
// not been touched for two minutes belongs to a browser that is gone.
function cleanStaleProfiles() {
  let removed = 0;
  for (const folder of tempFolders()) {
    try {
      const cutoff = Date.now() - 2 * 60 * 1000;
      for (const name of readdirSync(folder)) {
        if (!name.startsWith('playwright_chromiumdev_profile')) continue;
        const path = join(folder, name);
        try {
          if (statSync(path).mtimeMs > cutoff) continue;
          rmSync(path, { recursive: true, force: true });
          removed++;
        } catch {
          // Still in use, or already gone.
        }
      }
    } catch {
      // No listing.
    }
  }
  return removed;
}

// The folder the browser keeps its profile in, read from the browser's own
// command line. It is the folder that has to be removed when the browser
// goes, so that the next group starts with the same amount of room.
function profileDirOf(cmdline) {
  const match = /--user-data-dir=(\S+)/.exec(cmdline || '');
  return match ? match[1] : null;
}

// How much the browser process is using right now, while it is still alive.
//
// This is the number that matters and that Node cannot give: the browser is
// a separate process. A browser killed for want of memory is reported by the
// kernel with SIGKILL; a browser that crashed reports SIGSEGV. Knowing which
// one it was is the difference between "give it less to do" and "give it more
// room".
function browserMemoryBytes(browserPid) {
  if (!browserPid) return 0;
  try {
    const statm = readFileSync(`/proc/${browserPid}/statm`, 'utf8').trim().split(/\s+/);
    return (Number(statm[1]) || 0) * 4096;
  } catch {
    return 0;
  }
}

function browserMemory(browserPid) {
  const bytes = browserMemoryBytes(browserPid);
  return bytes ? `${Math.round(bytes / 1048576)}MB` : 'unknown';
}

// Watch the browser while a report is being fetched, and report the highest
// it ever got.
//
// The heavy pages kill the browser on the serverless host, and the only
// question that matters is whether they kill it by using too much memory.
// The browser is gone by the time it dies, so the only way to know is to look
// while it is alive.
//
// The process id is passed in rather than read from the outside: the browser
// lives inside the run, and its id is only known there.
function startMemoryWatch(label, pid) {
  let peak = 0;
  const timer = setInterval(() => {
    // A read that fails must never take the run down with it.
    try {
      const bytes = browserMemoryBytes(pid);
      if (bytes > peak) peak = bytes;
    } catch {
      // The browser is gone.
    }
  }, 250);
  return {
    stop() {
      clearInterval(timer);
      if (peak) console.log(`  🧠 Peak browser memory while ${label}: ${Math.round(peak / 1048576)}MB`);
    },
  };
}

function memorySnapshot() {
  const parts = [];

  // The container's limit and how much of it is in use.
  const cgroups = [
    ['/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory.current'],
    ['/sys/fs/cgroup/memory/memory.limit_in_bytes', '/sys/fs/cgroup/memory/memory.usage_in_bytes'],
  ];
  for (const [limitPath, usagePath] of cgroups) {
    try {
      const limit = readFileSync(limitPath, 'utf8').trim();
      const usage = readFileSync(usagePath, 'utf8').trim();
      if (/^\d+$/.test(limit)) {
        parts.push(`container ${Math.round(Number(usage) / 1048576)}MB of ${Math.round(Number(limit) / 1048576)}MB`);
      }
      break;
    } catch {
      // Not this layout — try the next one.
    }
  }

  // Every browser process and what it is really using.
  try {
    const pids = readdirSync('/proc').filter((n) => /^\d+$/.test(n));
    let total = 0;
    const each = [];
    for (const pid of pids) {
      if (Number(pid) === process.pid) continue;
      try {
        const cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8');
        if (!/chromium|chrome|headless_shell/i.test(cmd)) continue;
        const pages = Number(readFileSync(`/proc/${pid}/statm`, 'utf8').trim().split(/\s+/)[1] || 0);
        const rss = pages * 4096;
        total += rss;
        each.push(`${pid}:${Math.round(rss / 1048576)}MB`);
      } catch {
        // The process ended while we were looking at it.
      }
    }
    if (each.length) {
      parts.push(`browser ${each.join(' ')} (total ${Math.round(total / 1048576)}MB)`);
    }
  } catch {
    // No /proc — not a Linux box.
  }

  const mem = process.memoryUsage();
  parts.push(`node rss ${Math.round(mem.rss / 1048576)}MB heap ${Math.round(mem.heapUsed / 1048576)}MB`);
  parts.push(`tmp ${tempSpace()}`);
  return parts.join(' | ');
}

// A folder of our own for everything the browser writes while it runs.
//
// Playwright puts the browser's profile, its cache and the files it
// downloads into the system's temporary folder — on the serverless host that
// is /tmp, and it is only 512MB. Every report group leaves a profile behind,
// and ten of them fill the disk; the browser then starts dying in ways that
// look like nothing to do with the disk at all. The room left in /tmp is
// printed with every death, and it was down to 16MB when the last groups
// failed.
//
// So the browser writes into a folder of our own, and that folder is emptied
// when the browser closes.
const RUN_TMP_DIR = BROWSER_TMP_DIR;

// Point the browser's temporary files at our own folder.
//
// The serverless route sets this BEFORE the browser is unpacked, so there is
// exactly one copy of the browser on the disk. This is the belt to that
// braces: if the engine is ever run without the route (the office computer
// path), the folder is still ours — and it never overrides a folder that has
// already been chosen, because changing it after the browser is unpacked
// would unpack it a second time.
function useOwnTempFolder() {
  try {
    mkdirSync(RUN_TMP_DIR, { recursive: true });
    if (!process.env.TMPDIR) process.env.TMPDIR = RUN_TMP_DIR;
    return true;
  } catch {
    // No permission — the system folder will have to do.
    return false;
  }
}

// Every folder the browser may write to.
function tempFolders() {
  return ['/tmp', RUN_TMP_DIR];
}

// Is this a core dump the browser left behind?
//
// A browser that dies writes a core dump the size of its own memory — about
// 900MB on this host — and the disk is 512MB. One crash is enough to fill it,
// and then every browser after it fails for the wrong reason.
function isCoreDump(name) {
  return name.startsWith('core.chromium') || name.startsWith('core.headless');
}

// Remove what the browser left behind.
//
// The disk on the serverless host is small, and every browser leaves a
// profile and an artifacts folder behind. `force` is used when the disk is
// low: at that point nothing may be left.
function clearRunTemp(force = false) {
  for (const folder of tempFolders()) {
    try {
      for (const name of readdirSync(folder)) {
        // Core dumps are always safe to remove: they are only written by a
        // browser that has already died.
        if (isCoreDump(name)) {
          try {
            rmSync(join(folder, name), { recursive: true, force: true });
          } catch {
            // Already gone.
          }
          continue;
        }
        if (!name.startsWith('playwright')) continue;
        const path = join(folder, name);
        try {
          // A folder that was touched in the last half-minute may belong to
          // a browser that is running right now, in another request.
          if (!force && Date.now() - statSync(path).mtimeMs < 30000) continue;
          rmSync(path, { recursive: true, force: true });
        } catch {
          // Still in use, or already gone.
        }
      }
    } catch {
      // Nothing to clear.
    }
  }
}

// How much room is left in the temporary folder, in megabytes.
function freeTempMb() {
  try {
    const s = statfsSync('/tmp');
    return Math.round((s.bavail * s.bsize) / 1048576);
  } catch {
    return -1;
  }
}

// The size of the biggest things in the temporary folders.
//
// When the disk fills up, the only question that matters is what filled it.
// This answers it.
function dirSize(path, depth = 2) {
  let total = 0;
  let files = 0;
  let entries = [];
  try {
    entries = readdirSync(path);
  } catch {
    return 0;
  }
  for (const name of entries) {
    if (files > 400) break;
    try {
      const st = statSync(join(path, name));
      if (st.isDirectory() && depth > 0) {
        total += dirSize(join(path, name), depth - 1);
        files++;
      } else {
        total += st.size;
        files++;
      }
    } catch {
      // A file that went away.
    }
  }
  return total;
}

function biggestTempItems() {
  const items = [];
  for (const folder of tempFolders()) {
    let entries = [];
    try {
      entries = readdirSync(folder);
    } catch {
      continue;
    }
    for (const name of entries) {
      try {
        const st = statSync(join(folder, name));
        // Files are listed too, not only folders. A browser that crashes
        // leaves a file behind — a crash dump is the size of the memory the
        // browser had — and a report that only counts folders hides exactly
        // the thing that matters.
        const size = st.isDirectory()
          ? dirSize(join(folder, name))
          : st.size;
        items.push(`${name} ${Math.round(size / 1048576)}MB`);
      } catch {
        // Gone.
      }
    }
  }
  items.sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
  return items.slice(0, 4).join(', ');
}

// A browser that dies can leave its helper processes behind. On the serverless
// host the same instance serves the next request, and those orphans keep
// holding the memory the next browser needs — which turns one death into a
// run of deaths, exactly as the logs show.
//
// Only processes belonging to THIS browser are touched: the dead browser's
// own pid, anything the kernel re-parented to init after it died (PPid 1),
// and anything still parented to it. A browser belonging to another request
// running at the same time is left alone.
function killOrphanBrowsers(browserPid) {
  let killed = 0;
  try {
    const pids = readdirSync('/proc').filter((n) => /^\d+$/.test(n));
    for (const pid of pids) {
      if (Number(pid) === process.pid) continue;
      try {
        const cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8');
        if (!/chromium|chrome|headless_shell/i.test(cmd)) continue;
        // Field 4 of /proc/<pid>/stat is the parent pid.
        const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
        const ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
        const isOurs = Number(pid) === browserPid || ppid === browserPid || ppid === 1;
        if (!isOurs) continue;
        process.kill(Number(pid), 'SIGKILL');
        killed++;
      } catch {
        // Already gone, or not ours to kill.
      }
    }
  } catch {
    // No /proc — nothing to clean up.
  }
  return killed;
}

// The reports that feed the finance pages.
//
// The variable-pay metrics are paused, so the run only pulls the reports the
// finance pages need:
//
//   due_payment         money owed by customers  -> finance_receivables
//   executive           the calendar-month revenue split -> finance_monthly_revenue
//   purchase_invoices   vendor bills -> expenses
//   purchase_returns    debit notes   -> expenses
//
// The rest of the reports feed variable pay only, and are not pulled at all.
export const FINANCE_REPORTS = ['due_payment', 'executive', 'purchase_invoices', 'purchase_returns'];

// Is this run finance-only?
//
// Finance-only means two things: the variable-pay reports are not pulled, and
// nothing is written to the variable-pay metric rows. What is left is the
// finance data — the revenue split, the vendor bills and the money owed by
// customers.
export function isFinanceOnly() {
  const value = String(process.env.SYNC_FINANCE_ONLY ?? '').toLowerCase();
  return value === '1' || value === 'true';
}

function reportEnabled(name) {
  const explicit = process.env.SYNC_REPORTS;
  if (explicit) {
    return explicit.split(',').map((s) => s.trim()).filter(Boolean).includes(name);
  }
  // Finance-only: the reports that feed variable pay are not pulled.
  if (isFinanceOnly() && !FINANCE_REPORTS.includes(name)) return false;
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
// The Google Sheets customer-feedback pull is not a Petpooja report, but it
// shares the same pay period and writes to the same metric rows. When the
// run is split into groups it must run only once — the last group — so the
// values are not written over and over.
//
// It writes variable-pay metrics, so a finance-only run never pulls it.
function feedbackEnabled() {
  if (process.env.SYNC_REPORTS) return false; // an explicit report list means Petpooja only
  if (isFinanceOnly()) return false;
  const group = process.env.SYNC_GROUP;
  if (!group) return true;
  const lastGroup = Math.max(...Object.keys(REPORT_GROUPS).map(Number));
  return Number(group) === lastGroup;
}

// Download timeout for report files. The default suits a local desktop; a
// serverless runner is slower and needs longer for the large Item Report.
const DOWNLOAD_TIMEOUT = Number(process.env.PETPOOJA_DOWNLOAD_TIMEOUT || 35000);

// Debug screenshots are diagnostic only. The working directory is read-only
// on a serverless runtime, so fall back to a temp directory — and never let a
// failed screenshot mask the real error it was meant to capture.
async function saveDebugScreenshot(page, name, options = {}) {
  // On the serverless runtime there is nowhere to write the file, so skip it
  // rather than spend the time limit on a screenshot that cannot be saved.
  if (process.env.VERCEL) return null;

  const file = `debug-${name.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
  const dir = process.env.PETPOOJA_DEBUG_DIR
    || (existsSync(join(process.cwd(), 'scripts')) ? 'scripts' : tmpdir());
  const filePath = join(dir, file);
  try {
    // A busy page can take a long time to render; the screenshot must never
    // hold up the report it is meant to document.
    await page.screenshot({ path: filePath, fullPage: false, timeout: 5000, ...options });
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

/**
 * Write the money owed by customers — the finance reading of the Due Payment
 * Report.
 *
 * The rows are a snapshot of one calendar month: each pull replaces that
 * month's rows, so the page always shows the latest picture, and a month that
 * is over keeps the picture it was left with.
 *
 * @param {object} supabase a Supabase service-role client
 * @param {object} creditResult the result of parseCreditRecovery()
 * @param {string} [monthKey] 'YYYY-MM'; today in IST by default
 */
async function saveReceivablesSnapshot(supabase, creditResult, monthKey) {
  const month = monthKey || monthKeyOf();
  const invoices = creditResult?.openInvoices || [];

  // The same invoice can appear twice in the report; one row is enough.
  const seen = new Set();
  const payload = [];
  for (const row of invoices) {
    const key = `${row.invoice} ${row.customer}`;
    if (seen.has(key)) continue;
    seen.add(key);
    payload.push({
      month,
      invoice_no: row.invoice || '',
      customer_name: row.customer || '',
      invoice_date: row.date || null,
      remaining_amount: row.remaining,
      age_days: row.ageDays || 0,
      is_overdue: !!row.isOverdue,
      source: 'petpooja:due_payment_report',
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  const { error: deleteError } = await supabase
    .from('finance_receivables')
    .delete()
    .eq('month', month);
  if (deleteError) throw new Error(deleteError.message);

  // In batches, so a long list of invoices is never too much for one write.
  for (let i = 0; i < payload.length; i += 200) {
    const { error } = await supabase
      .from('finance_receivables')
      .insert(payload.slice(i, i + 200));
    if (error) throw new Error(error.message);
  }

  return { month, count: payload.length };
}

/**
 * Keep the supplier list in step with the bills.
 *
 * Every bill names the supplier it came from, and those names are the truth
 * about who the restaurant buys from. The vendor list is what the manual
 * expense screen offers, so a new supplier has to be added to it — otherwise
 * the next bill typed by hand cannot pick it.
 *
 * The name Petpooja writes carries a "[Supplier]" tag, and the same supplier
 * sometimes turns up without it. Both are reduced to one name, so one
 * supplier is one entry however Petpooja happened to spell it that day.
 *
 * @param {object} supabase a Supabase service-role client
 */
async function syncVendorList(supabase) {
  const { data: bills, error: billError } = await supabase
    .from('expenses')
    .select('vendor_name');
  if (billError) throw new Error(billError.message);

  // The names the bills ask for, one per supplier.
  const wanted = new Map();
  for (const bill of bills || []) {
    const name = cleanVendorName(bill.vendor_name);
    if (!name) continue;
    const key = name.toLowerCase();
    if (!wanted.has(key)) wanted.set(key, name);
  }

  const { data: existing, error: vendorError } = await supabase
    .from('vendors')
    .select('id, name');
  if (vendorError) throw new Error(vendorError.message);

  const known = new Set((existing || []).map((v) => cleanVendorName(v.name).toLowerCase()));
  const missing = [...wanted.values()].filter((name) => !known.has(name.toLowerCase()));

  if (missing.length === 0) return { added: 0, total: wanted.size };

  // In batches, so a long supplier list is never too much for one write.
  for (let i = 0; i < missing.length; i += 100) {
    const { error } = await supabase
      .from('vendors')
      .insert(missing.slice(i, i + 100).map((name) => ({ name })));
    if (error) throw new Error(error.message);
  }

  return { added: missing.length, total: wanted.size };
}

export async function runPetpoojaSync(options = {}) {
  const cfg = loadLocalConfig();

  // `sessionCookies` is a session handed over by the previous report group;
  // `keepSession` says to leave the session alive and hand it on, instead of
  // logging out at the end of this group.
  const sessionCookies = options.sessionCookies || null;
  // SYNC_KEEP_SESSION lets a command-line run leave the session alive for a
  // follow-up run — the same hand-over the serverless groups use.
  const keepSession = options.keepSession === true
    || String(process.env.SYNC_KEEP_SESSION ?? '').toLowerCase() === 'true';

  // An unknown group or report name must fail loudly. Running nothing and
  // reporting success would look like a working sync while no metric was
  // ever fetched.
  if (process.env.SYNC_GROUP && !REPORT_GROUPS[Number(process.env.SYNC_GROUP)]) {
    throw new Error(
      `Unknown SYNC_GROUP "${process.env.SYNC_GROUP}". Known groups: ${Object.keys(REPORT_GROUPS).join(', ')}.`
    );
  }
  if (process.env.SYNC_REPORTS) {
    const unknown = process.env.SYNC_REPORTS.split(',').map(s => s.trim()).filter(Boolean)
      .filter(name => !REPORT_NAMES.includes(name));
    if (unknown.length > 0) {
      throw new Error(
        `Unknown report(s) in SYNC_REPORTS: ${unknown.join(', ')}. Known reports: ${REPORT_NAMES.join(', ')}.`
      );
    }
  }

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

  // The pay period.
  //
  // A finance-only run does not touch it: opening a period, closing a stale
  // one and locking a finished one are all payroll decisions, and the
  // variable pay side is paused. The finance figures — the revenue split, the
  // vendor bills, the money owed — belong to a calendar month and need no
  // pay period.
  let period = null;
  if (isFinanceOnly()) {
    console.log('💼 Finance-only run — the pay periods are left alone.');
  } else {
    const { data: foundPeriod } = await supabase
      .from('variable_pay_periods')
      .select('*')
      .eq('period_start', cycle.start)
      .eq('period_end', cycle.end)
      .maybeSingle();
    period = foundPeriod;

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
  //
  // Chromium's own words about why it died have to be asked for BEFORE
  // playwright is loaded: it reads the DEBUG setting when it loads, and then
  // prints what the browser says — the signal, the failed check. That is the
  // difference between a crash and an out-of-memory kill.
  if (process.env.PETPOOJA_BROWSER_DEBUG) {
    process.env.DEBUG = process.env.DEBUG || 'pw:browser*';
  }
  const { chromium } = await import('playwright-core');

  // Headed mode (default on local runs) is more reliable — Petpooja is far
  // less likely to challenge a real visible Chrome window than a headless one.
  // Set PETPOOJA_HEADLESS=true in the config to run without a visible window.
  const headless = String(process.env.PETPOOJA_HEADLESS ?? 'false').toLowerCase() === 'true';

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

  // The browser can die on us mid-run — Chromium crashing under memory
  // pressure on the serverless host, or Petpooja dropping the session. That
  // is not a report failure, it is a dead browser, so the browser, its
  // context and its page are created through openBrowser() and can be
  // replaced with a fresh set when the login has to be retried.
  let browser = null;
  let context = null;
  let page = null;
  let browserPid = null;
  let browserProfileDir = null;

  // Set while the browser is being closed on purpose, so the "the browser
  // died" message is only printed when it really did.
  let closingOnPurpose = false;

  // The session cookies this run was given, if any.
  //
  // They are put back into every new context, so a browser that dies and is
  // replaced does not lose the session with it.
  let carriedCookies = null;

  async function openBrowser() {
    console.log(`🌐 Launching browser (headless=${headless})...`);
    // The browser writes into a folder of our own, and that folder is emptied
    // when the browser closes. On the serverless host the system's temporary
    // folder is only 512MB, and ten report groups' worth of browser profiles
    // fill it — after which the browser dies in ways that look like anything
    // but a full disk.
    useOwnTempFolder();

    // The disk is checked before the browser starts, not after it dies: when
    // the disk is full the browser cannot even begin, and that is a different
    // failure from a browser that dies later.
    const free = freeTempMb();
    console.log(`  💽 ${tempSpace()}`);
    if (free >= 0 && free < 150) {
      console.log(`  ⚠️ Only ${free}MB left — clearing everything the browser has left behind.`);
      clearRunTemp(true);
    }

    // A browser that died leaves its profile and cache behind in /tmp, and
    // the serverless host reuses the same instance for the next group. Those
    // leftovers are cleared first, because a full /tmp makes the next
    // browser behave in ways that look like nothing to do with the disk.
    const cleared = cleanStaleProfiles();
    if (cleared > 0) console.log(`  🧹 Cleared ${cleared} leftover browser profile(s) from /tmp.`);

    browser = await chromium.launch(launchOptions);

    // When the browser dies, the reason matters: out of memory looks exactly
    // like a crash and tells you nothing. This is the only clue there is.
    // The browser's own process id, so that anything it leaves behind can be
    // recognised and cleared. Playwright does not hand this over officially,
    // so it is read defensively — a null id only costs the extra cleanup.
    const browserProc = browser?._process ?? null;
    const found = findBrowserPid();
    browserPid = found?.pid ?? browserProc?.pid ?? null;
    browserProfileDir = profileDirOf(found?.cmd || '');
    browser.on('disconnected', () => {
      // The same event fires when the browser is closed on purpose, so it is
      // only worth reporting when the browser died on its own.
      if (closingOnPurpose) return;
      const exit = browserProc
        ? ` (exit code ${browserProc.exitCode}, signal ${browserProc.signalCode})`
        : '';
      console.error(`  ⚠️ The browser went away${exit}. ${memorySnapshot()}`);
      const killed = killOrphanBrowsers(browserPid);
      if (killed > 0) {
        console.error(`  🧹 Cleared ${killed} leftover browser process(es).`);
      }
      if (browserProfileDir) {
        try {
          rmSync(browserProfileDir, { recursive: true, force: true });
        } catch {
          // Already gone.
        }
        browserProfileDir = null;
      }
      clearRunTemp();
    });

    console.log(`  🧠 Browser memory after launch: ${browserMemory(browserPid)} (${found?.cmd || 'browser process not found'})`);
    if (!browserPid) console.log(`  🖥️ ${environmentReport()}`);

    context = await browser.newContext({
      acceptDownloads: true,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      viewport: { width: 1366, height: 768 },
      locale: 'en-US',
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    // The pages we drive are single-page apps. On the serverless CPU the
    // images, fonts and trackers are what stop the app from painting its form
    // in time — the login form then sits in the DOM but stays invisible.
    // None of them are needed to read a report, so they are never fetched.
    await context.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (type === 'image' || type === 'font' || type === 'media') {
        return route.abort();
      }
      // Analytics and advertising scripts are pure overhead. They run a lot
      // of code on every single page, for numbers nobody in the payroll ever
      // looks at — and on a one-vCPU serverless box that work is part of
      // what tips the browser over. The pages work perfectly well without
      // them.
      if (TRACKING_HOSTS.test(route.request().url())) {
        return route.abort();
      }
      return route.continue();
    });

    page = await context.newPage();

    // A replacement browser starts with the session this run was given.
    if (carriedCookies?.length) {
      await context.addCookies(carriedCookies).catch(() => {});
    }
  }

  async function closeBrowser() {
    closingOnPurpose = true;
    try {
      await browser?.close();
    } catch {
      // A browser that already died needs no closing.
    }
    closingOnPurpose = false;
    browser = null;
    context = null;
    page = null;
    // The profile is the browser's own folder in /tmp. It is big, and it is
    // not cleaned up when the browser dies — so it is cleaned up here.
    if (browserProfileDir) {
      try {
        rmSync(browserProfileDir, { recursive: true, force: true });
      } catch {
        // Already gone.
      }
      browserProfileDir = null;
    }
    clearRunTemp();
  }

  await openBrowser();

  async function saveMetric(metricId, actual, sourceType, filename, detail, employeeId = null) {
    // The variable-pay metrics are paused. A finance-only run writes nothing
    // to them — the finance pages get their own figures, and the attainment
    // keeps the numbers it has until variable pay is switched back on.
    if (isFinanceOnly()) {
      console.log(`  ⏸️ Not writing the variable-pay metric ${metricId} — variable pay is paused.`);
      return;
    }

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
  // The existing bills that carry any of the given invoice numbers.
  //
  // The list is fetched in batches: a long list of invoice numbers makes a
  // long address, and a long address is refused by the database gateway
  // before it ever reaches the table.
  async function fetchExpensesByInvoice(invoiceNumbers) {
    const found = [];
    const batchSize = 150;
    for (let i = 0; i < invoiceNumbers.length; i += batchSize) {
      const { data, error } = await supabase
        .from('expenses')
        .select('id, vendor_name, invoice_number, amount, invoice_date, payment_status, debit_note, source, category, cost_type, entry_type, status, description, created_by, approved_by')
        .in('invoice_number', invoiceNumbers.slice(i, i + batchSize));
      if (error) throw error;
      found.push(...(data || []));
    }
    return { data: found };
  }

  async function syncExpenseRows(rows, label) {
    if (!rows || rows.length === 0) return { inserted: 0, updated: 0 };

    // A bill is identified by its supplier and its invoice number.
    //
    // The supplier name is compared without regard to capitalisation: the
    // same supplier written "AMBROSIA" on one day and "Ambrosia" the next is
    // one supplier, and treating it as two would write every bill twice.
    const keyOf = (vendor, invoice) =>
      `${String(vendor ?? '').trim().toLowerCase()}\u0000${String(invoice ?? '').trim().toLowerCase()}`;

    // The existing bills are found by invoice number — that is the bill's
    // own identity — and, for the rare bill that carries no invoice number,
    // by its supplier name.
    const invoiceNumbers = [...new Set(rows.map(r => r.invoice_number).filter(Boolean))];
    const unnamedVendors = [...new Set(
      rows.filter(r => !String(r.invoice_number || '').trim()).map(r => r.vendor_name).filter(Boolean)
    )];

    const [byInvoice, byVendor] = await Promise.all([
      fetchExpensesByInvoice(invoiceNumbers),
      unnamedVendors.length > 0
        ? supabase
            .from('expenses')
            .select('id, vendor_name, invoice_number, amount, invoice_date, payment_status, debit_note, source, category, cost_type, entry_type, status, description, created_by, approved_by')
            .in('vendor_name', unnamedVendors)
        : Promise.resolve({ data: [] }),
    ]);

    // The same bill can come back from both queries — it is counted once.
    const existingByKey = new Map();
    for (const row of [...(byInvoice.data || []), ...(byVendor.data || [])]) {
      const key = keyOf(row.vendor_name, row.invoice_number);
      if (!existingByKey.has(key)) existingByKey.set(key, row);
    }

    // A bill the accountant typed into their sheet may have the supplier
    // spelled a different way from the way Petpooja spells it. It is still the
    // same bill, so it is found by its invoice number — otherwise the same
    // bill would be written twice, once for each spelling.
    const sheetByInvoice = new Map();
    for (const row of byInvoice.data || []) {
      if (row.source !== 'sheet') continue;
      const number = String(row.invoice_number || '').trim().toLowerCase();
      if (number && !sheetByInvoice.has(number)) sheetByInvoice.set(number, row);
    }

    const toInsert = new Map();
    const toUpdate = [];
    const seenKeys = new Set();
    for (const row of rows) {
      const key = keyOf(row.vendor_name, row.invoice_number);
      // Two bills that share a supplier and an invoice number cannot both be
      // written — the second would be taken for the first. That is worth
      // saying out loud, because a bill that is quietly dropped is a bill
      // that is quietly missing from the books.
      if (seenKeys.has(key) && !toInsert.has(key)) {
        console.warn(`  ⚠️ Two ${label} share the supplier and invoice number: ${row.vendor_name} / ${row.invoice_number}`);
      }
      seenKeys.add(key);
      const found =
        existingByKey.get(key) ||
        sheetByInvoice.get(String(row.invoice_number || '').trim().toLowerCase());
      if (!found) {
        if (!toInsert.has(key)) toInsert.set(key, row);
        continue;
      }
      // Only write the row again when something actually changed. A daily run
      // over the same bills must not spend a request per bill every morning.
      const changed =
        Number(found.amount || 0) !== Number(row.amount || 0) ||
        (found.invoice_date || null) !== (row.invoice_date || null) ||
        (found.payment_status || null) !== (row.payment_status || null) ||
        Number(found.debit_note || 0) !== Number(row.debit_note || 0);
      // A bill that came from the sheet is always written again, because the
      // Petpooja bill is the record — even when only the supplier's spelling
      // differs.
      const fromSheet = found.source === 'sheet';
      if (changed || fromSheet) {
        // Petpooja is the record of the **facts** of a bill — how much, when it
        // is dated, whether it is paid. It knows nothing of how the bill is
        // **classified**, and the pull must not wipe a classification a person
        // or the accountant made: the category is what matches a bill to its
        // standing cost (rent, pest control, power), so losing it would both
        // change the books and break that match.
        toUpdate.push({ id: found.id, row: mergePetpoojaBill(found, row) });
      }
    }

    let inserted = 0;
    let updated = 0;
    let unchanged = 0;

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

    unchanged = rows.length - inserted - updated;
    console.log(`  ✓ ${label}: ${inserted} new, ${updated} updated, ${unchanged} unchanged`);
    return { inserted, updated, unchanged };
  }

  /**
   * Take the cancelled documents out of the books.
   *
   * A bill that Petpooja cancelled is not a bill, and the pull leaves it out.
   * But a bill that was pulled *before* it was cancelled would still be in the
   * books as money the restaurant owes — so the cancelled document is matched
   * against the ledger and the row is removed.
   *
   * Only rows that came from Petpooja are touched. A bill typed by hand, or
   * written by the accountant in the sheet, is a person's record and is never
   * removed by the sync.
   *
   * @param {Array<{vendor_name: string, invoice_number: string, invoice_date: string}>} docs
   * @param {string} label what the rows are called in the log
   */
  async function removeCancelledBills(docs, label = 'bill(s)') {
    if (!docs || docs.length === 0) return 0;
    let removed = 0;
    for (const doc of docs) {
      // A document with no date cannot be matched to a row, and PostgREST
      // refuses an equality on a null. There is nothing to remove either way.
      if (!doc.vendor_name || !doc.invoice_number || !doc.invoice_date) continue;

      const { data: matches, error } = await supabase
        .from('expenses')
        .select('id, source, description')
        .eq('vendor_name', doc.vendor_name)
        .eq('invoice_number', doc.invoice_number)
        .eq('invoice_date', doc.invoice_date);
      if (error) {
        console.error(`  ❌ Could not look up a cancelled ${label}:`, error.message);
        continue;
      }

      // Only a row that came from Petpooja is removed. The older rows are
      // tagged 'existing' — that is the column's default, so anything written
      // without a source lands there — and the description is what tells the
      // Petpooja rows apart from a bill a person typed.
      const mine = (matches || []).filter(
        (row) =>
          row.source === 'petpooja' ||
          (row.source === 'existing' && String(row.description || '').startsWith('Petpooja'))
      );
      if (mine.length === 0) continue;

      const { error: deleteError } = await supabase
        .from('expenses')
        .delete()
        .in('id', mine.map((row) => row.id));
      if (deleteError) {
        console.error(`  ❌ Could not remove a cancelled ${label}:`, deleteError.message);
        continue;
      }
      removed += mine.length;
    }
    if (removed > 0) {
      console.log(`  🧹 Took ${removed} cancelled ${label} out of the books`);
    }
    return removed;
  }

  /**
   * Is this run the twice-weekly refresh of the last 90 days of purchases?
   *
   * The refresh re-reads a window that the nightly run never looks at, so
   * that a bill Petpooja has edited, paid, cancelled or entered late is in
   * the books within days rather than never.
   */
  function isPurchaseRefresh() {
    const value = String(process.env.SYNC_PURCHASE_REFRESH ?? '').toLowerCase();
    return value === '1' || value === 'true';
  }

  /**
   * Put the books right after a refresh, and say what was found.
   *
   * Petpooja's report is the truth about the bills of the window. A bill that
   * is in the books and not in the report is a bill Petpooja no longer has.
   * A deleted document leaves no trace at all, so that is a weaker signal
   * than a cancellation: the bill is flagged at the first refresh and
   * removed only if it is still missing at the next one.
   */
  async function reconcileRefresh(supabase, { kind, reportRows, from, to }) {
    const columns =
      'id, vendor_name, invoice_number, amount, invoice_date, payment_status, debit_note, source, description';

    const bookRows = await readAllRows((fromRow, toRow) =>
      supabase
        .from('expenses')
        .select(columns)
        .gte('invoice_date', from)
        .lte('invoice_date', to)
        .in('source', ['petpooja', 'existing'])
        .order('id')
        .range(fromRow, toRow)
    );

    const summary = await applyRefreshMisses(supabase, {
      kind,
      reportRows,
      bookRows: bookRows.filter((row) =>
        kind === 'credit' ? Number(row.debit_note || 0) > 0 : Number(row.debit_note || 0) === 0
      ),
    });

    for (const line of describeRefresh(summary, kind)) console.log(line);
    return summary;
  }

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

  // 3. Login to Petpooja Billing (2-Step Form)
  //
  // The login page is flaky on the serverless browser, in three separate ways:
  // the page sometimes fails to load at all (chrome-error://chromewebdata/),
  // sometimes the app boots but never paints the form (it sits in the DOM,
  // invisible), and sometimes the second step never appears. A fresh browser
  // and a fresh load of the page fix all three, so the login retries — but
  // every attempt and every browser restart shares ONE time budget, because a
  // serverless function may only run for 300 seconds and the reports still
  // need most of that.
  //
  // The probe is the difference between "the page did not render" and "the
  // site is not answering us at all". Petpooja's edge blocks datacenter IP
  // ranges, so from the serverless host that distinction decides whether a
  // retry is worth anything.
  async function probePetpooja() {
    try {
      const res = await fetch('https://billing.petpooja.com/', {
        redirect: 'manual',
        signal: AbortSignal.timeout(15000),
      });
      return `direct fetch got HTTP ${res.status}`;
    } catch (err) {
      return `direct fetch failed (${err.message})`;
    }
  }

  // What the page is actually showing. This is the difference between
  // "still loading" and "Petpooja is telling us something", and it is the
  // only clue worth having when the login fails.
  const pageText = async () => {
    try {
      const text = await page.locator('body').innerText({ timeout: 5000 });
      return text.replace(/\s+/g, ' ').trim().slice(0, 300);
    } catch {
      return '(could not read the page)';
    }
  };

  // Restore a Petpooja session that a previous group left alive.
  //
  // The whole nightly run is split into ten serverless calls, and Petpooja
  // turns away a login from an address it does not recognise as the one
  // holding the live session. So instead of ten logins (ten chances to be
  // turned away) the run does ONE: the first group logs in and leaves its
  // session behind, and the next group picks it up and goes straight to the
  // dashboard.
  //
  // The session is checked with a plain HTTP request rather than by loading
  // the page. The dashboard is a heavy single-page app, and rendering it in
  // the bundled Chromium is the most common thing that kills the browser on
  // the serverless host. A request carries the same cookies and answers the
  // same question — is this session still logged in? — without drawing
  // anything.
  //
  // Returns true when the session was restored, false when the caller has to
  // log in instead.
  async function tryReuseSession(cookies, alreadyRetried = false) {
    if (!Array.isArray(cookies) || cookies.length === 0) return false;

    const usable = cookies.filter(
      (c) => c && SESSION_COOKIE_NAMES.includes(c.name) && c.value && c.domain
    );
    if (usable.length === 0) return false;

    // Remember them: a browser that dies and is replaced gets them back, and
    // a login that is turned away can release the session they point at.
    carriedCookies = usable;

    try {
      await context.addCookies(usable.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || '/',
        httpOnly: !!c.httpOnly,
        secure: !!c.secure,
        sameSite: c.sameSite || 'Lax',
        ...(c.expires && c.expires > 0 ? { expires: Math.floor(c.expires) } : {}),
      })));

      // A request, not a page. Same cookies, no rendering.
      const response = await context.request.get(DASHBOARD_URL, {
        timeout: 25000,
        maxRedirects: 5,
      });
      const landedOn = response.url();
      const body = await response.text().catch(() => '');

      // The dashboard is the proof. A refused or expired session answers with
      // the login form instead — either by being sent to the login page, or by
      // serving the form where the dashboard should be.
      const showsLoginForm = /data\[User\]\[password\]|UserPassword/i.test(body);
      if (!/dashboard/i.test(landedOn) || showsLoginForm) {
        console.log(`  ℹ️ The saved session was refused (landed on ${landedOn}) — logging in instead.`);
        return false;
      }
      if (!response.ok()) {
        console.log(`  ℹ️ The session check answered HTTP ${response.status()} — logging in instead.`);
        return false;
      }

      console.log(`  🔑 Restored the Petpooja session — no second login needed (HTTP ${response.status()}).`);
      return true;
    } catch (err) {
      // A browser that died takes the session with it. Start a fresh one —
      // it comes up with the session already in it — and try again.
      if (/closed|Target closed/i.test(err.message) && !alreadyRetried) {
        console.log('  ⚠️ The browser died while restoring the session — starting a fresh one.');
        await closeBrowser();
        await new Promise(r => setTimeout(r, 5000));
        await openBrowser();
        return tryReuseSession(cookies, true);
      }
      console.log(`  ℹ️ Could not restore the session (${err.message}) — logging in instead.`);
      return false;
    }
  }

  // The live session, kept in the database so any group can pick it up.
  async function loadStoredSession() {
    try {
      const { data } = await supabase
        .from(SESSION_TABLE)
        .select('cookies')
        .eq('id', 1)
        .maybeSingle();
      const cookies = data?.cookies;
      if (!Array.isArray(cookies) || cookies.length === 0) return null;
      return cookies;
    } catch (err) {
      console.log(`  ℹ️ Could not read the saved session (${err.message}).`);
      return null;
    }
  }

  async function saveStoredSession(cookies) {
    if (!Array.isArray(cookies) || cookies.length === 0) return;
    try {
      const { error } = await supabase
        .from(SESSION_TABLE)
        .upsert({ id: 1, cookies, updated_at: new Date().toISOString() }, { onConflict: 'id' });
      if (error) throw error;
    } catch (err) {
      // The run itself is fine; the session just will not survive to the next
      // group, and that group will log in for itself.
      console.log(`  ⚠️ Could not save the session for the next group: ${err.message}`);
    }
  }

  async function clearStoredSession() {
    try {
      await supabase.from(SESSION_TABLE).delete().eq('id', 1);
    } catch (err) {
      console.log(`  ⚠️ Could not clear the saved session: ${err.message}`);
    }
  }

  async function loginToPetpooja() {
    const EMAIL = '#UserEmail, input[name="data[User][email]"], input[placeholder*="Email"]';
    const PASS = '#UserPassword, input[name="data[User][password]"], input[type="password"]';
    const deadline = Date.now() + LOGIN_BUDGET_MS;

    const left = () => Math.max(0, deadline - Date.now());

    for (let attempt = 1; attempt <= 5; attempt++) {
      if (left() <= 5000) break;

      // A browser that died is replaced, not reloaded.
      let dead = false;
      try {
        await page.goto('https://billing.petpooja.com/', { waitUntil: 'load', timeout: Math.min(45000, left()) })
          .catch((err) => { if (/closed|Target closed/i.test(err.message)) dead = true; });
      } catch (err) {
        if (/closed|Target closed/i.test(err.message)) dead = true;
      }
      if (dead) {
        console.error(`  ⚠️ Browser died before the login (attempt ${attempt}/5) — starting a fresh one.`);
        await closeBrowser();
        await new Promise(r => setTimeout(r, 5000));
        await openBrowser();
        continue;
      }

      await page.waitForTimeout(4000);

      console.log(`  Current Page URL: ${page.url()}`);
      console.log(`  Current Page Title: "${await page.title()}"`);
      console.log(`  Total input tags found on page: ${await page.locator('input').count()}`);

      // Step 1: Email / Username — it must be *visible*, not merely present.
      // The wait is generous on purpose: the app is slow to boot on the
      // serverless CPU, and reloading too early restarts that boot for ever.
      const emailInput = page.locator(EMAIL).first();
      const emailReady = await emailInput.waitFor({ state: 'visible', timeout: Math.min(40000, left()) })
        .then(() => true).catch(() => false);
      if (!emailReady) {
        console.error(`  ⚠️ Login form not visible (attempt ${attempt}/5). Page says: ${await pageText()}`);
        continue;
      }

      await emailInput.fill(email);
      console.log('  ✓ Filled email address.');

      const continueBtn = page.locator('button:has-text("Continue"), button[type="submit"], input[type="submit"]').first();
      await continueBtn.click();

      // Step 2: Password — it only appears once the email step is accepted.
      const passInput = page.locator(PASS).first();
      const passReady = await passInput.waitFor({ state: 'visible', timeout: Math.min(30000, left()) })
        .then(() => true).catch(() => false);
      if (!passReady) {
        console.error(`  ⚠️ Password box never appeared (attempt ${attempt}/5). Page says: ${await pageText()}`);

        // Petpooja turns a login away while another session is alive, and it
        // will not accept a login from an address it does not recognise as
        // the one holding that session. The session this run was given may be
        // exactly that session — release it, so the next attempt starts on a
        // free account.
        if (attempt === 1 && carriedCookies?.length) {
          console.log('  ℹ️ Releasing the session this run was given, then logging in again...');
          await page.goto(LOGOUT_URL, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
          await page.waitForTimeout(3000);
          carriedCookies = null;
          await clearStoredSession();
        }
        continue;
      }

      await passInput.fill(password);
      console.log('  ✓ Filled password.');

      const loginSubmitBtn = page.locator('button:has-text("Sign in"), button:has-text("Login"), button:has-text("Continue"), button[type="submit"], input[type="submit"]').first();
      await loginSubmitBtn.click();

      // Wait for navigation after login
      await page.waitForNavigation({ timeout: 35000 }).catch(() => {});
      await page.waitForTimeout(5000);
      console.log(`✓ Post-login URL: ${page.url()} ("${await page.title()}")`);

      // A login that did not land on the dashboard did not succeed, however
      // cheerful the form looked.
      if (!/dashboard/i.test(page.url())) {
        console.error(`  ⚠️ Login did not reach the dashboard. Page says: ${await pageText()}`);
        continue;
      }

      // Remember the session this login just bought, so that a browser that
      // dies later can be replaced and carry on with it.
      try {
        const all = await context.cookies();
        const live = (all || []).filter((c) => SESSION_COOKIE_NAMES.includes(c.name));
        if (live.length) carriedCookies = live;
      } catch {
        // Nothing to remember — the browser will have to log in again.
      }
      return;
    }

    throw new Error(`Petpooja login did not complete. Probe: ${await probePetpooja()}. Last page said: ${await pageText()}`);
  }

  // Set when the run ends in a fatal error. A group that failed must NOT
  // hand a session on: it logs out instead, so the next group starts clean.
  let runFailed = false;
  // The live session, captured before the browser goes away, so the next
  // report group can pick it up instead of logging in again.
  let sessionOut = null;

  // What the run actually fetched. It carries no secret - only counts - and
  // it lets the caller answer with an honest status instead of a cheerful
  // 200 for a group that fetched nothing.
  let reportOutcome = null;

  try {
    // A session handed over by the previous group is restored first; only if
    // that fails does this group spend a login of its own. The session is
    // taken from the database, so a run that was killed half way still finds
    // the live session and does not get turned away.
    const reused = await tryReuseSession(sessionCookies || await loadStoredSession());
    if (!reused) {
      await loginToPetpooja();
    }

    // Helper: download custom report and return sheet rows
    // `sheetMatch` picks the sheet to read when a report spreads its sections
    // over several sheets (matched against the sheet's first cell).
    // Fetch one report.
//
// A report is fetched with the browser, and on the serverless host the
// browser still dies now and then on the heavier pages. A dead browser is
// not a failed report: the report is tried again with a fresh browser that
// comes up with the same session, which turns most of those deaths into a
// report that is simply fetched a moment later.
//
// A download that times out is NOT retried here — that is a different
// problem, and repeating it would only burn the time the function has.
async function fetchCustomReport(url, reportName, queryCycle = cycle, sheetMatch = null) {
      const watch = startMemoryWatch(`fetching ${reportName}`, browserPid);
      try {
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            return await fetchCustomReportOnce(url, reportName, queryCycle, sheetMatch);
          } catch (err) {
            const browserDied = /closed|Target closed|browser has been closed/i.test(err.message || '');
            // A page that never finished rendering is the same kind of problem:
            // a fresh browser gets a clean page.
            const pageNotReady = /Excel button not found/i.test(err.message || '');
            if (attempt === 2 || (!browserDied && !pageNotReady)) throw err;
            console.log(`  ⚠️ ${pageNotReady ? 'The page did not finish rendering' : 'The browser died'} during ${reportName} — starting a fresh one and trying again.`);
            await closeBrowser();
            await new Promise((r) => setTimeout(r, 5000));
            await openBrowser();
          }
        }
      } finally {
        watch.stop();
      }
    }

    async function fetchCustomReportOnce(url, reportName, queryCycle = cycle, sheetMatch = null) {
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
      console.log(`  🧠 Browser memory before the page load: ${browserMemory(browserPid)}`);
      await page.goto(url, { waitUntil: 'load', timeout: 45000 });
      await page.waitForTimeout(4000);

      // The page must be FINISHED before it is used, not merely loaded.
      //
      // On the serverless CPU these pages' scripts arrive out of order: the
      // grid library ran before jQuery, and the page's own plugins were not
      // defined yet, so the export button did nothing and the download
      // never came. Waiting for the network to go quiet is what makes the
      // page usable. The wait is capped, because a page that keeps a
      // connection open would otherwise hold the report up for ever.
      await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {});

      // Petpooja's report pages sometimes render slowly or partially. Working
      // on a half-rendered page means the date fields and the export button
      // are both missing, and the report is lost — or, worse, it is exported
      // without a date filter and covers the wrong period. Wait for the date
      // fields to be there, and reload the page once if they never arrive.
      const dateFieldSelector =
        'input.start_fromdate:visible, input.set-calendar:visible, input.reportsatrtdate:visible, input[name*="date" i]:visible, input[id*="date" i]:visible';
      const exportButtonSelector =
        'button:visible:has-text("Excel"), a:visible:has-text("Excel"), button:visible:has-text("Export"), a:visible:has-text("Export"), .dropdown-toggle:visible:has-text("Export")';

      let pageReady = false;
      for (let attempt = 1; attempt <= 2 && !pageReady; attempt++) {
        const deadline = Date.now() + 30000;
        while (!pageReady && Date.now() < deadline) {
          const dateFields = await page.locator(dateFieldSelector).count().catch(() => 0);
          if (dateFields >= 2) {
            pageReady = true;
            break;
          }
          // A page with an export button but still no date fields probably has
          // no date filter at all. Give the fields a moment more, then carry
          // on without one.
          if (await page.locator(exportButtonSelector).count().catch(() => 0) > 0) {
            await page.waitForTimeout(12000);
            pageReady = (await page.locator(dateFieldSelector).count().catch(() => 0)) < 2;
            break;
          }
          await page.waitForTimeout(2000);
        }
        if (!pageReady && attempt < 2) {
          console.log(`  ℹ️ ${reportName} page was not ready — reloading it...`);
          await page.reload({ waitUntil: 'load', timeout: 45000 }).catch(() => {});
          await page.waitForTimeout(4000);
        }
      }
      if (!pageReady) {
        console.log(`  ⚠️ ${reportName} page still looks incomplete after a reload.`);
      }

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

        const waitForDownload = (waitMs) => new Promise((resolve, reject) => {
          let timer = null;
          const cleanup = () => {
            clearTimeout(timer);
            page.off('download', onDownload);
            context.off('page', onNewPage);
          };
          const onDownload = (dl) => { cleanup(); resolve(dl); };
          const onNewPage = (p) => { p.once('download', onDownload); };
          timer = setTimeout(() => { cleanup(); reject(new Error('Download timeout')); }, waitMs);
          page.on('download', onDownload);
          context.on('page', onNewPage);
        });

        const downloadPromise = waitForDownload(DOWNLOAD_TIMEOUT);

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

        let download;
        try {
          download = await downloadPromise;
        } catch (err) {
          // Petpooja does not always stream the export straight to the browser.
          // Sometimes it queues the export and offers a "Download" link in a
          // table on the same page — wait for that link and use it instead.
          console.log('  ℹ️ No direct download — waiting for a queued export to become available...');
          const queuedLink = page.locator('table a:visible:has-text("Download"), a:visible:has-text("Download")').first();
          let found = false;
          for (let i = 0; i < 20 && !found; i++) {
            await page.waitForTimeout(3000);
            found = await queuedLink.count() > 0 && await queuedLink.isVisible().catch(() => false);
          }
          if (!found) throw err;

          console.log('  ✓ Found the queued export — clicking its Download link...');
          const queuedDownload = waitForDownload(DOWNLOAD_TIMEOUT);
          await queuedLink.click({ force: true });
          download = await queuedDownload;
        }

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

      // Petpooja renders these report pages slowly at times, so the button is
      // looked for over a period rather than just once — a single immediate
      // check loses the export of a whole report on a slow day.
      const buttonDeadline = Date.now() + 30000;
      while (!targetBtn && Date.now() < buttonDeadline) {
        for (const sel of excelPrioritySelectors) {
          const loc = page.locator(sel).first();
          if (await loc.count() > 0 && await loc.isVisible().catch(() => false)) {
            targetBtn = loc;
            matchedSelector = sel;
            break;
          }
        }
        if (!targetBtn) await page.waitForTimeout(2000);
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

    // Revenue for a plain calendar month, for the finance dashboards.
    //
    // The 20-19 pay cycle is the basis for salary processing and variable pay.
    // The finance dashboards ask a different question — "how is this month
    // going?" — so they need the calendar month. The Executive Sales Summary
    // is the only report that splits revenue into Dine In / Pick Up /
    // Delivery, so it is pulled a second time for the calendar month and
    // written to its own table. The pay-cycle metrics above are untouched.
    //
    // The month that has just ended is pulled as well, until a pull has
    // covered its last day — that is what makes a completed month final.
    //
    // A backfill asks for one month by name (`SYNC_REVENUE_MONTH`), because
    // the months before the running one are not otherwise reachable: the
    // nightly run only ever looks at the month that is running and the one
    // before it. The named month is pulled on its own — nothing else is.
    async function syncCalendarMonthRevenue() {
      const currentKey = monthKeyOf();
      const backfillKey = String(process.env.SYNC_REVENUE_MONTH || '').trim();
      const targets = [];

      if (backfillKey) {
        const backfillWindow = petpoojaMonthWindow(backfillKey);
        if (!backfillWindow) {
          console.error(`  ⚠️ "${backfillKey}" is not a month I can pull.`);
        } else {
          targets.push(backfillWindow);
          console.log(`  📅 Backfill: the calendar month ${backfillKey} only.`);
        }
      } else {
        const currentWindow = petpoojaMonthWindow(currentKey);
        if (currentWindow) targets.push(currentWindow);

        const previousKey = previousMonthKey(currentKey);
        const previousWindow = petpoojaMonthWindow(previousKey);
        if (previousWindow) {
          const { data: existing } = await supabase
            .from('finance_monthly_revenue')
            .select('is_complete')
            .eq('month', previousKey)
            .maybeSingle();
          if (existing?.is_complete !== true) targets.push(previousWindow);
        }
      }

      let pulled = 0;
      for (const window of targets) {
        const isComplete = window.through >= window.end;
        const queryCycle = { start: window.start, end: window.end, queryEnd: window.through };
        // Two attempts: a report that did not take the date range can
        // usually be made to take it the second time.
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          try {
            const rows = await fetchCustomReport(
              'https://billing.petpooja.com/reports/executive_sales_summary/all',
              `Executive Sales Summary (${window.key})`,
              queryCycle,
              'order type'
            );
            const parsed = parseExecutiveOrderTypes(rows);
            if (!parsed.ok) {
              console.error(`  ⚠️ Could not parse the calendar-month revenue for ${window.key}: ${parsed.error || 'unknown reason'}`);
              break;
            }

            // The parser keeps the grand total beside the split, not inside it.
            // It is added up here so the stored total can never disagree with
            // the three numbers next to it.
            const revenueTotal = Number(parsed.data.dine_in || 0)
              + Number(parsed.data.pick_up || 0)
              + Number(parsed.data.delivery || 0);

            // A figure that is the same as another month's is not this month's.
            //
            // The report sometimes answers with its own default window instead
            // of the one that was asked for, and a wrong month is worse than a
            // missing one — a month with no figure is shown as missing, which
            // is honest, while a month with the wrong figure is not.
            const { data: monthsOnRecord } = await supabase
              .from('finance_monthly_revenue')
              .select('month, total');
            if (repeatsAnotherMonth(revenueTotal, monthsOnRecord, window.key)) {
              const other = (monthsOnRecord || []).find(
                (row) => row.month !== window.key && Math.abs(Number(row.total || 0) - revenueTotal) < 0.01,
              );
              if (attempt < 2) {
                console.error(
                  `  ⚠️ The report answered with ${other?.month}'s figure for ${window.key} — pulling it again.`,
                );
                continue;
              }
              console.error(
                `  ⚠️ The report answered with ${other?.month}'s figure for ${window.key} again — it was not written.`,
              );
              break;
            }

            const payload = {
              month: window.key,
              dine_in: parsed.data.dine_in,
              pick_up: parsed.data.pick_up,
              delivery: parsed.data.delivery,
              total: revenueTotal,
              window_start: window.start,
              window_end: window.through,
              is_complete: isComplete,
              source: 'petpooja:executive_sales_summary',
              synced_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            const { error } = await supabase
              .from('finance_monthly_revenue')
              .upsert(payload, { onConflict: 'month' });
            if (error) throw error;

            console.log(
              `  📅 Calendar month ${window.key}: total ${revenueTotal} ` +
              `(dine-in ${parsed.data.dine_in}, pick-up ${parsed.data.pick_up}, delivery ${parsed.data.delivery}) ` +
              `covering ${window.start} → ${window.through}${isComplete ? ' — complete' : ' — month so far'}`
            );
            pulled += 1;
          } catch (e) {
            // A failed calendar-month pull must never fail the pay-cycle sync.
            console.error(`  ⚠️ Could not sync the calendar-month revenue for ${window.key}: ${e.message}`);
          }
        }
        }
      return { pulled, asked: targets.length };
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

          // The money owed by customers, for the finance pages. This is
          // written in every run — it is a finance figure, not a variable-pay
          // one.
          try {
            const snapshot = await saveReceivablesSnapshot(supabase, creditResult);
            console.log(`  💳 Money owed by customers (${snapshot.month}): ${snapshot.count} open invoice(s)`);
          } catch (receivableErr) {
            console.error(`  ⚠️ Could not save the money owed by customers: ${receivableErr.message}`);
          }

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
        // A backfill asks for one calendar month of sales. The pay-cycle
        // revenue breakdown is not wanted then — and it is not written in a
        // finance-only run anyway — so the report is pulled once, for the
        // month that was named.
        const backfillKey = String(process.env.SYNC_REVENUE_MONTH || '').trim();
        if (backfillKey) {
          console.log(`📥 Fetching the Executive Sales Summary for ${backfillKey}...`);
          const backfill = await syncCalendarMonthRevenue();
          if (backfill?.pulled > 0) successfulReports++;
          else {
            failedReports++;
            console.error(`⚠️ The Executive Sales Summary for ${backfillKey} could not be read.`);
          }
        } else {
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

          // The same report, pulled again for the plain calendar month, so the
          // finance dashboards have a month to report on.
          await syncCalendarMonthRevenue();
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
    //
    // The hand-off is a COOKIE, not a page. Loading the dashboard in the
    // browser is the single heaviest thing this run does, and on the
    // serverless host it is what kills the browser: the three inventory
    // groups were the only ones still failing, every one of them dying on
    // that dashboard load.
    //
    // So the dashboard is never rendered. A plain request to it is enough,
    // because that request refreshes the single-sign-on cookie (PETPOOJA_CO)
    // that the inventory subdomain accepts, and the inventory pages then
    // open directly. Verified both ways: with the cookie refreshed by a
    // request the inventory pages open, and without it they bounce straight
    // back to the billing dashboard.
    let inventorySessionReady = false;
    async function openInventoryModule() {
      if (inventorySessionReady) return;

      const response = await context.request.get(DASHBOARD_URL, {
        timeout: 25000,
        maxRedirects: 5,
      });
      const landedOn = response.url();
      if (!/dashboard/i.test(landedOn)) {
        throw new Error(`The Petpooja hand-off to the Inventory module did not reach the dashboard (landed on ${landedOn}).`);
      }
      if (!response.ok()) {
        throw new Error(`The Petpooja hand-off to the Inventory module answered HTTP ${response.status()}.`);
      }
      console.log('  ✓ Refreshed the Petpooja single-sign-on for the Inventory module (no page loaded).');
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

        // The raw export, when asked for.
        //
        // Petpooja's own words are worth keeping when a field is not reading
        // the way it should: what the report actually says about a payment is
        // the only way to tell a parsing mistake from a real figure.
        if (String(process.env.SYNC_DUMP_ROWS || '').toLowerCase() === 'true') {
          dumpReportRows('purchase-invoices', purchaseRows);
        }

        if (purchaseRows && purchaseRows.length > 0) {
          const purchaseResult = parsePurchaseInvoices(purchaseRows, cycle);
          if (purchaseResult.ok && purchaseResult.invoices.length > 0) {
            console.log(`  📊 Found ${purchaseResult.invoices.length} purchase invoices`);
            if (purchaseResult.cancelled) {
              // A cancelled document never happened, so it is not money owed.
              console.log(`  ↩︎ Left out ${purchaseResult.cancelled} cancelled purchase document(s)`);
            }
  
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
              payment_status: invoice.payment_status || 'unpaid',
              payment_date: invoice.payment_date || null,
              payment_mode: invoice.payment_mode || null,
              bank_reference: invoice.bank_reference || null,
              created_by: null, // System-generated
              approved_by: null,
              source: 'petpooja', // this bill is the Petpooja one, not the sheet's
            }));
            await syncExpenseRows(invoicePayloads, 'purchase invoice(s)');

            // A bill that was pulled before Petpooja cancelled it is still in
            // the books as money owed. The cancelled document is what says it
            // never happened.
            await removeCancelledBills(purchaseResult.cancelledDocs, 'bill(s)');

            // The refresh says what Petpooja's report says, so a bill that has
            // been changed, paid or deleted is put right.
            if (isPurchaseRefresh()) {
              console.log(`🔄 Refresh window: ${cycle.start} → ${cycle.end}`);
              await reconcileRefresh(supabase, {
                kind: 'bill',
                reportRows: purchaseResult.invoices,
                from: cycle.start,
                to: cycle.end,
              });
            }

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

        // The raw export, when asked for.
        if (String(process.env.SYNC_DUMP_ROWS || '').toLowerCase() === 'true') {
          dumpReportRows('purchase-returns', returnRows);
        }

        if (returnRows && returnRows.length > 0) {
          const returnsResult = parsePurchaseReturns(returnRows, cycle);
          if (returnsResult.ok && returnsResult.returns.length > 0) {
            console.log(`  📊 Found ${returnsResult.returns.length} purchase returns (debit notes)`);
            if (returnsResult.cancelled) {
              console.log(`  ↩︎ Left out ${returnsResult.cancelled} cancelled debit note(s)`);
            }

            // The `b2b_returns` metric comes from the same report.
            const total = returnsResult.returns.reduce((s, r) => s + Number(r.total_amount || 0), 0);
            console.log(`  📊 Total Purchase Returns: ₹${total} across ${returnsResult.returns.length} debit notes`);
            await saveMetric('b2b_returns', total, 'petpooja', 'Purchase Return Report', {
              scheme_name: 'b2b_counter',
              entries: returnsResult.returns.length,
              skippedCancelled: 0
            });

            // Sync each debit note to expenses table.
            //
            // A debit note is a credit against the supplier, not a cost of
            // its own: the amount is zero and the whole value sits in
            // `debit_note`, so every total reads `amount - debit_note` and
            // a return reduces the cost of purchases instead of being
            // counted as one.
            const returnPayloads = returnsResult.returns.map((ret) => ({
              category: 'Vendor',
              cost_type: 'variable',
              entry_type: 'actual',
              status: 'approved',
              amount: 0,
              debit_note: ret.total_amount,
              vendor_name: ret.vendor_name,
              invoice_number: ret.return_number,
              invoice_date: ret.return_date,
              description: `Debit Note: ${ret.description || 'Purchase return'}`,
              payment_status: 'unpaid',
              payment_date: null,
              payment_mode: null,
              bank_reference: null,
              created_by: null,
              approved_by: null,
              source: 'petpooja', // this bill is the Petpooja one, not the sheet's
            }));
            await syncExpenseRows(returnPayloads, 'debit note(s)');

            // A cancelled debit note is not a credit either.
            await removeCancelledBills(
              returnsResult.cancelledDocs.map((doc) => ({
                vendor_name: doc.vendor_name,
                invoice_number: doc.return_number,
                invoice_date: doc.return_date,
              })),
              'debit note(s)'
            );

            // The refresh says what Petpooja's report says.
            if (isPurchaseRefresh()) {
              console.log(`🔄 Refresh window: ${cycle.start} → ${cycle.end}`);
              await reconcileRefresh(supabase, {
                kind: 'credit',
                reportRows: returnsResult.returns,
                from: cycle.start,
                to: cycle.end,
              });
            }

            successfulReports++;
          } else {
            console.log('  ℹ️ No purchase returns found for this period');
            dumpReportRows('purchase-returns', returnRows);
            // No debit notes is worth zero, not missing.
            await saveMetric('b2b_returns', 0, 'petpooja', 'Purchase Return Report', {
              scheme_name: 'b2b_counter',
              entries: 0,
              skippedCancelled: 0
            });
            successfulReports++;
          }
        } else {
          // Nothing was recorded for this period — the honest value is zero.
          console.log('  📊 No debit notes recorded for this period — recording 0.');
          await saveMetric('b2b_returns', 0, 'petpooja', 'Purchase Return Report', {
            scheme_name: 'b2b_counter',
            entries: 0,
            skippedCancelled: 0
          });
          successfulReports++;
        }
      } catch (re) {
        failedReports++;
        console.error('⚠️ Could not sync Purchase Returns:', re.message);
      }
    }

    // The supplier list, kept in step with the bills.
    //
    // The bills name their supplier, so the supplier list is rebuilt from
    // them. A new supplier appears in the list the morning after its first
    // bill — so it can be picked when the next bill is typed by hand.
    try {
      const vendorList = await syncVendorList(supabase);
      console.log(`  🏪 Supplier list: ${vendorList.total} supplier(s) on the bills, ${vendorList.added} added to the list.`);
    } catch (vendorErr) {
      console.error(`  ⚠️ Could not update the supplier list: ${vendorErr.message}`);
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

    reportOutcome = { successfulReports, failedReports };
  } catch (fatal) {
    runFailed = true;
    console.error('❌ Sync failed:', fatal.message);
    await sendFailureEmail({
      message: 'Fatal error occurred during Petpooja Sync execution.',
      errorDetails: fatal.stack || fatal.message
    });
    throw fatal;
  } finally {
    // Read the live session before the browser closes.
    //
    // Only the three cookies that make up the login are kept — the analytics
    // cookies are noise. They are never written to the log, and they are kept
    // in the database so that any group can pick them up — including the
    // first group of a run that was interrupted and left a live session
    // behind.
    try {
      const all = await context?.cookies();
      sessionOut = (all || []).filter((c) => SESSION_COOKIE_NAMES.includes(c.name));
    } catch {
      // A browser that already died has no session to hand on.
      sessionOut = null;
    }

    // End the Petpooja session properly before the browser goes away.
    //
    // Closing the browser does NOT end it: the session (`user_id` +
    // `user_key`) stays live on Petpooja's side. Petpooja then refuses the
    // next login — the email step is accepted but the password box never
    // appears — because the account already has a session. Logging out
    // releases it.
    //
    // The logout happens on the LAST group of the run (nobody needs the
    // session afterwards) and on any group that failed (so the next group
    // starts clean). Every other group keeps the session alive and hands it
    // to its successor.
    let loggedOut = false;
    try {
      if (page && !page.isClosed() && (!keepSession || runFailed)) {
        await page.goto(LOGOUT_URL, {
          waitUntil: 'domcontentloaded',
          timeout: 20000,
        }).catch(() => {});
        console.log('  🔓 Logged out of Petpooja.');
        loggedOut = true;
      }
    } catch {
      // A browser that already died needs no logout.
    }

    // The stored session goes with the session it points at — but only when
    // the session was really ended.
    //
    // A browser that died leaves the Petpooja session ALIVE. Deleting the
    // stored copy then would leave the next group with nothing to restore,
    // and its fresh login would be turned away — a deadlock that only a
    // human could break. So the copy is kept whenever the session is still
    // live, and the next group picks it up and carries on.
    if (loggedOut) {
      await clearStoredSession();
    } else if (sessionOut?.length) {
      await saveStoredSession(sessionOut);
      console.log(`  🔑 Session kept for the next group (${sessionOut.length} cookies).`);
    }

    await closeBrowser();
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

  // Only counts come back: what the run fetched and what it could not. The
  // live session is a credential and never travels in a response body, which
  // the workflow prints into its log.
  return reportOutcome;
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
