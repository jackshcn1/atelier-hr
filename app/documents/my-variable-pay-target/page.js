'use client';
import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabaseClient';

function VariableTargetPolicyContent() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const router = useRouter();

  const queryEmpId = searchParams.get('employee_id');

  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserProfile, setCurrentUserProfile] = useState(null);
  const [isManager, setIsManager] = useState(false);

  const [employees, setAllEmployees] = useState([]);
  const [targetEmployee, setTargetEmployee] = useState(null);
  const [schemes, setSchemes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, [queryEmpId]);

  async function loadData() {
    setLoading(true);
    setError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);

      let myProfile = null;
      let privileged = false;

      if (user) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        myProfile = prof;
        setCurrentUserProfile(prof);
        privileged = !!(prof?.is_super_admin || prof?.role === 'admin' || prof?.role === 'hr_manager' || prof?.permissions?.manage_payroll || prof?.permissions?.view_all_variable_pay);
        setIsManager(privileged);
      }

      // Fetch schemes
      const { data: schemeList } = await supabase
        .from('variable_pay_schemes')
        .select('*')
        .order('id');
      setSchemes(schemeList || []);

      // Fetch all employees if manager
      const { data: empList } = await supabase
        .from('employees')
        .select('*')
        .is('deleted_at', null)
        .order('name');
      setAllEmployees(empList || []);

      // Resolve which employee to display
      let selectedEmp = null;

      if (privileged && queryEmpId) {
        selectedEmp = (empList || []).find(e => e.employee_id === queryEmpId);
      }

      if (!selectedEmp && user) {
        // Match by email or employee_id
        selectedEmp = (empList || []).find(e =>
          (user.email && e.email && e.email.toLowerCase() === user.email.toLowerCase()) ||
          (myProfile?.employee_id && e.employee_id === myProfile.employee_id)
        );
      }

      // If still not resolved and privileged, default to first active employee with scheme or fixed salary
      if (!selectedEmp && privileged && empList && empList.length > 0) {
        selectedEmp = empList.find(e => e.variable_pay_scheme) || empList[0];
      }

      setTargetEmployee(selectedEmp || null);
    } catch (err) {
      setError(`Failed to load document: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  // Calculate live metric distribution for target employee
  const docModel = useMemo(() => {
    if (!targetEmployee) return null;

    const scheme = schemes.find(s => s.name === targetEmployee.variable_pay_scheme) || schemes[0] || null;
    const fixedMonthly = Number(targetEmployee.current_fixed_salary || 0);
    const variablePoolMonthly = Number(targetEmployee.current_variable_salary || 0);
    const totalMonthlyCTC = fixedMonthly + variablePoolMonthly;
    const annualCTC = totalMonthlyCTC * 12;

    const fixedRatio = totalMonthlyCTC > 0 ? Math.round((fixedMonthly / totalMonthlyCTC) * 100) : 100;
    const variableRatio = totalMonthlyCTC > 0 ? (100 - fixedRatio) : 0;

    const metricsBreakdown = (scheme?.metrics || []).map((m, idx) => {
      const weight = Number(m.weight || 0);
      const weightPct = Math.round(weight * 100);
      const monthlyAmount = Math.round(weight * variablePoolMonthly);
      const annualAmount = monthlyAmount * 12;

      return {
        id: m.id || idx,
        name: m.name,
        weightPct,
        monthlyAmount,
        annualAmount,
        type: m.type || 'binary',
        direction: m.direction || 'higher',
        target: m.target,
        floor: m.floor,
        ceiling: m.ceiling,
        unit: m.unit || '',
        scope: m.scope || 'individual',
        comments: m.comments || ''
      };
    });

    // Sample performance payout tiers (50%, 80%, 100%, 120%)
    const payoutTiers = [
      { level: 'Minimum Threshold (50% Attainment)', pct: 50, amount: Math.round(variablePoolMonthly * 0.5) },
      { level: 'Target Benchmark (100% Attainment)', pct: 100, amount: variablePoolMonthly },
      { level: 'Exceeding Ceiling (120% Capped)', pct: 120, amount: Math.round(variablePoolMonthly * 1.2) }
    ];

    return {
      employee: targetEmployee,
      scheme,
      fixedMonthly,
      variablePoolMonthly,
      totalMonthlyCTC,
      annualCTC,
      fixedRatio,
      variableRatio,
      metricsBreakdown,
      payoutTiers
    };
  }, [targetEmployee, schemes]);

  if (loading) {
    return (
      <div className="py-24 text-center">
        <div className="inline-block animate-spin text-2xl mb-3">⏳</div>
        <p className="text-sm text-ink-muted">Generating personalized variable pay policy document…</p>
      </div>
    );
  }

  if (error || !targetEmployee) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center">
        <div className="panel panel-body">
          <div className="text-3xl mb-3">🎯</div>
          <h2 className="panel-title mb-2">No Personalized Target Policy Found</h2>
          <p className="text-sm text-ink-muted mb-6">
            {error || 'No employee record with variable compensation targets is linked to your account.'}
          </p>
          <a href="/documents" className="btn-secondary text-xs">
            ← Back to Documents Hub
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-20 max-w-4xl mx-auto px-4 sm:px-6">
      {/* Top Header & Actions (Screen Only) */}
      <div className="print:hidden flex flex-wrap items-center justify-between gap-4 mb-6 pt-2">
        <div className="flex items-center gap-3">
          <a href="/documents?category=targets" className="btn-quiet text-xs font-semibold">
            ← Documents
          </a>
          <span className="text-ink-muted">•</span>
          <span className="text-xs font-mono text-ink-muted">
            Ref: <strong className="text-ink">{docModel.employee.employee_id}</strong>
          </span>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Manager Switcher */}
          {isManager && employees.length > 0 && (
            <div className="flex items-center gap-2 bg-surface border border-rule px-2.5 py-1 rounded-control text-xs">
              <span className="text-ink-muted font-medium">Switch Staff:</span>
              <select
                value={docModel.employee.employee_id}
                onChange={e => router.push(`/documents/my-variable-pay-target?employee_id=${e.target.value}`)}
                className="bg-transparent font-semibold text-ink border-none focus:outline-none cursor-pointer"
              >
                {employees.map(emp => (
                  <option key={emp.employee_id} value={emp.employee_id}>
                    {emp.name} ({emp.designation || 'Staff'} · {emp.department || 'General'})
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            onClick={() => window.print()}
            className="btn-primary text-xs flex items-center gap-1.5 shadow-sm"
          >
            <span>🖨️</span> Print / Save PDF
          </button>
        </div>
      </div>

      {/* =========================================================================
          OFFICIAL LETTERHEAD POLICY DOCUMENT (Rendered on Screen & Printed on A4)
          ========================================================================= */}
      <div className="bg-surface border border-rule rounded-card shadow-sm p-6 sm:p-10 text-ink leading-relaxed print:border-none print:shadow-none print:p-0">

        {/* Document Letterhead */}
        <div className="border-b-2 border-ink pb-5 mb-6 flex flex-wrap justify-between items-end gap-4">
          <div>
            <div className="text-3xs font-bold uppercase tracking-widest text-ink-muted">
              ATELIER HOSPITALITY · OFFICIAL COMPENSATION POLICY
            </div>
            <h1 className="font-serif text-2.5xl sm:text-3xl font-bold text-ink mt-1">
              Variable Pay & Incentive Scheme Policy
            </h1>
            <div className="text-xs text-ink-muted font-medium mt-0.5">
              Personalized Performance Targets & Component Breakdown Schedule
            </div>
          </div>
          <div className="text-right text-3xs font-mono text-ink-muted">
            <div>Document Ref: <strong>VP-DOC-{docModel.employee.employee_id}</strong></div>
            <div>Scheme: <strong>{docModel.scheme?.display_name || 'Standard'}</strong></div>
            <div>Effective Date: {docModel.employee.date_of_joining || new Date().toISOString().slice(0, 10)}</div>
          </div>
        </div>

        {/* Employee Summary Box */}
        <div className="bg-page/70 border border-rule-soft rounded-control p-4 mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3.5 text-xs">
          <div>
            <span className="text-3xs uppercase text-ink-muted font-bold block">Employee Name</span>
            <strong className="text-sm text-ink">{docModel.employee.name}</strong>
          </div>
          <div>
            <span className="text-3xs uppercase text-ink-muted font-bold block">Role / Designation</span>
            <span className="text-ink font-semibold">{docModel.employee.designation || 'Staff Member'}</span>
          </div>
          <div>
            <span className="text-3xs uppercase text-ink-muted font-bold block">Department</span>
            <span className="text-ink font-semibold">{docModel.employee.department || 'General Operations'}</span>
          </div>
          <div>
            <span className="text-3xs uppercase text-ink-muted font-bold block">Employee ID</span>
            <span className="text-ink font-mono font-bold">{docModel.employee.employee_id}</span>
          </div>
        </div>

        {/* 1. Compensation Split Breakdown */}
        <div className="mb-8">
          <div className="flex items-baseline justify-between border-b border-rule-soft pb-2 mb-3">
            <h2 className="font-serif text-base font-bold text-ink">
              1. Monthly CTC Breakdown & Fixed vs Variable Ratio
            </h2>
            <span className="text-3xs font-mono text-ink-muted">
              Total Potential CTC: ₹{docModel.totalMonthlyCTC.toLocaleString('en-IN')}/mo (₹{docModel.annualCTC.toLocaleString('en-IN')}/year)
            </span>
          </div>

          <p className="text-xs text-ink-muted mb-4">
            Your total compensation package is structured into a guaranteed monthly Fixed Gross CTC and a performance-linked Variable Incentive Pool:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div className="panel p-3.5 bg-surface border-rule">
              <div className="text-3xs uppercase font-bold text-ink-muted">Fixed Monthly CTC</div>
              <div className="font-serif text-xl font-bold text-ink mt-0.5">
                ₹{docModel.fixedMonthly.toLocaleString('en-IN')}
              </div>
              <div className="text-3xs text-ink-muted mt-1">{docModel.fixedRatio}% of total target earnings</div>
            </div>

            <div className="panel p-3.5 bg-accent/5 border-accent/20">
              <div className="text-3xs uppercase font-bold text-accent">Monthly Variable Pool (100%)</div>
              <div className="font-serif text-xl font-bold text-accent mt-0.5">
                ₹{docModel.variablePoolMonthly.toLocaleString('en-IN')}
              </div>
              <div className="text-3xs text-accent/80 mt-1">{docModel.variableRatio}% performance weighting</div>
            </div>

            <div className="panel p-3.5 bg-good/5 border-good/20">
              <div className="text-3xs uppercase font-bold text-good">Maximum Annual Variable Potential</div>
              <div className="font-serif text-xl font-bold text-good mt-0.5">
                ₹{(docModel.variablePoolMonthly * 12).toLocaleString('en-IN')}
              </div>
              <div className="text-3xs text-good/80 mt-1">Disbursed monthly based on performance</div>
            </div>
          </div>

          {/* Visual Ratio Bar */}
          <div className="w-full h-3 bg-rule-soft rounded-full overflow-hidden flex text-3xs font-bold text-white mb-2">
            <div
              style={{ width: `${docModel.fixedRatio}%` }}
              className="bg-ink flex items-center justify-center overflow-hidden"
              title={`Fixed: ${docModel.fixedRatio}%`}
            >
              {docModel.fixedRatio > 15 ? `Fixed ${docModel.fixedRatio}%` : ''}
            </div>
            <div
              style={{ width: `${docModel.variableRatio}%` }}
              className="bg-accent flex items-center justify-center overflow-hidden"
              title={`Variable: ${docModel.variableRatio}%`}
            >
              {docModel.variableRatio > 15 ? `Variable ${docModel.variableRatio}%` : ''}
            </div>
          </div>
          <div className="flex justify-between text-3xs text-ink-muted font-medium">
            <span>■ Fixed Gross Salary (Guaranteed)</span>
            <span>■ Variable Incentive Pool (Target-Linked)</span>
          </div>
        </div>

        {/* 2. Variable Pay Component Distribution Table */}
        <div className="mb-8">
          <div className="flex items-baseline justify-between border-b border-rule-soft pb-2 mb-3">
            <h2 className="font-serif text-base font-bold text-ink">
              2. Variable Component Distribution & Target Metrics
            </h2>
            <span className="text-3xs font-semibold text-accent">
              Scheme: {docModel.scheme?.display_name || 'Standard'}
            </span>
          </div>

          <p className="text-xs text-ink-muted mb-3">
            Your monthly variable pool of <strong>₹{docModel.variablePoolMonthly.toLocaleString('en-IN')}</strong> is allocated across the following performance criteria. Each component is evaluated independently each monthly cycle:
          </p>

          <div className="overflow-x-auto border border-rule rounded-control">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-page/70 border-b border-rule text-3xs uppercase font-bold text-ink-muted">
                  <th className="py-2.5 px-3">Performance Metric</th>
                  <th className="py-2.5 px-3">Weight (%)</th>
                  <th className="py-2.5 px-3">Max Monthly Payout</th>
                  <th className="py-2.5 px-3">Benchmark Target</th>
                  <th className="py-2.5 px-3">Calculation Logic & Thresholds</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule-soft text-ink">
                {docModel.metricsBreakdown.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-ink-muted italic">
                      No metrics configured in this scheme.
                    </td>
                  </tr>
                ) : (
                  docModel.metricsBreakdown.map((m, idx) => (
                    <tr key={m.id || idx} className="hover:bg-page/40">
                      <td className="py-3 px-3">
                        <div className="font-bold text-ink">{m.name}</div>
                        {m.comments && <div className="text-3xs text-ink-muted mt-0.5">{m.comments}</div>}
                      </td>
                      <td className="py-3 px-3 font-bold font-mono text-accent">
                        {m.weightPct}%
                      </td>
                      <td className="py-3 px-3 font-bold text-good">
                        ₹{m.monthlyAmount.toLocaleString('en-IN')}/mo
                      </td>
                      <td className="py-3 px-3 font-semibold font-mono text-3xs">
                        {m.target} {m.unit} ({m.direction === 'higher' ? 'Higher is better' : 'Lower is better'})
                      </td>
                      <td className="py-3 px-3 text-3xs text-ink-muted">
                        <div className="capitalize font-semibold text-ink">{m.type} rate</div>
                        {m.floor !== null && m.floor !== undefined && (
                          <div>Min Floor: {m.floor} {m.unit} (0% below)</div>
                        )}
                        {m.ceiling !== null && m.ceiling !== undefined && (
                          <div>Ceiling: {m.ceiling} {m.unit} (capped)</div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="bg-page/80 font-bold border-t border-rule text-ink">
                <tr>
                  <td className="py-2.5 px-3">Total Scheme Allocation</td>
                  <td className="py-2.5 px-3 text-accent">
                    {docModel.metricsBreakdown.reduce((s, m) => s + m.weightPct, 0)}%
                  </td>
                  <td className="py-2.5 px-3 text-good font-serif text-sm">
                    ₹{docModel.variablePoolMonthly.toLocaleString('en-IN')}/mo
                  </td>
                  <td colSpan={2} className="py-2.5 px-3 text-3xs font-normal text-ink-muted text-right">
                    100% On-Target Earning Potential
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* 3. Attainment & Payout Example Tiers */}
        <div className="mb-8">
          <h2 className="font-serif text-base font-bold text-ink border-b border-rule-soft pb-2 mb-3">
            3. Payout Realization Scenarios
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {docModel.payoutTiers.map(t => (
              <div key={t.pct} className="p-3 bg-page/50 border border-rule-soft rounded-control text-xs">
                <div className="text-3xs uppercase font-bold text-ink-muted">{t.level}</div>
                <div className="text-base font-bold text-ink mt-1">
                  ₹{t.amount.toLocaleString('en-IN')} <span className="text-3xs font-normal text-ink-muted">/ month</span>
                </div>
                <div className="text-3xs text-ink-muted mt-1">
                  Total Monthly Earnings: <strong>₹{(docModel.fixedMonthly + t.amount).toLocaleString('en-IN')}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 4. Terms & Operational Governance (Rendered from Scheme Template) */}
        <div className="mb-8 bg-page/40 p-4 border border-rule-soft rounded-control text-3xs text-ink-muted space-y-2">
          <div className="flex justify-between items-center mb-1">
            <div className="font-bold text-xs text-ink uppercase tracking-wider">
              4. Governance & Operational Guidelines
            </div>
          </div>
          {docModel.scheme?.policy_guidelines ? (
            <div className="whitespace-pre-line leading-relaxed text-ink-muted">
              {docModel.scheme.policy_guidelines}
            </div>
          ) : (
            <>
              <p>
                • <strong>Measurement Period</strong>: Variable performance cycles run monthly from the 20th of the previous month to the 19th of the current month.
              </p>
              <p>
                • <strong>Data Verification & Disbursal</strong>: Metrics are synced directly from Petpooja POS and management audits. Monthly payouts are disbursed alongside the monthly salary following attendance review.
              </p>
              <p>
                • <strong>Attendance Floor</strong>: Payout eligibility requires satisfactory attendance during the designated cycle. Unexcused absences or disciplinary actions may result in forfeiture.
              </p>
            </>
          )}
        </div>

        {/* 5. Acknowledgment & Signatures */}
        {docModel.scheme?.terms_and_conditions && (
          <div className="mb-6 p-3 bg-page/60 border border-rule-soft rounded-control text-3xs text-ink italic leading-normal">
            <strong>Declaration:</strong> &ldquo;{docModel.scheme.terms_and_conditions}&rdquo;
          </div>
        )}

        <div className="pt-6 border-t border-rule-soft grid grid-cols-2 gap-10 text-center text-xs">
          <div>
            <div className="border-b border-ink/40 pb-10 mb-2"></div>
            <strong className="text-ink">{docModel.employee.name}</strong>
            <div className="text-3xs text-ink-muted uppercase font-semibold">Employee Signature & Date</div>
          </div>
          <div>
            <div className="border-b border-ink/40 pb-10 mb-2"></div>
            <strong className="text-ink">Atelier Operations / HR</strong>
            <div className="text-3xs text-ink-muted uppercase font-semibold">Authorized Management Signatory</div>
          </div>
        </div>
      </div>

      {/* Global CSS for Print */}
      <style jsx global>{`
        @media print {
          nav, header, aside, .no-print {
            display: none !important;
          }
          body {
            background: white !important;
            color: #111827 !important;
            font-size: 11px !important;
          }
          @page {
            margin: 12mm 15mm 12mm 15mm;
            size: A4 portrait;
          }
        }
      `}</style>
    </div>
  );
}

export default function VariableTargetPolicyPage() {
  return (
    <Suspense fallback={<div className="py-24 text-center text-sm text-ink-muted">Loading policy document…</div>}>
      <VariableTargetPolicyContent />
    </Suspense>
  );
}
