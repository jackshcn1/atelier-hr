'use client';
import { useState } from 'react';
import * as XLSX from 'xlsx';
import { createClient } from '../../lib/supabaseClient';
import { parseHours, daysInPeriod, calculateEmployeePayroll } from '../../lib/payroll';

export default function PayrollPage() {
  const supabase = createClient();
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [rawRows, setRawRows] = useState([]);
  const [results, setResults] = useState([]);
  const [unmatchedCodes, setUnmatchedCodes] = useState([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

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

    for (const code of Object.keys(byCode)) {
      const emp = employees.find(e => e.petpooja_employee_code === code);
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

      matchedResults.push({
        employee_id: emp.employee_id, name: emp.name, fixedSalary,
        ...calc, variablePay: 0, override: null, joinedDuringPeriod
      });
    }

    setUnmatchedCodes(unmatched);
    setResults(matchedResults);
    setSaved(false);
  }

  function updateVariablePay(employeeId, value) {
    setResults(results.map(r => r.employee_id === employeeId ? { ...r, variablePay: Number(value) || 0 } : r));
  }

  function overrideTotalPaidDays(employeeId, value, totalDays) {
    setResults(results.map(r => {
      if (r.employee_id !== employeeId) return r;
      const days = value === '' ? null : Number(value);
      const fixedPay = days === null ? r.fixedPay : Math.round(r.perDaySalary * days);
      return { ...r, override: days, fixedPay };
    }));
  }

  async function finalizePayroll() {
    setError('');
    const period = `${periodStart}_to_${periodEnd}`;
    const { data: run, error: runError } = await supabase.from('payroll_runs').insert([{
      period, imported_attendance: rawRows, calculation_logic_version: 'v1-confirmed-formula'
    }]).select().single();
    if (runError) { setError(runError.message); return; }

    const lineItems = results.map(r => ({
      payroll_run_id: run.id,
      employee_id: r.employee_id,
      days_present: r.override ?? r.totalPaidDays,
      gross_pay: r.fixedPay + r.variablePay,
      deductions: r.fixedSalary - r.fixedPay,
      net_pay: r.fixedPay + r.variablePay
    }));
    const { error: itemsError } = await supabase.from('payroll_line_items').insert(lineItems);
    if (itemsError) { setError(itemsError.message); return; }
    setSaved(true);
  }

  return (
    <div>
      <h1>Payroll</h1>
      <p style={{ color: '#777' }}>
        Upload the Petpooja attendance export, set the pay period, and review the calculated figures below before finalizing —
        nothing is saved until you click Finalize.
      </p>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <div style={{ background: 'white', padding: 16, borderRadius: 8, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 }}>
        <label>Period start <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} /></label>
        <label>Period end <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} /></label>
        <label>Petpooja file <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} /></label>
        <button onClick={runCalculation}>Calculate</button>
      </div>

      {unmatchedCodes.length > 0 && (
        <div style={{ background: '#fff3cd', border: '1px solid #ffe08a', borderRadius: 6, padding: 10, marginBottom: 16 }}>
          <strong>Unmatched Petpooja employee codes (add these under each employee's Petpooja code field):</strong> {unmatchedCodes.join(', ')}
        </div>
      )}

      {results.length > 0 && (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                <th style={{ padding: 6 }}>Name</th>
                <th>Present</th><th>Absent</th><th>Hours</th><th>Eff. days</th>
                <th>Offs paid</th><th>Total paid days</th><th>Per-day ₹</th>
                <th>Fixed pay</th><th>Variable pay</th><th>Total pay</th>
              </tr>
            </thead>
            <tbody>
              {results.map(r => (
                <tr key={r.employee_id} style={{ borderBottom: '1px solid #eee', background: r.joinedDuringPeriod ? '#fff8e1' : 'white' }}>
                  <td style={{ padding: 6 }}>{r.name}{r.joinedDuringPeriod && ' ⚠ new joinee — check manually'}</td>
                  <td>{r.daysPresent}</td>
                  <td>{r.daysAbsent}</td>
                  <td>{r.totalHours}</td>
                  <td>{r.effectiveDaysFromHours}</td>
                  <td>{r.offsPaid}</td>
                  <td>
                    <input type="number" style={{ width: 60 }} value={r.override ?? r.totalPaidDays}
                      onChange={e => overrideTotalPaidDays(r.employee_id, e.target.value)} />
                  </td>
                  <td>₹{r.perDaySalary}</td>
                  <td>₹{r.fixedPay}</td>
                  <td><input type="number" style={{ width: 80 }} value={r.variablePay}
                    onChange={e => updateVariablePay(r.employee_id, e.target.value)} /></td>
                  <td><strong>₹{r.fixedPay + r.variablePay}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ color: '#777', marginTop: 8 }}>
            You can override "Total paid days" directly for any correction — the fixed pay recalculates immediately.
          </p>
          <button onClick={finalizePayroll} style={{ marginTop: 12, padding: '10px 20px' }}>Finalize payroll</button>
          {saved && <span style={{ color: 'green', marginLeft: 12 }}>Saved.</span>}
        </>
      )}
    </div>
  );
}
