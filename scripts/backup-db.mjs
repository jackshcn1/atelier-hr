/**
 * backup-db.mjs — Full logical backup of the live Supabase database.
 *
 * Uses the Supabase Management API (personal access token) to execute SQL
 * remotely and write a restorable .sql file to .backups/.
 *
 * Produces:
 *   .backups/atelier_<ts>_schema.sql   — tables, columns, constraints, indexes,
 *                                         RLS policies, triggers, functions
 *   .backups/atelier_<ts>_data.sql     — INSERT statements for every table
 *
 * Usage:
 *   node scripts/backup-db.mjs
 *
 * Requires .supabase-access-token (Supabase CLI access token, kept out of git).
 */
import fs from 'fs';
import path from 'path';

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'wzxswmopfxnucmeygqeg';
const TOKEN_FILE = '.supabase-access-token';

if (!fs.existsSync(TOKEN_FILE)) {
  console.error(`Missing ${TOKEN_FILE}. Extract with:`);
  console.error(`  security find-generic-password -s "Supabase CLI" -a "supabase" -w > ${TOKEN_FILE}`);
  process.exit(1);
}
const token = fs.readFileSync(TOKEN_FILE, 'utf8').trim();

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    throw new Error(`SQL failed (${res.status}): ${(await res.text()).slice(0, 500)}`);
  }
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [rows];
}

const one = (rows) => Object.values(rows[0] || {})[0];

/* ----------------------------- schema dump ----------------------------- */

async function dumpSchema() {
  const parts = [];
  const banner = `-- Atelier HR — schema backup\n-- Project: ${PROJECT_REF}\n-- Generated: ${new Date().toISOString()}\n\n`;

  // Enums
  const enums = await sql(`select n.nspname as schema, t.typname as name, e.enumlabel as label
    from pg_type t join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname not in ('pg_catalog','information_schema')
    order by 1,2, e.enumsortorder`);
  const enumGroups = new Map();
  for (const r of enums) {
    const k = `${r.schema}.${r.name}`;
    if (!enumGroups.has(k)) enumGroups.set(k, { schema: r.schema, name: r.name, labels: [] });
    enumGroups.get(k).labels.push(r.label);
  }
  if (enumGroups.size) {
    parts.push('-- ENUMS');
    for (const e of enumGroups.values()) {
      parts.push(`create type ${e.schema}.${e.name} as enum (${e.labels.map((l) => `'${l.replace(/'/g, "''")}'`).join(', ')});`);
    }
    parts.push('');
  }

  // Tables (columns, defaults, nullability) with FK ordering hints
  const tables = await sql(`select c.table_schema as schema, c.table_name as name, c.column_name as col,
      c.ordinal_position as pos, c.data_type as dtype, c.udt_name as udt, c.is_nullable as nullable,
      c.column_default as def, c.character_maximum_length as maxlen
    from information_schema.columns c
    where c.table_schema = 'public'
    order by c.table_schema, c.table_name, c.ordinal_position`);

  const tableMap = new Map();
  for (const r of tables) {
    const k = `${r.schema}.${r.name}`;
    if (!tableMap.has(k)) tableMap.set(k, { schema: r.schema, name: r.name, cols: [] });
    tableMap.get(k).cols.push(r);
  }

  parts.push('-- TABLES');
  for (const t of tableMap.values()) {
    const colLines = t.cols.map((c) => {
      let type = c.udt;
      if (c.dtype === 'ARRAY') type = `${c.udt.replace(/^_/, '')}[]`;
      else if (c.dtype === 'character varying') type = `varchar${c.maxlen ? `(${c.maxlen})` : ''}`;
      else if (c.dtype === 'numeric') type = 'numeric';
      else if (c.dtype === 'timestamp with time zone') type = 'timestamptz';
      else if (c.dtype === 'timestamp without time zone') type = 'timestamp';
      else if (c.dtype === 'USER-DEFINED') type = c.udt;
      let line = `  "${c.col}" ${type}`;
      if (c.nullable === 'NO') line += ' not null';
      if (c.def) line += ` default ${c.def}`;
      return line;
    });
    parts.push(`create table ${t.schema}.${t.name} (\n${colLines.join(',\n')}\n);`);
  }
  parts.push('');

  // Primary keys
  const pks = await sql(`select tc.table_schema as schema, tc.table_name as name,
      string_agg(kcu.column_name, ', ' order by kcu.ordinal_position) as cols
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
    where tc.table_schema='public' and tc.constraint_type='PRIMARY KEY'
    group by 1,2`);
  parts.push('-- PRIMARY KEYS');
  for (const p of pks) parts.push(`alter table ${p.schema}.${p.name} add constraint ${p.name}_pkey primary key (${p.cols});`);
  parts.push('');

  // Unique constraints
  const uqs = await sql(`select tc.table_schema as schema, tc.table_name as name,
      tc.constraint_name as cname, string_agg(kcu.column_name, ', ' order by kcu.ordinal_position) as cols
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
    where tc.table_schema='public' and tc.constraint_type='UNIQUE'
    group by 1,2,3`);
  if (uqs.length) {
    parts.push('-- UNIQUE CONSTRAINTS');
    for (const u of uqs) parts.push(`alter table ${u.schema}.${u.name} add constraint ${u.cname} unique (${u.cols});`);
    parts.push('');
  }

  // Foreign keys
  const fks = await sql(`select tc.table_schema as schema, tc.table_name as name, tc.constraint_name as cname,
      kcu.column_name as col, ccu.table_schema as ref_schema, ccu.table_name as ref_table, ccu.column_name as ref_col
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
    where tc.table_schema='public' and tc.constraint_type='FOREIGN KEY'`);
  if (fks.length) {
    parts.push('-- FOREIGN KEYS');
    for (const f of fks) {
      parts.push(`alter table ${f.schema}.${f.name} add constraint ${f.cname} foreign key (${f.col}) references ${f.ref_schema}.${f.ref_table}(${f.ref_col});`);
    }
    parts.push('');
  }

  // Indexes
  const idx = await sql(`select schemaname as schema, tablename as name, indexname as iname, indexdef as def
    from pg_indexes where schemaname='public' order by tablename, indexname`);
  parts.push('-- INDEXES');
  for (const i of idx) parts.push(`${i.def};`);
  parts.push('');

  // RLS status + policies
  const rls = await sql(`select c.relname as name, c.relrowsecurity as enabled
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' order by c.relname`);
  parts.push('-- ROW LEVEL SECURITY');
  for (const t of rls) parts.push(`alter table public.${t.name} ${t.enabled ? 'enable row level security' : 'disable row level security'};`);
  parts.push('');

  const pol = await sql(`select schemaname as schema, tablename as name, policyname as pname,
      permissive as permissive, roles::text as roles, cmd as cmd, qual as qual, with_check as with_check
    from pg_policies where schemaname='public' order by tablename, policyname`);
  if (pol.length) {
    parts.push('-- POLICIES');
    for (const p of pol) {
      const roleList = p.roles.replace(/^\{(.*)\}$/, '$1').split(',').map((r) => r.trim()).filter(Boolean);
      const roles = roleList.length ? roleList.map((r) => (r === 'public' ? 'public' : `"${r}"`)).join(', ') : 'public';
      let stmt = `create policy ${p.pname} on ${p.schema}.${p.name} as ${p.permissive === 'PERMISSIVE' ? 'permissive' : 'restrictive'} for ${p.cmd} to ${roles}`;
      if (p.cmd === 'ALL' || p.cmd === 'SELECT' || p.cmd === 'UPDATE' || p.cmd === 'DELETE') stmt += ` using (${p.qual || 'true'})`;
      if (p.cmd === 'ALL' || p.cmd === 'INSERT' || p.cmd === 'UPDATE') stmt += ` with check (${p.with_check || 'true'})`;
      parts.push(`${stmt};`);
    }
    parts.push('');
  }

  // Triggers
  const trg = await sql(`select trigger_schema as schema, event_object_table as name, trigger_name as tname,
      action_timing as timing, event_manipulation as event, action_statement as stmt
    from information_schema.triggers where trigger_schema='public' order by event_object_table, trigger_name`);
  if (trg.length) {
    parts.push('-- TRIGGERS');
    for (const t of trg) {
      parts.push(`create trigger ${t.tname} ${t.timing} ${t.event.toLowerCase()} on ${t.schema}.${t.name} for each row execute function ${t.stmt};`);
    }
    parts.push('');
  }

  // Custom functions (non-extension)
  const fns = await sql(`select n.nspname as schema, p.proname as name, pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f'
    order by p.proname`);
  if (fns.length) {
    parts.push('-- FUNCTIONS');
    for (const f of fns) parts.push(`${f.def.replace(/^CREATE OR REPLACE /i, 'create or replace ')};`);
    parts.push('');
  }

  // Sequences
  const seqs = await sql(`select sequence_schema as schema, sequence_name as name, data_type as dtype
    from information_schema.sequences where sequence_schema='public' order by sequence_name`);
  if (seqs.length) {
    parts.push('-- SEQUENCES');
    for (const s of seqs) parts.push(`create sequence ${s.schema}.${s.name};`);
    parts.push('');
  }

  return banner + parts.join('\n') + '\n';
}

/* ------------------------------ data dump ------------------------------ */

async function dumpData() {
  const parts = [];
  parts.push(`-- Atelier HR — data backup\n-- Project: ${PROJECT_REF}\n-- Generated: ${new Date().toISOString()}\n`);
  parts.push('begin;');
  parts.push('');

  const tables = await sql(`select table_name as name from information_schema.tables
    where table_schema='public' and table_type='BASE TABLE' order by table_name`);

  let totalRows = 0;
  for (const t of tables) {
    const tbl = t.name;
    // Let Postgres render each row as a typed INSERT using jsonb_populate_record,
    // so every column type round-trips correctly without hand-escaping.
    const q = `select coalesce(string_agg(stmt, E'\\n'), '') as s from (
      select format('insert into public.%I select * from jsonb_populate_record(null::public.%I, %L::jsonb);',
                    '${tbl}', '${tbl}', j::text) as stmt
      from (select to_jsonb(x) as j from public."${tbl}" x) s
    ) q`;
    let stmts = '';
    try {
      const rows = await sql(q);
      stmts = one(rows) || '';
    } catch (e) {
      stmts = `-- ERROR dumping ${tbl}: ${e.message}`;
    }
    const count = stmts ? stmts.split('\n').filter(Boolean).length : 0;
    totalRows += count;
    parts.push(`-- ${tbl} (${count} rows)`);
    if (stmts) parts.push(stmts);
    parts.push('');
  }

  parts.push('commit;');
  parts.push('');
  console.log(`   data rows captured: ${totalRows} across ${tables.length} tables`);
  return parts.join('\n');
}

/* -------------------------------- main --------------------------------- */

(async () => {
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
  const dir = '.backups';
  fs.mkdirSync(dir, { recursive: true });

  console.log('1/2 Dumping schema...');
  const schema = await dumpSchema();
  const schemaPath = path.join(dir, `atelier_${ts}_schema.sql`);
  fs.writeFileSync(schemaPath, schema);
  console.log(`   -> ${schemaPath} (${(schema.length / 1024).toFixed(1)} KB)`);

  console.log('2/2 Dumping data...');
  const data = await dumpData();
  const dataPath = path.join(dir, `atelier_${ts}_data.sql`);
  fs.writeFileSync(dataPath, data);
  console.log(`   -> ${dataPath} (${(data.length / 1024).toFixed(1)} KB)`);

  console.log('Backup complete.');
})().catch((e) => {
  console.error('BACKUP FAILED:', e.message);
  process.exit(1);
});
