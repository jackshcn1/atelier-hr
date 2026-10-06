'use client';
import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '../../../../lib/supabaseClient';
import { computeSalarySplit } from '../../../../lib/salarySplit';

export default function OnboardingDocumentPage() {
  const { id } = useParams();
  const router = useRouter();
  const supabase = createClient();

  const [employee, setEmployee] = useState(null);
  const [sensitiveInfo, setSensitiveInfo] = useState(null);
  const [assets, setAssets] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [acknowledgment, setAcknowledgment] = useState(null);
  const [payrollSettings, setPayrollSettings] = useState(null);
  const [companyPolicies, setCompanyPolicies] = useState(null);

  const [selectedClauses, setSelectedClauses] = useState({});
  const [customClauseTexts, setCustomClauseTexts] = useState({});
  const [editingClauseId, setEditingClauseId] = useState(null);

  // Signed & Collected tracking state
  const [isSignedCollected, setIsSignedCollected] = useState(false);
  const [signedDate, setSignedDate] = useState(new Date().toISOString().slice(0, 10));
  const [signedFile, setSignedFile] = useState(null);
  const [signedFileUrl, setSignedFileUrl] = useState(null);
  const [savingGate, setSavingGate] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Default fallback templates in case DB is being initialized
  const DEFAULT_TEMPLATES = [
    {
      id: 1,
      name: '1. Offer Letter & Appointment Terms',
      default_applicable: 'employment_type',
      default_condition: 'all',
      clause_text: 'We are pleased to confirm your appointment at Atelier as {{designation}} in the {{department}} department, commencing on {{doj}}. Your employment is on a {{employment_type}} basis with standard daily operational hours of 10 hours per shift. You agree to perform the duties assigned to your role diligently and adhere to all operational guidelines.'
    },
    {
      id: 2,
      name: '2. Compensation Structure & Statutory Payment Plan',
      default_applicable: 'employment_type',
      default_condition: 'all',
      clause_text: 'Your monthly compensation is set at a Fixed Gross CTC of {{fixed_salary}} per month. In addition, you are eligible for the Variable Incentive Scheme ({{variable_scheme}}). Statutory Kerala payroll allocations apply as follows: {{salary_split}}. Statutory coverage: {{pf_esi_status}}. Salaries are disbursed monthly following attendance verification.'
    },
    {
      id: 3,
      name: '3. Code of Conduct, Punctuality & Attendance Policy',
      default_applicable: 'department',
      default_condition: 'all',
      clause_text: 'Atelier maintains high standards of guest hospitality and hygiene. Punctual attendance for scheduled shifts is mandatory. Any planned leave must be requested at least 7 days in advance. Unexcused absence or absconding without notice will result in disciplinary action and forfeiting of accrued variable incentives.'
    },
    {
      id: 4,
      name: '4. Prevention of Sexual Harassment (POSH) Policy',
      default_applicable: 'department',
      default_condition: 'all',
      clause_text: 'Atelier is committed to providing a safe, respectful, and dignified work environment for all employees. Harassment of any nature—verbal, physical, or psychological—will not be tolerated and is subject to immediate disciplinary termination and legal reporting under the POSH Act, 2013.'
    },
    {
      id: 5,
      name: '5. Asset Allocation, Uniforms & Security Deposits',
      default_applicable: 'assets_assigned',
      default_condition: 'assets_assigned',
      clause_text: 'The company has issued the following assets and equipment for your operational duties: {{assets_list}}. You are required to maintain all items in clean, undamaged condition. In the event of loss or willful damage, repair/replacement charges will be deducted from your deposit or final salary clearance.'
    },
    {
      id: 6,
      name: '6. Company Accommodation & Facility Guidelines',
      default_applicable: 'assets_assigned',
      default_condition: 'accommodation',
      clause_text: 'Staff utilizing company accommodation agree to maintain cleanliness, adhere to quiet hours, respect fellow residents, and safeguard all room keys and furnishings. The accommodation deposit of {{assets_list}} is refundable upon exit handover in good order.'
    },
    {
      id: 7,
      name: '7. Confidentiality, Food Safety & Non-Disclosure',
      default_applicable: 'department',
      default_condition: 'all',
      clause_text: 'All recipes, culinary preparation methods, vendor pricing, guest details, and financial metrics of Atelier are strictly proprietary. You agree not to disclose, replicate, or share any trade secrets or proprietary workflows with external third parties during or after your tenure.'
    }
  ];

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [empRes, sensRes, assetsRes, depsRes, tmplRes, ackRes, setRes, polRes] = await Promise.all([
        supabase.from('employees').select('*').eq('employee_id', id).single(),
        supabase.from('employee_sensitive_info').select('*').eq('employee_id', id).maybeSingle(),
        supabase.from('employee_assets').select('*').eq('employee_id', id),
        supabase.from('employee_deposits').select('*').eq('employee_id', id),
        supabase.from('onboarding_doc_templates').select('*').eq('is_active', true).order('id'),
        supabase.from('onboarding_acknowledgments').select('*').eq('employee_id', id).maybeSingle(),
        supabase.from('payroll_settings').select('*').eq('id', 1).maybeSingle(),
        supabase.from('company_policies').select('*').eq('id', 1).maybeSingle()
      ]);

      if (empRes.error) throw new Error(empRes.error.message);
      const emp = empRes.data;
      setEmployee(emp);
      setSensitiveInfo(sensRes.data || null);
      const assetList = assetsRes.data || [];
      setAssets(assetList);
      setDeposits(depsRes.data || []);
      setPayrollSettings(setRes.data || { basic_da_floor: 18000, hra_split_percent: 50 });
      setCompanyPolicies(polRes.data || null);

      const loadedTemplates = (tmplRes.data && tmplRes.data.length > 0) ? tmplRes.data : DEFAULT_TEMPLATES;
      setTemplates(loadedTemplates);

      // Initialize selected clauses based on default applicability rules
      const initialSelection = {};
      const initialCustomTexts = {};

      const hasAssets = assetList.length > 0;
      const hasAccommodation = !!emp.accommodation_provided || assetList.some(a => a.name.toLowerCase().includes('accommodation'));
      const hasPfEsi = !!emp.pf_applicable || !!emp.esi_applicable;

      loadedTemplates.forEach(t => {
        initialCustomTexts[t.id] = t.clause_text;
        let isApplicable = true;

        if (t.default_applicable === 'assets_assigned') {
          if (t.default_condition === 'accommodation') {
            isApplicable = hasAccommodation;
          } else {
            isApplicable = hasAssets;
          }
        } else if (t.default_applicable === 'pf_esi_applicable') {
          isApplicable = hasPfEsi;
        } else if (t.default_applicable === 'department' && t.default_condition !== 'all') {
          isApplicable = t.default_condition === emp.department;
        } else if (t.default_applicable === 'employment_type' && t.default_condition !== 'all') {
          isApplicable = t.default_condition === emp.employment_type;
        }

        initialSelection[t.id] = isApplicable;
      });

      setSelectedClauses(initialSelection);
      setCustomClauseTexts(initialCustomTexts);

      // Acknowledgment record
      if (ackRes.data) {
        setAcknowledgment(ackRes.data);
        setIsSignedCollected(!!ackRes.data.signed_collected);
        if (ackRes.data.signed_collected_date) setSignedDate(ackRes.data.signed_collected_date);
        if (ackRes.data.pdf_url) {
          const { data: signedSignedUrl } = await supabase.storage.from('documents').createSignedUrl(ackRes.data.pdf_url, 3600);
          setSignedFileUrl(signedSignedUrl?.signedUrl || null);
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to load onboarding data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [id]);

  function notify(msg) {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(''), 4500);
  }

  // Calculate merge fields
  const mergeFieldValues = useMemo(() => {
    if (!employee) return {};
    const split = computeSalarySplit(employee.current_fixed_salary || 0, payrollSettings);
    const splitText = `Basic+DA: ₹${split.basic_da.toLocaleString('en-IN')}, HRA: ₹${split.hra.toLocaleString('en-IN')}, Other Allowances: ₹${split.other_allowances.toLocaleString('en-IN')}`;

    const formattedAssets = assets.map(a => {
      const parts = [a.name];
      if (a.asset_number) parts.push(`Tag: ${a.asset_number}`);
      if (a.units && a.units > 1) parts.push(`${a.units} units`);
      if (Number(a.deposit_amount) > 0) parts.push(`₹${Number(a.deposit_amount).toLocaleString('en-IN')} deposit`);
      return parts.join(' - ');
    }).join('; ') || 'No physical assets issued';

    const pfEsiText = `PF: ${employee.pf_applicable ? 'Applicable' : 'Not Applicable'}, ESI: ${employee.esi_applicable ? 'Applicable' : 'Not Applicable'}`;
    const emergencyText = `${employee.emergency_contact_name || '—'} (${employee.emergency_contact_phone || '—'})`;

    return {
      '{{name}}': employee.name || '',
      '{{designation}}': employee.designation || 'Staff',
      '{{department}}': employee.department || 'General Hospitality',
      '{{doj}}': employee.date_of_joining || 'Immediate',
      '{{employment_type}}': employee.employment_type || 'full-time',
      '{{fixed_salary}}': `₹${Number(employee.current_fixed_salary || 0).toLocaleString('en-IN')}`,
      '{{variable_scheme}}': `Target: ₹${Number(employee.current_variable_salary || 0).toLocaleString('en-IN')}/month (${employee.variable_pay_scheme || 'Standard Scheme'})`,
      '{{salary_split}}': splitText,
      '{{assets_list}}': formattedAssets,
      '{{pf_esi_status}}': pfEsiText,
      '{{emergency_contact}}': emergencyText
    };
  }, [employee, assets, payrollSettings]);

  // Merge template text with live data
  function renderMergedClause(text) {
    let result = text || '';
    Object.entries(mergeFieldValues).forEach(([placeholder, val]) => {
      result = result.split(placeholder).join(val);
    });
    return result;
  }

  // Handle Save Gate & Signed Document Upload
  async function handleSaveSignedGate(e) {
    e.preventDefault();
    setSavingGate(true);
    setError('');
    try {
      let uploadedFilePath = acknowledgment?.pdf_url || null;

      if (signedFile) {
        const filePath = `onboarding-signed/${id}-${Date.now()}-${signedFile.name}`;
        const { error: upErr } = await supabase.storage.from('documents').upload(filePath, signedFile);
        if (upErr) throw new Error(`Document upload error: ${upErr.message}`);
        uploadedFilePath = filePath;
      }

      const activeClauseNames = templates
        .filter(t => selectedClauses[t.id])
        .map(t => t.name);

      const ackPayload = {
        employee_id: id,
        clauses_merged: activeClauseNames,
        pdf_url: uploadedFilePath,
        signed_collected: isSignedCollected,
        signed_collected_date: isSignedCollected ? signedDate : null,
        signed_by_employee: employee.name,
        signed_by_hr: (await supabase.auth.getUser()).data.user?.email || 'HR Operations'
      };

      const { data: savedAck, error: ackErr } = await supabase
        .from('onboarding_acknowledgments')
        .upsert([ackPayload])
        .select()
        .single();

      if (ackErr) throw new Error(ackErr.message);

      // If signed and collected, advance employee status if in earlier tier
      if (isSignedCollected) {
        await supabase.from('employees').update({
          acknowledgment_id: savedAck.id,
          onboarding_status: 'Active'
        }).eq('employee_id', id);
      }

      notify(isSignedCollected ? '✓ Signed documentation verified! Onboarding gate cleared.' : 'Status updated.');
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to update signed status.');
    } finally {
      setSavingGate(false);
    }
  }

  if (loading) {
    return (
      <div className="p-12 text-center text-ink-muted">
        <div className="inline-block animate-spin text-2xl mb-3">⏳</div>
        <p className="font-serif text-lg">Compiling customized onboarding documentation…</p>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="p-12 text-center text-ink-muted">
        <p className="font-serif text-lg text-red-600">Employee record not found.</p>
        <a href="/employees" className="btn-secondary text-xs mt-3 inline-block">← Back to Employees</a>
      </div>
    );
  }

  const activeTemplates = templates.filter(t => selectedClauses[t.id]);

  return (
    <div className="pb-16 max-w-6xl mx-auto">
      {/* =========================================================================
          SCREEN ONLY WORKSPACE CONTROLS & CLAUSE PICKER
          ========================================================================= */}
      <div className="print:hidden">
        {/* Breadcrumb & Navigation */}
        <div className="flex items-center justify-between gap-4 mb-4">
          <a href={`/employees/${id}`} className="btn-quiet text-xs font-semibold text-ink-muted hover:text-ink">
            ← Back to {employee.name}'s Profile
          </a>
          <div className="text-2xs font-mono text-ink-muted">
            Employee Ref: <span className="font-bold text-ink">{id}</span>
          </div>
        </div>

        {/* Global Feedback Messages */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded-control text-xs flex items-center justify-between">
            <span>⚠️ {error}</span>
            <button onClick={() => setError('')} className="text-red-600 font-bold ml-2">✕</button>
          </div>
        )}
        {successMessage && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-control text-xs flex items-center justify-between">
            <span>{successMessage}</span>
            <button onClick={() => setSuccessMessage('')} className="text-emerald-600 font-bold ml-2">✕</button>
          </div>
        )}

        {/* Header Summary Banner */}
        <div className="panel panel-body bg-surface mb-6 p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-2xs uppercase tracking-wider text-accent font-bold">Onboarding Compliance Package</span>
                <span className={`text-3xs font-bold px-2 py-0.5 rounded-full border ${
                  isSignedCollected
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}>
                  {isSignedCollected ? '✓ Signed & Collected' : '⏳ Awaiting Physical Signature'}
                </span>
              </div>
              <h1 className="font-serif text-2xl md:text-3xl font-bold text-ink">
                Onboarding Documentation & Terms — {employee.name}
              </h1>
              <p className="text-xs text-ink-muted mt-1 max-w-2xl">
                Customized compliance terms, salary breakdown, asset liabilities, and policies merged into a single printable document packet.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => window.print()}
                className="btn-primary text-xs flex items-center gap-1.5 shadow-sm"
              >
                🖨️ Download / Print Combined Document
              </button>
            </div>
          </div>
        </div>

        {/* Two-Column Workspace: Left Clause Configurator / Right Signed Tracking Gate */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">

          {/* Left Column (2 spans): Clause Applicability Configurator */}
          <div className="lg:col-span-2 panel panel-body bg-surface">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-rule-soft">
              <div>
                <h2 className="panel-title text-base font-bold text-ink">📑 Include / Exclude Clauses</h2>
                <p className="text-2xs text-ink-muted">Pre-ticked based on {employee.name}'s department, salary, and issued assets.</p>
              </div>
              <span className="text-2xs font-bold bg-page px-2 py-1 rounded border border-rule-soft">
                {activeTemplates.length} of {templates.length} Clauses Included
              </span>
            </div>

            <div className="space-y-3">
              {templates.map(t => {
                const isSelected = !!selectedClauses[t.id];
                const isEditing = editingClauseId === t.id;
                return (
                  <div
                    key={t.id}
                    className={`border rounded-control p-3.5 transition-all ${
                      isSelected ? 'bg-surface border-rule shadow-2xs' : 'bg-page/50 border-rule-soft opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <label className="flex items-start gap-3 cursor-pointer flex-1">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={e => setSelectedClauses(prev => ({ ...prev, [t.id]: e.target.checked }))}
                          className="mt-1 rounded border-rule text-ink focus:ring-accent"
                        />
                        <div>
                          <div className="text-xs font-bold text-ink flex items-center gap-2">
                            <span>{t.name}</span>
                            {t.default_applicable === 'assets_assigned' && (
                              <span className="text-3xs px-1.5 py-0.2 rounded bg-sky-50 text-sky-800 border border-sky-200">
                                Auto-ticked for Assets
                              </span>
                            )}
                          </div>
                          {!isEditing && (
                            <p className="text-2xs text-ink-muted mt-1 leading-relaxed line-clamp-2">
                              {renderMergedClause(customClauseTexts[t.id] || t.clause_text)}
                            </p>
                          )}
                        </div>
                      </label>

                      {isSelected && (
                        <button
                          type="button"
                          onClick={() => setEditingClauseId(isEditing ? null : t.id)}
                          className="text-3xs text-accent font-semibold hover:underline shrink-0 pt-0.5"
                        >
                          {isEditing ? 'Done' : '✏️ Customise'}
                        </button>
                      )}
                    </div>

                    {/* Inline Term Customizer */}
                    {isEditing && (
                      <div className="mt-3 pt-2.5 border-t border-rule-soft space-y-2">
                        <label className="block text-3xs font-semibold uppercase text-ink-muted">
                          Customise text for {employee.name} (supports merge placeholders like <code className="text-ink">{'{{name}}'}</code>, <code className="text-ink">{'{{fixed_salary}}'}</code>)
                        </label>
                        <textarea
                          rows={3}
                          value={customClauseTexts[t.id] || ''}
                          onChange={e => setCustomClauseTexts(prev => ({ ...prev, [t.id]: e.target.value }))}
                          className="field text-xs font-mono"
                        />
                        <div className="flex justify-between items-center text-3xs text-ink-muted">
                          <span>Live preview updates automatically in document below.</span>
                          <button
                            type="button"
                            onClick={() => setCustomClauseTexts(prev => ({ ...prev, [t.id]: t.clause_text }))}
                            className="text-red-600 hover:underline"
                          >
                            Reset to Default Template
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column (1 span): Signed & Collected Hard Gate Verification */}
          <div className="space-y-6">
            <div className="panel panel-body bg-surface">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-rule-soft">
                <h2 className="panel-title text-base font-bold text-ink">✍️ Physical Signature Gate</h2>
                <span className="text-3xs font-bold uppercase tracking-wider bg-red-100 text-red-900 px-2 py-0.5 rounded">
                  Mandatory Gate
                </span>
              </div>
              <p className="text-xs text-ink-muted mb-4">
                Onboarding cannot advance to <strong>Active</strong> status until this combined terms packet is physically signed, collected, and verified on file.
              </p>

              <form onSubmit={handleSaveSignedGate} className="space-y-4">
                <div className="p-3.5 bg-page border border-rule-soft rounded-control space-y-3">
                  <label className="flex items-center gap-2.5 text-xs font-bold text-ink cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isSignedCollected}
                      onChange={e => setIsSignedCollected(e.target.checked)}
                      className="w-4 h-4 rounded border-rule text-ink focus:ring-accent"
                    />
                    <span>Mark as Signed & Collected</span>
                  </label>

                  {isSignedCollected && (
                    <div className="space-y-3 pt-2 border-t border-rule-soft">
                      <div>
                        <label className="field-label">Date Signed & Collected</label>
                        <input
                          type="date"
                          value={signedDate}
                          onChange={e => setSignedDate(e.target.value)}
                          className="field text-xs bg-surface"
                        />
                      </div>

                      <div>
                        <label className="field-label">Upload Scanned Signed PDF / Copy</label>
                        <input
                          type="file"
                          accept=".pdf,image/*"
                          onChange={e => setSignedFile(e.target.files?.[0] || null)}
                          className="field text-xs py-1 bg-surface"
                        />
                        {signedFileUrl && (
                          <a
                            href={signedFileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-2xs text-accent font-semibold mt-1.5 inline-block hover:underline"
                          >
                            👁️ View Archived Signed Document →
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={savingGate}
                  className="btn-primary text-xs w-full justify-center"
                >
                  {savingGate ? 'Saving Gate…' : 'Save Compliance Gate Status'}
                </button>
              </form>
            </div>

            {/* Quick Helper Tile */}
            <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-card text-xs text-amber-900 space-y-2">
              <div className="font-bold flex items-center gap-1.5">
                <span>💡</span>
                <span>How the Onboarding Gate Works:</span>
              </div>
              <ol className="list-decimal list-inside space-y-1 text-2xs text-amber-950">
                <li>Review the pre-ticked clauses on the left.</li>
                <li>Click <strong>"Download / Print Combined Document"</strong>.</li>
                <li>Hand the printed document to <strong>{employee.name}</strong> on Day 1.</li>
                <li>Collect physical signatures from employee and management.</li>
                <li>Scan and upload the signed document above to clear the gate!</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Visual Separator */}
        <div className="flex items-center gap-3 my-8">
          <div className="h-px bg-rule flex-1"></div>
          <span className="text-2xs font-bold uppercase tracking-wider text-ink-muted font-mono">
            Document Live Preview (What gets printed)
          </span>
          <div className="h-px bg-rule flex-1"></div>
        </div>
      </div>

      {/* =========================================================================
          THE COMBINED DOCUMENT PACKET (Live onscreen preview + Print Layout)
          ========================================================================= */}
      <div className="bg-white border border-rule shadow-md print:border-none print:shadow-none p-8 md:p-12 max-w-4xl mx-auto rounded-card print:rounded-none font-sans text-xs text-gray-900 leading-relaxed">

        {/* Document Formal Letterhead Header */}
        <div className="border-b-2 border-gray-900 pb-4 mb-6 flex justify-between items-start">
          <div>
            <div className="font-serif text-2xl font-bold tracking-tight text-gray-900">
              ATELIER HOSPITALITY
            </div>
            <div className="text-3xs uppercase tracking-widest text-gray-500 font-semibold mt-0.5">
              Official Appointment & Onboarding Compliance Agreement
            </div>
          </div>
          <div className="text-right text-3xs text-gray-500 font-mono">
            <div>Ref Code: <strong className="text-gray-900">{id}</strong></div>
            <div>Date: {employee.date_of_joining || new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
          </div>
        </div>

        {/* Employee Summary Card */}
        <div className="bg-gray-50 border border-gray-200 rounded p-4 mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-2 gap-x-4 text-xs">
            <div>
              <span className="text-3xs uppercase font-bold text-gray-500 block">Candidate Name</span>
              <strong className="text-gray-900 text-sm">{employee.name}</strong>
            </div>
            <div>
              <span className="text-3xs uppercase font-bold text-gray-500 block">Designation</span>
              <span className="font-semibold text-gray-900">{employee.designation || 'Staff'}</span>
            </div>
            <div>
              <span className="text-3xs uppercase font-bold text-gray-500 block">Department</span>
              <span className="font-semibold text-gray-900">{employee.department || 'General'}</span>
            </div>
            <div>
              <span className="text-3xs uppercase font-bold text-gray-500 block">Date of Joining</span>
              <span className="font-semibold text-gray-900">{employee.date_of_joining || '—'}</span>
            </div>
            <div>
              <span className="text-3xs uppercase font-bold text-gray-500 block">Fixed Salary (CTC)</span>
              <span className="font-semibold text-gray-900">₹{Number(employee.current_fixed_salary || 0).toLocaleString('en-IN')}/mo</span>
            </div>
            <div>
              <span className="text-3xs uppercase font-bold text-gray-500 block">Variable Target</span>
              <span className="font-semibold text-gray-900">₹{Number(employee.current_variable_salary || 0).toLocaleString('en-IN')}/mo</span>
            </div>
            <div>
              <span className="text-3xs uppercase font-bold text-gray-500 block">Emergency Contact</span>
              <span className="text-gray-900">{employee.emergency_contact_name || '—'}</span>
            </div>
            <div>
              <span className="text-3xs uppercase font-bold text-gray-500 block">Contact Phone</span>
              <span className="font-mono text-gray-900">{employee.phone || '—'}</span>
            </div>
          </div>
        </div>

        {/* Compiled Dynamic Clauses List */}
        <div className="space-y-6 mb-8">
          {activeTemplates.map((t, idx) => (
            <div key={t.id} className="space-y-1.5">
              <h3 className="font-serif text-sm font-bold text-gray-900 border-b border-gray-200 pb-1">
                {t.name}
              </h3>
              <p className="text-xs text-gray-800 leading-relaxed whitespace-pre-wrap">
                {renderMergedClause(customClauseTexts[t.id] || t.clause_text)}
              </p>
            </div>
          ))}
        </div>

        {/* Assets & Liability Ledger Table (if assets assigned) */}
        {assets.length > 0 && (
          <div className="mb-8 space-y-2">
            <h3 className="font-serif text-sm font-bold text-gray-900 border-b border-gray-200 pb-1">
              Issued Asset & Key Allocation Schedule
            </h3>
            <table className="w-full text-2xs border border-gray-200 text-left">
              <thead className="bg-gray-100 font-bold text-gray-700">
                <tr>
                  <th className="p-1.5 border-b border-gray-300">Item Description</th>
                  <th className="p-1.5 border-b border-gray-300">Tag / Size / Room #</th>
                  <th className="p-1.5 border-b border-gray-300">Qty</th>
                  <th className="p-1.5 border-b border-gray-300">Deposit (₹)</th>
                  <th className="p-1.5 border-b border-gray-300">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {assets.map(a => (
                  <tr key={a.id}>
                    <td className="p-1.5 font-semibold">{a.name}</td>
                    <td className="p-1.5 font-mono">{a.asset_number || '—'}</td>
                    <td className="p-1.5">{a.units ?? 1}</td>
                    <td className="p-1.5 font-semibold">{Number(a.deposit_amount) > 0 ? `₹${Number(a.deposit_amount).toLocaleString('en-IN')}` : '—'}</td>
                    <td className="p-1.5 capitalize font-bold text-gray-700">{a.status || 'Issued'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Formal Acknowledgment Declaration */}
        <div className="p-4 bg-gray-50 border border-gray-300 rounded mb-10 text-xs text-gray-800 leading-relaxed">
          <p className="font-bold text-gray-900 mb-1">Declaration & Acceptance:</p>
          <p>
            I, <strong>{employee.name}</strong>, hereby acknowledge that I have read, understood, and received a copy of the
            above terms of employment, compensation breakdown, code of conduct, POSH guidelines, and asset allocation schedule.
            I unconditionally agree to abide by all the policies and procedures established by Atelier.
          </p>
        </div>

        {/* Dual Signature Execution Block */}
        <div className="pt-6 border-t border-gray-400 grid grid-cols-2 gap-16 text-center text-xs">
          <div>
            <div className="border-b border-gray-400 pb-12 mb-2"></div>
            <div className="font-bold text-gray-900">{employee.name}</div>
            <div className="text-3xs text-gray-500 uppercase font-semibold">Employee Signature & Date</div>
          </div>
          <div>
            <div className="border-b border-gray-400 pb-12 mb-2"></div>
            <div className="font-bold text-gray-900">Atelier Hospitality Operations / HR</div>
            <div className="text-3xs text-gray-500 uppercase font-semibold">Authorized Management Signatory & Date</div>
          </div>
        </div>
      </div>

      {/* Global Print Media Styles */}
      <style jsx global>{`
        @media print {
          nav, header, aside, .no-print, .print\\:hidden {
            display: none !important;
          }
          body {
            background: white !important;
            color: #111827 !important;
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
