'use client';
import { useState, useEffect, useMemo, Suspense } from 'react';
import { createClient } from '../../lib/supabaseClient';
import { computeEmployeeVariablePayout } from '../../lib/variablePayCalculator';

function getDefaultPayrollCycle() {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth(); // 0-indexed
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

function MyVariablePayContent() {
  const supabase = createClient();
  const defaultCycle = getDefaultPayrollCycle();

  // User & permissions
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [isManager, setIsManager] = useState(false);

  // Data
  const [periods, setPeriods] = useState([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState(null);
  const [allEmployees, setAllEmployees] = useState([]);
  const [selectedEmpId, setSelectedEmpId] = useState(null);
  const [myEmployee, setMyEmployee] = useState(null);
  const [schemes, setSchemes] = useState([]);
  const [metricInputs, setMetricInputs] = useState([]);
  const [snapshotRows, setSnapshotRows] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadUserAndInit();
  }, []);

  async function loadUserAndInit() {
    setLoading(true);
    setError('');

    // 1. Get authenticated user
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
        // Find employee by email match
        const { data: empMatch } = await supabase.from('employees').select('employee_id').ilike('email', user.email).maybeSingle();
        if (empMatch) targetEmpId = empMatch.employee_id;
      }
    }

    // 2. Fetch periods
    const { data: pList } = await supabase
      .from('variable_pay_periods')
      .select('*')
      .order('period_start', { ascending: false });

    const periodRows = pList || [];
    setPeriods(periodRows);

    let activePeriod = periodRows.find(p => p.status === 'open') || periodRows[0];
    if (activePeriod) {
      setSelectedPeriodId(activePeriod.id);
    }

    // 3. Fetch schemes
    const { data: sList } = await supabase.from('variable_pay_schemes').select('*').eq('is_active', true);
    setSchemes(sList || []);

    // 4. Fetch the employee record.
    // A regular employee may only ever load their OWN row — we never issue the
    // bulk "select all employees" query on their behalf, because that would
    // hand the browser a list of colleagues we have no reason to expose.
    if (targetEmpId) {
      const { data: ownEmp } = await supabase
        .from('employees')
        .select('*')
        .eq('employee_id', targetEmpId)
        .maybeSingle();
      if (ownEmp) setMyEmployee(ownEmp);
    }

    // Admins and managers legitimately need the full roster to power the
    // employee switcher, so only they run this query.
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

    // 5. Fetch metric inputs for active period
    if (activePeriod) {
      await loadInputsForPeriod(activePeriod.id);
    }

    setLoading(false);
  }

  async function loadInputsForPeriod(periodId) {
    if (!periodId) return;
    const period = periods.find(p => p.id === periodId);
    const isClosed = period?.status === 'locked' || period?.status === 'paid';

    if (isClosed) {
      // A closed cycle is frozen. Read the snapshot rather than the live input
      // rows, so later edits or re-syncs can never change what this employee
      // saw for that cycle. RLS limits this to their own rows.
      const { data: snap } = await supabase
        .from('variable_pay_snapshot')
        .select('*')
        .eq('period_id', periodId);
      setSnapshotRows(snap || []);
      setMetricInputs([]);
      return;
    }

    // Current cycle: live attainment from the values the sync just pulled.
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

  // Active viewing employee record.
  // For a regular employee this is always their own record — the switcher
  // exists solely for admins, and `selectedEmpId` is never allowed to point
  // anywhere else for anyone else.
  const currentEmp = useMemo(() => {
    if (isManager) return allEmployees.find(e => e.employee_id === selectedEmpId) || null;
    return myEmployee;
  }, [allEmployees, selectedEmpId, myEmployee, isManager]);

  // Selected period object
  const currentPeriod = useMemo(() => {
    return periods.find(p => p.id === selectedPeriodId) || null;
  }, [periods, selectedPeriodId]);

  const isClosedCycle = currentPeriod?.status === 'locked' || currentPeriod?.status === 'paid';

  // Assigned scheme for current employee
  const currentScheme = useMemo(() => {
    if (!currentEmp?.variable_pay_scheme) return null;
    return schemes.find(s => s.name === currentEmp.variable_pay_scheme) || null;
  }, [currentEmp, schemes]);

  // Build the calculation. A closed cycle reads its frozen snapshot; the
  // current cycle is computed live from the freshly synced metric inputs.
  const liveCalculation = useMemo(() => {
    if (!currentScheme || !currentEmp) return null;

    const pool = Number(currentEmp.current_variable_salary || 0);

    if (isClosedCycle) {
      const mine = snapshotRows.filter(s => s.employee_id === currentEmp.employee_id);
      if (mine.length === 0) return null;
      const totalPayout = mine.reduce((sum, r) => sum + Number(r.payout_amount || 0), 0);
      return {
        fromSnapshot: true,
        totalPayoutAmount: totalPayout,
        totalEarnedFraction: pool > 0 ? totalPayout / pool : 0,
        totalEarnedPct: pool > 0 ? Math.round((totalPayout / pool) * 1000) / 10 : 0,
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
          payoutAmount: Number(r.payout_amount || 0)
        }))
      };
    }

    const actualInputs = {};

    // Match metric inputs for this employee (individual row OR team row)
    (currentScheme.metrics || []).forEach(m => {
      const row = metricInputs.find(
        i => i.metric_id === m.id && (i.employee_id === currentEmp.employee_id || i.employee_id === null)
      );
      actualInputs[m.id] = row?.actual_value ?? null;
    });

    return { fromSnapshot: false, ...computeEmployeeVariablePayout(currentScheme, actualInputs, pool) };
  }, [currentScheme, currentEmp, metricInputs, snapshotRows, isClosedCycle]);

  // Format date range nicely
  function formatPeriodDates(p) {
    if (!p) return '—';
    return `${p.period_start} to ${p.period_end}`;
  }

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#6b7280' }}>
        Loading live variable pay tracker…
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>Please log in to view your variable pay tracker.</p>
        <a href="/login" style={{ color: '#2563eb', fontWeight: 600 }}>Go to Login →</a>
      </div>
    );
  }

  const isLiveCycle = currentPeriod?.status === 'open';

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', paddingBottom: 60 }}>
      {/* Top Header & Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: '0 0 4px 0', fontSize: 24, fontWeight: 800, color: '#111827' }}>
            🎯 Live Variable Pay Tracker
          </h1>
          <p style={{ color: '#666', margin: 0, fontSize: 14 }}>
            Track your live performance metrics, qualification status, and monthly bonus attainment in real time.
          </p>
        </div>

        {/* Period Selector & Manager Links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
              Cycle:
            </label>
            <select
              value={selectedPeriodId || ''}
              onChange={e => handlePeriodChange(Number(e.target.value))}
              style={{
                padding: '7px 12px', borderRadius: 6, border: '1.5px solid #cbd5e1',
                background: 'white', fontWeight: 700, fontSize: 13, color: '#111827'
              }}
            >
              {periods.map(p => (
                <option key={p.id} value={p.id}>
                  {p.period_start} to {p.period_end} ({p.status === 'open' ? '🟢 Live Cycle' : p.status === 'locked' ? '🔒 Locked' : '✅ Paid'})
                </option>
              ))}
            </select>
          </div>

          {isManager && (
            <a
              href="/payroll/variable-pay"
              style={{
                background: '#2563eb', color: 'white', padding: '7px 14px', borderRadius: 6,
                textDecoration: 'none', fontWeight: 700, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4
              }}
            >
              📤 Data Upload Hub →
            </a>
          )}
        </div>
      </div>

      {/* Manager Employee Switcher Bar (Admins / Managers only) */}
      {isManager && (
        <div style={{
          background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 8,
          padding: '10px 16px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>👑 Manager View:</span>
            <span>Inspecting Employee Performance</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>Select Employee:</span>
            <select
              value={selectedEmpId || ''}
              onChange={e => setSelectedEmpId(e.target.value)}
              style={{
                padding: '5px 10px', borderRadius: 5, border: '1px solid #94a3b8',
                background: 'white', fontWeight: 700, fontSize: 12
              }}
            >
              {allEmployees.map(emp => (
                <option key={emp.employee_id} value={emp.employee_id}>
                  {emp.name} ({emp.designation || 'Staff'} • {emp.variable_pay_scheme || 'No Scheme'})
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Top Employee Profile & Live Attainment Banner */}
      {currentEmp ? (
        <div style={{
          background: 'white', border: '1px solid #e5e7eb', borderRadius: 10,
          padding: '20px 24px', marginBottom: 24, boxShadow: '0 2px 6px rgba(0,0,0,0.04)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            {/* Left: Employee Info */}
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <div style={{
                width: 60, height: 60, borderRadius: '50%',
                background: '#eff6ff', color: '#1d4ed8', border: '2px solid #bfdbfe',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: 18, flexShrink: 0
              }}>
                {currentEmp.passport_photo_url ? (
                  <img
                    src={`https://wzxswmopfxnucmeygqeg.supabase.co/storage/v1/object/public/documents/${currentEmp.passport_photo_url}`}
                    alt=""
                    onError={e => { e.target.style.display = 'none'; }}
                    style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                  />
                ) : (
                  String(currentEmp.name || 'E').slice(0, 2).toUpperCase()
                )}
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#111827' }}>
                    {currentEmp.name}
                  </h2>
                  <span style={{ background: '#f3f4f6', color: '#374151', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                    {currentEmp.designation || 'Staff'}
                  </span>
                  <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                    {currentEmp.department || 'All'}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                  Assigned Scheme: <strong style={{ color: '#0369a1' }}>{currentScheme?.display_name || 'None Assigned'}</strong> • ID: <code>{currentEmp.employee_id}</code>
                </div>
              </div>
            </div>

            {/* Right: Target Pool & Live Payout Summary */}
            <div style={{ textAlign: 'right', minWidth: 200 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
                Overall Attainment
              </div>
              <div style={{
                fontSize: 26, fontWeight: 900, margin: '2px 0 6px 0',
                color: (liveCalculation?.totalEarnedPct || 0) >= 100 ? '#059669'
                  : (liveCalculation?.totalEarnedPct || 0) > 0 ? '#d97706' : '#6b7280'
              }}>
                {liveCalculation?.totalEarnedPct || 0}%
              </div>
              <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>
                {isClosedCycle ? 'Finalised for this cycle' : 'Live — updates with each sync'}
              </div>
            </div>
          </div>

          {/* Cycle Refresh Status Bar */}
          <div style={{
            marginTop: 16, paddingTop: 12, borderTop: '1px solid #f3f4f6',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, fontSize: 11, color: '#6b7280'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: isLiveCycle ? '#10b981' : '#6b7280' }} />
              <span>
                {isLiveCycle
                ? 'Live tracking cycle — figures update with each daily sync'
                : 'Archived cycle — figures were finalised when the cycle closed on the 19th'}
              </span>
            </div>
            <div>
              Pay Cycle Range: <strong>{formatPeriodDates(currentPeriod)}</strong>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ background: 'white', padding: 30, textAlign: 'center', borderRadius: 8, color: '#6b7280' }}>
          No employee profile selected or found.
        </div>
      )}

      {/* No Scheme Configured Notice */}
      {currentEmp && !currentScheme && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: 18, textAlign: 'center', color: '#92400e' }}>
          <strong>⚠️ No Variable Pay Scheme Assigned</strong>
          <p style={{ margin: '6px 0 0 0', fontSize: 13 }}>
            This employee currently does not have an active variable pay scheme linked to their profile. An administrator can assign a scheme under <strong>Employees → View / Edit → Payroll & Variable Pay Info</strong>.
          </p>
        </div>
      )}

      {/* Breakdown of Metrics Cards */}
      {currentScheme && liveCalculation && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#111827', textTransform: 'uppercase', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Metric Scorecards ({currentScheme.metrics?.length || 0})</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>
              Weights total 100% of your variable target
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {liveCalculation.breakdown.map(item => {
              const metric = (currentScheme.metrics || []).find(m => m.id === item.metric_id) || item;
              const isProportional = metric.type === 'proportional';
              const isBinary = metric.type === 'binary';
              const hasFloor = isProportional && metric.floor !== null && metric.floor !== undefined;
              const isBelowFloor = hasFloor && item.actual !== null && item.actual < Number(metric.floor);
              const isOverachieved = isProportional && item.attainmentPct > 100;
              const isQualified = item.attainmentRate >= 1 || (!isBelowFloor && item.attainmentRate > 0);

              // Progress percentage capped at 100% for the visual bar (overachievement is shown in badge)
              const visualProgressPct = Math.min(Math.max(item.attainmentPct || 0, 0), 100);

              return (
                <div
                  key={item.metric_id}
                  style={{
                    background: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: 10,
                    padding: 18,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
                    {/* Metric Title & Badges */}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#111827' }}>
                          {item.metric_name}
                        </h3>
                        <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
                          {Math.round(Number(item.weight || 0) * 100)}% of your target
                        </span>
                        <span style={{
                          background: isBinary ? '#fef3c7' : '#e0f2fe',
                          color: isBinary ? '#92400e' : '#0369a1',
                          padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700
                        }}>
                          {isBinary ? '🎯 Hit / Miss' : '📈 Proportional'}
                        </span>
                        {metric.scope === 'team' && (
                          <span style={{ background: '#f3e8ff', color: '#7c3aed', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
                            👥 Team-wide
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                        Target: <strong>{metric.target}{metric.unit || ''}</strong>
                        {hasFloor && <span> • Min Floor: <strong>{metric.floor}{metric.unit || ''}</strong></span>}
                        {metric.ceiling && <span> • Max Cap: <strong>{metric.ceiling}{metric.unit || ''}</strong></span>}
                      </div>
                    </div>

                    {/* Attainment Status */}
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
                        Attained
                      </div>
                      <div style={{
                        fontSize: 18, fontWeight: 900,
                        color: isBelowFloor ? '#dc2626' : (item.attainmentPct || 0) >= 100 ? '#059669' : '#d97706'
                      }}>
                        {item.attainmentPct || 0}%
                      </div>
                    </div>
                  </div>

                  {/* Visual Progress Bar */}
                  <div style={{ marginTop: 12, marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: '#4b5563', fontWeight: 600 }}>
                        Current Progress: <strong style={{ color: '#111827' }}>
                          {item.actual !== null && item.actual !== undefined ? `${item.actual} ${metric.unit || ''}` : 'Pending data pull'}
                        </strong>
                      </span>
                      <span style={{
                        fontWeight: 800,
                        color: isBelowFloor ? '#dc2626' : item.attainmentPct >= 100 ? '#059669' : '#d97706'
                      }}>
                        {item.attainmentPct || 0}% Attained
                      </span>
                    </div>

                    <div style={{
                      width: '100%', height: 10, background: '#f1f5f9',
                      borderRadius: 6, overflow: 'hidden', border: '1px solid #e2e8f0'
                    }}>
                      <div style={{
                        width: `${visualProgressPct}%`,
                        height: '100%',
                        background: isBelowFloor
                          ? '#f87171'
                          : item.attainmentPct >= 100
                            ? 'linear-gradient(90deg, #10b981, #059669)'
                            : 'linear-gradient(90deg, #3b82f6, #2563eb)',
                        borderRadius: 6,
                        transition: 'width 0.4s ease'
                      }} />
                    </div>
                  </div>

                  {/* Status Banner / Explanation Note */}
                  <div style={{ fontSize: 11, marginTop: 8 }}>
                    {isBelowFloor ? (
                      <span style={{ color: '#dc2626', fontWeight: 700, background: '#fef2f2', padding: '3px 8px', borderRadius: 4 }}>
                        ⚠️ Below qualification floor of {metric.floor}{metric.unit || ''} — no credit for this metric
                      </span>
                    ) : isOverachieved ? (
                      <span style={{ color: '#065f46', fontWeight: 700, background: '#ecfdf5', padding: '3px 8px', borderRadius: 4 }}>
                        🌟 Overachieved — {item.attainmentPct}% of target
                      </span>
                    ) : item.attainmentRate >= 1 ? (
                      <span style={{ color: '#065f46', fontWeight: 700, background: '#ecfdf5', padding: '3px 8px', borderRadius: 4 }}>
                        ✓ Target met
                      </span>
                    ) : item.attainmentRate > 0 ? (
                      <span style={{ color: '#92400e', fontWeight: 700, background: '#fffbeb', padding: '3px 8px', borderRadius: 4 }}>
                        ⏳ Partway there — {item.attainmentPct}% of target
                      </span>
                    ) : (
                      <span style={{ color: '#6b7280', fontStyle: 'italic' }}>
                        {item.actual === null || item.actual === 0
                          ? 'Waiting for the nightly Petpooja sync or a manager entry'
                          : 'Target not yet reached'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MyVariablePayPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading tracker…</div>}>
      <MyVariablePayContent />
    </Suspense>
  );
}
