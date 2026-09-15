'use client';
import { useEffect, useState } from 'react';
import { createClient } from '../../lib/supabaseClient';

const empty = {
  employee_id: '', name: '', phone: '', email: '', designation: '',
  department: '', employment_type: 'full-time', date_of_joining: '',
  reporting_manager_id: '',
  pf_applicable: false, esi_applicable: false, accommodation_provided: false,
  current_fixed_salary: '', current_variable_salary: ''
};

export default function EmployeesPage() {
  const supabase = createClient();
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState(empty);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const { data, error } = await supabase.from('employees').select('*').order('name');
    if (error) setError(error.message);
    else setEmployees(data);
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e) {
    e.preventDefault();
    setError('');
    const payload = { ...form, reporting_manager_id: form.reporting_manager_id || null };
    const { error } = await supabase.from('employees').insert([payload]);
    if (error) { setError(error.message); return; }
    if (form.current_fixed_salary || form.current_variable_salary) {
      await supabase.from('salary_history').insert([{
        employee_id: form.employee_id,
        fixed: form.current_fixed_salary || 0,
        variable: form.current_variable_salary || 0,
        effective_from: form.date_of_joining || new Date().toISOString().slice(0, 10),
        reason: 'Starting salary'
      }]);
    }
    setForm(empty);
    setShowForm(false);
    load();
  }

  async function reassign(employeeId, newManagerId) {
    await supabase.from('employees').update({ reporting_manager_id: newManagerId || null }).eq('employee_id', employeeId);
    load();
  }

  const activeEmployees = employees.filter(e => e.status !== 'exited');
  const exitedIds = new Set(employees.filter(e => e.status === 'exited').map(e => e.employee_id));
  const needsReassignment = employees.filter(e => e.reporting_manager_id && exitedIds.has(e.reporting_manager_id) && e.status !== 'exited');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Employees</h1>
        <button onClick={() => setShowForm(s => !s)} style={{ padding: '8px 16px' }}>
          {showForm ? 'Cancel' : '+ Add employee'}
        </button>
      </div>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      {needsReassignment.length > 0 && (
        <div style={{ background: '#fff3cd', border: '1px solid #ffe08a', borderRadius: 8, padding: 16, marginBottom: 20 }}>
          <strong>⚠ Needs reassignment — {needsReassignment.length} employee(s) report to someone who has exited</strong>
          <ul style={{ marginTop: 10 }}>
            {needsReassignment.map(e => (
              <li key={e.employee_id} style={{ marginBottom: 6 }}>
                {e.name} (previously reported to an exited employee) — new manager:{' '}
                <select defaultValue="" onChange={ev => reassign(e.employee_id, ev.target.value)}>
                  <option value="">Choose manager…</option>
                  {activeEmployees.filter(m => m.employee_id !== e.employee_id).map(m => (
                    <option key={m.employee_id} value={m.employee_id}>{m.name}</option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleAdd} style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
          background: 'white', padding: 16, borderRadius: 8, marginBottom: 20
        }}>
          <input placeholder="Employee ID (e.g. EMP-0001)" required value={form.employee_id}
            onChange={e => setForm({ ...form, employee_id: e.target.value })} />
          <input placeholder="Name" required value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })} />
          <input placeholder="Phone" value={form.phone}
            onChange={e => setForm({ ...form, phone: e.target.value })} />
          <input placeholder="Email" value={form.email}
            onChange={e => setForm({ ...form, email: e.target.value })} />
          <input placeholder="Designation" value={form.designation}
            onChange={e => setForm({ ...form, designation: e.target.value })} />
          <input placeholder="Department" value={form.department}
            onChange={e => setForm({ ...form, department: e.target.value })} />
          <label>Date of joining
            <input type="date" value={form.date_of_joining}
              onChange={e => setForm({ ...form, date_of_joining: e.target.value })} />
          </label>
          <select value={form.employment_type}
            onChange={e => setForm({ ...form, employment_type: e.target.value })}>
            <option value="full-time">Full-time</option>
            <option value="part-time">Part-time</option>
            <option value="contract">Contract</option>
            <option value="probation">Probation</option>
          </select>
          <label>Reporting manager
            <select value={form.reporting_manager_id}
              onChange={e => setForm({ ...form, reporting_manager_id: e.target.value })}>
              <option value="">None (top of hierarchy)</option>
              {activeEmployees.map(m => (
                <option key={m.employee_id} value={m.employee_id}>{m.name}</option>
              ))}
            </select>
          </label>
          <input placeholder="Fixed salary" type="number" value={form.current_fixed_salary}
            onChange={e => setForm({ ...form, current_fixed_salary: e.target.value })} />
          <input placeholder="Variable salary" type="number" value={form.current_variable_salary}
            onChange={e => setForm({ ...form, current_variable_salary: e.target.value })} />
          <label><input type="checkbox" checked={form.pf_applicable}
            onChange={e => setForm({ ...form, pf_applicable: e.target.checked })} /> PF applicable</label>
          <label><input type="checkbox" checked={form.esi_applicable}
            onChange={e => setForm({ ...form, esi_applicable: e.target.checked })} /> ESI applicable</label>
          <label><input type="checkbox" checked={form.accommodation_provided}
            onChange={e => setForm({ ...form, accommodation_provided: e.target.checked })} /> Company accommodation</label>
          <button type="submit" style={{ gridColumn: 'span 2', padding: 10 }}>Save employee</button>
        </form>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
            <th style={{ padding: 8 }}>Name</th>
            <th>Designation</th>
            <th>Department</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {employees.map(emp => (
            <tr key={emp.employee_id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: 8 }}>{emp.name}</td>
              <td>{emp.designation}</td>
              <td>{emp.department}</td>
              <td>{emp.status}</td>
              <td><a href={`/employees/${emp.employee_id}`}>View / edit →</a></td>
            </tr>
          ))}
        </tbody>
      </table>
      {employees.length === 0 && <p style={{ color: '#777' }}>No employees yet — add your first one above.</p>}
    </div>
  );
}
