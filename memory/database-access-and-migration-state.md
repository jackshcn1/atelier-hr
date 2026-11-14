---
name: database-access-and-migration-state
description: "How to run SQL and migrations against the live Atelier HR database, and the 2026-11-14 migration ledger reconciliation."
metadata:
  node_type: memory
  type: project
  modified: 2026-11-14T12:15:00.000Z
---

# Database Access & Migration State

## How to run SQL (no Dashboard copy-paste needed)

Two RPCs exist on the live database, created by
`supabase/migrations/20261114120000_add_exec_sql_function.sql`:

- `public.exec_sql(q text) returns jsonb` — runs DDL/DML, returns `{ok, row_count}` or `{ok:false, error, code}`
- `public.exec_sql_select(q text) returns jsonb` — runs a SELECT, returns `{ok, rows}`

Both are `SECURITY DEFINER` (run as `postgres`) with `search_path = ''`.
`anon` and `authenticated` are **revoked** and verified rejected (HTTP 401).
Only `service_role` may call them. Do not widen these grants.

Call them with the service-role key from `.env.local`:

```js
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.rpc('exec_sql', { q: 'alter table ...' });
```

## Migrations

- `supabase link` is done — project ref `wzxswmopfxnucmeygqeg`.
- Ledger is in sync: **54 local files = 54 remote records**, zero mismatched.
- `supabase db push` reports "Remote database is up to date".
- Workflow: write `supabase/migrations/<version>_<name>.sql`, then `supabase db push`.
- If local files sort *before* the last applied remote version, push needs
  `--include-all`. That happens only when the DB was migrated by hand.

## Backup (required before any schema change)

```
node scripts/backup-db.mjs
```

Writes schema + data dumps to `.backups/` (gitignored). Needs
`.supabase-access-token` — the Supabase CLI access token:

```
security find-generic-password -s "Supabase CLI" -a "supabase" -w > .supabase-access-token
```

`supabase db dump` does **not** work here — it shells out to Docker, which is not
installed on this machine. The script uses the Management API instead and builds
INSERTs via `jsonb_populate_record`, so every column type round-trips correctly.

## Auditing drift

```
node scripts/check-migration-state.mjs
```

Reports per migration: APPLIED / PARTIAL / MISSING, based on whether its tables,
columns, indexes, policies, triggers and functions exist on the live DB.

```
node scripts/verify-supabase-setup.mjs
```

Verifies exec_sql works, that anon is denied, and that every table/column the app
reads actually exists.

## The 2026-11-14 reconciliation

Before this, **21 migrations were never recorded in the ledger** even though the
schema had been applied by hand through the Dashboard SQL Editor. Consequences:

- `supabase db push` failed outright on the first already-applied migration.
- Nine migrations had never actually been applied, so parts of the **deployed** app
  on `main` were broken: the finance cashflow and P&L pages queried a
  `cashflow_transactions` table that did not exist, the assets pages read columns
  (`assigned_employee_id`, `condition`, `created_at`, `brand`, `location`, `notes`,
  `purchase_price`, warranty fields) that did not exist, the onboarding Active gate
  read a missing `employees.acknowledgment_id`, and the variable-pay target document
  read missing `variable_pay_schemes.policy_guidelines`.

Resolution, in order:

1. Backed up the database (schema + data) to `.backups/`.
2. `supabase migration repair --status applied` for the 13 migrations verified as
   already present on the live DB.
3. Made 5 conflicting migration files re-runnable (`if not exists`, `drop policy if
   exists` before `create policy`, `on conflict do nothing` on seeds).
4. Fixed a **duplicate version collision**: `20261109100000` was used by both
   `add_fixed_costs_petty_cash.sql` and `add_cashflow_module.sql`. Renamed the
   cashflow one to `20261109100002_add_cashflow_module.sql`.
5. `supabase db push --include-all` applied the 9 genuinely-missing migrations.
6. Pushed the new `exec_sql` migration.

### Schema facts that caused conflicts — do not "fix" these back

- `assets` is keyed on a **text `id`**, not `asset_id`. It was recreated by
  `20261020110000` with a simpler shape, which is why `20261008100000`'s original
  `create table assets` could never be replayed. `maintenance_work_orders` and
  `asset_audit_log` therefore reference `assets(id)`, not `assets(asset_id)`.
- `maintenance_job_pocs.poc_id` is **TEXT**, matching `maintenance_pocs.id` (text).
  The UUID conversion in `20261021160000` was reverted deliberately when the FK was
  repaired in `20261021140000`, so that file now keeps the TEXT types.
- The asset-type seed contains a duplicate `CH` prefix (Chiller / Chair). The seed
  uses `on conflict do nothing`, so `Chair` is skipped rather than aborting the
  migration.

Related: [[tech-stack-atelier]], [[workflow-preferences]], [[project-atelier-hr]]
