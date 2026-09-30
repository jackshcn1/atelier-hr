'use client';
import { useState, useEffect, useMemo } from 'react';
import { createClient } from '../../../../lib/supabaseClient';
import { computeEmployeeVariablePayout } from '../../../../lib/variablePayCalculator';

// Format a cycle range as "20 Aug – 19 Sep", showing the year only when the
// cycle straddles two years.
function fmtPeriodRange(p) {
  if (!p) return '—';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const one = (iso) => {
    const [y, m, d] = String(iso).split('-');
    return `${Number(d)} ${MONTHS[Number(m) - 1]}`;
  };
  const sy = String(p.period_start).slice(0, 4);
  const ey = String(p.period_end).slice(0, 4);
  const range = `${one(p.period_start)} – ${one(p.period_end)}`;
  return sy === ey ? range : `${range} ${ey}`;
}

function attainmentTone(pct) {
  if (pct >= 100) return { bg: '#ecfdf5', fg: '#065f46', bar: '#10b981' };
  if (pct > 0) return { bg: '#fffbeb', fg: '#92400e', bar: '#f59e0b' };
  return { bg: '#f9fafb', fg: '#6b7280', bar: '#d1d5db' };
}

function fmt(value, unit) {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (unit === '₹') return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  if (unit === '%') return (n * 100).toFixed(0) + '%';
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

export default function VariablePayAttainmentPage() {
  const supabase = createClient();

  const [periods, setPeriods] = useState([]);
  const [periodId, setPeriodId] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [schemes, setSchemes] = useState([]);
  const [metricInputs, setMetricInputs] = useState([]);
  const [snapshots, setSnapshots] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const [search, setSearch] = useState('');
  const [schemeFilter, setSchemeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('attainment');

  const [isAdmin, setIsAdmin] = useState(false);

  async function loadAll() {
    setLoading(true);
    setError('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    const perms = prof?.permissions || {};
    const privileged =
      prof?.access_status !== 'inactive' &&
      (prof?.is_super_admin || prof?.role === 'super_admin' || prof?.role === 'admin' ||
        perms.manage_settings === true || perms.view_payroll === true);
    setIsAdmin(!!privileged);

    const { data: pList } = await supabase
      .from('variable_pay_periods').select('*').order('period_start', { ascending: false });
    const periodRows = pList || [];
    setPeriods(periodRows);

    const active = periodRows.find(p => p.status === 'open') || periodRows[0];
    if (active) setPeriodId(active.id);

    const [{ data: eList }, { data: sList }] = await Promise.all([
      supabase.from('employees').select('*').is('deleted_at', null).order('name'),
      supabase.from('variable_pay_schemes').select('*').eq('is_active', true),
    ]);
    setEmployees(eList || []);
    setSchemes(sList || []);

    if (active) await loadPeriodData(active.id, periodRows);
    setLoading(false);
  }

  async function loadPeriodData(pid, periodRows) {
    const list = periodRows || periods;
    const period = list.find(p => p.id === pid);
    const closed = period?.status === 'locked' || period?.status === 'paid';

    const { data: inputs } = await supabase
      .from('variable_metric_inputs').select('*').eq('period_id', pid);
    setMetricInputs(closed ? [] : (inputs || []));

    const { data: snap } = await supabase
      .from('variable_pay_snapshot').select('*').eq('period_id', pid);
    setSnapshots(snap || []);
  }

  useEffect(() => { loadAll(); }, []);

  async function handlePeriodChange(pid) {
    setPeriodId(pid);
    setMessage(''); setError('');
    await loadPeriodData(Number(pid), periods);
  }

  async function regenerateSnapshot() {
    if (!periodId) return;
    if (!window.confirm(
      'Regenerate the frozen snapshot for this cycle?\n\n' +
      'This overwrites the saved figures for every employee. Use this when a ' +
      'metric was corrected after the cycle closed.'
    )) return;

    setBusy(true); setError(''); setMessage('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const res = await fetch('/api/payroll/variable-pay/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user?.access_token || ''}` },
        body: JSON.stringify({ periodId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not regenerate snapshot.');
      setMessage(`✓ Snapshot regenerated (${body.rows} metric rows).`);
      await loadPeriodData(periodId, periods);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const currentPeriod = useMemo(() => periods.find(p => p.id === periodId) || null, [periods, periodId]);
  const isClosed = currentPeriod?.status === 'locked' || currentPeriod?.status === 'paid';

  // Build one row per employee, from the snapshot for a closed cycle and from
  // the live inputs for the current one.
  const rows = useMemo(() => {
    const out = [];

    employees
      .filter(e => e.variable_pay_scheme)
      .forEach(emp => {
        const scheme = schemes.find(s => s.name === emp.variable_pay_scheme);
        if (!scheme) return;
        const pool = Number(emp.current_variable_salary || 0);

        let breakdown;
        if (isClosed) {
          const mine = snapshots.filter(s => s.employee_id === emp.employee_id);
          if (mine.length === 0) return;
          const total = mine.reduce((s, r) => s + Number(r.payout_amount || 0), 0);
          breakdown = mine.map(r => ({
            metric_id: r.metric_id, metric_name: r.metric_name,
            actual: Number(r.actual_value || 0), target: Number(r.target_value || 0),
            floor: r.floor_value !== null ? Number(r.floor_value) : null,
            ceiling: r.ceiling_value !== null ? Number(r.ceiling_value) : null,
            weight: Number(r.weight || 0), unit: r.metric_unit || '',
            type: r.metric_type, direction: r.metric_direction,
            attainmentRate: Number(r.attainment_rate || 0),
            attainmentPct: Number(r.attainment_pct || 0),
            payoutAmount: Number(r.payout_amount || 0),
          }));
        } else {
          const actualInputs = {};
          (scheme.metrics || []).forEach(m => {
            const rec = metricInputs.find(
              i => i.metric_id === m.id && (i.employee_id === emp.employee_id || i.employee_id === null)
            );
            actualInputs[m.id] = rec?.actual_value ?? null;
          });
          breakdown = computeEmployeeVariablePayout(scheme, actualInputs, pool).breakdown;
        }

        const totalPayout = breakdown.reduce((s, b) => s + (b.payoutAmount || 0), 0);
        out.push({
          employee: emp,
          schemeName: scheme.name,
          schemeDisplay: scheme.display_name,
          pool,
          breakdown,
          totalPayout,
          attainmentPct: pool > 0 ? Math.round((totalPayout / pool) * 1000) / 10 : 0,
        });
      });

    return out;
  }, [employees, schemes, metricInputs, snapshots, isClosed]);

  const filtered = useMemo(() => {
    let list = rows;
    if (schemeFilter !== 'all') list = list.filter(r => r.schemeName === schemeFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(r =>
        r.employee.name?.toLowerCase().includes(q) ||
        String(r.employee.employee_id).toLowerCase().includes(q) ||
        r.employee.department?.toLowerCase().includes(q)
      );
    }
    const sorted = [...list];
    if (sortBy === 'attainment') sorted.sort((a, b) => b.attainmentPct - a.attainmentPct);
    else if (sortBy === 'name') sorted.sort((a, b) => (a.employee.name || '').localeCompare(b.employee.name || ''));
    else if (sortBy === 'payout') sorted.sort((a, b) => b.totalPayout - a.totalPayout);
    return sorted;
  }, [rows, schemeFilter, search, sortBy]);

  const summary = useMemo(() => {
    if (filtered.length === 0) return null;
    const totalPayout = filtered.reduce((s, r) => s + r.totalPayout, 0);
    const avg = filtered.reduce((s, r) => s + r.attainmentPct, 0) / filtered.length;
    const full = filtered.filter(r => r.attainmentPct >= 100).length;
    return { count: filtered.length, totalPayout, avg: Math.round(avg * 10) / 10, full };
  }, [filtered]);

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading attainment dashboard…</div>;
  }

  return (
    <div style={{ paddingBottom: 60 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: '0 0 4px 0', fontSize: 24, fontWeight: 800, color: '#111827' }}>
            📊 Variable Pay Attainment
          </h1>
          <p style={{ color: '#666', margin: 0, fontSize: 14 }}>
            Every employee's attainment against target for the selected cycle.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={periodId || ''} onChange={e => handlePeriodChange(e.target.value)}
            style={{ padding: '7px 12px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontWeight: 700, fontSize: 13 }}>
            {periods.map(p => (
              <option key={p.id} value={p.id}>
                {fmtPeriodRange(p)} ({p.status === 'open' ? '🟢 Live' : p.status === 'locked' ? '🔒 Closed' : '✅ Paid'})
              </option>
            ))}
          </select>
          <a href="/payroll/variable-pay"
            style={{ background: '#6b7280', color: 'white', padding: '7px 14px', borderRadius: 6, textDecoration: 'none', fontWeight: 700, fontSize: 12 }}>
            ⬅ Data Upload Hub
          </a>
        </div>
      </div>

      {!isAdmin && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 14, marginBottom: 16, color: '#991b1b', fontSize: 13 }}>
          ⚠️ This page is for payroll administrators. Your own figures are on the Variable Pay page.
        </div>
      )}

      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: 12, marginBottom: 14, color: '#991b1b', fontSize: 13 }}>{error}</div>}
      {message && <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 6, padding: 12, marginBottom: 14, color: '#065f46', fontSize: 13 }}>{message}</div>}

      {/* Cycle status + snapshot controls */}
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ fontSize: 13, color: '#374151' }}>
          <strong>Cycle {fmtPeriodRange(currentPeriod)}</strong>
          <span style={{ marginLeft: 10, color: '#6b7280' }}>
            {isClosed
              ? '🔒 Closed — figures are frozen from the snapshot taken when the cycle ended.'
              : '🟢 Live — recalculates from the current sync data.'}
          </span>
          {currentPeriod?.snapshot_at && (
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
              Snapshot taken {new Date(currentPeriod.snapshot_at).toLocaleString('en-IN')} by {currentPeriod.snapshot_generated_by}
            </div>
          )}
        </div>
        {isAdmin && (
          <button onClick={regenerateSnapshot} disabled={busy}
            style={{ background: busy ? '#9ca3af' : '#2563eb', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: busy ? 'not-allowed' : 'pointer' }}>
            {busy ? 'Regenerating…' : '🔄 Regenerate Snapshot'}
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, marginBottom: 18, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, ID or department…"
          style={{ flex: '1 1 220px', padding: '7px 12px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: 13 }} />
        <select value={schemeFilter} onChange={e => setSchemeFilter(e.target.value)}
          style={{ padding: '7px 12px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: 13 }}>
          <option value="all">All schemes</option>
          {schemes.map(s => <option key={s.id} value={s.name}>{s.display_name}</option>)}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          style={{ padding: '7px 12px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: 13 }}>
          <option value="attainment">Sort: attainment (high → low)</option>
          <option value="payout">Sort: payout (high → low)</option>
          <option value="name">Sort: name (A → Z)</option>
        </select>
      </div>

      {/* Summary */}
      {summary && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          {[
            { label: 'Employees on schemes', value: summary.count },
            { label: 'Average attainment', value: `${summary.avg}%` },
            { label: 'At or above target', value: summary.full },
            { label: 'Total variable payout', value: '₹' + summary.totalPayout.toLocaleString('en-IN') },
          ].map(s => (
            <div key={s.label} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 18px', flex: '1 1 180px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#111827', marginTop: 2 }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: 40, textAlign: 'center', color: '#6b7280' }}>
          {rows.length === 0
            ? 'No employees currently have a variable pay scheme assigned. Assign schemes under Employees → View / Edit.'
            : 'No employees match your filters.'}
        </div>
      ) : (
        filtered.map(r => {
          const tone = attainmentTone(r.attainmentPct);
          return (
            <div key={r.employee.employee_id} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: 18, marginBottom: 14 }}>
              {/* Employee header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>{r.employee.name}</span>
                    <span style={{ background: '#f3f4f6', color: '#374151', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{r.employee.designation || 'Staff'}</span>
                    <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{r.employee.department || 'All'}</span>
                    <span style={{ background: '#ede9fe', color: '#6d28d9', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{r.schemeDisplay}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                    ID {r.employee.employee_id} · Variable pool ₹{r.pool.toLocaleString('en-IN')}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', padding: '4px 14px', borderRadius: 20, fontSize: 13, fontWeight: 800, background: tone.bg, color: tone.fg }}>
                    {r.attainmentPct}% attained
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#111827', marginTop: 4 }}>
                    ₹{r.totalPayout.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>

              {/* Per-metric table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f9fafb' }}>
                      {['Metric', 'Actual', 'Target', 'Floor', 'Weight', 'Attainment', 'Payout'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '7px 10px', borderBottom: '1px solid #e5e7eb', fontWeight: 700, color: '#6b7280', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {r.breakdown.map(b => {
                      const m = (schemes.find(s => s.name === r.schemeName)?.metrics || []).find(x => x.id === b.metric_id);
                      const unit = b.unit || m?.unit || '';
                      const bt = attainmentTone(b.attainmentPct);
                      return (
                        <tr key={b.metric_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '7px 10px', fontWeight: 600, color: '#111827' }}>
                            {b.metric_name}
                            {m?.scope === 'team' && <span style={{ marginLeft: 6, fontSize: 10, color: '#7c3aed', fontWeight: 700 }}>TEAM</span>}
                          </td>
                          <td style={{ padding: '7px 10px', color: '#374151', whiteSpace: 'nowrap' }}>{fmt(b.actual, unit)}</td>
                          <td style={{ padding: '7px 10px', color: '#374151', whiteSpace: 'nowrap' }}>{fmt(b.target, unit)}</td>
                          <td style={{ padding: '7px 10px', color: '#6b7280', whiteSpace: 'nowrap' }}>{b.floor === null || b.floor === undefined ? '—' : fmt(b.floor, unit)}</td>
                          <td style={{ padding: '7px 10px', color: '#6b7280', whiteSpace: 'nowrap' }}>{Math.round(Number(b.weight || 0) * 100)}%</td>
                          <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontWeight: 800, color: bt.fg, minWidth: 44 }}>{b.attainmentPct || 0}%</span>
                              <div style={{ width: 60, height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{ width: `${Math.min(Math.max(b.attainmentPct || 0, 0), 100)}%`, height: '100%', background: bt.bar }} />
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '7px 10px', fontWeight: 700, color: (b.payoutAmount || 0) > 0 ? '#059669' : '#9ca3af', whiteSpace: 'nowrap' }}>
                            ₹{Number(b.payoutAmount || 0).toLocaleString('en-IN')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}