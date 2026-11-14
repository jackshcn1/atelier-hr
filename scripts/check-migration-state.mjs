/**
 * check-migration-state.mjs — Reconcile local migration files against the live DB.
 *
 * For every migration file present locally but absent from Supabase's
 * supabase_migrations ledger, inspects the objects it creates and reports:
 *   APPLIED  — every object already exists (safe to mark applied)
 *   PARTIAL  — some objects exist (needs the rest applied, then mark applied)
 *   MISSING  — nothing exists (safe to push normally)
 *
 * Read-only: never writes to the database.
 */
import fs from 'fs';
import path from 'path';

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'wzxswmopfxnucmeygqeg';
const token = fs.readFileSync('.supabase-access-token', 'utf8').trim();

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`SQL failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [rows];
}

const MIGRATIONS_DIR = 'supabase/migrations';
const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

/* --- objects the live schema already has --- */
const tables = new Set((await sql(`select tablename as t from pg_tables where schemaname='public'`)).map((r) => r.t));
const columns = new Set((await sql(`select table_name||'.'||column_name as c from information_schema.columns where table_schema='public'`)).map((r) => r.c));
const indexes = new Set((await sql(`select indexname as i from pg_indexes where schemaname='public'`)).map((r) => r.i));
const policies = new Set((await sql(`select policyname as p from pg_policies where schemaname='public'`)).map((r) => r.p));
const triggers = new Set((await sql(`select trigger_name as t from information_schema.triggers where trigger_schema='public'`)).map((r) => r.t));
const functions = new Set((await sql(`select proname as f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`)).map((r) => r.f));
const rlsEnabled = new Set((await sql(`select c.relname as t from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relrowsecurity`)).map((r) => r.t));
const ledger = new Set((await sql(`select version as v from supabase_migrations.schema_migrations`)).map((r) => r.v));

/* --- ledger state --- */
const { execSync } = await import('child_process');
const listed = execSync('supabase migration list 2>/dev/null', { encoding: 'utf8' });
const pending = listed.split('\n')
  .map((l) => l.replace(/`/g, '').split('|').map((s) => s.trim()))
  .filter((c) => /^[0-9]{14}$/.test(c[0]) && c[1] === '')
  .map((c) => c[0]);

const uniq = [...new Set(pending)];
console.log(`Ledger: ${ledger.size} recorded | ${uniq.length} local files not in ledger\n`);

const clean = (s) => s.replace(/public\./g, '').replace(/"/g, '').trim();

for (const version of uniq) {
  const file = files.find((f) => f.startsWith(version));
  if (!file) continue;
  const sqlText = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
  const checks = [];

  // CREATE TABLE [IF NOT EXISTS] name
  for (const m of sqlText.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([a-zA-Z_][\w.]*)/gi)) {
    const t = clean(m[1]);
    checks.push({ kind: 'table', name: t, exists: tables.has(t) });
  }
  // ALTER TABLE x ADD [COLUMN] [IF NOT EXISTS] col
  for (const m of sqlText.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?([a-zA-Z_][\w.]*)\s+add\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?([a-zA-Z_]\w*)/gi)) {
    const t = clean(m[1]); const c = clean(m[2]);
    checks.push({ kind: 'column', name: `${t}.${c}`, exists: columns.has(`${t}.${c}`) });
  }
  // CREATE INDEX name ON table
  for (const m of sqlText.matchAll(/create\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?([a-zA-Z_]\w*)\s+on\s+([a-zA-Z_][\w.]*)/gi)) {
    const i = clean(m[1]);
    checks.push({ kind: 'index', name: i, exists: indexes.has(i) });
  }
  // CREATE POLICY [IF NOT EXISTS] "name" ON table
  for (const m of sqlText.matchAll(/create\s+policy\s+(?:if\s+not\s+exists\s+)?(?:"([^"]+)"|([a-zA-Z_]\w*))\s+on\s+([a-zA-Z_][\w.]*)/gi)) {
    const p = clean(m[1] || m[2]);
    checks.push({ kind: 'policy', name: p, exists: policies.has(p) });
  }
  // ALTER TABLE x ENABLE ROW LEVEL SECURITY
  for (const m of sqlText.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?([a-zA-Z_][\w.]*)\s+enable\s+row\s+level\s+security/gi)) {
    const t = clean(m[1]);
    checks.push({ kind: 'rls', name: `${t}.rls`, exists: rlsEnabled.has(t) });
  }
  // CREATE TRIGGER name
  for (const m of sqlText.matchAll(/create\s+trigger\s+([a-zA-Z_]\w*)/gi)) {
    const t = clean(m[1]);
    checks.push({ kind: 'trigger', name: t, exists: triggers.has(t) });
  }
  // CREATE FUNCTION name
  for (const m of sqlText.matchAll(/create\s+(?:or\s+replace\s+)?function\s+([a-zA-Z_][\w.]*)/gi)) {
    const f = clean(m[1]).split('(')[0].split('.').pop();
    checks.push({ kind: 'function', name: f, exists: functions.has(f) });
  }
  // INSERT INTO table  (seed)
  for (const m of sqlText.matchAll(/insert\s+into\s+([a-zA-Z_][\w.]*)/gi)) {
    const t = clean(m[1]);
    if (!checks.some((c) => c.kind === 'table' && c.name === t)) {
      checks.push({ kind: 'seed', name: t, exists: tables.has(t) });
    }
  }

  const total = checks.length;
  const found = checks.filter((c) => c.exists).length;
  const status = total === 0 ? 'UNKNOWN' : found === total ? 'APPLIED' : found === 0 ? 'MISSING' : 'PARTIAL';
  console.log(`${status.padEnd(8)} ${version}  ${file.replace(version, '')}  [${found}/${total} objects present]`);
  if (status === 'PARTIAL' || status === 'UNKNOWN') {
    for (const c of checks.filter((x) => !x.exists)) console.log(`           MISSING ${c.kind}: ${c.name}`);
  }
}
