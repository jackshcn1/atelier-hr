// scripts/merge-vendor-duplicates.mjs — merge one vendor into another.
//
// Two spellings of one supplier are two rows on the books: the money splits
// between them, and anything filed against one — a certificate, a contract
// — is invisible on the other. This moves everything that points at the twin
// over to the vendor that is being kept, and then deletes the twin.
//
// The pairs are listed here on purpose. Which two names are the same company
// is the owner's judgement, not this script's: it merges the pairs it is
// told to, and refuses to guess at the rest.
//
//   node scripts/merge-vendor-duplicates.mjs              # dry run — prints the plan
//   node scripts/merge-vendor-duplicates.mjs --apply      # do it
//   node scripts/merge-vendor-duplicates.mjs --apply --pair 32:120
//
// What moves:
//   expenses.vendor_name      the bills, rewritten to the keeper's name
//   assets.vendor_id          the assets, repointed at the keeper
//   petty_cash_ledger         the petty-cash entries, rewritten too
//
// Take a backup first (node scripts/backup-db.mjs).

import fs from 'node:fs';
import path from 'node:path';
import { vendorNameKey } from '../lib/vendorName.js';

// keep: the vendor that survives.  twin: the vendor that is folded into it.
const PAIRS = [
  // The same bakery, written two ways: "Wholegrains" vs "WHOLE GRAINS", and a
  // missing apostrophe in "Baker's".
  { keep: 32, twin: 120 },
  // The same bakery, with a typo in the second one: "Ambrosia" vs "Ambrisia".
  { keep: 34, twin: 122 },
  // The same supplier, with a branch tag in brackets on the second one.
  { keep: 23, twin: 114 },
];

// Rows that are not vendors at all — a test row someone left behind.
const DELETE_ROWS = [87];

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
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const apply = process.argv.includes('--apply');
const onlyPair = (() => {
  const i = process.argv.indexOf('--pair');
  return i === -1 ? null : process.argv[i + 1];
})();

const { data: vendors, error: vErr } = await db.from('vendors').select('*').order('id');
if (vErr) { console.error(vErr.message); process.exit(1); }
const byId = new Map(vendors.map(v => [v.id, v]));

const pairs = PAIRS.filter(p => {
  if (!onlyPair) return true;
  const [k, t] = onlyPair.split(':').map(Number);
  return p.keep === k && p.twin === t;
});

console.log(apply ? 'APPLYING' : 'DRY RUN — nothing has been changed');
console.log('');

for (const { keep, twin } of pairs) {
  const keeper = byId.get(keep);
  const loser = byId.get(twin);
  if (!keeper || !loser) {
    console.log(`  skip ${keep}:${twin} — one of the two is not on the list`);
    continue;
  }

  // The bills, by name as written.
  const { data: bills } = await db
    .from('expenses')
    .select('id, vendor_name, amount')
    .eq('vendor_name', loser.name);
  const { data: assets } = await db.from('assets').select('id, asset_number').eq('vendor_id', twin);
  const { data: petty } = await db
    .from('petty_cash_ledger')
    .select('id, vendor_name')
    .eq('vendor_name', loser.name);

  const money = (bills || []).reduce((sum, b) => sum + Number(b.amount || 0), 0);

  console.log(`  ${JSON.stringify(loser.name)} (id ${twin})  →  ${JSON.stringify(keeper.name)} (id ${keep})`);
  console.log(`      key: ${vendorNameKey(loser.name)}  |  ${vendorNameKey(keeper.name)}`);
  console.log(`      bills: ${(bills || []).length} (₹${Math.round(money).toLocaleString('en-IN')})   assets: ${(assets || []).length}   petty cash: ${(petty || []).length}`);

  if (apply) {
    if ((bills || []).length) {
      const { error } = await db.from('expenses').update({ vendor_name: keeper.name }).eq('vendor_name', loser.name);
      if (error) { console.error('      FAILED to move the bills:', error.message); process.exit(1); }
    }
    if ((assets || []).length) {
      const { error } = await db.from('assets').update({ vendor_id: keep }).eq('vendor_id', twin);
      if (error) { console.error('      FAILED to move the assets:', error.message); process.exit(1); }
    }
    if ((petty || []).length) {
      const { error } = await db.from('petty_cash_ledger').update({ vendor_name: keeper.name }).eq('vendor_name', loser.name);
      if (error) { console.error('      FAILED to move the petty cash entries:', error.message); process.exit(1); }
    }
    const { error: dErr } = await db.from('vendors').delete().eq('id', twin);
    if (dErr) { console.error('      FAILED to delete the twin:', dErr.message); process.exit(1); }
    console.log('      merged.');
  }
  console.log('');
}

for (const id of DELETE_ROWS) {
  const row = byId.get(id);
  if (!row) { console.log(`  skip delete ${id} — not on the list`); continue; }
  const { data: bills } = await db.from('expenses').select('id').eq('vendor_name', row.name);
  const { data: assets } = await db.from('assets').select('id').eq('vendor_id', id);
  if ((bills || []).length || (assets || []).length) {
    console.log(`  NOT deleting ${JSON.stringify(row.name)} (id ${id}) — it still carries ${(bills || []).length} bills or ${(assets || []).length} assets.`);
    continue;
  }
  console.log(`  delete ${JSON.stringify(row.name)} (id ${id}) — nothing points at it`);
  if (apply) {
    const { error } = await db.from('vendors').delete().eq('id', id);
    if (error) { console.error('      FAILED:', error.message); process.exit(1); }
    console.log('      deleted.');
  }
}

// A record of what was done, beside the backups.
if (apply) {
  const stamp = new Date().toISOString().slice(0, 10);
  const file = path.join('.backups', `vendor-merges-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify({ pairs, deleted: DELETE_ROWS, at: new Date().toISOString() }, null, 2));
  console.log(`\n  record written: ${file}`);
}

const { data: after } = await db.from('vendors').select('id,name').order('id');
console.log(`\n  vendors on the list: ${after.length}`);
