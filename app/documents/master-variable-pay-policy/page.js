'use client';
import { useState, useEffect, Suspense } from 'react';
import { createClient } from '../../../lib/supabaseClient';

function MasterVariablePayDocContent() {
  const supabase = createClient();

  const [schemes, setSchemes] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      const privileged = !!(
        profile?.is_super_admin ||
        profile?.role === 'admin' ||
        profile?.role === 'super_admin' ||
        profile?.role === 'hr_manager' ||
        profile?.permissions?.manage_settings ||
        profile?.permissions?.manage_payroll ||
        profile?.permissions?.view_all_variable_pay
      );

      setIsAdmin(privileged);

      if (!privileged) {
        setLoading(false);
        return;
      }

      const [{ data: schemeList }, { data: empList }] = await Promise.all([
        supabase.from('variable_pay_schemes').select('*').order('id', { ascending: true }),
        supabase.from('employees').select('name, designation, department, variable_pay_scheme, current_fixed_salary, current_variable_salary').is('deleted_at', null).in('status', ['active', 'on-notice'])
      ]);

      setSchemes(schemeList || []);
      setEmployees(empList || []);
    } catch (err) {
      setError(err.message || 'Failed to load schemes master data.');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="py-24 text-center">
        <div className="inline-block animate-spin text-2xl mb-3">⏳</div>
        <p className="text-sm text-ink-muted">Loading Master Variable Pay Policy Schemes...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center">
        <div className="panel panel-body">
          <div className="text-3xl mb-3">🔒</div>
          <h2 className="panel-title mb-2">Admin Access Required</h2>
          <p className="text-sm text-ink-muted mb-6">
            This Master Variable Pay Policy Overview is restricted to authorized company administrators and management.
          </p>
          <a href="/documents" className="btn-secondary text-xs">
            ← Back to Documents Hub
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-20 max-w-5xl mx-auto px-4 sm:px-6">
      {/* Top Header & Actions (Screen Only) */}
      <div className="print:hidden flex flex-wrap items-center justify-between gap-4 mb-6 pt-2">
        <div className="flex items-center gap-3">
          <a href="/documents?category=targets" className="btn-quiet text-xs font-semibold">
            ← Documents
          </a>
          <span className="text-ink-muted">•</span>
          <span className="text-xs font-mono text-ink-muted">
            Scope: <strong className="text-accent">Executive Company Master</strong>
          </span>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <a
            href="/settings/variable-pay"
            className="btn-secondary text-xs flex items-center gap-1.5"
          >
            <span>⚙️</span> Configure Schemes in Settings
          </a>
          <button
            type="button"
            onClick={() => window.print()}
            className="btn-primary text-xs flex items-center gap-1.5 shadow-sm"
          >
            <span>🖨️</span> Print Master Document
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 mb-6 bg-bad-wash text-bad rounded-control text-sm border border-bad/20">
          {error}
        </div>
      )}

      {/* =========================================================================
          MASTER DOCUMENT LETTERHEAD CONTAINER (Screen & Print Friendly)
          ========================================================================= */}
      <div className="bg-surface border border-rule rounded-card shadow-sm p-6 sm:p-10 text-ink leading-relaxed print:border-none print:shadow-none print:p-0">

        {/* Document Header */}
        <div className="border-b-2 border-ink pb-5 mb-8 flex flex-wrap justify-between items-end gap-4">
          <div>
            <div className="text-3xs font-bold uppercase tracking-widest text-ink-muted">
              ATELIER HOSPITALITY · EXECUTIVE GOVERNANCE RECORD
            </div>
            <h1 className="font-serif text-2.5xl sm:text-3xl font-bold text-ink mt-1">
              Master Variable Pay Policy & Incentive Schemes Directory
            </h1>
            <div className="text-xs text-ink-muted font-medium mt-0.5">
              Comprehensive role-based metric distribution matrices, qualification floors, and governance schedules.
            </div>
          </div>
          <div className="text-right text-3xs font-mono text-ink-muted">
            <div>Document Ref: <strong>VP-MASTER-ALL</strong></div>
            <div>Active Schemes: <strong>{schemes.length}</strong></div>
            <div>Generated: {new Date().toISOString().slice(0, 10)}</div>
          </div>
        </div>

        {/* Executive Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <div className="panel p-4 bg-surface border-rule">
            <div className="text-3xs uppercase font-bold text-ink-muted">Configured Schemes</div>
            <div className="font-serif text-2xl font-bold text-ink mt-0.5">{schemes.length}</div>
            <div className="text-3xs text-ink-muted mt-1">Active departmental frameworks</div>
          </div>

          <div className="panel p-4 bg-accent/5 border-accent/20">
            <div className="text-3xs uppercase font-bold text-accent">Staff on Variable Schemes</div>
            <div className="font-serif text-2xl font-bold text-accent mt-0.5">
              {employees.filter(e => Number(e.current_variable_salary || 0) > 0).length}
            </div>
            <div className="text-3xs text-accent/80 mt-1">Active and on-notice team members</div>
          </div>

          <div className="panel p-4 bg-good/5 border-good/20">
            <div className="text-3xs uppercase font-bold text-good">Total Monthly Target Pool</div>
            <div className="font-serif text-2xl font-bold text-good mt-0.5">
              ₹{employees.reduce((sum, e) => sum + Number(e.current_variable_salary || 0), 0).toLocaleString('en-IN')}
            </div>
            <div className="text-3xs text-good/80 mt-1">At 100% on-target attainment across company</div>
          </div>
        </div>

        {/* All Active Schemes Rendered in Real-Time */}
        <div className="space-y-12">
          {schemes.map((scheme, schemeIdx) => {
            const assignedStaff = employees.filter(e => e.variable_pay_scheme === scheme.name);
            const totalStaffPool = assignedStaff.reduce((s, e) => s + Number(e.current_variable_salary || 0), 0);
            const metrics = scheme.metrics || [];
            const totalWeightPct = metrics.reduce((sum, m) => sum + Math.round(Number(m.weight || 0) * 100), 0);

            return (
              <div key={scheme.id || scheme.name} className="border border-rule-soft rounded-card p-6 bg-page/30">
                {/* Scheme Title & Metadata */}
                <div className="flex flex-wrap justify-between items-start gap-4 pb-4 border-b border-rule-soft mb-5">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-3xs font-bold uppercase tracking-wider bg-ink/10 text-ink px-2 py-0.5 rounded">
                        Scheme #{schemeIdx + 1}
                      </span>
                      <span className="text-3xs font-mono text-ink-muted">
                        Identifier: <code>{scheme.name}</code>
                      </span>
                    </div>
                    <h2 className="font-serif text-xl font-bold text-ink">
                      {scheme.display_name}
                    </h2>
                    <div className="text-xs text-ink-muted mt-0.5">
                      Target Department: <strong>{scheme.department || 'All Departments'}</strong>
                    </div>
                  </div>

                  <div className="text-right text-xs">
                    <div className="font-semibold text-ink">
                      {assignedStaff.length} Employee{assignedStaff.length !== 1 ? 's' : ''} Assigned
                    </div>
                    <div className="text-3xs text-good font-bold mt-0.5">
                      Pool: ₹{totalStaffPool.toLocaleString('en-IN')}/mo
                    </div>
                  </div>
                </div>

                {/* Metrics Breakdown Table */}
                <div className="mb-5 overflow-x-auto border border-rule rounded-control bg-surface">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-page/70 border-b border-rule text-3xs uppercase font-bold text-ink-muted">
                        <th className="py-2 px-3">Performance Metric</th>
                        <th className="py-2 px-3">Weight (%)</th>
                        <th className="py-2 px-3">Target Benchmark</th>
                        <th className="py-2 px-3">Measurement Mode</th>
                        <th className="py-2 px-3">Floors & Ceilings</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rule-soft text-ink">
                      {metrics.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-4 text-center text-ink-muted italic">
                            No performance metrics configured for this scheme.
                          </td>
                        </tr>
                      ) : (
                        metrics.map((m, mIdx) => {
                          const weightPct = Math.round(Number(m.weight || 0) * 100);
                          return (
                            <tr key={m.id || mIdx} className="hover:bg-page/40">
                              <td className="py-2.5 px-3">
                                <div className="font-bold text-ink">{m.name}</div>
                                {m.comments && <div className="text-3xs text-ink-muted mt-0.5">{m.comments}</div>}
                              </td>
                              <td className="py-2.5 px-3 font-bold font-mono text-accent">
                                {weightPct}%
                              </td>
                              <td className="py-2.5 px-3 font-semibold font-mono text-3xs">
                                {m.target} {m.unit} ({m.direction === 'higher' ? 'Higher is better' : 'Lower is better'})
                              </td>
                              <td className="py-2.5 px-3 capitalize text-3xs font-semibold text-ink">
                                {m.type || 'binary'}
                              </td>
                              <td className="py-2.5 px-3 text-3xs text-ink-muted">
                                {m.floor !== null && m.floor !== undefined ? (
                                  <div>Min Floor: {m.floor} {m.unit} (0% below)</div>
                                ) : (
                                  <div>Floor: None</div>
                                )}
                                {m.ceiling !== null && m.ceiling !== undefined && (
                                  <div>Ceiling: {m.ceiling} {m.unit} (capped)</div>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    <tfoot className="bg-page/80 font-bold border-t border-rule text-ink">
                      <tr>
                        <td className="py-2 px-3">Total Scheme Allocation Weight</td>
                        <td className="py-2 px-3 text-accent font-mono">
                          {totalWeightPct}%
                        </td>
                        <td colSpan={3} className="py-2 px-3 text-3xs font-normal text-ink-muted text-right">
                          {totalWeightPct === 100 ? '✓ Balanced (100%)' : `⚠️ Total is ${totalWeightPct}% (expected 100%)`}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Policy Guidelines & Legal Wording for this Scheme */}
                <div className="bg-page/60 p-4 border border-rule-soft rounded-control text-3xs space-y-2">
                  <div className="font-bold text-2xs uppercase tracking-wider text-ink">
                    Governance Guidelines & Disbursal Rules:
                  </div>
                  {scheme.policy_guidelines ? (
                    <div className="whitespace-pre-line text-ink-muted leading-relaxed">
                      {scheme.policy_guidelines}
                    </div>
                  ) : (
                    <p className="text-ink-muted italic">
                      Standard company variable pay guidelines apply (20th to 19th cycle, Petpooja POS verification, attendance thresholds).
                    </p>
                  )}

                  {scheme.terms_and_conditions && (
                    <div className="pt-2 border-t border-rule-soft/60 mt-2 text-ink italic">
                      <strong>Employee Sign-off Declaration:</strong> &ldquo;{scheme.terms_and_conditions}&rdquo;
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Master Sign-off Footer */}
        <div className="mt-12 pt-6 border-t border-rule-soft grid grid-cols-2 gap-10 text-center text-xs">
          <div>
            <div className="border-b border-ink/40 pb-10 mb-2"></div>
            <strong className="text-ink">Atelier Operations & HR Directorate</strong>
            <div className="text-3xs text-ink-muted uppercase font-semibold">Policy Authority & Auditor</div>
          </div>
          <div>
            <div className="border-b border-ink/40 pb-10 mb-2"></div>
            <strong className="text-ink">Executive Management</strong>
            <div className="text-3xs text-ink-muted uppercase font-semibold">Compensation Committee Approval</div>
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

export default function MasterVariablePayDocPage() {
  return (
    <Suspense fallback={<div className="py-24 text-center text-sm text-ink-muted">Loading Master Variable Pay Policy Document…</div>}>
      <MasterVariablePayDocContent />
    </Suspense>
  );
}
