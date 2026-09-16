'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '../../../lib/supabaseClient';
import { computeSalarySplit } from '../../../lib/salarySplit';

export default function EmployeeDetail() {
  const { id } = useParams();
  const supabase = createClient();
  const [employee, setEmployee] = useState(null);
  const [allEmployees, setAllEmployees] = useState([]);
  const [salaryHistory, setSalaryHistory] = useState([]);
  const [trackRecord, setTrackRecord] = useState([]);
  const [newSalary, setNewSalary] = useState({ fixed: '', variable: '', effective_from: '', reason: '' });
  const [newNote, setNewNote] = useState({ type: 'note', text: '', author: '' });
  const [managerEdit, setManagerEdit] = useState('');
  const [statusEdit, setStatusEdit] = useState('');
  const [exitDate, setExitDate] = useState('');
  const [exitReason, setExitReason] = useState('');
  const [resignationLetter, setResignationLetter] = useState(null);
  const [uploadingLetter, setUploadingLetter] = useState(false);
  const [exitRecord, setExitRecord] = useState(null);
  const [newAsset, setNewAsset] = useState('');
  const [uniformReturned, setUniformReturned] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const { data: emp } = await supabase.from('employees').select('*').eq('employee_id', id).single();
    setEmployee(emp);
    if (emp) {
      setManagerEdit(emp.reporting_manager_id || '');
      setStatusEdit(emp.status || 'active');
      setExitDate(emp.date_of_leaving || '');
      setExitReason(emp.exit_reason || '');
    }
    const { data: all } = await supabase.from('employees').select('employee_id, name, status');
    setAllEmployees(all || []);
    const { data: sh } = await supabase.from('salary_history').select('*').eq('employee_id', id).order('effective_from', { ascending: false });
    setSalaryHistory(sh || []);
    const { data: tr } = await supabase.from('track_record').select('*').eq('employee_id', id).order('date', { ascending: false });
    setTrackRecord(tr || []);
    const { data: letter } = await supabase.from('documents').select('*').eq('employee_id', id).eq('doc_type', 'resignation_letter').maybeSingle();
    setResignationLetter(letter);
    const { data: exit } = await supabase.from('exit_records').select('*').eq('employee_id', id).maybeSingle();
    setExitRecord(exit);
    setUniformReturned(exit?.uniform_returned || false);
  }

  useEffect(() => { load(); }, [id]);

  async function addSalaryChange(e) {
    e.preventDefault();
    setError('');
    const { data: settings } = await supabase.from('payroll_settings').select('*').eq('id', 1).single();
    const split = computeSalarySplit(newSalary.fixed, settings);
    const { error } = await supabase.from('salary_history').insert([{ ...newSalary, ...split, employee_id: id }]);
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

  async function saveManagerAndStatus(e) {
    e.preventDefault();
    setError('');
    const update = {
      reporting_manager_id: managerEdit || null,
      status: statusEdit,
      date_of_leaving: statusEdit === 'exited' ? (exitDate || new Date().toISOString().slice(0, 10)) : null,
      exit_reason: statusEdit === 'exited' ? (exitReason || null) : null
    };
    const { error } = await supabase.from('employees').update(update).eq('employee_id', id);
    if (error) { setError(error.message); return; }
    load();
  }

  async function uploadResignationLetter(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLetter(true);
    setError('');
    const path = `resignation-letters/${id}-${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from('documents').upload(path, file);
    if (uploadError) { setError(uploadError.message); setUploadingLetter(false); return; }
    const { error: dbError } = await supabase.from('documents').insert([{
      employee_id: id, doc_type: 'resignation_letter', status: 'on-file', file_url: path
    }]);
    if (dbError) setError(dbError.message);
    setUploadingLetter(false);
    load();
  }

  async function addAsset(e) {
    e.preventDefault();
    if (!newAsset.trim()) return;
    const currentAssets = exitRecord?.assets_issued || [];
    const updatedAssets = [...currentAssets, { name: newAsset.trim(), returned: false }];
    const { error } = await supabase.from('exit_records').upsert([{ employee_id: id, assets_issued: updatedAssets }]);
    if (error) { setError(error.message); return; }
    setNewAsset('');
    load();
  }

  async function toggleAssetReturned(index) {
    const assets = [...(exitRecord?.assets_issued || [])];
    assets[index] = { ...assets[index], returned: !assets[index].returned };
    const { error } = await supabase.from('exit_records').upsert([{ employee_id: id, assets_issued: assets }]);
    if (error) { setError(error.message); return; }
    load();
  }

  async function saveUniformReturned() {
    const allAssetsReturned = (exitRecord?.assets_issued || []).every(a => a.returned);
    const clearance_status = allAssetsReturned && uniformReturned ? 'cleared' : 'pending';
    const { error } = await supabase.from('exit_records').upsert([{
      employee_id: id, uniform_returned: uniformReturned, clearance_status
    }]);
    if (error) { setError(error.message); return; }
    load();
  }

  if (!employee) return <p>Loading… (or you may not have access to this employee's department)</p>;

  const tenure = (() => {
    const start = new Date(employee.date_of_joining);
    const end = employee.date_of_leaving ? new Date(employee.date_of_leaving) : new Date();
    const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    return `${Math.floor(months / 12)}y ${months % 12}m`;
  })();

  const directReports = allEmployees.filter(e => e.employee_id !== id);

  return (
    <div>
      <a href="/employees">← Back to employees</a>
      <h1>{employee.name}</h1>
      <p>{employee.designation} — {employee.department}</p>
      <p>In service: {tenure} · Status: {employee.status}{employee.exit_reason ? ` (${employee.exit_reason.replace('_', ' ')})` : ''}</p>
      <p><a href={`/employees/${id}/onboarding`}>View / print onboarding acknowledgment document →</a></p>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <section style={{ background: 'white', padding: 16, borderRadius: 8, marginTop: 20 }}>
        <h2>Manager & status</h2>
        <form onSubmit={saveManagerAndStatus} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <label>Reports to
            <select value={managerEdit} onChange={e => setManagerEdit(e.target.value)}>
              <option value="">None (top of hierarchy)</option>
              {directReports.map(m => (
                <option key={m.employee_id} value={m.employee_id}>{m.name}{m.status === 'exited' ? ' (exited)' : ''}</option>
              ))}
            </select>
          </label>
          <label>Status
            <select value={statusEdit} onChange={e => setStatusEdit(e.target.value)}>
              <option value="active">Active</option>
              <option value="on-notice">On notice</option>
              <option value="exited">Exited</option>
            </select>
          </label>
          {statusEdit === 'exited' && (
            <>
              <label>Date of leaving
                <input type="date" value={exitDate} onChange={e => setExitDate(e.target.value)} />
              </label>
              <label>Exit reason
                <select value={exitReason} onChange={e => setExitReason(e.target.value)}>
                  <option value="">Select reason…</option>
                  <option value="resigned">Resigned</option>
                  <option value="absconding">Absconding</option>
                  <option value="terminated_disciplinary">Terminated (disciplinary)</option>
                  <option value="terminated_admin">Terminated (admin)</option>
                </select>
              </label>
            </>
          )}
          <button type="submit">Save</button>
        </form>
        {statusEdit === 'exited' && (
          <p style={{ color: '#856404', marginTop: 10 }}>
            Marking this person exited: anyone who reports to them will show up under "Needs reassignment" on the Employees page until you reassign them.
          </p>
        )}
        {(statusEdit === 'on-notice' || statusEdit === 'exited') && (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 16 }}>Resignation letter</h3>
            {resignationLetter ? (
              <p>On file since {resignationLetter.date_added}.</p>
            ) : (
              <p style={{ color: '#777' }}>Not uploaded yet.</p>
            )}
            <input type="file" onChange={uploadResignationLetter} disabled={uploadingLetter} />
            {uploadingLetter && <span> Uploading…</span>}
          </div>
        )}
      </section>

      <section style={{ background: 'white', padding: 16, borderRadius: 8, marginTop: 20 }}>
        <h2>Assets & exit clearance</h2>
        <p style={{ color: '#777', fontSize: 14 }}>Track anything issued to this employee (laptop, keys, etc.) and check them off as returned at exit.</p>
        <ul>
          {(exitRecord?.assets_issued || []).map((a, i) => (
            <li key={i}>
              <label>
                <input type="checkbox" checked={!!a.returned} onChange={() => toggleAssetReturned(i)} /> {a.name} {a.returned ? '(returned)' : ''}
              </label>
            </li>
          ))}
        </ul>
        <form onSubmit={addAsset} style={{ display: 'flex', gap: 8 }}>
          <input placeholder="Asset name (e.g. Laptop)" value={newAsset} onChange={e => setNewAsset(e.target.value)} />
          <button type="submit">Add asset</button>
        </form>
        <label style={{ display: 'block', marginTop: 12 }}>
          <input type="checkbox" checked={uniformReturned} onChange={e => setUniformReturned(e.target.checked)} /> Uniform returned
        </label>
        <button onClick={saveUniformReturned} style={{ marginTop: 8 }}>Save clearance status</button>
        <p style={{ marginTop: 8 }}>Clearance status: <strong>{exitRecord?.clearance_status || 'pending'}</strong></p>
        <p style={{ marginTop: 12 }}>
          <a href={`/employees/${id}/exit-clearance`}>View / print exit clearance document →</a><br />
          <a href={`/employees/${id}/work-certificate`}>View / print work certificate →</a>
        </p>
      </section>

      <section style={{ background: 'white', padding: 16, borderRadius: 8, marginTop: 20 }}>
        <h2>Salary history</h2>
        <p style={{ color: '#777', fontSize: 14 }}>Payroll split shown below is the breakdown used for gratuity/statutory purposes at the time each entry was recorded.</p>
        <ul>
          {salaryHistory.map(s => (
            <li key={s.id} style={{ marginBottom: 8 }}>
              {s.effective_from}: ₹{s.fixed} fixed + ₹{s.variable} variable — {s.reason}
              <br />
              <span style={{ color: '#777', fontSize: 13 }}>
                Split — Basic+DA: ₹{s.basic_da ?? '—'} · HRA: ₹{s.hra ?? '—'} · Other allowances: ₹{s.other_allowances ?? '—'}
              </span>
            </li>
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
