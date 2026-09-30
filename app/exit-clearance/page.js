'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '../../lib/supabaseClient';
import { summariseExitClearance } from '../../lib/exitClearance';

const EXIT_TYPES = [
  { value: 'voluntary', label: 'Voluntary resignation' },
  { value: 'notional', label: 'Notional / management termination' },
  { value: 'disciplinary', label: 'Disciplinary termination' },
  { value: 'absconding', label: 'Absconding' },
  { value: 'retirement', label: 'Retirement' },
  { value: 'other', label: 'Other' },
];

export default function ExitClearanceWorkspace() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading exit clearance…</div>}>
      <ExitClearanceInner />
    </Suspense>
  );
}

function ExitClearanceInner() {
  const params = useSearchParams();
  const id = params.get('id');
  const supabase = createClient();

  const [employee, setEmployee] = useState(null);
  const [record, setRecord] = useState(null);
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showPrint, setShowPrint] = useState(false);

  const [assetRow, setAssetRow] = useState({ name: '', returned: false });
  const [dueRow, setDueRow] = useState({ label: '', amount: '' });

  async function load() {
    setLoading(true);
    const [{ data: emp }, { data: rec }, { data: deps }] = await Promise.all([
      supabase.from('employees').select('*').eq('employee_id', id).maybeSingle(),
      supabase.from('exit_records').select('*').eq('employee_id', id).maybeSingle(),
      supabase.from('employee_deposits').select('*').eq('employee_id', id),
    ]);
    setEmployee(emp || null);
    setRecord(rec || null);
    setDeposits(deps || []);
    setLoading(false);
  }

  useEffect(() => { if (id) load(); }, [id]);

  // Ensure a record exists so the form always has somewhere to write.
  async function ensureRecord() {
    if (record) return record;
    const { data: created, error: insErr } = await supabase
      .from('exit_records')
      .insert({ employee_id: id, clearance_status: 'pending' })
      .select()
      .single();
    if (insErr) throw insErr;
    setRecord(created);
    return created;
  }

  async function patch(fields, successMsg) {
    setError(''); setMessage('');
    setSaving(true);
    try {
      const current = await ensureRecord();
      const { error: updErr } = await supabase
        .from('exit_records')
        .update(fields)
        .eq('employee_id', id);
      if (updErr) throw updErr;
      if (successMsg) setMessage(successMsg);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveExitFacts(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await patch({
      last_working_day: fd.get('last_working_day') || employee?.date_of_leaving || null,
      exit_date: fd.get('exit_date') || employee?.date_of_leaving || null,
      exit_type: fd.get('exit_type') || null,
      notice_period_days: fd.get('notice_period_days') ? Number(fd.get('notice_period_days')) : null,
      notice_served: fd.get('notice_served') === 'on',
      gratuity_payable: fd.get('gratuity_payable') ? Number(fd.get('gratuity_payable')) : 0,
      last_salary_paid_date: fd.get('last_salary_paid_date') || null,
      open_remarks: fd.get('open_remarks') || null,
    }, '✓ Exit details saved.');
  }

  async function addAsset() {
    if (!assetRow.name.trim()) return;
    const current = await ensureRecord();
    const next = [...(current.assets_issued || []), { name: assetRow.name.trim(), returned: assetRow.returned }];
    await patch({ assets_issued: next }, '✓ Asset added.');
    setAssetRow({ name: '', returned: false });
  }

  async function toggleAsset(index) {
    const current = await ensureRecord();
    const next = (current.assets_issued || []).map((a, i) => (i === index ? { ...a, returned: !a.returned } : a));
    await patch({ assets_issued: next });
  }

  async function removeAsset(index) {
    const current = await ensureRecord();
    const next = (current.assets_issued || []).filter((_, i) => i !== index);
    await patch({ assets_issued: next });
  }

  async function addDue() {
    if (!dueRow.label.trim()) return;
    const current = await ensureRecord();
    const next = [...(current.pending_dues || []), { label: dueRow.label.trim(), amount: Number(dueRow.amount) || 0 }];
    await patch({ pending_dues: next }, '✓ Pending due added.');
    setDueRow({ label: '', amount: '' });
  }

  async function removeDue(index) {
    const current = await ensureRecord();
    const next = (current.pending_dues || []).filter((_, i) => i !== index);
    await patch({ pending_dues: next });
  }

  // Marking someone exited does NOT require clearance to be complete — it is
  // allowed to proceed. Clearance is then tracked as outstanding work rather
  // than being a gate on the exit itself.
  async function markExited() {
    if (!window.confirm(`Mark ${employee?.name} as exited? Clearance items can still be outstanding — they will be listed as pending.`)) return;
    setError(''); setMessage(''); setSaving(true);
    try {
      const leavingDate = record?.last_working_day || new Date().toISOString().slice(0, 10);
      const { error: updErr } = await supabase
        .from('employees')
        .update({ status: 'exited', date_of_leaving: leavingDate })
        .eq('employee_id', id);
      if (updErr) throw updErr;

      await supabase.from('audit_log').insert([{
        actor: (await supabase.auth.getUser()).data.user?.email || 'unknown',
        action: 'marked employee exited',
        record_affected: `${id} (${employee?.name}) — last working day ${leavingDate}`,
      }]);

      await ensureRecord();
      await patch({ clearance_status: 'pending' });
      setMessage('✓ Employee marked as exited. Clearance items below remain outstanding until settled.');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function markCleared() {
    if (!window.confirm('Confirm clearance is complete? This records who settled it and the date.')) return;
    await patch({
      clearance_status: 'cleared',
      settled_on: new Date().toISOString().slice(0, 10),
      settled_by: (await supabase.auth.getUser()).data.user?.email || 'unknown',
      deposit_settled: true,
      uniform_returned: record?.uniform_returned === false ? false : true,
    }, '✓ Clearance marked complete.');
  }

  async function reopenClearance() {
    await patch({
      clearance_status: 'pending',
      settled_on: null,
      settled_by: null,
      deposit_settled: false,
    }, 'Clearance reopened.');
  }

  if (!id) return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>No employee selected. Open this page from an employee record.</div>;
  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading exit clearance…</div>;
  if (!employee) return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Employee not found.</div>;

  const summary = summariseExitClearance({ exitRecord: record, employee, deposits });
  const isExited = employee.status === 'exited';

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', paddingBottom: 60 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: '0 0 4px 0', fontSize: 22, fontWeight: 800, color: '#111827' }}>Exit Clearance</h1>
          <p style={{ color: '#666', margin: 0, fontSize: 14 }}>
            {employee.name} · {employee.designation || 'Staff'} · {employee.department || 'All'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowPrint(v => !v)}
            style={{ background: '#f8fafc', border: '1px solid #cbd5e1', color: '#334155', padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {showPrint ? 'Hide' : 'Preview'} printable form
          </button>
          <a href={`/employees/${id}`}
            style={{ background: '#6b7280', color: 'white', padding: '7px 14px', borderRadius: 6, textDecoration: 'none', fontWeight: 700, fontSize: 12 }}>
            ← Back
          </a>
        </div>
      </div>

      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: 12, marginBottom: 14, color: '#991b1b', fontSize: 13 }}>{error}</div>}
      {message && <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 6, padding: 12, marginBottom: 14, color: '#065f46', fontSize: 13 }}>{message}</div>}

      {/* Outstanding items */}
      <div style={{
        background: summary.isCleared ? '#ecfdf5' : summary.hasBlockingIssues ? '#fef2f2' : '#fffbeb',
        border: `1px solid ${summary.isCleared ? '#a7f3d0' : summary.hasBlockingIssues ? '#fecaca' : '#fde68a'}`,
        borderRadius: 10, padding: 16, marginBottom: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: summary.openCount > 0 ? 10 : 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: summary.isCleared ? '#065f46' : summary.hasBlockingIssues ? '#991b1b' : '#92400e' }}>
            {summary.isCleared ? '✅ Clearance complete' : `${summary.openCount} outstanding item(s)`}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {!isExited && (
              <button onClick={markExited} disabled={saving}
                style={{ background: '#dc2626', color: 'white', border: 'none', padding: '7px 16px', borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                Mark as exited
              </button>
            )}
            {summary.isCleared ? (
              <button onClick={reopenClearance} disabled={saving}
                style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', padding: '7px 14px', borderRadius: 6, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                Reopen clearance
              </button>
            ) : (
              <button onClick={markCleared} disabled={saving}
                style={{ background: '#059669', color: 'white', border: 'none', padding: '7px 16px', borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                Mark clearance complete
              </button>
            )}
          </div>
        </div>

        {summary.openCount > 0 && (
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#374151' }}>
            {summary.openItems.map(item => (
              <li key={item.key} style={{ marginBottom: 3 }}>
                <span style={{
                  display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginRight: 6,
                  background: item.severity === 'high' ? '#dc2626' : item.severity === 'medium' ? '#f59e0b' : '#9ca3af',
                }} />
                {item.label}
              </li>
            ))}
          </ul>
        )}

        {summary.isCleared && summary.settledOn && (
          <div style={{ fontSize: 12, color: '#047857', marginTop: 8 }}>
            Settled {summary.settledOn} by {summary.settledBy}
          </div>
        )}
      </div>

      {/* Exit facts */}
      <form onSubmit={saveExitFacts} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: 18, marginBottom: 18 }}>
        <h2 style={{ margin: '0 0 14px 0', fontSize: 16, fontWeight: 800, color: '#111827' }}>Exit details</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
            Last working day
            <input type="date" name="last_working_day" defaultValue={record?.last_working_day || employee.date_of_leaving || ''}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '7px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1' }} />
          </label>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
            Exit type
            <select name="exit_type" defaultValue={record?.exit_type || ''}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '7px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1' }}>
              <option value="">Not recorded</option>
              {EXIT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
            Notice period (days)
            <input type="number" name="notice_period_days" defaultValue={record?.notice_period_days ?? ''}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '7px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1' }} />
          </label>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
            Gratuity payable (₹)
            <input type="number" name="gratuity_payable" defaultValue={record?.gratuity_payable ?? 0}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '7px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1' }} />
          </label>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
            Last salary paid on
            <input type="date" name="last_salary_paid_date" defaultValue={record?.last_salary_paid_date || ''}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '7px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1' }} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#374151', marginTop: 18 }}>
            <input type="checkbox" name="notice_served" defaultChecked={record?.notice_served || false} />
            Notice served
          </label>
        </div>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 14 }}>
          Remarks
          <textarea name="open_remarks" rows={2} defaultValue={record?.open_remarks || ''}
            style={{ display: 'block', width: '100%', marginTop: 4, padding: '7px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontFamily: 'inherit' }} />
        </label>
        <button type="submit" disabled={saving}
          style={{ background: saving ? '#9ca3af' : '#2563eb', color: 'white', border: 'none', padding: '9px 20px', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer' }}>
          {saving ? 'Saving…' : 'Save exit details'}
        </button>
      </form>

      {/* Uniform + assets */}
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: 18, marginBottom: 18 }}>
        <h2 style={{ margin: '0 0 14px 0', fontSize: 16, fontWeight: 800, color: '#111827' }}>Uniform and assets</h2>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Uniform returned:</span>
          {[true, false].map(v => (
            <button key={String(v)} onClick={() => patch({ uniform_returned: v })}
              style={{
                padding: '6px 16px', borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: 'pointer',
                background: record?.uniform_returned === v ? (v ? '#059669' : '#dc2626') : '#f3f4f6',
                color: record?.uniform_returned === v ? 'white' : '#374151',
                border: '1px solid #d1d5db',
              }}>
              {v ? 'Yes' : 'No'}
            </button>
          ))}
          {record?.uniform_returned === null || record?.uniform_returned === undefined ? (
            <span style={{ fontSize: 12, color: '#92400e' }}>Not yet confirmed</span>
          ) : null}
        </div>

        {summary.assetsIssued === 0 ? (
          <p style={{ fontSize: 13, color: '#6b7280' }}>No assets recorded.</p>
        ) : (
          <div style={{ marginBottom: 12 }}>
            {(record?.assets_issued || []).map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ flex: 1, fontSize: 13, color: '#111827' }}>{a.name}</span>
                <button onClick={() => toggleAsset(i)}
                  style={{
                    padding: '4px 12px', borderRadius: 5, fontWeight: 700, fontSize: 11, cursor: 'pointer',
                    background: a.returned ? '#ecfdf5' : '#fef2f2',
                    color: a.returned ? '#065f46' : '#991b1b',
                    border: `1px solid ${a.returned ? '#a7f3d0' : '#fecaca'}`,
                  }}>
                  {a.returned ? '✓ Returned' : '✗ Not returned'}
                </button>
                <button onClick={() => removeAsset(i)}
                  style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 16 }}>×</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
          <input value={assetRow.name} onChange={e => setAssetRow({ ...assetRow, name: e.target.value })}
            placeholder="Asset name (e.g. Apron, ID card, torch)"
            style={{ flex: '1 1 200px', padding: '7px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: 13 }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#374151' }}>
            <input type="checkbox" checked={assetRow.returned} onChange={e => setAssetRow({ ...assetRow, returned: e.target.checked })} />
            Already returned
          </label>
          <button onClick={addAsset}
            style={{ background: '#334155', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
            Add asset
          </button>
        </div>
      </div>

      {/* Deposits and dues */}
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: 18, marginBottom: 18 }}>
        <h2 style={{ margin: '0 0 14px 0', fontSize: 16, fontWeight: 800, color: '#111827' }}>Deposits and dues</h2>

        {deposits.length === 0 ? (
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>No deposits recorded for this employee.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 12 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['Type', 'Amount', 'Recorded', ''].map((h, i) => (
                  <th key={i} style={{ textAlign: 'left', padding: '7px 10px', borderBottom: '1px solid #e5e7eb', fontWeight: 700, color: '#6b7280', fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {deposits.map(d => (
                <tr key={d.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '7px 10px' }}>{d.deposit_type === 'uniform' ? 'Uniform' : 'Accommodation'}</td>
                  <td style={{ padding: '7px 10px', fontWeight: Number(d.amount) > 0 ? 700 : 400, color: Number(d.amount) > 0 ? '#111827' : '#9ca3af' }}>
                    ₹{Number(d.amount || 0).toLocaleString('en-IN')}
                    {Number(d.amount) === 0 && <span style={{ marginLeft: 6, fontSize: 10, color: '#b45309' }}>not recorded</span>}
                  </td>
                  <td style={{ padding: '7px 10px', color: '#6b7280' }}>{d.date_recorded || '—'}</td>
                  <td style={{ padding: '7px 10px' }}>
                    {Number(d.amount) > 0 && (
                      <button onClick={() => patch({ deposit_settled: true }, '✓ Deposits marked settled.')}
                        disabled={record?.deposit_settled}
                        style={{
                          background: record?.deposit_settled ? '#ecfdf5' : '#f3f4f6',
                          color: record?.deposit_settled ? '#065f46' : '#374151',
                          border: '1px solid #d1d5db', padding: '4px 10px', borderRadius: 5, fontWeight: 700, fontSize: 11, cursor: 'pointer',
                        }}>
                        {record?.deposit_settled ? '✓ Settled' : 'Mark settled'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h3 style={{ margin: '16px 0 8px 0', fontSize: 13, fontWeight: 800, color: '#374151' }}>Pending dues</h3>
        {(record?.pending_dues || []).length === 0 ? (
          <p style={{ fontSize: 13, color: '#6b7280' }}>No pending dues recorded.</p>
        ) : (
          (record?.pending_dues || []).map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid #f3f4f6', fontSize: 13 }}>
              <span style={{ flex: 1 }}>{d.label}</span>
              <span style={{ fontWeight: 700, color: '#991b1b' }}>₹{Number(d.amount || 0).toLocaleString('en-IN')}</span>
              <button onClick={() => removeDue(i)}
                style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 16 }}>×</button>
            </div>
          ))
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <input value={dueRow.label} onChange={e => setDueRow({ ...dueRow, label: e.target.value })}
            placeholder="Due (e.g. Uniform damage, advance pending)"
            style={{ flex: '1 1 200px', padding: '7px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: 13 }} />
          <input value={dueRow.amount} onChange={e => setDueRow({ ...dueRow, amount: e.target.value })}
            placeholder="₹" type="number"
            style={{ width: 110, padding: '7px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: 13 }} />
          <button onClick={addDue}
            style={{ background: '#334155', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
            Add due
          </button>
        </div>
      </div>

      {/* Printable form */}
      {showPrint && (
        <div style={{ background: 'white', border: '2px solid #d1d5db', borderRadius: 8, padding: 32, marginTop: 20 }}>
          <div className="no-print" style={{ marginBottom: 16 }}>
            <button onClick={() => window.print()}
              style={{ padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>Print this form</button>
          </div>
          <h1 style={{ textAlign: 'center', fontSize: 20 }}>Exit Clearance Form</h1>
          <p style={{ fontSize: 13 }}>
            <strong>Name:</strong> {employee.name}<br />
            <strong>Designation:</strong> {employee.designation}<br />
            <strong>Department:</strong> {employee.department}<br />
            <strong>Date of joining:</strong> {employee.date_of_joining || '—'}<br />
            <strong>Last working day:</strong> {record?.last_working_day || employee.date_of_leaving || '—'}<br />
            <strong>Exit type:</strong> {record?.exit_type || '—'}<br />
            <strong>Exit reason:</strong> {employee.exit_reason ? employee.exit_reason.replace(/_/g, ' ') : '—'}<br />
            <strong>Notice served:</strong> {record?.notice_served ? `Yes (${record?.notice_period_days ?? '—'} days)` : 'No'}<br />
            <strong>Gratuity:</strong> ₹{Number(record?.gratuity_payable || 0).toLocaleString('en-IN')}{record?.gratuity_paid ? ' (paid)' : ''}
          </p>

          <h3 style={{ fontSize: 14, marginTop: 20 }}>Assets issued and return status</h3>
          {summary.assetsIssued === 0 ? <p style={{ fontSize: 13 }}>No assets recorded.</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr><th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: 4 }}>Item</th><th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: 4 }}>Returned?</th></tr></thead>
              <tbody>
                {(record?.assets_issued || []).map((a, i) => (
                  <tr key={i}><td style={{ padding: 4 }}>{a.name}</td><td style={{ padding: 4 }}>{a.returned ? 'Yes' : 'No'}</td></tr>
                ))}
              </tbody>
            </table>
          )}

          <p style={{ fontSize: 13, marginTop: 12 }}>Uniform returned: <strong>{record?.uniform_returned ? 'Yes' : 'No'}</strong></p>

          <h3 style={{ fontSize: 14, marginTop: 20 }}>Deposits held</h3>
          {summary.depositsTotal > 0 ? (
            <p style={{ fontSize: 13 }}>Total held: <strong>₹{summary.depositsTotal.toLocaleString('en-IN')}</strong> — {record?.deposit_settled ? 'settled' : 'to be refunded pending clearance, less any deductions for unreturned items'}.</p>
          ) : (
            <p style={{ fontSize: 13 }}>No deposit amounts recorded.</p>
          )}

          <h3 style={{ fontSize: 14, marginTop: 20 }}>Outstanding items</h3>
          {summary.openCount === 0 ? <p style={{ fontSize: 13 }}>None.</p> : (
            <ul style={{ fontSize: 13 }}>
              {summary.openItems.map(i => <li key={i.key}>{i.label}</li>)}
            </ul>
          )}

          <p style={{ fontSize: 15, marginTop: 18 }}>
            Overall clearance status: <strong>{summary.isCleared ? 'CLEARED' : 'PENDING'}</strong>
            {summary.settledOn && <> (settled {summary.settledOn} by {summary.settledBy})</>}
          </p>

          <p style={{ marginTop: 24, fontSize: 13 }}>
            I confirm that all assets and uniform issued to me during my employment have been returned as indicated above.
          </p>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 48 }}>
            <div>_____________________<br />Employee signature &amp; date</div>
            <div>_____________________<br />HR signature &amp; date</div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @media print {
          nav, .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
}