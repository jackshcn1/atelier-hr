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
 *   sales    ?reports=executive&revenueMonth=YYYY-MM   the calendar month
 *   bills    ?reports=purchase_invoices&from=…&to=…    the vendor bills
 *   returns  ?reports=purchase_returns&from=…&to=…     the debit notes
 *
 * Every request is a finance-only run (`finance=1`), so the variable-pay
 * metrics and the pay periods are left exactly as they are — the route
 * refuses a backfill window without that flag.
 *
 * The secret is read from SYNC_SECRET, or from /tmp/pj_sync_secret. It is
 * never printed.
 *
 * Usage:
 *   node scripts/backfill-finance-history.mjs                     # March–October 2026
 *   node scripts/backfill-finance-history.mjs --from 2026-03 --to 2026-10
 *   node scripts/backfill-finance-history.mjs --verify            # only print the books
 *   node scripts/backfill-finance-history.mjs --dry-run           # print the plan
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const BASE = (value('base', process.env.ATELIER_SITE_URL || 'https://atelier-hr-inky.vercel.app')).replace(/\/$/, '');
const FROM = value('from', '2026-03');
const TO = value('to', '2026-10');
const DRY = flag('dry-run');
const VERIFY_ONLY = flag('verify');

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
  const start = `${key}-01`;
  const end = `${key}-${String(LAST_DAY[m - 1]).padStart(2, '0')}`;
  return { start, end };
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

async function callSync(query, { label, keepSession }) {
  const secret = readSecret();
  const url = `${BASE}/api/sync?${query}${keepSession ? '&keepSession=1' : ''}`;
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
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
      console.log(`  ⚠️  ${label} — ${(e.name === 'TimeoutError' ? 'timed out' : e.message)}`);
    }
    if (attempt < attempts) {
      console.log(`     … retrying (${attempt + 1}/${attempts})`);
      await new Promise((r) => setTimeout(r, 30000));
    }
  }
  return { ok: false, body: null };
}

/** What the books hold, month by month. */
async function readBooks() {
  const env = {};
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

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

  console.log('\nMonth     | Sales        | Bills           | Returns (credit) | Recv');
  console.log('----------|--------------|-----------------|------------------|------');
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
      `${key} | ${sales ? `₹${Number(sales.total).toLocaleString('en-IN')}${sales.is_complete ? '' : '*'}` : '— missing'} | ` +
      `${bills.length} bills ₹${billTotal.toLocaleString('en-IN')}`.padEnd(45) +
      ` | ₹${credit.toLocaleString('en-IN')}`.padEnd(26) +
      ` | ${recv || '—'}`
    );
  }
  console.log('\n* the month is still running');
}

const months = monthKeys(FROM, TO);
const plan = [];
for (const key of months) {
  const { start, end } = windowOf(key);
  plan.push({ key, kind: 'sales', query: `reports=executive&revenueMonth=${key}&from=${start}&to=${end}&finance=1` });
  plan.push({ key, kind: 'bills', query: `reports=purchase_invoices&from=${start}&to=${end}&finance=1` });
  plan.push({ key, kind: 'returns', query: `reports=purchase_returns&from=${start}&to=${end}&finance=1` });
}

console.log(`Backfill ${FROM} → ${TO}: ${months.length} months, ${plan.length} report pulls.`);
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
    if (!result.ok) failures += 1;
  }
  console.log(`\n${plan.length - failures}/${plan.length} pulls succeeded.`);
}

await readBooks();
