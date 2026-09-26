'use client';
import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { createClient } from '../../lib/supabaseClient';
import { parseHours, daysInPeriod, calculateEmployeePayroll } from '../../lib/payroll';

function getDefaultPayrollCycle() {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-indexed
  const currentDate = today.getDate();

  // If today is on or after the 20th of the month, cycle is 20th of prev month to 19th of current month
  // If today is before the 20th, cycle is 20th of 2 months ago to 19th of prev month
  let endYear = currentYear;
  let endMonth = currentMonth;

  if (currentDate < 20) {
    endMonth -= 1;
    if (endMonth < 0) {
      endMonth = 11;
      endYear -= 1;
    }
  }

  let startYear = endYear;
  let startMonth = endMonth - 1;
  if (startMonth < 0) {
    startMonth = 11;
    startYear -= 1;
  }

  const startStr = `${startYear}-${String(startMonth + 1).padStart(2, '0')}-20`;
  const endStr = `${endYear}-${String(endMonth + 1).padStart(2, '0')}-19`;
  return { start: startStr, end: endStr };
}

export default function PayrollPage() {
  const supabase = createClient();
  const defaultCycle = getDefaultPayrollCycle();

  const [periodStart, setPeriodStart] = useState(defaultCycle.start);
  const [periodEnd, setPeriodEnd] = useState(defaultCycle.end);
  const [variablePercents, setVariablePercents] = useState({});
  const [rawRows, setRawRows] = useState([]);
  const [results, setResults] = useState([]);
  const [unmatchedCodes, setUnmatchedCodes] = useState([]);
  const [error, setError] = useState('');
  const [savedRun, setSavedRun] = useState(null);
  const [activeRunId, setActiveRunId] = useState(null);
  const [pastRuns, setPastRuns] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);

  useEffect(() => {
    loadPastRuns();
    checkAndLoadExistingRun(defaultCycle.start, defaultCycle.end);
  }, []);

  async function loadPastRuns() {
    const { data, error } = await supabase
      .from('payroll_runs')
      .select('id, period, period_start, period_end, generated_on, total_amount, status')
      .order('id', { ascending: false })
      .limit(10);
    if (!error && data) setPastRuns(data);
  }

  async function checkAndLoadExistingRun(start, end) {
    if (!start || !end) return;
    setLoadingExisting(true);
    const { data: runs, error } = await supabase
      .from('payroll_runs')
      .select('*')
      .or(`period.eq.${start}_to_${end},and(period_start.eq.${start},period_end.eq.${end})`)
      .order('id', { ascending: false })
      .limit(1);

    if (!error && runs && runs.length > 0) {
      await loadRunById(runs[0].id);
    } else {
      setLoadingExisting(false);
    }
  }

  async function loadRunById(runId) {
    setLoadingExisting(true);
    setError('');

    const { data: run, error: runErr } = await supabase
      .from('payroll_runs')
      .select('*')
      .eq('id', runId)
      .single();

    if (runErr || !run) {
      setLoadingExisting(false);
      return;
    }

    if (run.period_start) setPeriodStart(run.period_start);
    if (run.period_end) setPeriodEnd(run.period_end);
    setActiveRunId(run.id);
    setSavedRun(run);

    const { data: items, error: itemsErr } = await supabase
      .from('payroll_line_items')
      .select('*')
      .eq('payroll_run_id', runId)
      .order('id', { ascending: true });

    if (!itemsErr && items) {
      const { data: emps } = await supabase.from('employees').select('employee_id, name');
      const empMap = {};
      (emps || []).forEach(e => { empMap[e.employee_id] = e.name; });

      const loadedResults = items.map(item => ({
        id: item.id,
        employee_id: item.employee_id,
        name: empMap[item.employee_id] || item.employee_id,
        daysPresent: item.days_present ?? 0,
        daysAbsent: item.days_absent ?? 0,
        expectedHours: item.expected_hours ?? 0,
        totalHours: item.actual_hours ?? 0,
        effectiveDaysFromHours: item.effective_days ?? 0,
        offsPaid: item.offs_paid ?? 0,
        totalPaidDays: item.total_paid_days ?? item.days_present ?? 0,
        override: item.total_paid_days,
        perDaySalary: item.per_day_salary ?? 0,
        fixedSalary: item.fixed_pay ?? 0,
        fixedPay: item.fixed_pay ?? 0,
        variableTarget: item.variable_target ?? 0,
        variablePercent: item.variable_percent ?? 0,
        variablePay: item.variable_pay ?? 0,
        bonusPay: item.bonus_pay ?? 0,
        bonusDescription: item.bonus_description ?? '',
        deductionAmount: item.deduction_amount ?? 0,
        deductionReason: item.deduction_reason ?? '',
        payslip_number: item.payslip_number ?? '',
        payment_status: item.payment_status ?? 'pending'
      }));

      setResults(loadedResults);
    }
    setLoadingExisting(false);
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'binary' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      setRawRows(json);
    };
    reader.readAsBinaryString(file);
  }

  async function runCalculation() {
    setError('');
    setSavedRun(null);
    if (!periodStart || !periodEnd) { setError('Set the period start and end dates first.'); return; }
    if (rawRows.length === 0) { setError('Upload the Petpooja attendance file first.'); return; }

    const totalDays = daysInPeriod(periodStart, periodEnd);

    // Filter rows to the selected period and normalize dates (Petpooja
    // exports as DD-MM-YYYY text).
    const inPeriod = rawRows.filter(r => {
      const raw = String(r['Date'] || '');
      const [d, m, y] = raw.split('-');
      if (!d || !m || !y) return false;
      const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      return iso >= periodStart && iso <= periodEnd;
    });

    // Group by Petpooja employee code
    const byCode = {};
    inPeriod.forEach(r => {
      const code = String(r['Employee ID']);
      byCode[code] = byCode[code] || [];
      byCode[code].push({ status: r['Status'], hours: parseHours(String(r['Total Working Hours'])) });
    });

    const { data: employees } = await supabase.from('employees').select('*').eq('status', 'active').is('deleted_at', null);
    const matchedResults = [];
    const unmatched = [];

    // Query highest existing sequence number for pre-generating payslip numbers
    const { data: existingItems } = await supabase
      .from('payroll_line_items')
      .select('payslip_number')
      .not('payslip_number', 'is', null);

    let maxSeq = 0;
    (existingItems || []).forEach(item => {
      const match = String(item.payslip_number || '').match(/ATL-EMP-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxSeq) maxSeq = num;
      }
    });

    let seqCounter = maxSeq + 1;

    for (const code of Object.keys(byCode)) {
      const emp = employees.find(e => e.employee_id === code);
      if (!emp) { unmatched.push(code); continue; }

      const { data: latestSalary } = await supabase.from('salary_history')
        .select('*').eq('employee_id', emp.employee_id).lte('effective_from', periodEnd)
        .order('effective_from', { ascending: false }).limit(1).maybeSingle();
      const fixedSalary = latestSalary?.fixed ?? emp.current_fixed_salary ?? 0;

      const calc = calculateEmployeePayroll({
        fixedSalary,
        standardHoursPerDay: emp.standard_hours_per_day || 10,
        totalDaysInPeriod: totalDays,
        attendanceRows: byCode[code]
      });

      const joinedDuringPeriod = emp.date_of_joining >= periodStart && emp.date_of_joining <= periodEnd;
      const variableTarget = latestSalary?.variable ?? emp.current_variable_salary ?? 0;
      const preassignedPayslipNumber = `ATL-EMP-${String(seqCounter++).padStart(5, '0')}`;

      matchedResults.push({
        employee_id: emp.employee_id, name: emp.name, fixedSalary,
        ...calc, variablePay: Math.round((variablePercents[code] || 0) / 100 * variableTarget) || 0,
        variableTarget, variablePercent: variablePercents[code] || 0,
        bonusPay: 0, bonusDescription: '',
        deductionAmount: 0, deductionReason: '',
        payslip_number: preassignedPayslipNumber,
        override: null, joinedDuringPeriod
      });
    }

    setUnmatchedCodes(unmatched);
    setResults(matchedResults);
  }

  function updateVariablePay(employeeId, percentValue) {
    const pct = Number(percentValue) || 0;
    setVariablePercents({ ...variablePercents, [employeeId]: pct });
    setResults(results.map(r => r.employee_id === employeeId ? { ...r, variablePercent: pct, variablePay: Math.round((pct / 100) * (r.variableTarget || 0)) } : r));
  }

  function updateBonusPay(employeeId, value) {
    setResults(results.map(r => r.employee_id === employeeId ? { ...r, bonusPay: Number(value) || 0 } : r));
  }

  function updateBonusDescription(employeeId, value) {
    setResults(results.map(r => r.employee_id === employeeId ? { ...r, bonusDescription: value } : r));
  }

  function updateDeductionAmount(employeeId, value) {
    setResults(results.map(r => r.employee_id === employeeId ? { ...r, deductionAmount: Number(value) || 0 } : r));
  }

  function updateDeductionReason(employeeId, value) {
    setResults(results.map(r => r.employee_id === employeeId ? { ...r, deductionReason: value } : r));
  }

  function overrideTotalPaidDays(employeeId, value, totalDays) {
    setResults(results.map(r => {
      if (r.employee_id !== employeeId) return r;
      const days = value === '' ? null : Number(value);
      const fixedPay = days === null ? r.fixedPay : Math.round(r.perDaySalary * days);
      return { ...r, override: days, fixedPay };
    }));
  }

  async function savePayrollRun() {
    setError('');
    setSaving(true);
    const period = `${periodStart}_to_${periodEnd}`;

    const grandTotal = results.reduce((sum, r) => {
      const varAmt = Math.round((r.variablePercent || 0) / 100 * (r.variableTarget || 0));
      return sum + (r.fixedPay + varAmt + (r.bonusPay || 0) - (r.deductionAmount || 0));
    }, 0);

    let runId = activeRunId;

    if (!runId) {
      // Create new payroll run
      const { data: newRun, error: runError } = await supabase.from('payroll_runs').insert([{
        period,
        period_start: periodStart,
        period_end: periodEnd,
        status: 'finalized',
        total_amount: grandTotal,
        imported_attendance: rawRows.length > 0 ? rawRows : null,
        calculation_logic_version: 'v1-confirmed-formula'
      }]).select().single();

      if (runError) { setError(runError.message); setSaving(false); return; }
      runId = newRun.id;
      setActiveRunId(runId);
      setSavedRun(newRun);
    } else {
      // Update existing run
      const { data: updatedRun, error: runError } = await supabase.from('payroll_runs').update({
        period,
        period_start: periodStart,
        period_end: periodEnd,
        total_amount: grandTotal,
        status: 'finalized'
      }).eq('id', runId).select().single();

      if (runError) { setError(runError.message); setSaving(false); return; }
      setSavedRun(updatedRun);
    }

    // Save/Upsert line items
    for (const r of results) {
      const varAmt = Math.round((r.variablePercent || 0) / 100 * (r.variableTarget || 0));
      const totalPay = r.fixedPay + varAmt + (r.bonusPay || 0) - (r.deductionAmount || 0);

      const rowData = {
        payroll_run_id: runId,
        employee_id: r.employee_id,
        days_present: r.daysPresent,
        days_absent: r.daysAbsent,
        expected_hours: r.expectedHours,
        actual_hours: r.totalHours,
        effective_days: r.effectiveDaysFromHours,
        offs_paid: r.offsPaid,
        total_paid_days: r.override ?? r.totalPaidDays,
        per_day_salary: r.perDaySalary,
        fixed_pay: r.fixedPay,
        variable_target: r.variableTarget,
        variable_percent: r.variablePercent || 0,
        variable_pay: varAmt,
        bonus_pay: r.bonusPay || 0,
        bonus_description: r.bonusDescription || null,
        deduction_amount: r.deductionAmount || 0,
        deduction_reason: r.deductionReason || null,
        gross_pay: totalPay,
        deductions: (r.fixedSalary - r.fixedPay) + (r.deductionAmount || 0),
        net_pay: totalPay,
        total_pay: totalPay,
        payslip_number: r.payslip_number
      };

      if (r.id) {
        await supabase.from('payroll_line_items').update(rowData).eq('id', r.id);
      } else {
        const { data: inserted } = await supabase.from('payroll_line_items').insert([{ ...rowData, payment_status: 'pending' }]).select().single();
        if (inserted) r.id = inserted.id;
      }
    }

    setSaving(false);
    loadPastRuns();
  }

  const grandTotal = results.reduce((sum, r) => sum + (r.fixedPay + Math.round((r.variablePercent || 0) / 100 * (r.variableTarget || 0)) + (r.bonusPay || 0) - (r.deductionAmount || 0)), 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: '0 0 4px 0' }}>Payroll Calculation & Drafts</h1>
          <p style={{ color: '#666', margin: 0 }}>
            Calculate monthly salary from Petpooja attendance, customize variable % / bonuses / deductions on the 25th, and save to process payments on the 1st.
          </p>
        </div>
        <a
          href="/payroll/processing"
          style={{
            background: '#2563eb', color: 'white', padding: '10px 16px', borderRadius: 6,
            textDecoration: 'none', fontWeight: 'bold', fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 6
          }}
        >
          💳 Go to Salary Processing →
        </a>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #f87171', color: '#991b1b', padding: 12, borderRadius: 6, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Date Cycle & Upload Bar */}
      <div style={{ background: 'white', padding: 20, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 500 }}>
            Period start (Auto-prefilled: 20th)
            <input
              type="date"
              value={periodStart}
              onChange={e => { setPeriodStart(e.target.value); checkAndLoadExistingRun(e.target.value, periodEnd); }}
              style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 500 }}>
            Period end (Auto-prefilled: 19th)
            <input
              type="date"
              value={periodEnd}
              onChange={e => { setPeriodEnd(e.target.value); checkAndLoadExistingRun(periodStart, e.target.value); }}
              style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 500 }}>
            Petpooja attendance file
            <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} style={{ padding: '4px 0' }} />
          </label>
          <button
            onClick={runCalculation}
            style={{
              alignSelf: 'flex-end', background: '#1f2937', color: 'white', border: 'none',
              padding: '8px 18px', borderRadius: 6, cursor: 'pointer', fontWeight: 600
            }}
          >
            {results.length > 0 ? '🔄 Re-Calculate' : 'Calculate from File'}
          </button>
        </div>

        {activeRunId && (
          <div style={{ marginTop: 12, background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '8px 12px', borderRadius: 6, fontSize: 13, color: '#15803d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>
              📄 <strong>Loaded Saved Payroll Run #{activeRunId}</strong> for this period. You can edit bonuses/deductions below and save anytime before payment on the 1st.
            </span>
            <button
              onClick={() => { setActiveRunId(null); setResults([]); }}
              style={{ background: 'transparent', border: 'none', color: '#6b7280', textDecoration: 'underline', cursor: 'pointer', fontSize: 12 }}
            >
              Clear & Start Fresh
            </button>
          </div>
        )}
      </div>

      {unmatchedCodes.length > 0 && (
        <div style={{ background: '#fff3cd', border: '1px solid #ffe08a', borderRadius: 6, padding: 12, marginBottom: 16 }}>
          <strong>⚠️ Unmatched Petpooja employee codes:</strong> {unmatchedCodes.join(', ')}
          <div style={{ fontSize: 12, color: '#777', marginTop: 4 }}>
            These codes exist in Petpooja but no active employee has this Employee ID. Add them or update existing employee IDs.
          </div>
        </div>
      )}

      {loadingExisting ? (
        <div style={{ background: 'white', padding: 40, textAlign: 'center', borderRadius: 8, color: '#6b7280' }}>
          Checking for saved payroll data...
        </div>
      ) : results.length > 0 ? (
        <div style={{ background: 'white', padding: 20, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Payroll Summary ({results.length} Employees)</h2>
            <div style={{ fontSize: 16, fontWeight: 'bold', color: '#1f2937' }}>
              Grand Total: <span style={{ color: '#059669' }}>₹{grandTotal.toLocaleString('en-IN')}</span>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb', background: '#f9fafb' }}>
                  <th style={{ padding: '8px 6px' }}>Name</th>
                  <th>Pres</th><th>Abs</th><th>Exp. hrs</th><th>Act. hrs</th><th>Eff. days</th>
                  <th>Offs</th><th>Paid days</th><th>Per-day ₹</th>
                  <th>Fixed ₹</th><th>Var %</th><th>Var ₹</th><th>Bonus ₹</th><th>Bonus desc</th>
                  <th>Deduction ₹</th><th>Deduction reason</th><th>Total pay</th>
                </tr>
              </thead>
              <tbody>
                {results.map(r => {
                  const varAmount = Math.round((r.variablePercent || 0) / 100 * (r.variableTarget || 0));
                  const rowTotal = r.fixedPay + varAmount + (r.bonusPay || 0) - (r.deductionAmount || 0);

                  return (
                    <tr key={r.employee_id} style={{ borderBottom: '1px solid #f3f4f6', background: r.joinedDuringPeriod ? '#fffbeb' : 'white' }}>
                      <td style={{ padding: '8px 6px', fontWeight: 500 }}>
                        {r.name}
                        {r.joinedDuringPeriod && <span style={{ display: 'block', fontSize: 11, color: '#d97706' }}>⚠ mid-period joinee</span>}
                      </td>
                      <td>{r.daysPresent}</td>
                      <td>{r.daysAbsent}</td>
                      <td>{r.expectedHours}</td>
                      <td>{r.totalHours}</td>
                      <td>{r.effectiveDaysFromHours}</td>
                      <td>{r.offsPaid}</td>
                      <td>
                        <input type="number" style={{ width: 50, padding: 2 }} value={r.override ?? r.totalPaidDays}
                          onChange={e => overrideTotalPaidDays(r.employee_id, e.target.value)} />
                      </td>
                      <td>₹{r.perDaySalary}</td>
                      <td>₹{r.fixedPay}</td>
                      <td>
                        <input type="number" style={{ width: 50, padding: 2 }} value={r.variablePercent || 0}
                          onChange={e => updateVariablePay(r.employee_id, Number(e.target.value))} />%
                      </td>
                      <td>₹{varAmount}</td>
                      <td>
                        <input type="number" style={{ width: 70, padding: 2 }} value={r.bonusPay || 0}
                          onChange={e => updateBonusPay(r.employee_id, e.target.value)} />
                      </td>
                      <td>
                        <input type="text" style={{ width: 110, padding: 2 }} value={r.bonusDescription || ''}
                          onChange={e => updateBonusDescription(r.employee_id, e.target.value)} placeholder="e.g. Festival" />
                      </td>
                      <td>
                        <input type="number" style={{ width: 70, padding: 2 }} value={r.deductionAmount || 0}
                          onChange={e => updateDeductionAmount(r.employee_id, e.target.value)} />
                      </td>
                      <td>
                        <input type="text" style={{ width: 110, padding: 2 }} value={r.deductionReason || ''}
                          onChange={e => updateDeductionReason(r.employee_id, e.target.value)} placeholder="e.g. Breakage" />
                      </td>
                      <td style={{ fontWeight: 'bold', color: '#059669' }}>₹{rowTotal.toLocaleString('en-IN')}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid #374151', background: '#f3f4f6', fontWeight: 'bold' }}>
                  <td style={{ padding: '10px 6px' }} colSpan="16">SUM TOTAL PAYABLE</td>
                  <td style={{ color: '#059669', fontSize: 15 }}>₹{grandTotal.toLocaleString('en-IN')}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div style={{ marginTop: 20, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={savePayrollRun}
              disabled={saving}
              style={{
                background: '#059669', color: 'white', border: 'none', padding: '10px 24px',
                borderRadius: 6, cursor: 'pointer', fontWeight: 'bold', fontSize: 14
              }}
            >
              {saving ? 'Saving...' : activeRunId ? '💾 Save Updates to Payroll Run' : '💾 Save & Finalize Payroll'}
            </button>
            <span style={{ fontSize: 13, color: '#666' }}>
              Saves all variable %, bonuses, deductions, and pre-generates payslip numbers. All data stays saved for payment processing on the 1st.
            </span>
          </div>

          {savedRun && (
            <div style={{ marginTop: 16, background: '#ecfdf5', border: '1px solid #10b981', padding: 16, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <strong style={{ color: '#065f46', fontSize: 15 }}>✅ Payroll Run #{savedRun.id} Saved Successfully!</strong>
                <p style={{ margin: '4px 0 0 0', color: '#047857', fontSize: 13 }}>
                  Period: {savedRun.period} • Total Amount: ₹{(savedRun.total_amount || grandTotal).toLocaleString('en-IN')} • {results.length} Employees saved.
                </p>
              </div>
              <a
                href={`/payroll/processing?runId=${savedRun.id}`}
                style={{
                  background: '#059669', color: 'white', padding: '10px 20px', borderRadius: 6,
                  textDecoration: 'none', fontWeight: 'bold', fontSize: 14
                }}
              >
                Start Processing Payments →
              </a>
            </div>
          )}
        </div>
      ) : null}

      {pastRuns.length > 0 && (
        <div style={{ background: 'white', padding: 20, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginTop: 24 }}>
          <h2 style={{ fontSize: 16, margin: '0 0 12px 0' }}>Past Payroll Runs</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #eee' }}>
                <th style={{ padding: 6 }}>Run ID</th>
                <th>Period</th>
                <th>Saved Date</th>
                <th>Total Amount</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pastRuns.map(run => (
                <tr key={run.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 6, fontWeight: 'bold' }}>#{run.id}</td>
                  <td>{run.period_start && run.period_end ? `${run.period_start} to ${run.period_end}` : run.period}</td>
                  <td>{run.generated_on ? new Date(run.generated_on).toLocaleDateString() : '—'}</td>
                  <td style={{ fontWeight: 600, color: '#059669' }}>₹{(run.total_amount || 0).toLocaleString('en-IN')}</td>
                  <td>
                    <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: '#e0f2fe', color: '#0369a1' }}>
                      {run.status || 'finalized'}
                    </span>
                  </td>
                  <td style={{ display: 'flex', gap: 12 }}>
                    <button
                      onClick={() => loadRunById(run.id)}
                      style={{ background: 'none', border: 'none', color: '#4f46e5', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                    >
                      ✏️ Edit Run
                    </button>
                    <a
                      href={`/payroll/processing?runId=${run.id}`}
                      style={{ color: '#059669', fontWeight: 600, textDecoration: 'none' }}
                    >
                      💳 Process Payments →
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
