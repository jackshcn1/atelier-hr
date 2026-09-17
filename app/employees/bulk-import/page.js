'use client';
import { useState } from 'react';
import * as XLSX from 'xlsx';
import { createClient } from '../../../lib/supabaseClient';
import { computeSalarySplit } from '../../../lib/salarySplit';

const TEMPLATE_COLUMNS = [
  'employee_id', 'name', 'phone', 'email', 'designation', 'department',
  'employment_type', 'date_of_joining', 'reporting_manager_id',
  'standard_hours_per_day', 'pf_applicable', 'esi_applicable',
  'accommodation_provided', 'uniform_deposit_applicable',
  'current_fixed_salary', 'current_variable_salary'
];

function toBool(v) {
  if (typeof v === 'boolean') return v;
  const s = String(v || '').trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === '1';
}

function downloadTemplate() {
  const example = {
    employee_id: 'the Petpooja code for this person', name: 'Full name', phone: '', email: '',
    designation: '', department: 'must match an existing department name exactly',
    employment_type: 'full-time', date_of_joining: 'YYYY-MM-DD', reporting_manager_id: 'another employee_id or blank',
    standard_hours_per_day: 10, pf_applicable: 'TRUE', esi_applicable: 'FALSE',
    accommodation_provided: 'FALSE', uniform_deposit_applicable: 'TRUE',
    current_fixed_salary: 0, current_variable_salary: 0
  };
  const ws = XLSX.utils.json_to_sheet([example]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Employees');
  XLSX.writeFile(wb, 'employee-bulk-import-template.xlsx');
}

export default function BulkImport() {
  const supabase = createClient();
  const [rows, setRows] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [existingIds, setExistingIds] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(''); setResult(null);

    const { data: depts } = await supabase.from('departments').select('name');
    setDepartments((depts || []).map(d => d.name));
    const { data: existing } = await supabase.from('employees').select('employee_id');
    setExistingIds(new Set((existing || []).map(e => e.employee_id)));

    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'binary' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      setRows(json.map(r => ({ ...r, _errors: [] })));
    };
    reader.readAsBinaryString(file);
  }

  function validate() {
    const seenIds = new Set();
    const deptSet = new Set(departments);
    return rows.map(r => {
      const errs = [];
      const id = String(r.employee_id || '').trim();
      if (!id) errs.push('Missing employee_id');
      if (id && existingIds.has(id)) errs.push('employee_id already exists — will be skipped');
      if (id && seenIds.has(id)) errs.push('Duplicate employee_id within this file');
      seenIds.add(id);
      if (!r.name || !String(r.name).trim()) errs.push('Missing name');
      if (r.department && !deptSet.has(String(r.department).trim())) errs.push(`Department "${r.department}" doesn't exist yet — add it in Settings first`);
      return { ...r, _errors: errs };
    });
  }

  function runValidation() {
    setRows(validate());
  }

  async function runImport() {
    setImporting(true);
    setError('');
    const validated = validate();
    const importable = validated.filter(r => r._errors.filter(e => !e.includes('will be skipped')).length === 0 && !existingIds.has(String(r.employee_id).trim()));

    const { data: depositRates } = await supabase.from('deposit_settings').select('*').eq('id', 1).single();
    const { data: payrollSettings } = await supabase.from('payroll_settings').select('*').eq('id', 1).single();

    let inserted = 0, failed = 0;
    const failedRows = [];

    for (const r of importable) {
      const employeeRow = {
        employee_id: String(r.employee_id).trim(),
        name: r.name,
        phone: r.phone || null,
        email: r.email || null,
        designation: r.designation || null,
        department: r.department || null,
        employment_type: r.employment_type || 'full-time',
        date_of_joining: r.date_of_joining || null,
        standard_hours_per_day: Number(r.standard_hours_per_day) || 10,
        pf_applicable: toBool(r.pf_applicable),
        esi_applicable: toBool(r.esi_applicable),
        accommodation_provided: toBool(r.accommodation_provided),
        current_fixed_salary: Number(r.current_fixed_salary) || 0,
        current_variable_salary: Number(r.current_variable_salary) || 0
        // reporting_manager_id intentionally left out — assigned in a second pass
        // below so import order never matters.
      };

      const { error: insertError } = await supabase.from('employees').insert([employeeRow]);
      if (insertError) { failed++; failedRows.push({ id: employeeRow.employee_id, error: insertError.message }); continue; }
      inserted++;

      const fixedSalary = employeeRow.current_fixed_salary;
      if (fixedSalary > 0) {
        const split = computeSalarySplit(fixedSalary, payrollSettings);
        await supabase.from('salary_history').insert([{
          employee_id: employeeRow.employee_id, fixed: fixedSalary,
          variable: employeeRow.current_variable_salary, ...split,
          effective_from: employeeRow.date_of_joining || new Date().toISOString().slice(0, 10),
          reason: 'Bulk import — starting salary'
        }]);
      }

      const depositRows = [];
      if (toBool(r.uniform_deposit_applicable) && depositRates) {
        depositRows.push({ employee_id: employeeRow.employee_id, deposit_type: 'uniform', amount: depositRates.uniform_deposit_amount });
      }
      if (employeeRow.accommodation_provided && depositRates) {
        depositRows.push({ employee_id: employeeRow.employee_id, deposit_type: 'accommodation', amount: depositRates.accommodation_deposit_amount });
      }
      if (depositRows.length > 0) await supabase.from('employee_deposits').insert(depositRows);
    }

    // Second pass: now that everyone exists, wire up reporting managers.
    for (const r of importable) {
      const mgr = String(r.reporting_manager_id || '').trim();
      if (!mgr) continue;
      await supabase.from('employees').update({ reporting_manager_id: mgr }).eq('employee_id', String(r.employee_id).trim());
    }

    setResult({ inserted, failed, failedRows, skipped: validated.length - importable.length });
    setImporting(false);
  }

  return (
    <div>
      <h1>Bulk import employees</h1>
      <p style={{ color: '#777' }}>
        For migrating your existing team in one go. Each row becomes a full employee record, including their starting
        salary history and deposits — same as adding them one by one, just batched.
      </p>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <div style={{ background: 'white', padding: 16, borderRadius: 8, marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={downloadTemplate}>Download template</button>
        <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} />
        {rows.length > 0 && <button onClick={runValidation}>Validate</button>}
      </div>

      {rows.length > 0 && (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                <th style={{ padding: 6 }}>employee_id</th><th>name</th><th>department</th><th>fixed salary</th><th>Issues</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #eee', background: r._errors?.some(e => !e.includes('skipped')) ? '#fff5f5' : 'white' }}>
                  <td style={{ padding: 6 }}>{r.employee_id}</td>
                  <td>{r.name}</td>
                  <td>{r.department}</td>
                  <td>{r.current_fixed_salary}</td>
                  <td style={{ color: '#c0392b' }}>{(r._errors || []).join('; ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ color: '#777', marginTop: 8 }}>
            Rows with a red issue (other than "already exists") will be skipped on import. Fix them in your file and re-upload if needed.
          </p>
          <button onClick={runImport} disabled={importing} style={{ marginTop: 12, padding: '10px 20px' }}>
            {importing ? 'Importing…' : 'Import valid rows'}
          </button>
        </>
      )}

      {result && (
        <div style={{ background: 'white', padding: 16, borderRadius: 8, marginTop: 20 }}>
          <p><strong>{result.inserted} imported, {result.failed} failed, {result.skipped} skipped.</strong></p>
          {result.failedRows.length > 0 && (
            <ul>{result.failedRows.map((f, i) => <li key={i} style={{ color: 'crimson' }}>{f.id}: {f.error}</li>)}</ul>
          )}
          <p><a href="/employees">Go to employees →</a></p>
        </div>
      )}
    </div>
  );
}
