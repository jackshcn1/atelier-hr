'use client';
import { useState } from 'react';
import { createClient } from '../../lib/supabaseClient';

function toCsv(rows) {
  if (!rows || rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [headers.join(',')];
  rows.forEach(r => lines.push(headers.map(h => escape(r[h])).join(',')));
  return lines.join('\n');
}

function download(filename, content) {
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const EXPORTS = [
  { table: 'employees', label: 'Employees (all fields, all statuses)' },
  { table: 'salary_history', label: 'Salary history' },
  { table: 'track_record', label: 'Track record (notes/warnings/merits)' },
  { table: 'training_records', label: 'Training records' },
  { table: 'documents', label: 'Documents (metadata only, not the files themselves)' },
  { table: 'employee_deposits', label: 'Employee deposits' },
  { table: 'exit_records', label: 'Exit records & clearance' },
  { table: 'departments', label: 'Departments' },
];

export default function ExportPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');

  async function exportTable(table) {
    setLoading(table);
    setError('');
    let query = supabase.from(table).select('*');
    if (table === 'employees') query = query.is('deleted_at', null);
    const { data, error } = await query;
    if (error) { setError(`${table}: ${error.message}`); setLoading(''); return; }
    download(`${table}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(data));
    setLoading('');
  }

  return (
    <div>
      <h1>Export data</h1>
      <p style={{ color: '#777' }}>
        Downloads a CSV of everything you have access to in that table (department heads only get their own department's rows,
        same as everywhere else in the app).
      </p>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      <div style={{ background: 'white', padding: 16, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 500 }}>
        {EXPORTS.map(exp => (
          <button key={exp.table} onClick={() => exportTable(exp.table)} disabled={loading === exp.table}
            style={{ padding: 10, textAlign: 'left' }}>
            {loading === exp.table ? 'Exporting…' : `Export: ${exp.label}`}
          </button>
        ))}
      </div>
    </div>
  );
}
