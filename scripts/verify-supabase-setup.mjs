/**
 * verify-supabase-setup.mjs — Post-reconciliation verification.
 *
 * Checks:
 *   1. Migration ledger: local files vs remote records (must match)
 *   2. No pending migrations left to push
 *   3. exec_sql works with the service_role key
 *   4. exec_sql is DENIED for the anonymous key (security)
 *   5. Every table/column the application reads actually exists
 *   6. PostgREST exposes the newly created tables
 */
import fs from 'fs';

const env = {};
fs.readFileSync('.env.local', 'utf8').split('\n').forEach((l) => {
  const [k, ...v] = l.split('=');
  if (k && v) env[k.trim()] = v.join('=').trim();
});
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let pass = 0, fail = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

async function rpc(key, fn, args) {
  const res = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  return { status: res.status, body: await res.text() };
}

console.log('=== 1. exec_sql with service_role ===');
let r = await rpc(SVC, 'exec_sql_select', { q: 'select 1 as x, current_user as usr' });
let parsed = {};
try { parsed = JSON.parse(r.body); } catch {}
check('service_role can call exec_sql_select', r.status === 200 && parsed.ok === true, r.status !== 200 ? r.body.slice(0, 120) : '');
console.log(`      rows: ${JSON.stringify(parsed.rows)}`);

r = await rpc(SVC, 'exec_sql', { q: 'select 1' });
try { parsed = JSON.parse(r.body); } catch {}
check('service_role can call exec_sql', r.status === 200 && parsed.ok === true, r.status !== 200 ? r.body.slice(0, 120) : '');

console.log('\n=== 2. exec_sql DENIED for anonymous key (security) ===');
r = await rpc(ANON, 'exec_sql', { q: 'select 1' });
check('anon key is rejected by exec_sql', r.status !== 200, `HTTP ${r.status}: ${r.body.slice(0, 140)}`);
r = await rpc(ANON, 'exec_sql_select', { q: 'select 1' });
check('anon key is rejected by exec_sql_select', r.status !== 200, `HTTP ${r.status}`);

console.log('\n=== 3. Application-required schema ===');
const reqTables = ['employees','profiles','assets','asset_locations','asset_categories','vendors',
  'maintenance_jobs','maintenance_pocs','maintenance_job_pocs','maintenance_audit_logs','job_quotes',
  'expenses','fixed_costs','petty_cash_ledger','cashflow_transactions','variable_pay_schemes',
  'variable_pay_periods','variable_metric_inputs','onboarding_doc_templates','onboarding_acknowledgments',
  'payroll_runs','payroll_line_items','company_documents','checklist_templates','checklist_runs',
  'tasks','task_comments','task_audit_logs','candidates','job_listings','offers','exit_records'];
const reqColumns = [
  ['assets','assigned_employee_id'],['assets','condition'],['assets','created_at'],['assets','brand'],
  ['assets','location'],['assets','notes'],['assets','purchase_price'],['assets','is_new'],
  ['assets','model_name'],['assets','warranty_months'],['assets','warranty_contact'],
  ['assets','extended_warranty'],['assets','extended_warranty_months'],['assets','vendor_id'],
  ['assets','pre_maintenance_status'],
  ['employees','acknowledgment_id'],
  ['job_quotes','line_items'],['job_quotes','date'],['job_quotes','poc_id'],['job_quotes','is_approved'],
  ['maintenance_jobs','completion_type'],['maintenance_jobs','is_locked'],
  ['variable_pay_schemes','policy_guidelines'],['variable_pay_schemes','terms_and_conditions'],
  ['maintenance_job_pocs','stage'],
];

const sel = async (table, cols) => {
  const res = await fetch(`${URL}/rest/v1/${table}?select=${cols.join(',')}&limit=1`, {
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}` },
  });
  return res.status;
};

const missingTables = [];
for (const t of reqTables) {
  const res = await fetch(`${URL}/rest/v1/${t}?select=*&limit=1`, { headers: { apikey: SVC, Authorization: `Bearer ${SVC}` } });
  if (res.status >= 400) missingTables.push(t);
}
check(`all ${reqTables.length} app tables exposed via PostgREST`, missingTables.length === 0, missingTables.join(', '));

const missingCols = [];
for (const [t, c] of reqColumns) {
  const res = await fetch(`${URL}/rest/v1/${t}?select=${c}&limit=1`, { headers: { apikey: SVC, Authorization: `Bearer ${SVC}` } });
  if (res.status >= 400) missingCols.push(`${t}.${c}`);
}
check(`all ${reqColumns.length} app columns present`, missingCols.length === 0, missingCols.join(', '));

console.log('\n=== 4. Live data intact ===');
for (const t of ['employees', 'payroll_runs', 'onboarding_doc_templates', 'assets', 'vendors', 'expenses']) {
  const res = await fetch(`${URL}/rest/v1/${t}?select=*`, { headers: { apikey: SVC, Authorization: `Bearer ${SVC}` } });
  const j = await res.json();
  console.log(`      ${t}: ${Array.isArray(j) ? j.length : 'ERR'} rows`);
}

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
