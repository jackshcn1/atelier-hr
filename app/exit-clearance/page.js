'use client';
import { Suspense, useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '../../lib/supabaseClient';
import { summariseExitClearance, calculateGratuity } from '../../lib/exitClearance';
import { computeSalarySplit } from '../../lib/salarySplit';

const EXIT_TYPES = [
  { value: 'voluntary', label: 'Voluntary Resignation' },
  { value: 'notional', label: 'Notional / Management Termination' },
  { value: 'disciplinary', label: 'Disciplinary Termination' },
  { value: 'absconding', label: 'Absconding' },
  { value: 'retirement', label: 'Retirement' },
  { value: 'other', label: 'Other Departure' },
];

export default function ExitClearanceWorkspace() {
  return (
    <Suspense fallback={<div className="py-24 text-center text-sm text-ink-muted">Loading exit clearance workspace…</div>}>
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
  const [assets, setAssets] = useState([]);
  const [payrollSettings, setPayrollSettings] = useState({ basic_da_floor: 18000, hra_split_percent: 50 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showPrint, setShowPrint] = useState(false);

  // Form states
  const [gratuityValue, setGratuityValue] = useState('');
  const [gratuityPaid, setGratuityPaid] = useState(false);
  const [depositRefundDate, setDepositRefundDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueRow, setDueRow] = useState({ label: '', amount: '', date: new Date().toISOString().slice(0, 10) });

  async function load() {
    setLoading(true);
    const [{ data: emp }, { data: rec }, { data: deps }, { data: assetRows }, { data: pSet }] = await Promise.all([
      supabase.from('employees').select('*').eq('employee_id', id).maybeSingle(),
      supabase.from('exit_records').select('*').eq('employee_id', id).maybeSingle(),
      supabase.from('employee_deposits').select('*').eq('employee_id', id),
      supabase.from('employee_assets').select('*').eq('employee_id', id).order('created_at', { ascending: false }),
      supabase.from('payroll_settings').select('*').eq('id', 1).maybeSingle()
    ]);

    setEmployee(emp || null);
    setRecord(rec || null);
    setDeposits(deps || []);
    setAssets(assetRows || []);
    if (pSet) setPayrollSettings(pSet);

    if (rec?.gratuity_payable !== undefined && rec?.gratuity_payable !== null) {
      setGratuityValue(rec.gratuity_payable);
    }
    if (rec?.gratuity_paid !== undefined) {
      setGratuityPaid(!!rec.gratuity_paid);
    }
    if (rec?.settled_on) {
      setDepositRefundDate(rec.settled_on);
    }

    setLoading(false);
  }

  useEffect(() => { if (id) load(); }, [id]);

  // Ensure an exit_record row exists
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
      await ensureRecord();
      const { error: updErr } = await supabase
        .from('exit_records')
        .update({ ...fields, updated_at: new Date().toISOString() })
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

  // Statutory Gratuity Calculation Model
  const statutoryGratuityInfo = useMemo(() => {
    if (!employee) return null;
    const salarySplit = computeSalarySplit(employee.current_fixed_salary || 0, payrollSettings);
    const basicDA = salarySplit.basic_da || employee.current_fixed_salary || 0;
    const lastDay = record?.last_working_day || employee.date_of_leaving || new Date().toISOString().slice(0, 10);
    return calculateGratuity({
      dateOfJoining: employee.date_of_joining,
      lastWorkingDay: lastDay,
      monthlyBasicDA: basicDA
    });
  }, [employee, record, payrollSettings]);

  // Pre-fill Gratuity if not yet set
  useEffect(() => {
    if (statutoryGratuityInfo && (gratuityValue === '' || gratuityValue === undefined) && !record?.gratuity_payable) {
      setGratuityValue(statutoryGratuityInfo.amount);
    }
  }, [statutoryGratuityInfo, record]);

  async function saveExitFacts(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const lastDay = fd.get('last_working_day') || employee?.date_of_leaving || new Date().toISOString().slice(0, 10);

    await patch({
      last_working_day: lastDay,
      exit_date: lastDay,
      exit_type: fd.get('exit_type') || null,
      notice_period_days: fd.get('notice_period_days') ? Number(fd.get('notice_period_days')) : null,
      notice_served: fd.get('notice_served') === 'on',
      gratuity_payable: gratuityValue !== '' ? Number(gratuityValue) : 0,
      gratuity_paid: gratuityPaid,
      last_salary_paid_date: fd.get('last_salary_paid_date') || null,
      open_remarks: fd.get('open_remarks') || null,
    }, '✓ Exit details & statutory terms saved.');
  }

  async function toggleAsset(assetId) {
    setError(''); setMessage('');
    setSaving(true);
    try {
      const target = assets.find(a => a.id === assetId);
      const nextReturned = !target?.returned;
      const { error: updErr } = await supabase
        .from('employee_assets')
        .update({
          returned: nextReturned,
          status: nextReturned ? 'Returned' : 'Issued',
          date_returned: nextReturned ? new Date().toISOString().slice(0, 10) : null,
        })
        .eq('id', assetId);
      if (updErr) throw updErr;
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function addDue() {
    if (!dueRow.label.trim()) return;
    const current = await ensureRecord();
    const next = [
      ...(current.pending_dues || []),
      {
        id: Date.now(),
        label: dueRow.label.trim(),
        amount: Number(dueRow.amount) || 0,
        date: dueRow.date || new Date().toISOString().slice(0, 10)
      }
    ];
    await patch({ pending_dues: next }, '✓ Pending due added.');
    setDueRow({ label: '', amount: '', date: new Date().toISOString().slice(0, 10) });
  }

  async function removeDue(index) {
    const current = await ensureRecord();
    const next = (current.pending_dues || []).filter((_, i) => i !== index);
    await patch({ pending_dues: next }, '✓ Pending due removed.');
  }

  async function handleToggleDepositSettled(nextSettled) {
    const dateToSave = nextSettled ? depositRefundDate : null;
    await patch({
      deposit_settled: nextSettled,
      settled_on: dateToSave
    }, nextSettled ? `✓ Security deposits marked refunded & settled on ${dateToSave}.` : 'Security deposits settlement reopened.');
  }

  // Mandatory Gate: Finalize Departure & Complete Clearance (Moves Employee to "Exited")
  async function finalizeExitAndClearance() {
    const summary = summariseExitClearance({ exitRecord: record, employee, deposits, assets });

    if (summary.hasBlockingIssues) {
      setError(`Cannot move employee to Exited. Please resolve all blocking items first (${summary.openItems.filter(i => i.severity === 'high').map(i => i.label).join('; ')}).`);
      return;
    }

    if (!window.confirm(`Confirm full exit clearance and finalize departure for ${employee?.name}? This will mark their status as Exited and lock in their official exit record.`)) {
      return;
    }

    setError(''); setMessage(''); setSaving(true);
    try {
      const userEmail = (await supabase.auth.getUser()).data.user?.email || 'HR Operations';
      const leavingDate = record?.last_working_day || employee?.date_of_leaving || new Date().toISOString().slice(0, 10);
      const exitReasonCode = record?.exit_type || employee?.exit_reason || 'resigned';

      // 1. Update Employee status to 'exited'
      const { error: empErr } = await supabase
        .from('employees')
        .update({
          status: 'exited',
          date_of_leaving: leavingDate,
          exit_reason: exitReasonCode
        })
        .eq('employee_id', id);
      if (empErr) throw empErr;

      // 2. Mark exit_records as 'cleared'
      await ensureRecord();
      await patch({
        clearance_status: 'cleared',
        settled_on: new Date().toISOString().slice(0, 10),
        settled_by: userEmail,
        deposit_settled: true,
        uniform_returned: record?.uniform_returned !== false,
      });

      // 3. Log to audit trail
      await supabase.from('audit_log').insert([{
        actor: userEmail,
        action: 'completed exit clearance and marked employee exited',
        record_affected: `${id} (${employee?.name}) — official exit on ${leavingDate}`,
      }]);

      setMessage('✓ Exit clearance verified and signed off! Employee has been moved to Exited Staff.');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function reopenClearance() {
    if (!window.confirm('Reopen exit clearance for this employee? Status will return to pending clearance.')) return;
    await patch({
      clearance_status: 'pending',
      settled_on: null,
      settled_by: null,
    }, 'Exit clearance reopened.');
  }

  if (!id) return <div className="py-24 text-center text-sm text-ink-muted">No employee selected. Open this page from an employee record.</div>;
  if (loading) return <div className="py-24 text-center text-sm text-ink-muted">Loading exit clearance workspace…</div>;
  if (!employee) return <div className="py-24 text-center text-sm text-ink-muted">Employee not found.</div>;

  const summary = summariseExitClearance({ exitRecord: record, employee, deposits, assets });
  const isExited = employee.status === 'exited';

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 pb-20">
      {/* Header & Back Action */}
      <div className="flex items-start justify-between gap-6 mb-6 pt-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-3xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
              isExited ? 'bg-red-50 text-red-800 border-red-200' : 'bg-amber-50 text-amber-800 border-amber-200'
            }`}>
              {isExited ? '🚪 Exited Staff Record' : '⏳ Serving Notice / Offboarding'}
            </span>
            <span className="text-3xs font-mono text-ink-muted">Ref: {id}</span>
          </div>
          <h1 className="font-serif text-2.5xl sm:text-3xl font-bold text-ink">
            Exit Clearance & Handover Workspace
          </h1>
          <p className="text-xs text-ink-muted mt-1">
            Mandatory clearance protocol for <strong>{employee.name}</strong> ({employee.designation || 'Staff'} · {employee.department || 'General'})
          </p>
        </div>
        <div className="flex gap-2 flex-wrap shrink-0">
          <button
            type="button"
            onClick={() => setShowPrint(v => !v)}
            className="btn-secondary text-xs flex items-center gap-1.5"
          >
            <span>🖨️</span> {showPrint ? 'Hide Printable Form' : 'Preview Exit Slip'}
          </button>
          <a href={`/employees/${id}`} className="btn-quiet text-xs font-semibold">
            ← Profile
          </a>
        </div>
      </div>

      {error && (
        <div className="p-3.5 mb-5 bg-red-50 text-red-800 rounded-control text-xs border border-red-200 flex items-center justify-between">
          <span>⚠️ {error}</span>
          <button onClick={() => setError('')} className="text-red-700 font-bold ml-2">✕</button>
        </div>
      )}
      {message && (
        <div className="p-3.5 mb-5 bg-emerald-50 text-emerald-800 rounded-control text-xs border border-emerald-200 font-semibold flex items-center justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage('')} className="text-emerald-700 font-bold ml-2">✕</button>
        </div>
      )}

      {/* Mandatory Clearance Status & Action Banner */}
      <div className={`p-5 rounded-card border shadow-sm mb-6 ${
        summary.isCleared
          ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
          : summary.hasBlockingIssues
          ? 'bg-red-50/80 border-red-200 text-red-950'
          : 'bg-amber-50/80 border-amber-200 text-amber-950'
      }`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className={`text-base font-bold flex items-center gap-2 ${
              summary.isCleared ? 'text-emerald-800' : summary.hasBlockingIssues ? 'text-red-800' : 'text-amber-800'
            }`}>
              <span>{summary.isCleared ? '✅' : summary.hasBlockingIssues ? '⛔' : '⏳'}</span>
              <span>{summary.isCleared ? 'Clearance Completed & Departure Verified' : `${summary.openCount} Outstanding Clearance Item(s)`}</span>
            </div>
            <p className="text-xs text-ink-muted mt-1">
              {summary.isCleared
                ? `Officially signed off and settled on ${summary.settledOn || 'record'} by ${summary.settledBy || 'Management'}.`
                : 'All uniforms, physical assets, and deposits must be settled and recorded before employee can be marked Exited.'}
            </p>
          </div>

          <div className="flex gap-2">
            {!summary.isCleared ? (
              <button
                type="button"
                onClick={finalizeExitAndClearance}
                disabled={saving || summary.hasBlockingIssues}
                className={`text-xs px-4 py-2 rounded-control font-bold transition-all shadow-xs ${
                  summary.hasBlockingIssues
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed border border-gray-300'
                    : 'bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer'
                }`}
                title={summary.hasBlockingIssues ? 'Resolve all high-priority items below first' : 'Sign off clearance and mark employee as Exited'}
              >
                {saving ? 'Processing…' : '✓ Complete Clearance & Mark Exited'}
              </button>
            ) : (
              <button
                type="button"
                onClick={reopenClearance}
                disabled={saving}
                className="btn-secondary text-xs"
              >
                Reopen Clearance Checklist
              </button>
            )}
          </div>
        </div>

        {summary.openCount > 0 && (
          <div className="mt-4 pt-3 border-t border-rule-soft/60">
            <div className="text-3xs font-bold uppercase tracking-wider text-ink-muted mb-2">Checklist Requirements:</div>
            <ul className="space-y-1.5 text-xs list-none pl-0">
              {summary.openItems.map(item => (
                <li key={item.key} className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    item.severity === 'high' ? 'bg-red-600' : item.severity === 'medium' ? 'bg-amber-500' : 'bg-gray-400'
                  }`} />
                  <span className={item.severity === 'high' ? 'font-semibold text-red-900' : 'text-ink'}>{item.label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* SECTION 1: Exit Facts, Dates & Statutory Gratuity */}
      <form onSubmit={saveExitFacts} className="panel panel-body bg-surface mb-6 p-5">
        <div className="flex justify-between items-center mb-4 pb-2 border-b border-rule-soft">
          <h2 className="panel-title text-base font-bold text-ink">1. Departure Terms & Statutory Gratuity</h2>
          <span className="text-3xs text-ink-muted">Recorded into Personnel Master Record</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="field-label">Last Working Day *</label>
            <input
              type="date"
              name="last_working_day"
              required
              defaultValue={record?.last_working_day || employee.date_of_leaving || new Date().toISOString().slice(0, 10)}
              className="field text-xs"
            />
          </div>

          <div>
            <label className="field-label">Exit Type / Classification</label>
            <select
              name="exit_type"
              defaultValue={record?.exit_type || employee.exit_reason || 'voluntary'}
              className="field text-xs bg-surface"
            >
              {EXIT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div>
            <label className="field-label">Notice Period (Days)</label>
            <input
              type="number"
              name="notice_period_days"
              placeholder="e.g. 30"
              defaultValue={record?.notice_period_days ?? 30}
              className="field text-xs"
            />
          </div>

          <div>
            <label className="field-label">Last Salary Disbursed Date</label>
            <input
              type="date"
              name="last_salary_paid_date"
              defaultValue={record?.last_salary_paid_date || ''}
              className="field text-xs"
            />
          </div>

          {/* Statutory Gratuity (Compliance Formula Pre-filled & Editable) */}
          <div className="sm:col-span-2">
            <div className="flex justify-between items-center mb-1">
              <label className="field-label mb-0">
                Statutory Gratuity Payable (₹)
              </label>
              {statutoryGratuityInfo && (
                <button
                  type="button"
                  onClick={() => setGratuityValue(statutoryGratuityInfo.amount)}
                  className="text-3xs text-accent font-semibold hover:underline"
                >
                  ⚡ Reset to Statutory Formula
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={gratuityValue}
                onChange={e => setGratuityValue(e.target.value)}
                placeholder="0"
                className="field text-xs font-semibold font-mono"
              />
              <label className="flex items-center gap-1.5 text-xs font-semibold text-ink shrink-0 bg-page px-2.5 py-1.5 rounded border border-rule-soft cursor-pointer">
                <input
                  type="checkbox"
                  checked={gratuityPaid}
                  onChange={e => setGratuityPaid(e.target.checked)}
                />
                <span>✓ Paid</span>
              </label>
            </div>
            {statutoryGratuityInfo && (
              <p className="text-3xs text-ink-muted mt-1 font-medium">
                {statutoryGratuityInfo.reason} (Tenure: {statutoryGratuityInfo.tenureText || '—'})
              </p>
            )}
          </div>

          <div className="sm:col-span-3 flex items-center gap-2 pt-1">
            <label className="flex items-center gap-2 text-xs font-semibold text-ink cursor-pointer">
              <input
                type="checkbox"
                name="notice_served"
                defaultChecked={record?.notice_served !== false}
                className="rounded border-rule"
              />
              <span>Notice period fully served as required</span>
            </label>
          </div>
        </div>

        <div>
          <label className="field-label">Administrative Exit Remarks & Handover Notes</label>
          <textarea
            name="open_remarks"
            rows={2}
            defaultValue={record?.open_remarks || ''}
            placeholder="Record handover notes, performance feedback, or rehire recommendations…"
            className="field text-xs font-sans"
          />
        </div>

        <div className="mt-4 flex justify-end">
          <button type="submit" disabled={saving} className="btn-primary text-xs">
            {saving ? 'Saving…' : '💾 Save Departure & Gratuity Details'}
          </button>
        </div>
      </form>

      {/* SECTION 2: Uniform & Asset Verification (With Asset Tag Numbers) */}
      <div className="panel panel-body bg-surface mb-6 p-5">
        <div className="flex justify-between items-center mb-4 pb-2 border-b border-rule-soft">
          <div>
            <h2 className="panel-title text-base font-bold text-ink">2. Asset Verification & Physical Return</h2>
            <p className="text-xs text-ink-muted">
              Verify tag numbers, keys, and condition against the assets issued at onboarding.
            </p>
          </div>
          <a href={`/employees/${id}`} className="text-3xs text-accent font-semibold hover:underline">
            + Issue / Edit Assets in Profile →
          </a>
        </div>

        {/* Uniform Return Verification */}
        <div className="p-3.5 bg-page/60 border border-rule-soft rounded-control flex items-center justify-between gap-4 mb-4">
          <div>
            <div className="font-bold text-xs text-ink flex items-center gap-1.5">
              <span>👕</span> Staff Uniform Return Status
            </div>
            <div className="text-3xs text-ink-muted mt-0.5">
              {record?.uniform_returned ? 'Uniform returned and inspected in good order' : 'Pending return of issued uniform sets'}
            </div>
          </div>
          <div className="flex gap-2">
            {[true, false].map(v => (
              <button
                key={String(v)}
                type="button"
                onClick={() => patch({ uniform_returned: v }, `✓ Uniform marked ${v ? 'Returned' : 'Not Returned'}.`)}
                className={`px-3 py-1 text-xs font-bold rounded-control transition-colors ${
                  record?.uniform_returned === v
                    ? (v ? 'bg-emerald-700 text-white' : 'bg-red-700 text-white')
                    : 'bg-surface text-ink-muted border border-rule hover:bg-page'
                }`}
              >
                {v ? '✓ Returned' : '✗ Not Returned'}
              </button>
            ))}
          </div>
        </div>

        {/* Tagged Assets List with Asset Numbers */}
        {assets.length === 0 ? (
          <p className="text-xs text-ink-muted italic py-3">No additional assets tagged to this employee record.</p>
        ) : (
          <div className="overflow-x-auto border border-rule-soft rounded-control">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-page/70 border-b border-rule-soft text-3xs uppercase font-bold text-ink-muted">
                  <th className="py-2 px-3">Asset Description</th>
                  <th className="py-2 px-3">Asset Tag / Serial / Room #</th>
                  <th className="py-2 px-3">Date Issued</th>
                  <th className="py-2 px-3">Deposit (₹)</th>
                  <th className="py-2 px-3 text-right">Handover Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule-soft text-ink">
                {assets.map(a => (
                  <tr key={a.id} className="hover:bg-page/30">
                    <td className="py-2.5 px-3 font-semibold text-ink">
                      {a.name}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-2xs text-accent font-bold">
                      {a.asset_number || '— (No Tag #)'}
                    </td>
                    <td className="py-2.5 px-3 text-3xs text-ink-muted">
                      {a.date_issued || a.date_handed_over || '—'}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-ink">
                      {Number(a.deposit_amount) > 0 ? `₹${Number(a.deposit_amount).toLocaleString('en-IN')}` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => toggleAsset(a.id)}
                        className={`px-2.5 py-1 rounded text-2xs font-bold transition-colors ${
                          a.returned
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                            : 'bg-red-50 text-red-800 border border-red-300'
                        }`}
                      >
                        {a.returned ? `✓ Returned (${a.date_returned || 'Yes'})` : '✗ Not Returned'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SECTION 3: Deposits & Dues (With Refund Date & Settlement Toggle) */}
      <div className="panel panel-body bg-surface mb-6 p-5">
        <div className="flex justify-between items-center mb-4 pb-2 border-b border-rule-soft">
          <div>
            <h2 className="panel-title text-base font-bold text-ink">3. Security Deposits & Pending Dues Settlement</h2>
            <p className="text-xs text-ink-muted">
              Record refund dates and reconcile any damage deductions or pending salary advances.
            </p>
          </div>
          <span className="text-xs font-mono font-bold text-good">
            Total Deposits Held: ₹{summary.depositsTotal.toLocaleString('en-IN')}
          </span>
        </div>

        {/* Security Deposits Settlement Card */}
        <div className="mb-6 p-4 bg-page/50 border border-rule-soft rounded-control">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
            <div>
              <div className="font-bold text-xs text-ink">Deposit Refund Reconciliation:</div>
              <div className="text-3xs text-ink-muted mt-0.5">
                {deposits.map(d => `${d.deposit_type === 'uniform' ? 'Uniform' : 'Accommodation'}: ₹${Number(d.amount || 0).toLocaleString('en-IN')}`).join(' + ') || 'No deposits on file'}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-3xs text-ink-muted font-bold">Refund Date:</span>
                <input
                  type="date"
                  value={depositRefundDate}
                  onChange={e => setDepositRefundDate(e.target.value)}
                  className="field text-2xs py-1 bg-surface"
                />
              </div>

              <button
                type="button"
                onClick={() => handleToggleDepositSettled(!record?.deposit_settled)}
                className={`px-3 py-1.5 rounded-control text-xs font-bold transition-all shadow-xs ${
                  record?.deposit_settled
                    ? 'bg-emerald-700 text-white'
                    : 'bg-surface text-ink border border-rule hover:bg-page'
                }`}
              >
                {record?.deposit_settled ? `✓ Deposits Settled (${record?.settled_on || 'Yes'})` : 'Mark Deposits Refunded'}
              </button>
            </div>
          </div>
        </div>

        {/* Customizable Pending Dues */}
        <div>
          <div className="text-xs font-bold text-ink mb-2">Customizable Pending Dues / Deductions:</div>
          {(record?.pending_dues || []).length === 0 ? (
            <p className="text-xs text-ink-muted italic py-2">No pending dues or salary deductions recorded.</p>
          ) : (
            <div className="space-y-2 mb-4">
              {(record?.pending_dues || []).map((d, i) => (
                <div key={d.id || i} className="p-2.5 bg-page border border-rule-soft rounded-control flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-ink">{d.label}</span>
                    <span className="text-3xs text-ink-muted ml-2 font-mono">({d.date || '—'})</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold font-mono text-red-700">₹{Number(d.amount || 0).toLocaleString('en-IN')}</span>
                    <button
                      type="button"
                      onClick={() => removeDue(i)}
                      className="text-red-600 hover:text-red-800 text-xs font-bold"
                      title="Remove due"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add Due Row */}
          <div className="flex gap-2 flex-wrap pt-2 border-t border-rule-soft">
            <input
              type="text"
              placeholder="Due description (e.g. Key replacement, Advance balance)"
              value={dueRow.label}
              onChange={e => setDueRow({ ...dueRow, label: e.target.value })}
              className="field text-xs flex-1 min-w-[200px]"
            />
            <input
              type="number"
              placeholder="Amount (₹)"
              value={dueRow.amount}
              onChange={e => setDueRow({ ...dueRow, amount: e.target.value })}
              className="field text-xs w-28 font-mono"
            />
            <input
              type="date"
              value={dueRow.date}
              onChange={e => setDueRow({ ...dueRow, date: e.target.value })}
              className="field text-xs w-36"
            />
            <button
              type="button"
              onClick={addDue}
              className="btn-secondary text-xs shrink-0"
            >
              + Add Due
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 4: Printable Exit Clearance Slip & Formal Sign-off Document */}
      {showPrint && (
        <div className="panel panel-body bg-surface p-8 print:p-0 print:border-none print:shadow-none shadow-lg text-ink">
          <div className="flex justify-between items-center mb-4 pb-2 border-b-2 border-ink no-print">
            <div className="font-serif font-bold text-base">Printable Exit Clearance Form</div>
            <button
              type="button"
              onClick={() => window.print()}
              className="btn-primary text-xs"
            >
              🖨️ Print Document
            </button>
          </div>

          {/* Letterhead */}
          <div className="text-center pb-4 mb-6 border-b-2 border-ink">
            <div className="text-3xs uppercase font-bold tracking-widest text-ink-muted">ATELIER HOSPITALITY</div>
            <h2 className="font-serif text-2xl font-bold text-ink mt-0.5">Employee Exit Clearance & Settlement Certificate</h2>
            <div className="text-xs text-ink-muted mt-0.5">Permanent Offboarding & Compliance Archive</div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-page/60 border border-rule-soft rounded text-xs mb-6">
            <div><span className="text-3xs uppercase font-bold text-ink-muted block">Employee Name</span><strong>{employee.name}</strong></div>
            <div><span className="text-3xs uppercase font-bold text-ink-muted block">Designation</span><span>{employee.designation || 'Staff'}</span></div>
            <div><span className="text-3xs uppercase font-bold text-ink-muted block">Department</span><span>{employee.department || 'General'}</span></div>
            <div><span className="text-3xs uppercase font-bold text-ink-muted block">Employee ID</span><span className="font-mono">{employee.employee_id}</span></div>
            <div><span className="text-3xs uppercase font-bold text-ink-muted block">Date of Joining</span><span>{employee.date_of_joining || '—'}</span></div>
            <div><span className="text-3xs uppercase font-bold text-ink-muted block">Last Working Day</span><span>{record?.last_working_day || employee.date_of_leaving || '—'}</span></div>
            <div><span className="text-3xs uppercase font-bold text-ink-muted block">Exit Classification</span><span className="capitalize">{record?.exit_type || 'Voluntary'}</span></div>
            <div><span className="text-3xs uppercase font-bold text-ink-muted block">Notice Period</span><span>{record?.notice_served ? 'Served' : 'Waived/Pending'} ({record?.notice_period_days ?? 30} days)</span></div>
          </div>

          {/* Assets Handover Table */}
          <div className="mb-6">
            <div className="font-bold text-xs text-ink uppercase tracking-wider mb-2 border-b border-rule-soft pb-1">
              1. Physical Assets & Equipment Handover Verification
            </div>
            <table className="w-full text-xs text-left border border-rule-soft">
              <thead className="bg-page/70 border-b border-rule-soft text-3xs font-bold uppercase">
                <tr>
                  <th className="p-2">Item Description</th>
                  <th className="p-2">Tag / Serial / Room #</th>
                  <th className="p-2">Handover Status</th>
                  <th className="p-2">Return Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule-soft">
                <tr>
                  <td className="p-2 font-semibold">Staff Uniform</td>
                  <td className="p-2 font-mono text-3xs">—</td>
                  <td className="p-2 font-bold">{record?.uniform_returned ? '✓ Returned' : 'Not Returned'}</td>
                  <td className="p-2 text-3xs">{record?.uniform_returned ? (record?.last_working_day || 'Verified') : '—'}</td>
                </tr>
                {assets.map(a => (
                  <tr key={a.id}>
                    <td className="p-2 font-semibold">{a.name}</td>
                    <td className="p-2 font-mono text-3xs text-accent font-bold">{a.asset_number || '—'}</td>
                    <td className="p-2 font-bold">{a.returned ? '✓ Returned' : 'Not Returned'}</td>
                    <td className="p-2 text-3xs">{a.date_returned || (a.returned ? 'Verified' : '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Dues & Gratuity Financial Settlement */}
          <div className="mb-6">
            <div className="font-bold text-xs text-ink uppercase tracking-wider mb-2 border-b border-rule-soft pb-1">
              2. Financial Dues, Deposits & Gratuity Settlement
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-page/50 border border-rule-soft rounded">
                <div className="font-bold text-3xs uppercase text-ink-muted">Deposits Refund</div>
                <div className="text-sm font-bold text-ink mt-0.5">₹{summary.depositsTotal.toLocaleString('en-IN')}</div>
                <div className="text-3xs text-ink-muted mt-1">Status: {record?.deposit_settled ? `✓ Settled on ${record?.settled_on || '—'}` : 'Pending Settlement'}</div>
              </div>

              <div className="p-3 bg-page/50 border border-rule-soft rounded">
                <div className="font-bold text-3xs uppercase text-ink-muted">Statutory Gratuity</div>
                <div className="text-sm font-bold text-ink mt-0.5">₹{Number(record?.gratuity_payable || gratuityValue || 0).toLocaleString('en-IN')}</div>
                <div className="text-3xs text-ink-muted mt-1">Status: {record?.gratuity_paid || gratuityPaid ? '✓ Disbursed' : 'Unpaid / Excluded'}</div>
              </div>
            </div>
          </div>

          {/* Final Signatures */}
          <div className="mt-12 pt-6 border-t-2 border-ink grid grid-cols-2 gap-12 text-center text-xs">
            <div>
              <div className="border-b border-ink/40 pb-10 mb-2"></div>
              <strong>{employee.name}</strong>
              <div className="text-3xs text-ink-muted uppercase font-semibold">Employee Signature & Date</div>
            </div>
            <div>
              <div className="border-b border-ink/40 pb-10 mb-2"></div>
              <strong>Atelier HR / Operations Authority</strong>
              <div className="text-3xs text-ink-muted uppercase font-semibold">Authorized Management Signatory</div>
            </div>
          </div>
        </div>
      )}

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
