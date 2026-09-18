'use client';
import { useEffect, useState } from 'react';
import { createClient } from '../../../lib/supabaseClient';

export default function DocTemplates() {
  const supabase = createClient();
  const [templates, setTemplates] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState({ department: '', doc_name: '', description: '', required: true });
  const [error, setError] = useState('');

  async function load() {
    const { data: t, error } = await supabase.from('doc_templates').select('*').order('department');
    if (error) setError(error.message);
    else setTemplates(t);
    const { data: d } = await supabase.from('departments').select('*');
    setDepartments(d || []);
  }

  useEffect(() => { load(); }, []);

  async function addTemplate(e) {
    e.preventDefault();
    setError('');
    const { error } = await supabase.from('doc_templates').insert([form]);
    if (error) { setError(error.message); return; }
    setForm({ department: '', doc_name: '', description: '', required: true });
    load();
  }

  async function removeTemplate(id) {
    await supabase.from('doc_templates').delete().eq('id', id);
    load();
  }

  const grouped = templates.reduce((acc, t) => {
    acc[t.department] = acc[t.department] || [];
    acc[t.department].push(t);
    return acc;
  }, {});

  return (
    <div>
      <h1>Document templates</h1>
      <p style={{ color: '#777' }}>
        Define the onboarding paperwork checklist for each department. These show up on every employee's page in
        that department, so you can see at a glance which documents are missing.
      </p>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <form onSubmit={addTemplate} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', background: 'white', padding: 16, borderRadius: 8, marginBottom: 20 }}>
        <select required value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}>
          <option value="">Select department…</option>
          {departments.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
        </select>
        <input placeholder="Document name (e.g. Asset handover form)" required value={form.doc_name}
          onChange={e => setForm({ ...form, doc_name: e.target.value })} style={{ flex: 1, minWidth: 200 }} />
        <input placeholder="Description (optional)" value={form.description}
          onChange={e => setForm({ ...form, description: e.target.value })} style={{ flex: 1, minWidth: 200 }} />
        <label><input type="checkbox" checked={form.required} onChange={e => setForm({ ...form, required: e.target.checked })} /> Required</label>
        <button type="submit">Add</button>
      </form>

      {Object.keys(grouped).length === 0 && <p style={{ color: '#777' }}>No templates yet — add one above for each department.</p>}
      {Object.entries(grouped).map(([dept, docs]) => (
        <div key={dept} style={{ background: 'white', padding: 16, borderRadius: 8, marginBottom: 16 }}>
          <h3>{dept}</h3>
          <ul>
            {docs.map(d => (
              <li key={d.id}>
                {d.doc_name} {d.required ? '(required)' : '(optional)'} {d.description && `— ${d.description}`}{' '}
                <button onClick={() => removeTemplate(d.id)} style={{ marginLeft: 8 }}>Remove</button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
