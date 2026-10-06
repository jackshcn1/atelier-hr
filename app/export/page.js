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
  { table: 'employees', label: 'Employees' },
  { table: 'salary_history', label: 'Salary history' },
  { table: 'track_record', label: 'Track record' },
  { table: 'training_records', label: 'Training records' },
  { table: 'documents', label: 'Documents metadata' },
  { table: 'employee_deposits', label: 'Employee deposits' },
  { table: 'employee_sensitive_info', label: 'Employee sensitive info' },
  { table: 'exit_records', label: 'Exit records' },
  { table: 'departments', label: 'Departments' },
];

export default function ExportImportPage() {
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
    <div className="pb-20 max-w-4xl mx-auto px-4 sm:px-6">
      <div className="mb-6 pt-2">
        <h1 className="font-serif text-2.5xl sm:text-3xl font-bold text-ink">Export/Import</h1>
        <p className="text-sm text-ink-muted mt-2">Manage data exports and bulk imports.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="panel p-6">
          <h2 className="panel-title mb-4">Export Data</h2>
          <div className="flex flex-col gap-2">
            {EXPORTS.map(exp => (
              <button key={exp.table} onClick={() => exportTable(exp.table)} disabled={loading === exp.table}
                className="btn-quiet text-left text-xs justify-start">
                {loading === exp.table ? 'Exporting…' : `Export: ${exp.label}`}
              </button>
            ))}
          </div>
        </div>

        <div className="panel p-6">
          <h2 className="panel-title mb-4">Bulk Import</h2>
          <p className="text-xs text-ink-muted mb-4">Use CSV templates to batch upload employee data.</p>
          <a href="/employees/bulk-import" className="btn-primary text-xs inline-block">
            Go to Bulk Import Tool →
          </a>
        </div>
      </div>
    </div>
  );
}
