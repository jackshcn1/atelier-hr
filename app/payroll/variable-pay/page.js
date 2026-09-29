'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { createClient } from '../../../lib/supabaseClient';
import {
  parseCaptainPerformance, parsePaxSales, parseKitchenPrepTime, parseWastage,
  parseB2bGstOrders, parseCreditRecovery, parsePurchaseReturns,
  parseDeliverySales, parseFeedbackForm, parseCounterSales
} from '../../../lib/variablePayParsers';
import { computeEmployeeVariablePayout } from '../../../lib/variablePayCalculator';

// The 14 approved kitchen categories. Kept here as a safe default; the
// authoritative list lives in kitchen_menu_categories and is loaded on mount.
const DEFAULT_KITCHEN_CATEGORIES = [
  'Appetizer', 'Arabic', 'Burgers', 'Chinese', 'Combos', 'Grills', 'Indian',
  'Indian Breads', 'Kothu Parotta', 'Pastas', 'Pizza', 'Salads', 'Sandwiches', 'Soups'
];

const DELIVERY_CHANNELS = ['Swiggy_Atelier', 'Zomato'];

// metric_id -> how its value is obtained and which report feeds it.
// Metric source config: source type, parser key, label, whether individual (per-employee),
// optional Petpooja/Google link, and for Counter Sales the category/area filters.
const SOURCE_MAP = {
  cap_sales:     { source: 'petpooja', parser: 'captain', label: 'Captain Performance Report', individual: true, link: 'https://billing.petpooja.com/custom_reports/view_report/27' },
  cap_reviews:   { source: 'manual_entry', label: 'Manual check of Google reviews' },
  cap_pax_avg:   { source: 'petpooja', parser: 'pax', label: 'Pax Sales Report (Biller Wise)', individual: true, link: 'https://billing.petpooja.com/custom_reports/view_report/61' },
  cap_grooming:  { source: 'checklist', label: 'Grooming checklists in this system' },
  cap_quality:   { source: 'feedback_form', label: 'Customer Feedback Form sheet', link: 'https://docs.google.com/spreadsheets/d/1M0jVGEh1aekFYnMtVkHSA4oobZq5Pg1i3-D6TenF9kU/edit?usp=sharing' },
  hlp_team_sales:{ source: 'petpooja', parser: 'captain', label: 'Captain Performance Report (team total — sum of all captains)', link: 'https://billing.petpooja.com/custom_reports/view_report/27' },
  hlp_grooming:  { source: 'checklist', label: 'Grooming checklists in this system' },
  hlp_quality:   { source: 'feedback_form', label: 'Customer Feedback Form sheet', link: 'https://docs.google.com/spreadsheets/d/1M0jVGEh1aekFYnMtVkHSA4oobZq5Pg1i3-D6TenF9kU/edit?usp=sharing' },
  kit_food_quality: { source: 'feedback_form', label: 'Customer Feedback Form sheet', link: 'https://docs.google.com/spreadsheets/d/1M0jVGEh1aekFYnMtVkHSA4oobZq5Pg1i3-D6TenF9kU/edit?usp=sharing' },
  kit_prep_time:{ source: 'petpooja', parser: 'kot', label: 'KOT Process Time + Base Menu', link: 'https://billing.petpooja.com/custom_reports/view_report/78' },
  kit_wastage:  { source: 'petpooja', parser: 'wastage', label: 'Wastage Report', link: 'https://inventory.petpooja.com/inventories/wastage_list/' },
  kit_hygiene:  { source: 'checklist', label: 'Kitchen hygiene checklists in this system' },
  kit_grooming: { source: 'checklist', label: 'Grooming checklists in this system' },
  b2b_rev:      { source: 'petpooja', parser: 'b2b', label: 'Corporate Customers order summary (100-day report; data filtered to payroll period)', link: 'https://billing.petpooja.com/reports/all_restaurant_orders/all' },
  b2b_clients:  { source: 'petpooja', parser: 'b2b', label: 'Corporate Customers order summary (same report as B2B Revenue — new GST clients in period)', link: 'https://billing.petpooja.com/reports/all_restaurant_orders/all' },
  b2b_returns:  { source: 'petpooja', parser: 'returns', label: 'Purchase Return report', link: 'https://inventory.petpooja.com/inventories/purchase_return_list/' },
  b2b_credit:   { source: 'petpooja', parser: 'credit', label: 'Due Payment report', link: 'https://billing.petpooja.com/reports/order_summary_ho/1' },
  b2b_counter_sales: { source: 'petpooja', parser: 'counter', label: 'Item Report with Customer Order Details (Final Total, filtered categories, exclude delivery)', link: 'https://billing.petpooja.com/custom_reports/view_report/65' },
  hk_checklist: { source: 'checklist', label: 'Housekeeping cleaning checklists' },
  hk_cleanliness:{ source: 'manual_entry', label: 'Manual entry — no cleanliness field in feedback form' },
  hk_breakage:  { source: 'manual_entry', label: 'Manual entry' },
  acc_reconciliation: { source: 'manual_entry', label: 'Manual entry — reconciliation report pending' },
  acc_delivery_sales: { source: 'petpooja', parser: 'delivery', label: 'Orders Master (Swiggy/Zomato)', link: 'https://billing.petpooja.com/custom_reports/view_report/10' },
  acc_gst:      { source: 'manual_entry', label: 'Manual entry' }
};

// binary "status"-style metrics are recorded as 1 or 0
const STATUS_METRICS = new Set(['b2b_credit', 'acc_gst', 'hk_checklist']);

function getDefaultCycle() {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  let ey = y, em = m;
  if (d < 20) { em -= 1; if (em < 0) { em = 11; ey -= 1; } }
  let sy = ey, sm = em - 1;
  if (sm < 0) { sm = 11; sy -= 1; }
  return {
    start: `${sy}-${String(sm + 1).padStart(2, '0')}-20`,
    end: `${ey}-${String(em + 1).padStart(2, '0')}-19`
  };
}

function readWorkbook(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'binary', cellDates: true });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
          header: 1, defval: '', raw: false, blankrows: true
        });
        resolve(rows);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });
}

const SOURCE_BADGE = {
  petpooja:     { label: 'Petpooja',       bg: '#e0f2fe', fg: '#0369a1', icon: '🧾' },
  feedback_form:{ label: 'Feedback form',  bg: '#ede9fe', fg: '#6d28d9', icon: '📝' },
  checklist:    { label: 'HRMS checklist', bg: '#dcfce7', fg: '#15803d', icon: '✅' },
  google_sheet: { label: 'Google Sheet',   bg: '#fef3c7', fg: '#b45309', icon: '📊' },
  manual_entry: { label: 'Manual entry',   bg: '#f3f4f6', fg: '#374151', icon: '✏️' }
};

export default function VariablePayPage() {
  const supabase = createClient();
  const cycle = getDefaultCycle();

  const [periodStart, setPeriodStart] = useState(cycle.start);
  const [periodEnd, setPeriodEnd] = useState(cycle.end);

  const [period, setPeriod] = useState(null);
  const [schemes, setSchemes] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [kitchenCategories, setKitchenCategories] = useState(DEFAULT_KITCHEN_CATEGORIES);
  const [inputs, setInputs] = useState({});     // metric_id -> { actual, source_type, source_filename, source_detail } OR per-emp: metric_id -> { empId -> { actual, ... } }
  const [manualDrafts, setManualDrafts] = useState({}); // "metricId::empId" -> string

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyParser, setBusyParser] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [lockIssues, setLockIssues] = useState([]);

  const isLocked = period?.status === 'locked' || period?.status === 'paid';
  const isPaid = period?.status === 'paid';

  // ------------------------------------------------------------------ load
  const loadPeriod = useCallback(async (start, end) => {
    const { data } = await supabase
      .from('variable_pay_periods')
      .select('*')
      .eq('period_start', start)
      .eq('period_end', end)
      .maybeSingle();
    return data;
  }, [supabase]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      const [schemesRes, empRes, catRes] = await Promise.all([
        supabase.from('variable_pay_schemes').select('*').eq('is_active', true).order('id'),
        supabase.from('employees').select('employee_id, name, designation, department, current_variable_salary, variable_pay_scheme').is('deleted_at', null).in('status', ['active', 'on-notice']),
        supabase.from('kitchen_menu_categories').select('category').eq('counts_toward_prep_time', true)
      ]);
      setSchemes(schemesRes.data || []);
      setEmployees(empRes.data || []);
      if (catRes.data?.length) setKitchenCategories(catRes.data.map(c => c.category));

      const p = await loadPeriod(periodStart, periodEnd);
      if (p) {
        setPeriod(p);
        const { data: rows } = await supabase.from('variable_metric_inputs').select('*').eq('period_id', p.id);
        const map = {};
        (rows || []).forEach(r => {
          const key = r.metric_id;
          if (!map[key]) map[key] = {};
          map[key][r.employee_id || 'TEAM'] = {
            actual: r.actual_value,
            source_type: r.source_type,
            source_filename: r.source_filename,
            source_detail: r.source_detail || {}
          };
        });
        setInputs(map);
      } else {
        setPeriod(null);
        setInputs({});
      }
      setLoading(false);
    })();
  }, [periodStart, periodEnd, loadPeriod]);

  // -------------------------------------------------------------- employees
  const employeesByScheme = useMemo(() => {
    const out = {};
    schemes.forEach(s => { out[s.name] = []; });
    employees.forEach(e => {
      if (e.variable_pay_scheme && out[e.variable_pay_scheme]) out[e.variable_pay_scheme].push(e);
    });
    Object.values(out).forEach(list => list.sort((a, b) => a.name.localeCompare(b.name)));
    return out;
  }, [schemes, employees]);

  // ------------------------------------------------------------- persisting
  async function saveMetric(metricId, actual, sourceType, filename, detail, employeeId = null) {
    if (!period) return;
    setSaving(true);
    setError('');
    const payload = {
      period_id: period.id,
      scheme_name: detail?.scheme_name || '',
      metric_id: metricId,
      employee_id: employeeId,
      actual_value: actual,
      source_type: sourceType,
      source_filename: filename || null,
      source_detail: detail || {}
    };
    const { error: e } = await supabase.from('variable_metric_inputs').upsert(payload, {
      onConflict: 'period_id,metric_id,employee_id'
    });
    setSaving(false);
    if (e) { setError(e.message); return; }
    setInputs(prev => {
      const key = metricId;
      const empKey = employeeId || 'TEAM';
      const newValue = { actual, source_type: sourceType, source_filename: filename, source_detail: detail };
      return {
        ...prev,
        [key]: { ...prev[key], [empKey]: newValue }
      };
    });
  }

  // Store the uploaded Base Menu rows in component state so the KOT parser
  // can map item names to categories without asking for a second file.
  const [baseMenuRows, setBaseMenuRows] = useState(null);

  async function handleBaseMenuUpload(file) {
    setError(''); setMessage(''); setBusyParser('basemenu');
    try {
      const rows = await readWorkbook(file);
      // Count usable rows for a quick confirmation
      const headerIndex = rows.findIndex(r =>
        r.some(c => String(c).trim().toLowerCase() === 'category') &&
        r.some(c => String(c).trim().toLowerCase() === 'item name')
      );
      const itemCount = headerIndex >= 0
        ? rows.slice(headerIndex + 1).filter(r => String(r[2] ?? '').trim()).length
        : rows.filter(r => r.some(c => String(c).trim())).length;
      setBaseMenuRows(rows);
      setMessage(`✓ Base Menu loaded (${itemCount} items). Now upload the KOT Process Time report.`);
      setBusyParser(null);
    } catch (err) {
      setError(err.message); setBusyParser(null);
    }
  }

  // ------------------------------------------------------------- uploading
  async function handleParserFile(metricId, parserKey, file) {
    setError('');
    setMessage('');
    setBusyParser(metricId);
    try {
      const rows = await readWorkbook(file);
      const range = { start: periodStart, end: periodEnd };
      let result;
      let extraFiles = null;

      if (parserKey === 'kot') {
        // KOT needs the Base Menu to map item names to kitchen categories.
        // Prefer a previously uploaded Base Menu; otherwise ask for one now.
        let menuRows = baseMenuRows;
        if (!menuRows) {
          const menuInput = document.createElement('input');
          menuInput.type = 'file';
          menuInput.accept = '.csv,.xlsx,.xls';
          const menuFile = await new Promise(res => {
            menuInput.onchange = () => res(menuInput.files?.[0] || null);
            menuInput.oncancel = () => res(null);
            menuInput.click();
          });
          if (!menuFile) { setBusyParser(null); setError('Base Menu file is required to map KOT items to kitchen categories.'); return; }
          menuRows = await readWorkbook(menuFile);
          setBaseMenuRows(menuRows);
        }
        result = parseKitchenPrepTime(rows, menuRows, { ...range, kitchenCategories });
        extraFiles = baseMenuRows ? 'using saved Base Menu' : menuFile.name;
      } else if (parserKey === 'captain') {
        result = parseCaptainPerformance(rows, range);
      } else if (parserKey === 'pax') {
        result = parsePaxSales(rows, range);
      } else if (parserKey === 'wastage') {
        result = parseWastage(rows, range);
      } else if (parserKey === 'b2b') {
        result = parseB2bGstOrders(rows, range);
      } else if (parserKey === 'credit') {
        result = parseCreditRecovery(rows, { end: periodEnd, maxAgeDays: 30 });
      } else if (parserKey === 'returns') {
        result = parsePurchaseReturns(rows, range);
      } else if (parserKey === 'delivery') {
        result = parseDeliverySales(rows, { ...range, channels: DELIVERY_CHANNELS });
      } else if (parserKey === 'counter') {
        result = parseCounterSales(rows, range);
      } else {
        result = { ok: false, error: `Unknown parser "${parserKey}".` };
      }

      if (!result.ok) { setError(result.error); setBusyParser(null); return; }

      // Map the parsed result onto the specific metric being uploaded.
      const scheme = schemes.find(s => (s.metrics || []).some(m => m.id === metricId));
      const metric = scheme?.metrics.find(m => m.id === metricId);
      const detail = { ...result, scheme_name: scheme?.name };
      delete detail.ok;

      let value = null;
      if (metricId === 'cap_sales') {
        const name = manualDrafts[`target::${metricId}`];
        value = result.captains.find(c => c.name.toLowerCase() === String(name || '').toLowerCase())?.total ?? null;
      } else if (metricId === 'cap_pax_avg') {
        const name = manualDrafts[`target::${metricId}`];
        value = result.people.find(p => p.name.toLowerCase() === String(name || '').toLowerCase())?.apc ?? null;
      } else if (metricId === 'hlp_team_sales') {
        value = result.teamTotal;
      } else if (metricId === 'kit_prep_time') {
        value = result.averageMinutes;
      } else if (metricId === 'kit_wastage') {
        value = result.total;
      } else if (metricId === 'b2b_rev') {
        value = result.totalRevenue;
      } else if (metricId === 'b2b_clients') {
        value = result.newCustomerCount;
      } else if (metricId === 'b2b_returns') {
        value = result.total;
      } else if (metricId === 'b2b_credit') {
        value = result.pass ? 1 : 0;
      } else if (metricId === 'b2b_counter_sales') {
        value = result.total;
      } else if (metricId === 'acc_delivery_sales') {
        value = result.total;
      }

      if (value === null || value === undefined) {
        setError(`Parsed the file, but no value matched metric "${metricId}". Check the person/row selected.`);
        setBusyParser(null);
        return;
      }

      const cfg = SOURCE_MAP[metricId] || {};

      if (cfg.individual && result.captains) {
        // Per-captain metrics: one stored row per captain, matched to the
        // employee record by name so the payslip can attribute it.
        let matched = 0;
        let unmatchedNames = [];
        for (const cap of result.captains) {
          const emp = employees.find(e => e.name.toLowerCase() === cap.name.toLowerCase());
          if (emp) {
            matched++;
            await saveMetric(metricId, cap.total, 'petpooja', file.name, {
              scheme_name: scheme?.name,
              captain_name: cap.name
            }, emp.employee_id);
          } else {
            unmatchedNames.push(cap.name);
          }
        }
        // The Helpers' team target comes from the same report — save the total
        // so nobody has to upload the same file twice.
        await saveMetric('hlp_team_sales', result.teamTotal, 'petpooja', file.name, {
          scheme_name: 'service_helpers',
          from: 'Captain Performance Report (sum of all captains)'
        });
        setMessage(
          `✓ Saved ${matched} captain(s) and updated Helpers team total (₹${result.teamTotal.toLocaleString('en-IN')}).` +
          (unmatchedNames.length ? ` ⚠ No employee record found for: ${unmatchedNames.join(', ')} — check spelling.` : '')
        );
        setBusyParser(null);
        return;
      }

      await saveMetric(metricId, value, 'petpooja', file.name, detail);

      // B2B revenue and new-client count come from the same report.
      if (metricId === 'b2b_rev') {
        await saveMetric('b2b_clients', result.newCustomerCount, 'petpooja', file.name, {
          scheme_name: 'b2b_counter',
          from: 'Corporate Customers order summary'
        });
        setMessage(`✓ B2B revenue ₹${result.totalRevenue.toLocaleString('en-IN')} and ${result.newCustomerCount} new client(s) saved.`);
        setBusyParser(null);
        return;
      }

      setMessage(`✓ ${metric?.name || metricId} updated from ${file.name}.`);
      setBusyParser(null);
    } catch (err) {
      setError(err.message || 'Could not read that file.');
      setBusyParser(null);
    }
  }

  async function handleFeedbackUpload(file) {
    setError(''); setMessage(''); setBusyParser('feedback');
    try {
      const rows = await readWorkbook(file);
      const result = parseFeedbackForm(rows, { start: periodStart, end: periodEnd });
      if (!result.ok) { setError(result.error); setBusyParser(null); return; }
      const detail = { ...result, scheme_name: 'feedback' };
      delete detail.ok;
      if (result.kitchenFoodPercent != null) {
        await saveMetric('kit_food_quality', result.kitchenFoodPercent, 'feedback_form', file.name, detail);
      }
      if (result.servicePercent != null) {
        await saveMetric('cap_quality', result.servicePercent, 'feedback_form', file.name, detail);
        await saveMetric('hlp_quality', result.servicePercent, 'feedback_form', file.name, detail);
      }
      setMessage(`✓ Feedback scores loaded from ${result.responses} responses.`);
      setBusyParser(null);
    } catch (err) {
      setError(err.message); setBusyParser(null);
    }
  }

  async function saveManual(metricId, rawValue) {
    const n = Number(rawValue);
    if (rawValue === '' || !Number.isFinite(n)) {
      setError('Enter a number, or clear the field to mark this metric as not provided.');
      return;
    }
    const metric = schemes.flatMap(s => s.metrics || []).find(m => m.id === metricId);
    // Status-style metrics (credit recovery, GST filing) are 1 = pass, 0 = fail.
    const value = STATUS_METRICS.has(metricId) ? (n >= 1 ? 1 : 0) : n;
    await saveMetric(metricId, value, 'manual_entry', null, { scheme_name: 'manual' });
    setManualDrafts(d => { const c = { ...d }; delete c[metricId]; return c; });
    setMessage(`✓ ${metric?.name || metricId} saved.`);
  }

  // -------------------------------------------------------------- preview
  const preview = useMemo(() => {
    const rows = [];
    schemes.forEach(s => {
      (s.metrics || []).forEach(metric => {
        const teamMembers = employeesByScheme[s.name] || [];
        const isIndividual = metric.scope === 'individual';

        if (isIndividual) {
          teamMembers.forEach(e => {
            const rec = inputs[metric.id];
            const val = rec ? (rec[e.employee_id]?.actual ?? rec['TEAM']?.actual) : null;
            const actual = val !== null && val !== undefined && !Number.isNaN(val) ? Number(val) : null;
            rows.push({
              scheme: s.display_name,
              schemeName: s.name,
              metric,
              employee: { employee_id: e.employee_id, name: e.name, pool: Number(e.current_variable_salary || 0) },
              actual,
              source: (rec?.[e.employee_id]?.source_type ?? rec?.['TEAM']?.source_type) || null,
              file: (rec?.[e.employee_id]?.source_filename ?? rec?.['TEAM']?.source_filename) || null
            });
          });
        } else {
          const rec = inputs[metric.id];
          const val = rec?.['TEAM']?.actual;
          const actual = val !== null && val !== undefined && !Number.isNaN(val) ? Number(val) : null;
          rows.push({
            scheme: s.display_name,
            schemeName: s.name,
            metric,
            employee: { employee_id: null, name: 'Whole team', pool: 0 },
            actual,
            source: rec?.['TEAM']?.source_type || null,
            file: rec?.['TEAM']?.source_filename || null
          });
        }
      });
    });
    return rows;
  }, [schemes, employeesByScheme, inputs]);

  const missingMetrics = useMemo(() => {
    // For individual metrics, every employee on the scheme must have a value.
    const missing = [];
    schemes.forEach(s => {
      const teamMembers = employeesByScheme[s.name] || [];
      (s.metrics || []).forEach(metric => {
        const isIndividual = metric.scope === 'individual';
        if (isIndividual) {
          const rec = inputs[metric.id];
          teamMembers.forEach(e => {
            const val = rec ? (rec[e.employee_id]?.actual ?? rec['TEAM']?.actual) : null;
            if (val === null || val === undefined || Number.isNaN(val)) {
              missing.push({ scheme: s.display_name, metric, employee: { name: e.name, employee_id: e.employee_id } });
            }
          });
        } else {
          const rec = inputs[metric.id];
          const val = rec?.['TEAM']?.actual;
          if (val === null || val === undefined || Number.isNaN(val)) {
            missing.push({ scheme: s.display_name, metric, employee: { name: 'Whole team', employee_id: null } });
          }
        }
      });
    });
    return missing;
  }, [schemes, employeesByScheme, inputs]);

  // ---------------------------------------------------------------- locking
  async function lockPeriod() {
    if (missingMetrics.length > 0) {
      setLockIssues(missingMetrics);
      return;
    }
    if (!window.confirm(`Lock variable pay for ${periodStart} to ${periodEnd}?\n\nAfter locking, values can still be adjusted by an admin, but every change is recorded in the audit log.`)) return;
    setError(''); setMessage('');
    const { data: { user } } = await supabase.auth.getUser();
    const { error: e } = await supabase.from('variable_pay_periods')
      .update({ status: 'locked', locked_at: new Date().toISOString(), locked_by: user?.email || 'unknown' })
      .eq('id', period.id);
    if (e) { setError(e.message); return; }
    setPeriod(p => ({ ...p, status: 'locked' }));
    setLockIssues([]);
    setMessage('🔒 Period locked. Values can no longer be edited.');
  }

  async function unlockPeriod() {
    if (!window.confirm('Re-open this period for editing?')) return;
    const { error: e } = await supabase.from('variable_pay_periods')
      .update({ status: 'open', locked_at: null, locked_by: null })
      .eq('id', period.id);
    if (e) { setError(e.message); return; }
    setPeriod(p => ({ ...p, status: 'open' }));
    setMessage('Period reopened for editing.');
  }

  async function markPaid(payrollRunId) {
    const { error: e } = await supabase.from('variable_pay_periods')
      .update({ status: 'paid', payroll_run_id: payrollRunId || null })
      .eq('id', period.id);
    if (e) { setError(e.message); return; }
    setPeriod(p => ({ ...p, status: 'paid' }));
    setMessage('✅ Marked as paid. Further edits are admin-only and audit-logged.');
  }

  // ------------------------------------------------------------------ views
  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading variable pay workspace…</div>;
  }

  return (
    <div style={{ paddingBottom: 60 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: '0 0 4px 0' }}>Variable Pay — Data Collection</h1>
          <p style={{ color: '#666', margin: 0, fontSize: 14 }}>
            Upload each month's source reports. Values are filtered to the pay period you set below.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <a href="/payroll" style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', padding: '8px 16px', borderRadius: 6, textDecoration: 'none', fontWeight: 600, fontSize: 13 }}>
            ← Back to Payroll
          </a>
        </div>
      </div>

      {error && <div style={{ background: '#fee2e2', border: '1px solid #f87171', color: '#991b1b', padding: 10, borderRadius: 6, marginBottom: 14, fontSize: 13 }}>{error}</div>}
      {message && <div style={{ background: '#ecfdf5', border: '1px solid #10b981', color: '#065f46', padding: 10, borderRadius: 6, marginBottom: 14, fontSize: 13 }}>{message}</div>}

      {/* Date range + lock bar */}
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 20, display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
          Pay period start
          <input type="date" value={periodStart} disabled={isLocked} onChange={e => setPeriodStart(e.target.value)} style={{ display: 'block', padding: 6, marginTop: 4, borderRadius: 4, border: '1px solid #ccc' }} />
        </label>
        <label style={{ fontSize: 12, fontWeight: 6, color: '#374151' }}>
          Pay period end
          <input type="date" value={periodEnd} disabled={isLocked} onChange={e => setPeriodEnd(e.target.value)} style={{ display: 'block', padding: 6, marginTop: 4, borderRadius: 4, border: '1px solid #ccc' }} />
        </label>

        <div style={{ flex: 1, minWidth: 180 }}>
          {period ? (
            <span style={{ fontSize: 12, fontWeight: 700, color: period.status === 'paid' ? '#065f46' : period.status === 'locked' ? '#b45309' : '#0369a1', background: period.status === 'paid' ? '#ecfdf5' : period.status === 'locked' ? '#fffbeb' : '#eff6ff', padding: '5px 12px', borderRadius: 6, display: 'inline-block' }}>
              {period.status === 'paid' ? '✅ Paid' : period.status === 'locked' ? '🔒 Locked' : '🟢 Open'}
            </span>
          ) : (
            <span style={{ fontSize: 12, color: '#6b7280' }}>No saved period yet — values will be stored when you first upload.</span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowPreview(true)} style={{ background: '#0f766e', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            👁 Preview Calculations
          </button>
          {isLocked && !isPaid && (
            <button onClick={unlockPeriod} style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', padding: '8px 14px', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              Re-open
            </button>
          )}
          {isLocked && !isPaid && (
            <button onClick={() => markPaid()} style={{ background: '#059669', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              Mark as Paid
            </button>
          )}
          {isPaid && (
            <button onClick={() => markPaid()} style={{ background: '#059669', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              Paid
            </button>
          )}
          {!isLocked && (
            <button onClick={lockPeriod} style={{ background: '#dc2626', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              🔒 Lock Period
            </button>
          )}
        </div>
      </div>

      {lockIssues.length > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: 14, marginBottom: 20 }}>
          <strong style={{ color: '#92400e' }}>⚠ Cannot lock — {lockIssues.length} metric(s) still have no value:</strong>
          <ul style={{ margin: '8px 0 0 0', paddingLeft: 20, fontSize: 12, color: '#78350f' }}>
            {lockIssues.slice(0, 12).map((i, idx) => (
              <li key={idx}>{i.scheme} — {i.metric.name} ({i.employee.name})</li>
            ))}
            {lockIssues.length > 12 && <li>…and {lockIssues.length - 12} more.</li>}
          </ul>
        </div>
      )}

      {/* Shared uploads that feed several metrics at once */}
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 4px 0', fontSize: 15, fontWeight: 700, color: '#111827' }}>Shared uploads</h3>
        <p style={{ margin: '0 0 12px 0', fontSize: 12, color: '#6b7280' }}>
          These reports feed more than one metric, so upload each once.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              disabled={isLocked}
              id="upload-feedback"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFeedbackUpload(f); e.target.value = ''; }}
              style={{ display: 'none' }}
            />
            <label htmlFor="upload-feedback" style={{ background: isLocked ? '#e5e7eb' : '#6d28d9', color: isLocked ? '#6b7280' : 'white', padding: '7px 14px', borderRadius: 5, fontSize: 12, fontWeight: 700, cursor: isLocked ? 'not-allowed' : 'pointer', display: 'inline-block' }}>
              {busyParser === 'feedback' ? 'Reading…' : '📝 Upload Customer Feedback Form'}
            </label>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>Fills: kitchen food quality, captain & helper service quality</div>
            <a href="https://docs.google.com/spreadsheets/d/1M0jVGEh1aekFYnMtVkHSA4oobZq5Pg1i3-D6TenF9kU/edit?usp=sharing" target="_blank" style={{ fontSize: 11, color: '#6d28d9', marginTop: 2, display: 'block' }}>🔗 Open Feedback Form</a>
          </div>
          <div>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              disabled={isLocked}
              id="upload-basemenu"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleBaseMenuUpload(f); e.target.value = ''; }}
              style={{ display: 'none' }}
            />
            <label htmlFor="upload-basemenu" style={{ background: isLocked ? '#e5e7eb' : '#2563eb', color: isLocked ? '#6b7280' : 'white', padding: '7px 14px', borderRadius: 5, fontSize: 12, fontWeight: 700, cursor: isLocked ? 'not-allowed' : 'pointer', display: 'inline-block' }}>
              {busyParser === 'basemenu' ? 'Reading…' : '🍽 Upload Base Menu (CSV/Excel)'}
            </label>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>Required for KOT Prep Time — maps items to categories</div>
          </div>
        </div>
      </div>

      {/* Metric rows grouped by team */}
      {schemes.map(scheme => {
        const teamMembers = employeesByScheme[scheme.name] || [];
        return (
          <div key={scheme.id} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: 18, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#111827' }}>{scheme.display_name}</h2>
              <span style={{ fontSize: 12, color: '#6b7280' }}>{teamMembers.length} employee(s) on this scheme</span>
            </div>

            {(scheme.metrics || []).map(metric => {
              const cfg = SOURCE_MAP[metric.id] || { source: 'manual_entry', label: 'Manual entry' };
              const badge = SOURCE_BADGE[cfg.source];
              const rec = inputs[metric.id];
              const isTeam = metric.scope !== 'individual';
              const teamValue = rec?.['TEAM']?.actual ?? null;
              // hlp_team_sales and b2b_clients are filled automatically from the
              // same report as their sibling metric, so they get no upload button.
              const autoFilled = metric.id === 'hlp_team_sales' || metric.id === 'b2b_clients';
              const displayValue = isTeam ? teamValue : teamValue;

              // Per-person metrics show one value per employee.
              const relevantPeople = isTeam ? [{ name: 'Whole team', employee_id: null }] : teamMembers;

              return (
                <div key={metric.id} style={{ borderTop: '1px solid #f3f4f6', paddingTop: 14, marginTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 240 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: 14, color: '#111827' }}>{metric.name}</strong>
                        <span style={{ background: '#f1f5f9', color: '#475569', padding: '1px 7px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>{Math.round(metric.weight * 100)}% weight</span>
                        <span style={{ background: metric.type === 'binary' ? '#fef3c7' : '#e0f2fe', color: metric.type === 'binary' ? '#92400e' : '#0369a1', padding: '1px 7px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>{metric.type === 'binary' ? 'Binary' : 'Proportional'}</span>
                        {isTeam && <span style={{ background: '#f3e8ff', color: '#7c3aed', padding: '1px 7px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>Team-wide</span>}
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>
                        Target: {metric.target}{metric.unit || ''} · Floor: {metric.floor ?? '—'} · Ceiling: {metric.ceiling ?? '—'}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 3, fontStyle: 'italic' }}>
                        {cfg.label}
                        {cfg.link && (
                          <a href={cfg.link} target="_blank" rel="noopener noreferrer"
                             style={{ marginLeft: 6, fontStyle: 'normal', fontWeight: 700, color: '#2563eb', textDecoration: 'none' }}>
                            ↗ Download report
                          </a>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ background: badge.bg, color: badge.fg, padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>{badge.icon} {badge.label}</span>

                      {displayValue !== null && displayValue !== undefined ? (
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#059669', background: '#ecfdf5', padding: '4px 10px', borderRadius: 6 }}>
                          {metricIdDisplay(metric, displayValue)}
                        </span>
                      ) : (
                        <span style={{ fontSize: 13, color: '#9ca3af', fontWeight: 600, background: '#f9fafb', padding: '4px 10px', borderRadius: 6 }}>Not provided</span>
                      )}

                      {autoFilled && (
                        <span style={{ fontSize: 11, color: '#6b7280' }}>
                          Auto-filled from {metric.id === 'hlp_team_sales' ? 'Captain Performance Report' : 'Corporate Customers report'}
                        </span>
                      )}

                      {cfg.source === 'petpooja' && cfg.parser && !autoFilled && (
                        <>
                          <input
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            disabled={isLocked}
                            id={`upload-${metric.id}`}
                            onChange={e => { const f = e.target.files?.[0]; if (f) handleParserFile(metric.id, cfg.parser, f); e.target.value = ''; }}
                            style={{ display: 'none' }}
                          />
                          <label htmlFor={`upload-${metric.id}`} style={{ background: isLocked ? '#e5e7eb' : '#2563eb', color: isLocked ? '#6b7280' : 'white', padding: '6px 12px', borderRadius: 5, fontSize: 12, fontWeight: 700, cursor: isLocked ? 'not-allowed' : 'pointer', display: 'inline-block' }}>
                            {busyParser === metric.id ? 'Reading…' : 'Upload'}
                          </label>
                        </>
                      )}

                      {cfg.source === 'manual_entry' && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <input
                            type="number"
                            step="any"
                            disabled={isLocked}
                            placeholder="Enter value"
                            defaultValue={displayValue ?? ''}
                            onBlur={e => { if (e.target.value !== '') saveManual(metric.id, e.target.value); }}
                            style={{ width: 80, padding: '4px 6px', borderRadius: 4, border: '1px solid #cbd5e1' }}
                          />
                          {STATUS_METRICS.has(metric.id) && <span style={{ fontSize: 10, color: '#6b7280' }}>(1=yes, 0=no)</span>}
                        </span>
                      )}

                      {cfg.source === 'checklist' && (
                        <span style={{ fontSize: 12, color: '#6b7280' }}>Computed automatically</span>
                      )}
                    </div>
                  </div>

                  {/* Per-employee value rows for individual metrics */}
                  {!isTeam && teamMembers.length > 0 && (
                    <div style={{ marginTop: 10, paddingLeft: 12, borderLeft: '2px solid #e5e7eb' }}>
                      {teamMembers.map(p => {
                        const rec = inputs[metric.id];
                        const val = rec ? (rec[p.employee_id]?.actual ?? rec['TEAM']?.actual) : null;
                        const hasVal = val !== null && val !== undefined && !Number.isNaN(val);
                        return (
                          <div key={p.employee_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 12 }}>
                            <span style={{ color: '#374151' }}>{p.name}</span>
                            <span style={{
                              color: hasVal ? '#059669' : '#dc2626',
                              fontSize: 11,
                              fontWeight: hasVal ? 600 : 400
                            }}>
                              {hasVal ? (val + (metric.unit || '')) : 'Not set'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Preview modal */}
      {showPreview && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 8, padding: 24, maxWidth: 1000, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Calculation Preview</h2>
              <button onClick={() => setShowPreview(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ padding: 6 }}>Team</th>
                  <th>Metric</th>
                  <th>For</th>
                  <th>Target</th>
                  <th>Actual</th>
                  <th>Attainment</th>
                  <th>₹ Earned</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => {
                  const pool = r.employee.pool;
                  const calc = pool > 0 ? computeEmployeeVariablePayout({ metrics: [r.metric] }, { [r.metric.id]: r.actual ?? 0 }, pool) : null;
                  const earned = calc ? calc.breakdown[0]?.payoutAmount : null;
                  const pct = calc ? calc.breakdown[0]?.attainmentPct : null;
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: 6 }}>{r.scheme}</td>
                      <td>{r.metric.name}</td>
                      <td>{r.employee.name}</td>
                      <td>{r.metric.target}{r.metric.unit || ''}</td>
                      <td style={{ color: r.actual === null ? '#dc2626' : '#111827', fontWeight: 600 }}>{r.actual === null ? '—' : r.actual + (r.metric.unit || '')}</td>
                      <td style={{ color: pct === 0 ? '#dc2626' : pct >= 100 ? '#15803d' : '#b45309', fontWeight: 700 }}>{pct === null ? '—' : pct + '%'}</td>
                      <td style={{ fontWeight: 700, color: '#059669' }}>{earned === null ? '—' : '₹' + earned}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function metricIdDisplay(metric, actual) {
  const u = metric.unit || '';
  if (u === 'status') return actual >= 1 ? '✅ Pass' : '❌ Fail';
  return `${actual}${u}`;
}
