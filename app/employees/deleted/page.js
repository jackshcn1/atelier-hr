'use client';
import { useEffect, useState } from 'react';
import { createClient } from '../../../lib/supabaseClient';

export default function DeletedEmployees() {
  const supabase = createClient();
  const [employees, setEmployees] = useState([]);
  const [error, setError] = useState('');

  async function load() {
    const { data, error } = await supabase.from('employees').select('*').not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
    if (error) setError(error.message + ' (only admins can view deleted employees)');
    else setEmployees(data);
  }

  useEffect(() => { load(); }, []);

  async function restore(emp) {
    const { error } = await supabase.from('employees').update({ deleted_at: null }).eq('employee_id', emp.employee_id);
    if (error) { setError(error.message); return; }
    await supabase.from('audit_log').insert([{
      actor: (await supabase.auth.getUser()).data.user?.email || 'unknown',
      action: 'restored employee',
      record_affected: `${emp.employee_id} (${emp.name})`
    }]);
    load();
  }

  return (
    <div>
      <a href="/employees">← Back to employees</a>
      <h1>Deleted employees</h1>
      <p style={{ color: '#777' }}>Restoring puts them back on every list, dropdown, and export exactly as they were.</p>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
            <th style={{ padding: 8 }}>Name</th><th>Designation</th><th>Department</th><th>Deleted on</th><th></th>
          </tr>
        </thead>
        <tbody>
          {employees.map(emp => (
            <tr key={emp.employee_id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: 8 }}>{emp.name}</td>
              <td>{emp.designation}</td>
              <td>{emp.department}</td>
              <td>{new Date(emp.deleted_at).toLocaleString()}</td>
              <td><button onClick={() => restore(emp)}>Restore</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {employees.length === 0 && <p style={{ color: '#777' }}>Nothing deleted.</p>}
    </div>
  );
}
