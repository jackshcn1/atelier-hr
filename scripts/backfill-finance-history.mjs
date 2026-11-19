#!/usr/bin/env node
/**
 * scripts/backfill-finance-history.mjs — fill in the months that are missing.
 *
 * The nightly sync pulls the month that is running and the pay cycle that is
 * running. Everything before that is simply not in the books: in November 2026
 * the site held sales for October and November only, and the vendor bills for
 * March–June that had come from the accountant's sheet — with July, August and
 * the first half of October missing entirely.
 *
 * This script asks the hosted sync for one window at a time, so every report
 * is read for the month it belongs to:
 *
 *   bills    ?reports=purchase_invoices&from=…&to=…   the vendor bills
 *   returns  ?reports=purchase_returns&from=…&to=…    the debit notes
 *   sales    ?reports=executive&revenueMonth=YYYY-MM  the calendar month
 *
 * Every request is a finance-only run (`finance=1`), so the variable-pay
 * metrics and the pay periods are left exactly as they are — the route
 * refuses a backfill window without that flag.
 *
 * **A sales pull is checked before it is believed.** The Executive Sales
 * Summary sometimes answers with the report's own default window instead of
 * the one that was asked for, and a wrong month is worse than a missing one.
 * Two things give it away: the figure is identical to another month's, and
 * the figure is far too small for a month that has that month's purchases.
 * A pull that fails either check is thrown away — the month is put back the
 * way it was — and the run carries on.
 *
 * The secret is read from SYNC_SECRET, or from /tmp/pj_sync_secret. It is
 * never printed.
 *
 * Usage:
 *   node scripts/backfill-finance-history.mjs --months 2026-04,2026-05
 *   node scripts/backfill-finance-history.mjs --from 2026-03 --to 2026-10
 *   node scripts/backfill-finance-history.mjs --months 2026-10 --skip-sales 2026-10
 *   node scripts/backfill-finance-history.mjs --verify          # only print the books
 *   node scripts/backfill-finance-history.mjs --dry-run         # print the plan
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};
const list = (name) =>
  value(name, '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const BASE = (value('base', process.env.ATELIER_SITE_URL || 'https://atelier-hr-inky.vercel.app')).replace(/\/$/, '');
const FROM = value('from', '2026-03');
const TO = value('to', '2026-10');
const DRY = flag('dry-run');
const VERIFY_ONLY = flag('verify');
const SKIP_SALES = list('skip-sales');

const LAST_DAY = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function monthKeys(fromKey, toKey) {
  const keys = [];
  let [y, m] = fromKey.split('-').map(Number);
  const [ty, tm] = toKey.split('-').map(Number);
  for (let i = 0; i < 600; i += 1) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    if (key > `${ty}-${String(tm).padStart(2, '0')}`) break;
    keys.push(key);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return keys;
}

function windowOf(key) {
  const [y, m] = key.split('-').map(Number);
  return { start: `${key}-01`, end: `${key}-${String(LAST_DAY[m - 1]).padStart(2, '0')}` };
}

// The secret never leaves this process.
function readSecret() {
  if (process.env.SYNC_SECRET) return process.env.SYNC_SECRET.trim();
  try {
    return readFileSync('/tmp/pj_sync_secret', 'utf8').trim();
  } catch {
    throw new Error('No SYNC_SECRET found (env var or /tmp/pj_sync_secret).');
  }
}

function supabaseClient() {
  const env = {};
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function callSync(query, { label, keepSession }) {
  const secret = readSecret();
  const url = `${BASE}/api/sync?${query}${keepSession ? '&keepSession=1' : ''}`;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const startedAt = Date.now();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'x-sync-secret': secret, accept: 'application/json' },
        signal: AbortSignal.timeout(300000),
      });
      const text = await res.text();
      let body = null;
      try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 300) }; }
      const seconds = ((Date.now() - startedAt) / 1000).toFixed(0);
      if (res.ok && body?.ok) {
        console.log(`  ✅ ${label} — ${seconds}s`);
        return { ok: true, body };
      }
      console.log(`  ⚠️  ${label} — ${seconds}s — HTTP ${res.status}: ${body?.error || body?.raw || 'unknown'}`);
    } catch (e) {
      console.log(`  ⚠️  ${label} — ${e.name === 'TimeoutError' ? 'timed out' : e.message}`);
    }
    if (attempt < 3) {
      console.log(`     … retrying (${attempt + 1}/3)`);
      await new Promise((r) => setTimeout(r, 30000));
    }
  }
  return { ok: false, body: null };
}

/** What the books hold, month by month. */
async function readBooks(supabase) {
  const { data: revenue } = await supabase
    .from('finance_monthly_revenue')
    .select('month, total, is_complete')
    .order('month');
  const { data: expenses } = await supabase
    .from('expenses')
    .select('invoice_date, amount, debit_note, source, cost_type');
  const { data: receivables } = await supabase
    .from('finance_receivables')
    .select('month, amount');

  const months = new Set();
  for (const row of revenue || []) months.add(row.month);
  for (const row of expenses || []) {
    if (row.invoice_date) months.add(String(row.invoice_date).slice(0, 7));
  }

  console.log('\nMonth     | Sales          | Bills                | Returns (credit) | Recv');
  console.log('----------|----------------|----------------------|------------------|------');
  for (const key of [...months].sort()) {
    const sales = (revenue || []).find((r) => r.month === key);
    const rows = (expenses || []).filter((r) => String(r.invoice_date || '').slice(0, 7) === key);
    const bills = rows.filter((r) => Number(r.debit_note || 0) === 0);
    const credit = rows
      .filter((r) => Number(r.debit_note || 0) > 0)
      .reduce((s, r) => s + Number(r.debit_note || 0), 0);
    const billTotal = bills.reduce((s, r) => s + Number(r.amount || 0), 0);
    const recv = (receivables || []).filter((r) => r.month === key).length;
    console.log(
      `${key} | ${(sales ? `₹${Number(sales.total).toLocaleString('en-IN')}${sales.is_complete ? '' : '*'}` : '— missing').padEnd(14)} | ` +
      `${bills.length} bills ₹${billTotal.toLocaleString('en-IN')}`.padEnd(20) +
      ` | ₹${credit.toLocaleString('en-IN')}`.padEnd(16) +
      ` | ${recv || '—'}`
    );
  }
  console.log('\n* the month is still running');
}

/**
 * Is the sales figure for a month believable?
 *
 * The Executive Sales Summary sometimes answers with the report's own default
 * window rather than the month that was asked for. The tell is a figure that
 * is identical to another month's, or one that is far too small for a month
 * that has that month's purchases.
 */
async function checkSales(supabase, monthKey, purchases) {
  const { data: rows } = await supabase
    .from('finance_monthly_revenue')
    .select('month, total');
  const mine = (rows || []).find((r) => r.month === monthKey);
  if (!mine) return { ok: false, why: 'nothing was written' };

  const total = Number(mine.total || 0);
  const clash = (rows || []).find(
    (r) => r.month !== monthKey && Math.abs(Number(r.total || 0) - total) < 0.01,
  );
  if (clash) {
    return { ok: false, why: `the same figure as ${clash.month} — the report did not take the date range` };
  }
  if (purchases > 0 && total < purchases * 0.25) {
    return {
      ok: false,
      why: `₹${Math.round(total)} against ₹${Math.round(purchases)} of purchases — too small to be the month`,
    };
  }
  return { ok: true, total };
}

/** Put a month back the way it was before this run touched it. */
async function restoreMonth(supabase, monthKey, before) {
  if (before) {
    await supabase
      .from('finance_monthly_revenue')
      .update({
        total: before.total,
        dine_in: before.dine_in,
        pick_up: before.pick_up,
        delivery: before.delivery,
        is_complete: before.is_complete,
      })
      .eq('month', monthKey);
    console.log(`     ↩️ ${monthKey} put back to ₹${Number(before.total).toLocaleString('en-IN')}`);
  } else {
    await supabase.from('finance_monthly_revenue').delete().eq('month', monthKey);
    console.log(`     ↩️ ${monthKey} removed — the figure was not believable`);
  }
}

const months = list('months').length ? list('months') : monthKeys(FROM, TO);
const supabase = supabaseClient();

// What the sales table holds now, so a bad pull can be undone.
const { data: revenueBefore } = await supabase
  .from('finance_monthly_revenue')
  .select('month, total, dine_in, pick_up, delivery, is_complete');
const beforeByMonth = new Map((revenueBefore || []).map((r) => [r.month, r]));

const plan = [];
for (const key of months) {
  const { start, end } = windowOf(key);
  plan.push({ key, kind: 'bills', query: `reports=purchase_invoices&from=${start}&to=${end}&finance=1` });
  plan.push({ key, kind: 'returns', query: `reports=purchase_returns&from=${start}&to=${end}&finance=1` });
  if (!SKIP_SALES.includes(key)) {
    plan.push({ key, kind: 'sales', query: `reports=executive&revenueMonth=${key}&from=${start}&to=${end}&finance=1` });
  }
}

console.log(
  `Backfill ${months[0]} → ${months[months.length - 1]}: ${months.length} months, ${plan.length} report pulls.` +
  `${SKIP_SALES.length ? ` (sales skipped for ${SKIP_SALES.join(', ')})` : ''}`,
);

if (DRY) {
  for (const step of plan) console.log(`  ${step.key}  ${step.kind.padEnd(8)} ${step.query}`);
  process.exit(0);
}

if (!VERIFY_ONLY) {
  let failures = 0;
  for (let i = 0; i < plan.length; i += 1) {
    const step = plan[i];
    const last = i === plan.length - 1;
    console.log(`\n▶ ${step.key} — ${step.kind}`);
    const result = await callSync(step.query, { label: `${step.key} ${step.kind}`, keepSession: !last });
    if (!result.ok) {
      failures += 1;
      continue;
    }

    // A sales figure is only believed once it has been checked.
    if (step.kind === 'sales') {
      const { data: bills } = await supabase
        .from('expenses')
        .select('amount, debit_note, invoice_date')
        .gte('invoice_date', `${step.key}-01`)
        .lte('invoice_date', windowOf(step.key).end);
      const purchases = (bills || []).reduce(
        (s, r) => s + Number(r.amount || 0) - Number(r.debit_note || 0),
        0,
      );
      const check = await checkSales(supabase, step.key, purchases);
      if (check.ok) {
        console.log(`     ✓ ${step.key} sales ₹${Math.round(check.total).toLocaleString('en-IN')} — believable`);
      } else {
        console.log(`     ⚠️  ${step.key} sales not believable: ${check.why}`);
        await restoreMonth(supabase, step.key, beforeByMonth.get(step.key));
        failures += 1;
      }
    }
  }
  console.log(`\n${plan.length - failures}/${plan.length} pulls accepted.`);
}

await readBooks(supabase);
