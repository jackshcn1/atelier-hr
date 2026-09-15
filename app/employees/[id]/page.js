'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '../../../lib/supabaseClient';

export default function EmployeeDetail() {
  const { id } = useParams();
  const supabase = createClient();
  const [employee, setEmployee] = useState(null);
  const [salaryHistory, setSalaryHistory] = useState([]);
  const [trackRecord, setTrackRecord] = useState([]);
  const [newSalary, setNewSalary] = useState({ fixed: '', variable: '', effective_from: '', reason: '' });
  const [newNote, setNewNote] = useState({ type: 'note', text: '', author: '' });
  const [error, setError] = useState('');

  async function load() {
    const { data: emp } = await supabase.from('employees').select('*').eq('employee_id', id).single();
    setEmployee(emp);
    const { data: sh } = await supabase.from('salary_history').select('*').eq('employee_id', id).order('effective_from', { ascending: false });
    setSalaryHistory(sh || []);
    const { data: tr } = await supabase.from('track_record').select('*').eq('employee_id', id).order('date', { ascending: false });
    setTrackRecord(tr || []);
  }

  useEffect(() => { load(); }, [id]);

  async function addSalaryChange(e) {
    e.preventDefault();
    setError('');
    const { error } = await supabase.from('salary_history').insert([{ ...newSalary, employee_id: id }]);
    if (error) { setError(error.message); return; }
    await supabase.from('employees').update({
      current_fixed_salary: newSalary.fixed,
      current_variable_salary: newSalary.variable
    }).eq('employee_id', id);
    setNewSalary({ fixed: '', variable: '', effective_from: '', reason: '' });
    load();
  }

  async function addTrackEntry(e) {
    e.preventDefault();
    setError('');
    const { error } = await supabase.from('track_record').insert([{ ...newNote, employee_id: id }]);
    if (error) { setError(error.message); return; }
    setNewNote({ type: 'note', text: '', author: '' });
    load();
  }

  if (!employee) return <p>Loading… (or you may not have access to this employee's department)</p>;

  const tenure = (() => {
    const start = new Date(employee.date_of_joining);
    const end = employee.date_of_leaving ? new Date(employee.date_of_leaving) : new Date();
    const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    return `${Math.floor(months / 12)}y ${months % 12}m`;
  })();

  return (
    <div>
      <a href="/employees">← Back to employees</a>
      <h1>{employee.name}</h1>
      <p>{employee.designation} — {employee.department}</p>
      <p>In service: {tenure} · Status: {employee.status}</p>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <section style={{ background: 'white', padding: 16, borderRadius: 8, marginTop: 20 }}>
        <h2>Salary history</h2>
        <ul>
          {salaryHistory.map(s => (
            <li key={s.id}>{s.effective_from}: ₹{s.fixed} fixed + ₹{s.variable} variable — {s.reason}</li>
          ))}
        </ul>
        <form onSubmit={addSalaryChange} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input type="number" placeholder="Fixed" required value={newSalary.fixed}
            onChange={e => setNewSalary({ ...newSalary, fixed: e.target.value })} />
          <input type="number" placeholder="Variable" value={newSalary.variable}
            onChange={e => setNewSalary({ ...newSalary, variable: e.target.value })} />
          <input type="date" required value={newSalary.effective_from}
            onChange={e => setNewSalary({ ...newSalary, effective_from: e.target.value })} />
          <input placeholder="Reason (e.g. annual review)" value={newSalary.reason}
            onChange={e => setNewSalary({ ...newSalary, reason: e.target.value })} />
          <button type="submit">Record change</button>
        </form>
      </section>

      <section style={{ background: 'white', padding: 16, borderRadius: 8, marginTop: 20 }}>
        <h2>Track record</h2>
        <ul>
          {trackRecord.map(t => (
            <li key={t.id}><strong>[{t.type}]</strong> {t.date}: {t.text} — {t.author}</li>
          ))}
        </ul>
        <form onSubmit={addTrackEntry} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={newNote.type} onChange={e => setNewNote({ ...newNote, type: e.target.value })}>
            <option value="note">Note</option>
            <option value="warning">Warning</option>
            <option value="merit">Merit</option>
          </select>
          <input placeholder="Details" required value={newNote.text}
            onChange={e => setNewNote({ ...newNote, text: e.target.value })} style={{ flex: 1 }} />
          <input placeholder="Your name" value={newNote.author}
            onChange={e => setNewNote({ ...newNote, author: e.target.value })} />
          <button type="submit">Add entry</button>
        </form>
      </section>
    </div>
  );
}
