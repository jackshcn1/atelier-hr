'use client';
import { useState } from 'react';
import * as XLSX from 'xlsx';
import { createClient } from '../../../lib/supabaseClient';
import { computeSalarySplit } from '../../../lib/salarySplit';

// Fields that live on the main employees table and are safe for anyone
// who can add/edit employees (admin or the relevant department head).
const CORE_FIELDS = [
  'employee_id', 'name', 'phone', 'email', 'designation', 'department',
  'employment_type', 'date_of_joining', 'reporting_manager_id',
  'standard_hours_per_day', 'pf_applicable', 'esi_applicable',
  'accommodation_provided', 'uniform_deposit_applicable',
  'current_fixed_salary', 'current_variable_salary',
  'dob', 'gender', 'blood_group', 'address',
  'emergency_contact_name', 'emergency_contact_phone', 'id_proof_type',
  'previous_work_history', 'education_history', 'notes',
  'update_salaries'  // When true, force updates of salary fields even if blank
];

// Fields that only an admin can write — routed to employee_sensitive_info.
// Included in the template so a full migration can capture everything in
// one file; simply fails silently (per row) if the person running the
// import isn't an admin, same as saving them individually would.
const SENSITIVE_FIELDS = [
  'id_proof_number', 'pf_number', 'esi_number',
  'bank_account_holder_name', 'bank_ifsc_code', 'bank_name', 'bank_account_number'
];

function toBool(v) {
  if (typeof v === 'boolean') return v;
  const s = String(v || '').trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === '1';
}

function isBlank(v) {
  return v === undefined || v === null || String(v).trim() === '';
}

// Excel stores dates as serial numbers (days since 1900-01-01, with a
// Lotus-123-inherited bug that treats 1900 as a leap year).  The xlsx
// library sometimes hands us those raw numbers instead of formatted
// strings.  This converts them to 'YYYY-MM-DD' so Supabase accepts them.
const DATE_FIELDS = ['date_of_joining', 'dob'];

function excelSerialToDate(v) {
  if (isBlank(v)) return '';
  // Already a recognisable date string — leave it alone.
  if (typeof v === 'string' && /\d{4}-\d{2}-\d{2}/.test(v)) return v;
  const n = Number(v);
  if (!isFinite(n) || n < 1) return v;               // not a serial number
  // Excel epoch: 1 = 1900-01-01; adjust for the phantom Feb 29 1900.
  const msPerDay = 86400000;
  const excelEpoch = new Date(Date.UTC(1899, 11, 30)); // Dec 30 1899
  const date = new Date(excelEpoch.getTime() + n * msPerDay);
  const yyyy = date.getUTCFullYear();
  const mm   = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd   = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function fixDateFields(row) {
  const fixed = { ...row };
  DATE_FIELDS.forEach(f => { if (f in fixed) fixed[f] = excelSerialToDate(fixed[f]); });
  return fixed;
}

function downloadTemplate() {
  const example = {
    employee_id: 'the Petpooja code for this person', name: 'Full name', phone: '', email: '',
    designation: '', department: 'must match an existing department name exactly',
    employment_type: 'full-time', date_of_joining: 'YYYY-MM-DD', reporting_manager_id: 'another employee_id or blank',
    standard_hours_per_day: 10, pf_applicable: 'TRUE', esi_applicable: 'FALSE',
    accommodation_provided: 'FALSE', uniform_deposit_applicable: 'TRUE',
    current_fixed_salary: 0, current_variable_salary: 0,
    dob: 'YYYY-MM-DD', gender: '', blood_group: '', address: '',
    emergency_contact_name: '', emergency_contact_phone: '', id_proof_type: '',
    previous_work_history: '', education_history: '', notes: '',
    id_proof_number: '', pf_number: '', esi_number: '',
    bank_account_holder_name: '', bank_ifsc_code: '', bank_name: '', bank_account_number: '',
    update_salaries: 'TRUE'  // Add this flag to force salary updates when reuploading
  };
  const notes = [
    ['Leave a cell blank to skip that field.'],
    ['For UPDATING existing employees: only filled-in cells are applied — blank cells leave the existing value untouched.'],
    ['employee_id must be the same code Petpooja generated for that person.'],
    ['The bottom 7 columns (id_proof_number onward) only save if the person running the import is an admin.']
  ];
  const ws = XLSX.utils.json_to_sheet([example]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Employees');
  const notesWs = XLSX.utils.aoa_to_sheet(notes);
  XLSX.utils.book_append_sheet(wb, notesWs, 'Read me');
  XLSX.writeFile(wb, 'employee-bulk-import-template.xlsx');
}

export default function BulkImport() {
  const supabase = createClient();
  const [rows, setRows] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [existingIds, setExistingIds] = useState(new Set());
  const [deletedEmployees, setDeletedEmployees] = useState(new Map()); // Map<employee_id, {name, deleted_at}>
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(''); setResult(null);

    const { data: depts } = await supabase.from('departments').select('name');
    setDepartments((depts || []).map(d => d.name));

    // Fetch all employees including deleted ones
    const { data: allEmployees } = await supabase.from('employees').select('employee_id, name, deleted_at');
    const activeIds = new Set();
    const deletedMap = new Map();

    (allEmployees || []).forEach(emp => {
      if (emp.deleted_at) {
        deletedMap.set(emp.employee_id, { name: emp.name, deleted_at: emp.deleted_at });
      } else {
        activeIds.add(emp.employee_id);
      }
    });

    setExistingIds(activeIds);
    setDeletedEmployees(deletedMap);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'binary' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      setRows(json.map(r => ({ ...fixDateFields(r), _errors: [] })));
    };
    reader.readAsBinaryString(file);
  }

  function validate() {
    const seenIds = new Set();
    const deptSet = new Set(departments);
    return rows.map(r => {
      const errs = [];
      const id = String(r.employee_id || '').trim();
      const isDeleted = id && deletedEmployees.has(id);
      const isUpdate = id && existingIds.has(id);

      if (!id) errs.push('Missing employee_id');
      if (id && seenIds.has(id)) errs.push('Duplicate employee_id within this file');
      seenIds.add(id);

      if (isDeleted) {
        const deleted = deletedEmployees.get(id);
        const deletedDate = new Date(deleted.deleted_at).toLocaleDateString();
        errs.push(`Employee was deleted on ${deletedDate}. Restore first to update.`);
      }

      if (!isUpdate && !isDeleted && (!r.name || !String(r.name).trim())) {
        errs.push('Missing name (required for new employees)');
      }

      if (r.department && !deptSet.has(String(r.department).trim())) {
        errs.push(`Department "${r.department}" doesn't exist yet — add it in Settings first`);
      }

      return {
        ...r,
        _errors: errs,
        _mode: isDeleted ? 'deleted' : (isUpdate ? 'update' : 'create'),
        _deletedInfo: isDeleted ? deletedEmployees.get(id) : null
      };
    });
  }

  function runValidation() {
    setRows(validate());
  }

  async function restoreAndUpdate(row) {
    const id = String(row.employee_id).trim();

    // Restore the employee (clear deleted_at)
    const { error: restoreError } = await supabase
      .from('employees')
      .update({ deleted_at: null })
      .eq('employee_id', id);

    if (restoreError) {
      setError(`Failed to restore employee ${id}: ${restoreError.message}`);
      return;
    }

    // Log the restoration
    const user = await supabase.auth.getUser();
    await supabase.from('audit_log').insert([{
      actor: user.data.user?.email || 'unknown',
      action: 'restored employee (via bulk import)',
      record_affected: `${id} (${row.name || row._deletedInfo?.name || 'unknown'})`
    }]);

    // Move the employee from deleted to active in our state
    const updatedDeletedMap = new Map(deletedEmployees);
    updatedDeletedMap.delete(id);
    setDeletedEmployees(updatedDeletedMap);

    const updatedActiveIds = new Set(existingIds);
    updatedActiveIds.add(id);
    setExistingIds(updatedActiveIds);

    // Re-validate all rows now that this employee is restored
    setRows(validate());
  }

  async function runImport() {
    setImporting(true);
    setError('');
    const validated = validate();

    const importable = validated.filter(r => r._errors.length === 0);

    const { data: depositRates } = await supabase.from('deposit_settings').select('*').eq('id', 1).single();
    const { data: payrollSettings } = await supabase.from('payroll_settings').select('*').eq('id', 1).single();

    let created = 0, updated = 0, failed = 0;
    const failedRows = [];

    for (const r of importable) {
      const id = String(r.employee_id).trim();

      if (r._mode === 'create') {
        const employeeRow = { employee_id: id };
        CORE_FIELDS.forEach(f => {
          if (f === 'employee_id' || isBlank(r[f])) return;
          if (['pf_applicable', 'esi_applicable', 'accommodation_provided'].includes(f)) employeeRow[f] = toBool(r[f]);
          else if (['standard_hours_per_day', 'current_fixed_salary', 'current_variable_salary'].includes(f)) employeeRow[f] = Number(r[f]) || 0;
          else if (f !== 'reporting_manager_id') employeeRow[f] = r[f];
        });
        if (!employeeRow.standard_hours_per_day) employeeRow.standard_hours_per_day = 10;
        if (!employeeRow.employment_type) employeeRow.employment_type = 'full-time';

        const { error: insertError } = await supabase.from('employees').insert([employeeRow]);
        if (insertError) { failed++; failedRows.push({ id, error: insertError.message }); continue; }
        created++;

        const fixedSalary = employeeRow.current_fixed_salary || 0;
        if (fixedSalary > 0) {
          const split = computeSalarySplit(fixedSalary, payrollSettings);
          await supabase.from('salary_history').insert([{
            employee_id: id, fixed: fixedSalary, variable: employeeRow.current_variable_salary || 0, ...split,
            effective_from: employeeRow.date_of_joining || new Date().toISOString().slice(0, 10),
            reason: 'Bulk import — starting salary'
          }]);
        }
        const depositRows = [];
        if (toBool(r.uniform_deposit_applicable) && depositRates) {
          depositRows.push({ employee_id: id, deposit_type: 'uniform', amount: depositRates.uniform_deposit_amount });
        }
        if (employeeRow.accommodation_provided && depositRates) {
          depositRows.push({ employee_id: id, deposit_type: 'accommodation', amount: depositRates.accommodation_deposit_amount });
        }
        if (depositRows.length > 0) await supabase.from('employee_deposits').insert(depositRows);

      } else {
        // Update mode: only include fields that actually have a value in
        // this row, so blank cells never overwrite existing data.
        // EXCEPT when update_salaries is true, then we force salary field updates.
        const updateRow = {};
        CORE_FIELDS.forEach(f => {
          if (f === 'employee_id' || f === 'reporting_manager_id') return;

          // Always process salary fields if update_salaries flag is true
          if (f === 'update_salaries' && r[f]) return; // Just a marker, don't add to updateRow

          // Check if field should be updated (not blank OR force update for salary)
          // The update_salaries flag can be 'TRUE', 'YES', '1', or boolean true
          const updateSalariesEnabled = r.update_salaries === true || r.update_salaries === 'TRUE' || r.update_salaries === 'YES' || r.update_salaries === '1';
          const shouldUpdate = r[f] !== undefined && r[f] !== null && r[f] !== '';
          const isSalaryField = ['current_fixed_salary', 'current_variable_salary'].includes(f);

          if (shouldUpdate || (updateSalariesEnabled && isSalaryField)) {
            if (['pf_applicable', 'esi_applicable', 'accommodation_provided'].includes(f)) updateRow[f] = toBool(r[f]);
            else if (['standard_hours_per_day', 'current_fixed_salary', 'current_variable_salary'].includes(f)) updateRow[f] = Number(r[f]);
            else updateRow[f] = r[f];
          }
        });
        if (Object.keys(updateRow).length > 0) {
          const { error: updateError } = await supabase.from('employees').update(updateRow).eq('employee_id', id);
          if (updateError) { failed++; failedRows.push({ id, error: updateError.message }); continue; }
        }
        updated++;
      }

      // Sensitive fields — same for create or update, upsert whatever's filled in.
      const sensitiveRow = {};
      SENSITIVE_FIELDS.forEach(f => { if (!isBlank(r[f])) sensitiveRow[f] = r[f]; });
      if (Object.keys(sensitiveRow).length > 0) {
        await supabase.from('employee_sensitive_info').upsert([{ employee_id: id, ...sensitiveRow }]);
        // Deliberately not checking this for errors — a non-admin running
        // the import just won't have these fields saved, same as if they'd
        // tried to save them individually on an employee's page.
      }
    }

    // Final pass: wire up reporting managers now that everyone in the file exists.
    for (const r of importable) {
      const mgr = String(r.reporting_manager_id || '').trim();
      if (!mgr) continue;
      await supabase.from('employees').update({ reporting_manager_id: mgr }).eq('employee_id', String(r.employee_id).trim());
    }

    setResult({ created, updated, failed, failedRows, skipped: validated.length - importable.length });
    setImporting(false);
  }

  return (
    <div>
      <h1>Bulk import / update employees</h1>
      <p style={{ color: '#777' }}>
        Rows with a new employee_id create a new employee (with starting salary history and deposits, same as adding
        one at a time). Rows with an employee_id that already exists UPDATE that employee instead — only cells you've
        filled in are changed, blank cells leave existing data alone. Salary itself is never touched here; use "Record
        salary change" on an employee's own page for that, so it stays properly logged with a reason.
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
                <th style={{ padding: 6 }}>employee_id</th><th>name</th><th>department</th><th>Mode</th><th>Issues / Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #eee', background: r._errors?.length > 0 ? '#fff5f5' : 'white' }}>
                  <td style={{ padding: 6 }}>{r.employee_id}</td>
                  <td>{r.name || r._deletedInfo?.name}</td>
                  <td>{r.department}</td>
                  <td>
                    {r._mode === 'deleted' ? (
                      <span style={{ color: '#e67e22' }}>⚠️ deleted</span>
                    ) : (
                      r._mode || '—'
                    )}
                  </td>
                  <td>
                    {r._mode === 'deleted' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: '#c0392b' }}>{(r._errors || []).join('; ')}</span>
                        <button
                          onClick={() => restoreAndUpdate(r)}
                          style={{
                            padding: '4px 8px',
                            fontSize: 12,
                            background: '#27ae60',
                            color: 'white',
                            border: 'none',
                            borderRadius: 4,
                            cursor: 'pointer'
                          }}
                        >
                          Restore & Update
                        </button>
                      </div>
                    ) : (
                      <span style={{ color: '#c0392b' }}>{(r._errors || []).join('; ')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ color: '#777', marginTop: 8 }}>
            Rows with an issue are skipped entirely on import. Fix them in your file and re-upload if needed.
          </p>
          <button onClick={runImport} disabled={importing} style={{ marginTop: 12, padding: '10px 20px' }}>
            {importing ? 'Importing…' : 'Import / update valid rows'}
          </button>
        </>
      )}

      {result && (
        <div style={{ background: 'white', padding: 16, borderRadius: 8, marginTop: 20 }}>
          <p><strong>{result.created} created, {result.updated} updated, {result.failed} failed, {result.skipped} skipped.</strong></p>
          {result.failedRows.length > 0 && (
            <ul>{result.failedRows.map((f, i) => <li key={i} style={{ color: 'crimson' }}>{f.id}: {f.error}</li>)}</ul>
          )}
          <p><a href="/employees">Go to employees →</a></p>
        </div>
      )}
    </div>
  );
}
