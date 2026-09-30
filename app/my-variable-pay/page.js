'use client';
import { useState, useEffect, useMemo, Suspense } from 'react';
import { createClient } from '../../lib/supabaseClient';
import { computeEmployeeVariablePayout } from '../../lib/variablePayCalculator';

function getDefaultPayrollCycle() {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  let ey = y, em = m;
  if (d < 20) {
    em -= 1;
    if (em < 0) { em = 11; ey -= 1; }
  }
  let sy = ey, sm = em - 1;
  if (sm < 0) { sm = 11; sy -= 1; }
  return {
    start: `${sy}-${String(sm + 1).padStart(2, '0')}-20`,
    end: `${ey}-${String(em + 1).padStart(2, '0')}-19`
  };
}

// Cycle ranges read as "20 Aug – 19 Sep". The year only appears when a cycle
// straddles two years, otherwise it is just noise.
function formatPeriodDates(p) {
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

// Money gets abbreviated so a figure stays scannable; exact values are still
// available on the metric rows below.
function formatMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v === 0) return '—';
  if (Math.abs(v) >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
  if (Math.abs(v) >= 100000) return `₹${(v / 100000).toFixed(2)}L`;
  if (Math.abs(v) >= 1000) return `₹${(v / 1000).toFixed(1)}k`;
  return `₹${v.toLocaleString('en-IN')}`;
}

function formatValue(value, unit) {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (unit === '₹') return n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  if (unit === '%') return `${(n * 100).toFixed(0)}%`;
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function attainmentTone(pct) {
  if (pct >= 100) return { text: 'text-good', fill: 'bg-good', pill: 'pill-good' };
  if (pct > 0) return { text: 'text-warn', fill: 'bg-warn', pill: 'pill-warn' };
  return { text: 'text-ink-muted', fill: 'bg-rule', pill: 'pill-quiet' };
}

function MyVariablePayContent() {
  const supabase = createClient();

  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [isManager, setIsManager] = useState(false);

  const [periods, setPeriods] = useState([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState(null);
  const [allEmployees, setAllEmployees] = useState([]);
  const [selectedEmpId, setSelectedEmpId] = useState(null);
  const [myEmployee, setMyEmployee] = useState(null);
  const [schemes, setSchemes] = useState([]);
  const [metricInputs, setMetricInputs] = useState([]);
  const [snapshotRows, setSnapshotRows] = useState([]);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUserAndInit();
  }, []);

  async function loadUserAndInit() {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUser(user);

    let myProfile = null;
    let privileged = false;
    let targetEmpId = null;

    if (user) {
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
      myProfile = prof;
      setUserProfile(prof);

      privileged = !!(
        prof?.is_super_admin ||
        prof?.role === 'admin' ||
        prof?.role === 'super_admin' ||
        prof?.role === 'hr_manager' ||
        prof?.permissions?.view_payroll ||
        prof?.permissions?.view_employees
      );
      setIsManager(privileged);

      if (prof?.employee_id) {
        targetEmpId = prof.employee_id;
      } else {
        const { data: empMatch } = await supabase.from('employees').select('employee_id').ilike('email', user.email).maybeSingle();
        if (empMatch) targetEmpId = empMatch.employee_id;
      }
    }

    const { data: pList } = await supabase
      .from('variable_pay_periods')
      .select('*')
      .order('period_start', { ascending: false });

    const periodRows = pList || [];
    setPeriods(periodRows);

    const activePeriod = periodRows.find(p => p.status === 'open') || periodRows[0];
    if (activePeriod) setSelectedPeriodId(activePeriod.id);

    const { data: sList } = await supabase.from('variable_pay_schemes').select('*').eq('is_active', true);
    setSchemes(sList || []);

    // A regular employee only ever loads their OWN row. We never issue the
    // bulk "select all employees" query on their behalf.
    if (targetEmpId) {
      const { data: ownEmp } = await supabase
        .from('employees')
        .select('*')
        .eq('employee_id', targetEmpId)
        .maybeSingle();
      if (ownEmp) setMyEmployee(ownEmp);
    }

    // Admins and managers legitimately need the full roster for the switcher.
    if (privileged) {
      const { data: eList } = await supabase
        .from('employees')
        .select('*')
        .is('deleted_at', null)
        .order('name');
      setAllEmployees(eList || []);
    } else {
      setAllEmployees([]);
    }

    setSelectedEmpId(targetEmpId);

    if (activePeriod) await loadInputsForPeriod(activePeriod.id);
    setLoading(false);
  }

  async function loadInputsForPeriod(periodId) {
    if (!periodId) return;
    const period = periods.find(p => p.id === periodId);
    const isClosed = period?.status === 'locked' || period?.status === 'paid';

    if (isClosed) {
      // A closed cycle is frozen: read the snapshot, so later edits or re-syncs
      // can never change what this employee saw for that cycle.
      const { data: snap } = await supabase
        .from('variable_pay_snapshot')
        .select('*')
        .eq('period_id', periodId);
      setSnapshotRows(snap || []);
      setMetricInputs([]);
      return;
    }

    const { data: inputs } = await supabase
      .from('variable_metric_inputs')
      .select('*')
      .eq('period_id', periodId);

    setSnapshotRows([]);
    setMetricInputs(inputs || []);
  }

  async function handlePeriodChange(pId) {
    setSelectedPeriodId(pId);
    await loadInputsForPeriod(pId);
  }

  // For a regular employee this is always their own record — the switcher
  // exists solely for admins.
  const currentEmp = useMemo(() => {
    if (isManager) return allEmployees.find(e => e.employee_id === selectedEmpId) || null;
    return myEmployee;
  }, [allEmployees, selectedEmpId, myEmployee, isManager]);

  const currentPeriod = useMemo(
    () => periods.find(p => p.id === selectedPeriodId) || null,
    [periods, selectedPeriodId]
  );

  const isClosedCycle = currentPeriod?.status === 'locked' || currentPeriod?.status === 'paid';

  const currentScheme = useMemo(() => {
    if (!currentEmp?.variable_pay_scheme) return null;
    return schemes.find(s => s.name === currentEmp.variable_pay_scheme) || null;
  }, [currentEmp, schemes]);

  const liveCalculation = useMemo(() => {
    if (!currentScheme || !currentEmp) return null;

    if (isClosedCycle) {
      const mine = snapshotRows.filter(s => s.employee_id === currentEmp.employee_id);
      if (mine.length === 0) return null;
      const totalPayout = mine.reduce((sum, r) => sum + Number(r.payout_amount || 0), 0);
      return {
        fromSnapshot: true,
        totalPayoutAmount: totalPayout,
        totalEarnedFraction: 0,
        totalEarnedPct: 0,
        breakdown: mine.map(r => ({
          metric_id: r.metric_id,
          metric_name: r.metric_name,
          actual: Number(r.actual_value || 0),
          target: Number(r.target_value || 0),
          floor: r.floor_value !== null ? Number(r.floor_value) : null,
          ceiling: r.ceiling_value !== null ? Number(r.ceiling_value) : null,
          weight: Number(r.weight || 0),
          unit: r.metric_unit || '',
          type: r.metric_type,
          direction: r.metric_direction,
          attainmentRate: Number(r.attainment_rate || 0),
          attainmentPct: Number(r.attainment_pct || 0),
          payoutAmount: Number(r.payout_amount || 0),
        })),
      };
    }

    const actualInputs = {};
    (currentScheme.metrics || []).forEach(m => {
      const row = metricInputs.find(
        i => i.metric_id === m.id && (i.employee_id === currentEmp.employee_id || i.employee_id === null)
      );
      actualInputs[m.id] = row?.actual_value ?? null;
    });

    return { fromSnapshot: false, ...computeEmployeeVariablePayout(currentScheme, actualInputs, Number(currentEmp.current_variable_salary || 0)) };
  }, [currentScheme, currentEmp, metricInputs, snapshotRows, isClosedCycle]);

  if (loading) {
    return (
      <div className="py-24 text-center">
        <p className="text-sm text-ink-muted">Loading your variable pay…</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="panel panel-body max-w-md mx-auto text-center">
        <p className="text-sm text-ink">Sign in to see your variable pay.</p>
        <a href="/login" className="btn-primary mt-4">Sign in</a>
      </div>
    );
  }

  const overall = liveCalculation?.totalEarnedPct || 0;
  const overallTone = attainmentTone(overall);
  const noData = !liveCalculation;

  return (
    <div className="pb-20">
      {/* Page head */}
      <div className="page-head">
        <div>
          <h1 className="page-title">Variable pay</h1>
          <p className="page-purpose">
            How you are tracking against this cycle&rsquo;s targets. Updates each time the
            nightly sync runs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedPeriodId || ''}
            onChange={e => handlePeriodChange(Number(e.target.value))}
            aria-label="Pay cycle"
            className="field w-auto min-w-[13rem] py-1.5 text-xs"
          >
            {periods.map(p => (
              <option key={p.id} value={p.id}>
                {formatPeriodDates(p)} — {p.status === 'open' ? 'Live' : p.status === 'locked' ? 'Closed' : 'Paid'}
              </option>
            ))}
          </select>
          {isManager && (
            <a href="/payroll/variable-pay/attainment" className="btn-secondary">All employees</a>
          )}
        </div>
      </div>

      {/* Manager switcher */}
      {isManager && allEmployees.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-card border border-rule bg-page px-4 py-3">
          <span className="text-xs font-medium text-ink-muted">Viewing</span>
          <select
            value={selectedEmpId || ''}
            onChange={e => setSelectedEmpId(e.target.value)}
            aria-label="Select employee"
            className="field w-auto min-w-[16rem] py-1.5 text-xs"
          >
            {allEmployees.map(emp => (
              <option key={emp.employee_id} value={emp.employee_id}>
                {emp.name} — {emp.designation || 'Staff'}
              </option>
            ))}
          </select>
        </div>
      )}

      {!currentEmp ? (
        <div className="note">
          <p className="text-ink">No employee record is linked to this login yet.</p>
          <p className="mt-1">An administrator can link it under Employees → View / Edit.</p>
        </div>
      ) : currentEmp && !currentScheme ? (
        <div className="note">
          <p className="text-ink">No variable pay scheme is assigned yet.</p>
          <p className="mt-1">
            An administrator assigns schemes under Employees → View / Edit → Payroll.
          </p>
        </div>
      ) : (
        <>
          {/* The one bold moment on the page. Everything else stays quiet so this
              number is the thing you actually came to read. */}
          <section className="panel mb-8 overflow-hidden">
            <div className="flex flex-wrap items-end justify-between gap-6 px-6 py-7">
              <div>
                <div className="text-xs font-medium text-ink-muted">
                  {currentEmp.name} · {formatPeriodDates(currentPeriod)}
                </div>
                <div className={`figure mt-2 ${noData ? 'text-ink-muted' : overallTone.text}`}>
                  {noData ? '—' : `${overall}%`}
                </div>
                <div className="figure-label">
                  of target {isClosedCycle ? '· finalised' : '· live'}
                </div>
              </div>

              <div className="text-right">
                <div className="text-xs font-medium text-ink-muted">Scheme</div>
                <div className="mt-1 text-sm text-ink">{currentScheme?.display_name}</div>
                {liveCalculation && !noData && (
                  <span className={`${overallTone.pill} mt-3`}>
                    {overall >= 100 ? 'On target' : overall > 0 ? 'In progress' : 'Not started'}
                  </span>
                )}
              </div>
            </div>

            {/* A single hairline rule separates live from finalised. */}
            <div className="border-t border-rule-soft px-6 py-3">
              <span className="text-xs text-ink-muted">
                {isClosedCycle
                  ? 'Figures were frozen when this cycle closed on the 19th.'
                  : 'Live figures — refreshes with each nightly sync.'}
              </span>
            </div>
          </section>

          {/* Metric scorecards: flat rows separated by hairlines rather than
              individual cards, so a dozen can be scanned at once. */}
          {liveCalculation && (
            <section>
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="panel-title">Your metrics</h2>
                <span className="text-xs text-ink-muted">
                  Weights total 100% of your variable target
                </span>
              </div>

              <div className="panel overflow-hidden">
                <div className="hairline-list">
                  {liveCalculation.breakdown.map(item => {
                    const metric = (currentScheme.metrics || []).find(m => m.id === item.metric_id) || item;
                    const isProportional = metric.type === 'proportional';
                    const hasFloor = isProportional && metric.floor !== null && metric.floor !== undefined;
                    const isBelowFloor = hasFloor && item.actual !== null && item.actual < Number(metric.floor);
                    const tone = isBelowFloor
                      ? { text: 'text-bad', fill: 'bg-bad', pill: 'pill-bad' }
                      : attainmentTone(item.attainmentPct);
                    const visual = Math.min(Math.max(item.attainmentPct || 0, 0), 100);

                    return (
                      <div key={item.metric_id} className="px-5 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-ink">{item.metric_name}</span>
                              <span className="pill-quiet">{Math.round(Number(item.weight || 0) * 100)}% of target</span>
                              {isProportional
                                ? <span className="pill-quiet">Proportional</span>
                                : <span className="pill-quiet">Hit or miss</span>}
                              {metric.scope === 'team' && <span className="pill-quiet">Team-wide</span>}
                            </div>
                            <div className="mt-1 text-xs text-ink-muted">
                              Target {formatValue(item.target, metric.unit || item.unit)}
                              {hasFloor && ` · Floor ${formatValue(metric.floor, metric.unit || item.unit)}`}
                              {metric.ceiling != null && ` · Cap ${formatValue(metric.ceiling, metric.unit || item.unit)}`}
                            </div>
                          </div>

                          <div className="text-right">
                            <div className={`tnum text-lg font-medium ${tone.text}`}>
                              {item.attainmentPct || 0}%
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center gap-3">
                          <div className="meter flex-1">
                            <div className={`meter-fill ${tone.fill}`} style={{ width: `${visual}%` }} />
                          </div>
                          <span className="tnum whitespace-nowrap text-xs text-ink-muted">
                            {formatValue(item.actual, metric.unit || item.unit)}
                            <span className="mx-1.5 text-rule">/</span>
                            {formatValue(item.target, metric.unit || item.unit)}
                          </span>
                        </div>

                        <div className="mt-2">
                          {isBelowFloor ? (
                            <span className="text-xs text-bad">
                              Below the qualification floor of {formatValue(metric.floor, metric.unit || item.unit)} — no credit for this metric
                            </span>
                          ) : (item.attainmentPct || 0) > 100 ? (
                            <span className="text-xs text-good">Above target</span>
                          ) : (item.attainmentRate || 0) >= 1 ? (
                            <span className="text-xs text-good">Target met</span>
                          ) : (item.attainmentRate || 0) > 0 ? (
                            <span className="text-xs text-warn">Partway there</span>
                          ) : (
                            <span className="text-xs text-ink-muted">
                              {item.actual === null || item.actual === 0
                                ? 'Waiting for the nightly sync or a manager entry'
                                : 'Target not yet reached'}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default function MyVariablePayPage() {
  return (
    <Suspense fallback={<div className="py-24 text-center text-sm text-ink-muted">Loading…</div>}>
      <MyVariablePayContent />
    </Suspense>
  );
}