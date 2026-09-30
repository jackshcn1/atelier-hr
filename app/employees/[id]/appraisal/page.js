'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '../../../../lib/supabaseClient';
import { computeSalarySplit } from '../../../../lib/salarySplit';

const RATING_LABELS = {
  5: 'Outstanding',
  4: 'Exceeds expectations',
  3: 'Meets expectations',
  2: 'Needs improvement',
  1: 'Unsatisfactory',
};

const RATING_COLOURS = {
  5: { bg: '#ecfdf5', fg: '#065f46' },
  4: { bg: '#f0fdf4', fg: '#166534' },
  3: { bg: '#fffbeb', fg: '#92400e' },
  2: { bg: '#fff7ed', fg: '#9a3412' },
  1: { bg: '#fef2f2', fg: '#991b1b' },
};

const EMPTY_FORM = {
  appraisal_date: new Date().toISOString().slice(0, 10),
  period_covered: '',
  rating: 3,
  new_designation: '',
  remarks: '',
  next_review_date: '',
  apply_salary_change: false,
  new_fixed: '',
  new_variable: '',
  salary_reason: 'Performance appraisal',
};

export default function EmployeeAppraisalPage() {
  const { id } = useParams();
  const router = useRouter();
  const supabase = createClient();

  const [employee, setEmployee] = useState(null);
  const [appraisals, setAppraisals] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    setLoading(true);
    const [{ data: emp }, { data: list }, { data: desig }] = await Promise.all([
      supabase.from('employees').select('*').eq('employee_id', id).maybeSingle(),
      supabase.from('employee_appraisals').select('*').eq('employee_id', id).order('appraisal_date', { ascending: false }),
      supabase.from('designations').select('name').order('name'),
    ]);
    setEmployee(emp || null);
    setAppraisals(list || []);
    setDesignations((desig || []).map(d => d.name));
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  async function saveAppraisal(e) {
    e.preventDefault();
    setError(''); setMessage('');
    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      // An appraisal may carry a salary change with it. Write the salary row
      // first so the appraisal can reference it, reusing the same split logic
      // as the manual salary-change form.
      let salaryChangeId = null;
      if (form.apply_salary_change && form.new_fixed) {
        const { data: settings } = await supabase.from('payroll_settings').select('*').eq('id', 1).single();
        const split = computeSalarySplit(Number(form.new_fixed), settings);

        const { data: salRow, error: salErr } = await supabase.from('salary_history').insert([{
          employee_id: id,
          fixed: Number(form.new_fixed),
          variable: Number(form.new_variable || 0),
          ...split,
          effective_from: form.appraisal_date,
          changed_by: user?.email || 'unknown',
          reason: form.salary_reason || 'Performance appraisal',
        }]).select().single();

        if (salErr) throw salErr;
        salaryChangeId = salRow.id;

        const prevFixed = Number(employee?.current_fixed_salary || 0);
        const prevVariable = Number(employee?.current_variable_salary || 0);

        await supabase.from('employees').update({
          current_fixed_salary: Number(form.new_fixed),
          current_variable_salary: Number(form.new_variable || 0),
        }).eq('employee_id', id);

        await supabase.from('audit_log').insert([{
          actor: user?.email || 'unknown',
          action: 'changed salary (appraisal)',
          record_affected: `${id} (${employee?.name || ''}) — fixed ₹${prevFixed.toLocaleString('en-IN')} → ₹${Number(form.new_fixed).toLocaleString('en-IN')}, ` +
            `variable ₹${prevVariable.toLocaleString('en-IN')} → ₹${Number(form.new_variable || 0).toLocaleString('en-IN')} — effective ${form.appraisal_date}`,
        }]);
      }

      const { error: appErr } = await supabase.from('employee_appraisals').insert([{
        employee_id: id,
        appraisal_date: form.appraisal_date,
        period_covered: form.period_covered || null,
        rating: Number(form.rating),
        rating_label: RATING_LABELS[form.rating] || null,
        previous_designation: employee?.designation || null,
        new_designation: form.new_designation || null,
        salary_change_id: salaryChangeId,
        salary_change_applied: !!salaryChangeId,
        reviewer: user?.email || 'unknown',
        remarks: form.remarks || null,
        next_review_date: form.next_review_date || null,
      }]);

      if (appErr) throw appErr;

      // A designation change is part of the same event.
      if (form.new_designation && form.new_designation !== employee?.designation) {
        await supabase.from('employees').update({ designation: form.new_designation }).eq('employee_id', id);
      }

      setMessage('✓ Appraisal recorded.');
      setForm({ ...EMPTY_FORM, appraisal_date: new Date().toISOString().slice(0, 10) });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteAppraisal(appraisalId) {
    if (!window.confirm('Delete this appraisal? Any salary change it made will stay in salary history.')) return;
    const { error: delErr } = await supabase.from('employee_appraisals').delete().eq('id', appraisalId);
    if (delErr) { setError(delErr.message); return; }
    await load();
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading appraisals…</div>;
  if (!employee) return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Employee not found.</div>;

  const rated = appraisals.filter(a => a.rating);
  const avgRating = rated.length > 0
    ? Math.round((rated.reduce((s, a) => s + Number(a.rating), 0) / rated.length) * 10) / 10
    : null;
  const latest = appraisals[0] || null;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', paddingBottom: 60 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: '0 0 4px 0', fontSize: 22, fontWeight: 800, color: '#111827' }}>
            Performance Appraisals
          </h1>
          <p style={{ color: '#666', margin: 0, fontSize: 14 }}>
            {employee.name} · {employee.designation || 'Staff'} · {employee.department || 'All'}
          </p>
        </div>
        <a href={`/employees/${id}`}
          style={{ background: '#6b7280', color: 'white', padding: '7px 14px', borderRadius: 6, textDecoration: 'none', fontWeight: 700, fontSize: 12 }}>
          ← Back to employee
        </a>
      </div>

      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: 12, marginBottom: 14, color: '#991b1b', fontSize: 13 }}>{error}</div>}
      {message && <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 6, padding: 12, marginBottom: 14, color: '#065f46', fontSize: 13 }}>{message}</div>}

      {/* Summary */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        {[
          { label: 'Appraisals recorded', value: appraisals.length },
          { label: 'Average rating', value: avgRating !== null ? `${avgRating} / 5` : '—' },
          { label: 'Latest rating', value: latest ? `${latest.rating} / 5` : '—' },
          { label: 'Next review due', value: latest?.next_review_date || '—' },
        ].map(s => (
          <div key={s.label} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 18px', flex: '1 1 170px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#111827', marginTop: 2 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Record a new appraisal */}
      <form onSubmit={saveAppraisal} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: 18, marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 14px 0', fontSize: 16, fontWeight: 800, color: '#111827' }}>Record an appraisal</h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
            Appraisal date
            <input type="date" required value={form.appraisal_date}
              onChange={e => setForm({ ...form, appraisal_date: e.target.value })}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '7px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1' }} />
          </label>

          <label style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
            Period covered
            <input type="text" placeholder="e.g. Aug 20 – Sep 19" value={form.period_covered}
              onChange={e => setForm({ ...form, period_covered: e.target.value })}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '7px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1' }} />
          </label>

          <label style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
            Rating
            <select value={form.rating} onChange={e => setForm({ ...form, rating: Number(e.target.value) })}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '7px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1' }}>
              {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n} — {RATING_LABELS[n]}</option>)}
            </select>
          </label>

          <label style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
            Change designation
            <select value={form.new_designation} onChange={e => setForm({ ...form, new_designation: e.target.value })}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '7px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1' }}>
              <option value="">No change</option>
              {designations.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
        </div>

        {/* Optional salary change */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.apply_salary_change}
            onChange={e => setForm({ ...form, apply_salary_change: e.target.checked })} />
          Increase salary as part of this appraisal
        </label>

        {form.apply_salary_change && (
          <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
                New fixed salary
                <input type="number" required value={form.new_fixed} placeholder={String(employee.current_fixed_salary || 0)}
                  onChange={e => setForm({ ...form, new_fixed: e.target.value })}
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: '7px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1' }} />
              </label>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
                New variable salary
                <input type="number" value={form.new_variable} placeholder={String(employee.current_variable_salary || 0)}
                  onChange={e => setForm({ ...form, new_variable: e.target.value })}
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: '7px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1' }} />
              </label>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
                Reason
                <input type="text" value={form.salary_reason}
                  onChange={e => setForm({ ...form, salary_reason: e.target.value })}
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: '7px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1' }} />
              </label>
            </div>
            <p style={{ fontSize: 11, color: '#6b7280', marginTop: 8, marginBottom: 0 }}>
              Currently ₹{Number(employee.current_fixed_salary || 0).toLocaleString('en-IN')} fixed +
              ₹{Number(employee.current_variable_salary || 0).toLocaleString('en-IN')} variable. This writes a dated
              salary history row and is recorded in the audit trail.
            </p>
          </div>
        )}

        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 12 }}>
          Remarks
          <textarea value={form.remarks} rows={3} onChange={e => setForm({ ...form, remarks: e.target.value })}
            style={{ display: 'block', width: '100%', marginTop: 4, padding: '7px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontFamily: 'inherit' }} />
        </label>

        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 14 }}>
          Next review date
          <input type="date" value={form.next_review_date}
            onChange={e => setForm({ ...form, next_review_date: e.target.value })}
            style={{ display: 'block', width: '190px', marginTop: 4, padding: '7px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1' }} />
        </label>

        <button type="submit" disabled={saving}
          style={{ background: saving ? '#9ca3af' : '#2563eb', color: 'white', border: 'none', padding: '9px 20px', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer' }}>
          {saving ? 'Saving…' : 'Save appraisal'}
        </button>
      </form>

      {/* History */}
      <h2 style={{ margin: '0 0 12px 0', fontSize: 16, fontWeight: 800, color: '#111827' }}>
        Appraisal history ({appraisals.length})
      </h2>

      {appraisals.length === 0 ? (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: 32, textAlign: 'center', color: '#6b7280' }}>
          No appraisals recorded yet.
        </div>
      ) : (
        appraisals.map(a => {
          const tone = RATING_COLOURS[Number(a.rating)] || RATING_COLOURS[3];
          return (
            <div key={a.id} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>{a.appraisal_date}</span>
                    <span style={{ background: tone.bg, color: tone.fg, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 800 }}>
                      {a.rating} / 5 — {a.rating_label}
                    </span>
                    {a.salary_change_applied && (
                      <span style={{ background: '#ecfdf5', color: '#065f46', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>💰 Salary updated</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                    Reviewed by {a.reviewer}
                    {a.period_covered && <> · Period: {a.period_covered}</>}
                    {a.next_review_date && <> · Next review {a.next_review_date}</>}
                  </div>
                  {a.new_designation && a.new_designation !== a.previous_designation && (
                    <div style={{ fontSize: 12, color: '#0369a1', marginTop: 3 }}>
                      Designation: {a.previous_designation || '—'} → <strong>{a.new_designation}</strong>
                    </div>
                  )}
                </div>
                <button onClick={() => deleteAppraisal(a.id)}
                  style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', padding: '5px 12px', borderRadius: 5, fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                    Delete
                  </button>
              </div>
              {a.remarks && (
                <p style={{ fontSize: 13, color: '#374151', marginTop: 10, marginBottom: 0, whiteSpace: 'pre-wrap' }}>{a.remarks}</p>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}