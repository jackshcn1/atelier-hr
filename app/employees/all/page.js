'use client';
import { useEffect, useState } from 'react';
import { createClient } from '../../../lib/supabaseClient';

export default function AllEmployeesPage() {
  const supabase = createClient();
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    supabase.from('employees').select('*').is('deleted_at', null).order('name').then(({ data }) => {
      if (!data) return;
      // active + on-notice first, exited last; alphabetical within each group
      const order = { active: 0, 'on-notice': 1, exited: 2 };
      setEmployees([...data].sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3) || a.name.localeCompare(b.name)));
    });
  }, []);

  const filtered = employees.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.designation || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <a href="/employees">← Back to active employees</a>
      <h1>All employees (all-time record)</h1>
      <p style={{ color: '#777' }}>
        Every employee ever added, active first then past — useful for rehire checks and reference calls.
      </p>
      <input placeholder="Search by name or designation…" value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ padding: 8, width: '100%', marginBottom: 16, boxSizing: 'border-box' }} />

      <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
            <th style={{ padding: 8 }}>Name</th>
            <th>Designation</th>
            <th>Department</th>
            <th>Status</th>
            <th>Exit reason</th>
            <th>Joined</th>
            <th>Left</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(emp => (
            <tr key={emp.employee_id} style={{
              borderBottom: '1px solid #eee',
              opacity: emp.status === 'exited' ? 0.65 : 1
            }}>
              <td style={{ padding: 8 }}>{emp.name}</td>
              <td>{emp.designation}</td>
              <td>{emp.department}</td>
              <td>{emp.status}</td>
              <td>{emp.exit_reason ? emp.exit_reason.replace('_', ' ') : '—'}</td>
              <td>{emp.date_of_joining}</td>
              <td>{emp.date_of_leaving || '—'}</td>
              <td><a href={`/employees/${emp.employee_id}`}>View →</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
