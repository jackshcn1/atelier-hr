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
  if (pct >= 100) return { pill: 'pill-good', text: 'text-good', bar: 'bg-good' };
  if (pct > 0) return { pill: 'pill-warn', text: 'text-warn', bar: 'bg-warn' };
  return { pill: 'pill-quiet', text: 'text-ink-muted', bar: 'bg-rule' };
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
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      const res = await fetch('/api/payroll/variable-pay/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
    return (
      <div className="py-24 text-center">
        <p className="text-sm text-ink-muted">Loading attainment dashboard…</p>
      </div>
    );
  }

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="page-head">
        <div>
          <h1 className="page-title">Variable pay attainment</h1>
          <p className="page-purpose">
            Every employee&rsquo;s attainment against target for the selected cycle.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={periodId || ''}
            onChange={e => handlePeriodChange(Number(e.target.value))}
            aria-label="Cycle selector"
            className="field w-auto min-w-[14rem] text-xs py-1.5"
          >
            {periods.map(p => (
              <option key={p.id} value={p.id}>
                {fmtPeriodRange(p)} ({p.status === 'open' ? 'Live' : p.status === 'locked' ? 'Closed' : 'Paid'})
              </option>
            ))}
          </select>
          <a href="/my-variable-pay" className="btn-secondary text-xs">
            My Variable Pay
          </a>
        </div>
      </div>

      {!isAdmin && (
        <div className="note mb-6">
          <p className="text-ink">This page is for payroll administrators.</p>
          <p className="mt-1">Your own figures and metrics are on the My Variable Pay page.</p>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-card border border-bad/30 bg-bad-wash px-4 py-3 text-sm text-bad">
          {error}
        </div>
      )}
      {message && (
        <div className="mb-6 rounded-card border border-good/30 bg-good-wash px-4 py-3 text-sm text-good">
          {message}
        </div>
      )}

      {/* Cycle status + snapshot controls */}
      <div className="panel panel-body mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="text-sm text-ink">
          <strong>Cycle {fmtPeriodRange(currentPeriod)}</strong>
          <span className="ml-3 text-ink-muted text-xs">
            {isClosed
              ? 'Frozen snapshot from when the cycle closed.'
              : 'Live calculation based on current metrics.'}
          </span>
          {currentPeriod?.snapshot_at && (
            <div className="text-2xs text-ink-muted mt-1">
              Snapshot taken {new Date(currentPeriod.snapshot_at).toLocaleString('en-IN')} by {currentPeriod.snapshot_generated_by}
            </div>
          )}
        </div>
        {isAdmin && isClosed && (
          <button
            onClick={regenerateSnapshot}
            disabled={busy}
            className="btn-secondary text-xs"
          >
            {busy ? 'Regenerating…' : 'Regenerate Snapshot'}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="panel p-4 mb-6 flex flex-wrap gap-3 items-center">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, ID or department…"
          className="field flex-1 min-w-[14rem] text-xs py-1.5"
        />
        <select
          value={schemeFilter}
          onChange={e => setSchemeFilter(e.target.value)}
          aria-label="Filter scheme"
          className="field w-auto min-w-[10rem] text-xs py-1.5"
        >
          <option value="all">All schemes</option>
          {schemes.map(s => <option key={s.id} value={s.name}>{s.display_name}</option>)}
        </select>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          aria-label="Sort by"
          className="field w-auto min-w-[11rem] text-xs py-1.5"
        >
          <option value="attainment">Sort: Attainment (high → low)</option>
          <option value="payout">Sort: Payout (high → low)</option>
          <option value="name">Sort: Name (A → Z)</option>
        </select>
      </div>

      {/* Summary KPI row */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="panel p-4">
            <div className="text-2xs font-medium uppercase tracking-wide text-ink-muted">Employees on Schemes</div>
            <div className="text-2xl font-serif mt-1 text-ink">{summary.count}</div>
          </div>
          <div className="panel p-4">
            <div className="text-2xs font-medium uppercase tracking-wide text-ink-muted">Average Attainment</div>
            <div className="text-2xl font-serif mt-1 text-accent">{summary.avg}%</div>
          </div>
          <div className="panel p-4">
            <div className="text-2xs font-medium uppercase tracking-wide text-ink-muted">At or Above Target</div>
            <div className="text-2xl font-serif mt-1 text-good">{summary.full}</div>
          </div>
          <div className="panel p-4">
            <div className="text-2xs font-medium uppercase tracking-wide text-ink-muted">Total Payout Pool</div>
            <div className="text-2xl font-serif mt-1 text-ink">₹{summary.totalPayout.toLocaleString('en-IN')}</div>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="note text-center py-12">
          <p className="text-ink">
            {rows.length === 0
              ? 'No employees currently have a variable pay scheme assigned. Assign schemes under Employees → View / Edit.'
              : 'No employees match your filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(r => {
            const tone = attainmentTone(r.attainmentPct);
            return (
              <div key={r.employee.employee_id} className="panel overflow-hidden">
                {/* Employee header */}
                <div className="flex flex-wrap items-center justify-between gap-4 p-5 border-b border-rule-soft bg-surface">
                  <div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-base font-semibold text-ink">{r.employee.name}</span>
                      <span className="pill-quiet">{r.employee.designation || 'Staff'}</span>
                      <span className="pill-quiet">{r.employee.department || 'All'}</span>
                      <span className="pill bg-accent/10 text-accent font-medium">{r.schemeDisplay}</span>
                    </div>
                    <div className="text-xs text-ink-muted mt-1">
                      ID {r.employee.employee_id} · Variable pool ₹{r.pool.toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={tone.pill}>
                      {r.attainmentPct}% attained
                    </div>
                    <div className="text-base font-semibold text-ink mt-1">
                      ₹{r.totalPayout.toLocaleString('en-IN')}
                    </div>
                  </div>
                </div>

                {/* Per-metric table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-rule bg-page/50">
                        {['Metric', 'Actual', 'Target', 'Floor', 'Weight', 'Attainment', 'Payout'].map(h => (
                          <th key={h} className="table-head">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rule-soft">
                      {r.breakdown.map(b => {
                        const m = (schemes.find(s => s.name === r.schemeName)?.metrics || []).find(x => x.id === b.metric_id);
                        const unit = b.unit || m?.unit || '';
                        const bt = attainmentTone(b.attainmentPct);
                        return (
                          <tr key={b.metric_id} className="hover:bg-page/40 transition-colors">
                            <td className="table-cell font-medium text-ink">
                              {b.metric_name}
                              {m?.scope === 'team' && (
                                <span className="ml-2 text-2xs uppercase tracking-wide text-accent font-semibold">[Team]</span>
                              )}
                            </td>
                            <td className="table-cell whitespace-nowrap text-ink">{fmt(b.actual, unit)}</td>
                            <td className="table-cell whitespace-nowrap text-ink-muted">{fmt(b.target, unit)}</td>
                            <td className="table-cell whitespace-nowrap text-ink-muted">{b.floor === null || b.floor === undefined ? '—' : fmt(b.floor, unit)}</td>
                            <td className="table-cell whitespace-nowrap text-ink-muted">{Math.round(Number(b.weight || 0) * 100)}%</td>
                            <td className="table-cell whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span className={`font-semibold min-w-[3rem] ${bt.text}`}>{b.attainmentPct || 0}%</span>
                                <div className="w-16 h-1.5 bg-rule-soft rounded-full overflow-hidden">
                                  <div
                                    style={{ width: `${Math.min(Math.max(b.attainmentPct || 0, 0), 100)}%` }}
                                    className={`h-full rounded-full ${bt.bar}`}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className={`table-cell whitespace-nowrap font-medium ${(b.payoutAmount || 0) > 0 ? 'text-good' : 'text-ink-muted'}`}>
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
          })}
        </div>
      )}
    </div>
  );
}
