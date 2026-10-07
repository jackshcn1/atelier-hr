'use client';
import { useEffect, useState, useMemo } from 'react';
import { createClient } from '../../lib/supabaseClient';
import { computeSalarySplit } from '../../lib/salarySplit';

const initialEmptyForm = {
  // 1. Role & Job Basics
  employee_id: '',
  name: '',
  designation: '',
  department: 'Service',
  employment_type: 'full-time',
  date_of_joining: '',
  probation_end_date: '',
  reporting_manager_id: '',
  standard_hours_per_day: 10,

  // 2. Personal & Contact Details
  phone: '',
  email: '',
  dob: '',
  gender: '',
  blood_group: '',
  address: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  previous_work_history: '',
  education_history: '',
  notes: '',

  // 3. Identification
  id_proof_type: 'Aadhaar',
  id_proof_number: '',

  // 4. Compensation & Variable Pay
  current_fixed_salary: '',
  current_variable_salary: '',
  variable_pay_scheme: '',
  pf_applicable: false,
  pf_number: '',
  esi_applicable: false,
  esi_number: '',
  accommodation_provided: false,

  // 5. Bank Details (Admin-Only Sensitive)
  bank_account_holder_name: '',
  bank_name: '',
  bank_ifsc_code: '',
  bank_account_number: ''
};

const initialAssetsForm = {
  uniform: {
    enabled: true,
    name: 'Uniform',
    asset_number: '',
    units: 2,
    deposit_amount: 500,
    date_issued: '',
    status: 'Issued'
  },
  accommodation: {
    enabled: false,
    name: 'Company Accommodation',
    asset_number: '',
    units: 1,
    deposit_amount: 2000,
    date_issued: '',
    status: 'Issued'
  },
  custom: []
};

const DEFAULT_ONBOARDING_CLAUSES = [
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

export default function EmployeesPage() {
  const supabase = createClient();
  const [employees, setEmployees] = useState([]); // active + on-notice only
  const [allEmployees, setAllEmployees] = useState([]); // every status, for manager lookups
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [schemes, setSchemes] = useState([]);
  const [depositSettings, setDepositSettings] = useState({ uniform_deposit_amount: 500, accommodation_deposit_amount: 2000 });
  const [payrollSettings, setPayrollSettings] = useState({ basic_da_floor: 18000, hra_split_percent: 50 });

  // Filter states (multi-select / toggle arrays)
  const [selectedDepts, setSelectedDepts] = useState([]); // empty = all
  const [selectedStatuses, setSelectedStatuses] = useState(['active', 'on-notice']); // default active + on-notice

  const [form, setForm] = useState(initialEmptyForm);
  const [assetsForm, setAssetsForm] = useState(initialAssetsForm);
  const [showForm, setShowForm] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [idFrontFile, setIdFrontFile] = useState(null);
  const [idBackFile, setIdBackFile] = useState(null);

  // Onboarding Clause Templates & Signed Tracking inside Drawer
  const [clauseTemplates, setClauseTemplates] = useState(DEFAULT_ONBOARDING_CLAUSES);
  const [selectedClauses, setSelectedClauses] = useState({});
  const [customClauseTexts, setCustomClauseTexts] = useState({});

  // Physical Signed Document Upload & Verification
  const [isSignedCollected, setIsSignedCollected] = useState(false);
  const [signedDate, setSignedDate] = useState(new Date().toISOString().slice(0, 10));
  const [signedFile, setSignedFile] = useState(null);

  // Modal Preview for Document Printing / Download
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    const [all, depts, desigs, schemeData, depSetData, tmplData, pSetData] = await Promise.all([
      supabase.from('employees').select('*').is('deleted_at', null).order('name'),
      supabase.from('departments').select('name').order('name'),
      supabase.from('designations').select('*').order('name'),
      supabase.from('variable_pay_schemes').select('name, display_name').eq('is_active', true),
      supabase.from('deposit_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('onboarding_doc_templates').select('*').eq('is_active', true).order('id'),
      supabase.from('payroll_settings').select('*').eq('id', 1).maybeSingle()
    ]);

    if (all.error) setError(all.error.message);
    else {
      setEmployees(all.data || []);
      setAllEmployees(all.data || []);
    }
    setDepartments((depts.data || []).map(d => d.name));
    setDesignations(desigs.data || []);
    setSchemes(schemeData.data || []);
    if (pSetData?.data) setPayrollSettings(pSetData.data);

    if (depSetData?.data) {
      setDepositSettings(depSetData.data);
      setAssetsForm(prev => ({
        ...prev,
        uniform: {
          ...prev.uniform,
          deposit_amount: depSetData.data.uniform_deposit_amount ?? 500
        },
        accommodation: {
          ...prev.accommodation,
          deposit_amount: depSetData.data.accommodation_deposit_amount ?? 2000
        }
      }));
    }

    const loadedClauses = (tmplData?.data && tmplData.data.length > 0) ? tmplData.data : DEFAULT_ONBOARDING_CLAUSES;
    setClauseTemplates(loadedClauses);
    syncClauseSelection(loadedClauses, form, initialAssetsForm);
  }

  function syncClauseSelection(clauses, currentForm, currentAssets) {
    const sel = {};
    const texts = {};
    const hasAssets = !!currentAssets.uniform.enabled || currentAssets.custom.length > 0;
    const hasAccommodation = !!currentAssets.accommodation.enabled || !!currentForm.accommodation_provided;
    const hasPfEsi = !!currentForm.pf_applicable || !!currentForm.esi_applicable;

    clauses.forEach(c => {
      texts[c.id] = c.clause_text;
      let isApplicable = true;

      if (c.default_applicable === 'assets_assigned') {
        if (c.default_condition === 'accommodation') {
          isApplicable = hasAccommodation;
        } else {
          isApplicable = hasAssets;
        }
      } else if (c.default_applicable === 'pf_esi_applicable') {
        isApplicable = hasPfEsi;
      } else if (c.default_applicable === 'department' && c.default_condition !== 'all') {
        isApplicable = c.default_condition === currentForm.department;
      } else if (c.default_applicable === 'employment_type' && c.default_condition !== 'all') {
        isApplicable = c.default_condition === currentForm.employment_type;
      }

      sel[c.id] = isApplicable;
    });

    setSelectedClauses(sel);
    setCustomClauseTexts(texts);
  }

  useEffect(() => { load(); }, []);

  // Whenever key triggers change in form, refresh auto-checked clauses
  useEffect(() => {
    syncClauseSelection(clauseTemplates, form, assetsForm);
  }, [form.department, form.employment_type, form.pf_applicable, form.esi_applicable, form.accommodation_provided, assetsForm.uniform.enabled, assetsForm.accommodation.enabled, assetsForm.custom.length]);

  function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  }

  // Generate Document HTML and Data for Printing or Modal Preview
  const compiledDocData = useMemo(() => {
    const split = computeSalarySplit(form.current_fixed_salary || 0, payrollSettings);
    const splitText = `Basic+DA: ₹${split.basic_da.toLocaleString('en-IN')}, HRA: ₹${split.hra.toLocaleString('en-IN')}, Other Allowances: ₹${split.other_allowances.toLocaleString('en-IN')}`;

    const assetsList = [];
    if (assetsForm.uniform.enabled) {
      assetsList.push(`Uniform (${assetsForm.uniform.units || 2} sets, ${assetsForm.uniform.asset_number || 'Standard'}, Deposit: ₹${assetsForm.uniform.deposit_amount || 0})`);
    }
    if (assetsForm.accommodation.enabled || form.accommodation_provided) {
      assetsList.push(`Company Accommodation (${assetsForm.accommodation.asset_number || 'Room Key'}, Deposit: ₹${assetsForm.accommodation.deposit_amount || 0})`);
    }
    assetsForm.custom.forEach(c => {
      if (c.name) assetsList.push(`${c.name} (${c.units || 1} units, ${c.asset_number || '—'}, Deposit: ₹${c.deposit_amount || 0})`);
    });
    const assetsText = assetsList.length > 0 ? assetsList.join('; ') : 'No physical assets issued';

    const pfEsiText = `PF: ${form.pf_applicable ? 'Applicable' : 'Not Applicable'}, ESI: ${form.esi_applicable ? 'Applicable' : 'Not Applicable'}`;
    const emergencyText = `${form.emergency_contact_name || '—'} (${form.emergency_contact_phone || '—'})`;

    const mergeMap = {
      '{{name}}': form.name || 'Candidate',
      '{{designation}}': form.designation || 'Staff Member',
      '{{department}}': form.department || 'General',
      '{{doj}}': form.date_of_joining || new Date().toISOString().slice(0, 10),
      '{{employment_type}}': form.employment_type || 'full-time',
      '{{fixed_salary}}': `₹${Number(form.current_fixed_salary || 0).toLocaleString('en-IN')}`,
      '{{variable_scheme}}': `Target: ₹${Number(form.current_variable_salary || 0).toLocaleString('en-IN')}/mo (${form.variable_pay_scheme || 'Standard Scheme'})`,
      '{{salary_split}}': splitText,
      '{{assets_list}}': assetsText,
      '{{pf_esi_status}}': pfEsiText,
      '{{emergency_contact}}': emergencyText
    };

    const activeTemplates = clauseTemplates.filter(t => selectedClauses[t.id]);
    const clausesWithMerged = activeTemplates.map(t => {
      let text = customClauseTexts[t.id] || t.clause_text;
      Object.entries(mergeMap).forEach(([k, v]) => {
        text = text.split(k).join(v);
      });
      return { id: t.id, name: t.name, text };
    });

    return {
      name: form.name || 'Candidate',
      refCode: form.employee_id || 'PENDING',
      designation: form.designation || 'Staff',
      department: form.department || 'General',
      doj: form.date_of_joining || new Date().toISOString().slice(0, 10),
      fixedSalary: `₹${Number(form.current_fixed_salary || 0).toLocaleString('en-IN')}/mo`,
      variableTarget: `₹${Number(form.current_variable_salary || 0).toLocaleString('en-IN')}/mo`,
      empType: form.employment_type || 'Full-time',
      phone: form.phone || '—',
      clauses: clausesWithMerged
    };
  }, [form, assetsForm, payrollSettings, clauseTemplates, selectedClauses, customClauseTexts]);

  // Open modal preview or print
  function handleDownloadPrintClick() {
    if (!form.name.trim()) {
      setError('Please enter at least the candidate name before previewing or printing the agreement.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setPreviewModalOpen(true);
  }

  function triggerBrowserPrint() {
    const clausesHtml = compiledDocData.clauses.map(c => (
      `<div style="margin-bottom: 18px;">
        <h3 style="font-family: Georgia, serif; font-size: 13px; font-weight: bold; margin: 0 0 4px 0; color: #111827; border-bottom: 1px solid #e5e7eb; padding-bottom: 2px;">${c.name}</h3>
        <p style="margin: 0; line-height: 1.6; color: #374151; font-size: 11px; white-space: pre-wrap;">${c.text}</p>
      </div>`
    )).join('');

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <title>Onboarding Agreement — ${compiledDocData.name}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm 15mm; }
    body { font-family: system-ui, -apple-system, sans-serif; font-size: 11px; color: #111; margin: 20px auto; max-width: 750px; line-height: 1.5; }
    h1, h2, h3 { font-family: Georgia, serif; }
    .header { border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-end; }
    .summary { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 4px; padding: 10px; margin-bottom: 18px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; font-size: 11px; }
    .label { font-size: 9px; text-transform: uppercase; color: #6b7280; font-weight: bold; display: block; }
    .declaration { background: #f9fafb; border: 1px solid #d1d5db; border-radius: 4px; padding: 12px; margin: 24px 0 32px 0; font-size: 11px; }
    .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ccc; }
    .sig-line { border-bottom: 1px solid #000; padding-bottom: 40px; margin-bottom: 4px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div style="font-size: 20px; font-weight: bold; font-family: Georgia, serif;">ATELIER HOSPITALITY</div>
      <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; font-weight: 600;">Official Appointment & Onboarding Compliance Agreement</div>
    </div>
    <div style="text-align: right; font-size: 10px; color: #6b7280; font-family: monospace;">
      <div>Ref Code: <strong>${compiledDocData.refCode}</strong></div>
      <div>Date: ${compiledDocData.doj}</div>
    </div>
  </div>

  <div class="summary">
    <div><span class="label">Candidate Name</span><strong>${compiledDocData.name}</strong></div>
    <div><span class="label">Designation</span><span>${compiledDocData.designation}</span></div>
    <div><span class="label">Department</span><span>${compiledDocData.department}</span></div>
    <div><span class="label">Date of Joining</span><span>${compiledDocData.doj}</span></div>
    <div><span class="label">Fixed Salary (CTC)</span><span>${compiledDocData.fixedSalary}</span></div>
    <div><span class="label">Variable Target</span><span>${compiledDocData.variableTarget}</span></div>
    <div><span class="label">Employment Type</span><span style="text-transform: capitalize;">${compiledDocData.empType}</span></div>
    <div><span class="label">Contact Phone</span><span>${compiledDocData.phone}</span></div>
  </div>

  <div>${clausesHtml}</div>

  <div class="declaration">
    <div style="font-weight: bold; margin-bottom: 4px;">Declaration & Acceptance:</div>
    <div>I, <strong>${compiledDocData.name}</strong>, acknowledge that I have read, understood, and received a copy of the above terms of employment, compensation breakdown, code of conduct, POSH guidelines, and asset allocation schedule. I unconditionally agree to abide by all the policies and procedures established by Atelier.</div>
  </div>

  <div class="sig-grid">
    <div>
      <div class="sig-line"></div>
      <strong>${compiledDocData.name}</strong>
      <div style="font-size: 9px; color: #6b7280; text-transform: uppercase;">Employee Signature & Date</div>
    </div>
    <div>
      <div class="sig-line"></div>
      <strong>Atelier Operations / HR</strong>
      <div style="font-size: 9px; color: #6b7280; text-transform: uppercase;">Authorized Management Signatory & Date</div>
    </div>
  </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const printWindow = window.open(blobUrl, '_blank');
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
      };
    } else {
      // Fallback: download HTML directly if popup is blocked
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `Onboarding_Agreement_${compiledDocData.name.replace(/\s+/g, '_')}.html`;
      a.click();
    }
  }

  async function handleAdd(e, saveAsDraft = false) {
    if (e) e.preventDefault();
    setError('');
    const cleanId = form.employee_id.trim();
    if (!cleanId) { setError('Employee ID (Petpooja code) is required.'); return; }
    if (!form.name.trim()) { setError('Employee name is required.'); return; }

    setSubmitting(true);

    try {
      // 1. Upload photo if attached
      let passportUrl = null;
      if (photoFile) {
        const pPath = `passport-photos/${cleanId}-${Date.now()}-${photoFile.name}`;
        const { error: pErr } = await supabase.storage.from('documents').upload(pPath, photoFile);
        if (!pErr) passportUrl = pPath;
      }

      // 2. Upload ID proof scans if attached
      let idFrontUrl = null;
      let idBackUrl = null;
      if (idFrontFile) {
        const fPath = `id-proofs/${cleanId}-front-${Date.now()}-${idFrontFile.name}`;
        const { error: fErr } = await supabase.storage.from('documents').upload(fPath, idFrontFile);
        if (!fErr) idFrontUrl = fPath;
      }
      if (idBackFile) {
        const bPath = `id-proofs/${cleanId}-back-${Date.now()}-${idBackFile.name}`;
        const { error: bErr } = await supabase.storage.from('documents').upload(bPath, idBackFile);
        if (!bErr) idBackUrl = bPath;
      }

      // 3. Upload scanned signed onboarding document if attached
      let signedDocPath = null;
      if (signedFile) {
        const sPath = `onboarding-signed/${cleanId}-${Date.now()}-${signedFile.name}`;
        const { error: sErr } = await supabase.storage.from('documents').upload(sPath, signedFile);
        if (!sErr) signedDocPath = sPath;
      }

      // 4. Determine Gated Onboarding Status
      const isAccommodationActive = !!assetsForm.accommodation.enabled || !!form.accommodation_provided;
      const hasId = !!(form.id_proof_number.trim() || idFrontUrl);
      const hasBank = !!(form.bank_account_number.trim() && form.bank_ifsc_code.trim());
      const hasComp = Number(form.current_fixed_salary) > 0;
      const hasContact = !!(form.emergency_contact_name.trim() && form.emergency_contact_phone.trim());

      let calcOnboardingStatus = 'Draft';
      if (saveAsDraft) {
        calcOnboardingStatus = 'Draft';
      } else if (isSignedCollected && hasComp && hasBank && hasId && hasContact) {
        calcOnboardingStatus = 'Active';
      } else if (hasComp) {
        calcOnboardingStatus = 'Compensation Set';
      } else if (hasId || hasBank) {
        calcOnboardingStatus = 'Documents Pending';
      }

      const empPayload = {
        employee_id: cleanId,
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        designation: form.designation.trim() || null,
        department: form.department || null,
        employment_type: form.employment_type || 'full-time',
        date_of_joining: form.date_of_joining || null,
        probation_end_date: form.probation_end_date || null,
        reporting_manager_id: form.reporting_manager_id || null,
        standard_hours_per_day: Number(form.standard_hours_per_day) || 10,
        dob: form.dob || null,
        gender: form.gender || null,
        blood_group: form.blood_group || null,
        address: form.address.trim() || null,
        emergency_contact_name: form.emergency_contact_name.trim() || null,
        emergency_contact_phone: form.emergency_contact_phone.trim() || null,
        id_proof_type: form.id_proof_type || null,
        passport_photo_url: passportUrl,
        previous_work_history: form.previous_work_history.trim() || null,
        education_history: form.education_history.trim() || null,
        notes: form.notes.trim() || null,
        pf_applicable: !!form.pf_applicable,
        esi_applicable: !!form.esi_applicable,
        accommodation_provided: isAccommodationActive,
        uniform_deposit_applicable: assetsForm.uniform.enabled ? 'true' : 'false',
        current_fixed_salary: Number(form.current_fixed_salary) || 0,
        current_variable_salary: Number(form.current_variable_salary) || 0,
        variable_pay_scheme: form.variable_pay_scheme || null,
        onboarding_status: calcOnboardingStatus,
        status: 'active'
      };

      const { error: empError } = await supabase.from('employees').insert([empPayload]);
      if (empError) {
        setError(empError.message);
        setSubmitting(false);
        return;
      }

      // 5. Insert into employee_sensitive_info table
      const hasSensitive = form.id_proof_number || idFrontUrl || idBackUrl || form.pf_number || form.esi_number || form.bank_account_number || form.bank_account_holder_name || form.bank_name || form.bank_ifsc_code;
      if (hasSensitive) {
        await supabase.from('employee_sensitive_info').upsert([{
          employee_id: cleanId,
          id_proof_number: form.id_proof_number.trim() || null,
          id_proof_front_url: idFrontUrl,
          id_proof_back_url: idBackUrl,
          pf_number: form.pf_number.trim() || null,
          esi_number: form.esi_number.trim() || null,
          bank_account_holder_name: form.bank_account_holder_name.trim() || form.name.trim(),
          bank_name: form.bank_name.trim() || null,
          bank_ifsc_code: form.bank_ifsc_code.trim() || null,
          bank_account_number: form.bank_account_number.trim() || null
        }]);
      }

      // 6. Insert Assets into employee_assets
      const assetsToInsert = [];
      const defaultDate = form.date_of_joining || new Date().toISOString().slice(0, 10);

      if (assetsForm.uniform.enabled) {
        assetsToInsert.push({
          employee_id: cleanId,
          name: assetsForm.uniform.name.trim() || 'Uniform',
          asset_number: assetsForm.uniform.asset_number.trim() || null,
          units: Number(assetsForm.uniform.units) || 1,
          deposit_amount: Number(assetsForm.uniform.deposit_amount) || 0,
          date_issued: assetsForm.uniform.date_issued || defaultDate,
          date_handed_over: assetsForm.uniform.date_issued || defaultDate,
          status: 'Issued',
          returned: false
        });
      }

      if (isAccommodationActive) {
        assetsToInsert.push({
          employee_id: cleanId,
          name: assetsForm.accommodation.name.trim() || 'Company Accommodation',
          asset_number: assetsForm.accommodation.asset_number.trim() || null,
          units: Number(assetsForm.accommodation.units) || 1,
          deposit_amount: Number(assetsForm.accommodation.deposit_amount) || 0,
          date_issued: assetsForm.accommodation.date_issued || defaultDate,
          date_handed_over: assetsForm.accommodation.date_issued || defaultDate,
          status: 'Issued',
          returned: false
        });
      }

      assetsForm.custom.forEach(item => {
        if (item.name && item.name.trim()) {
          assetsToInsert.push({
            employee_id: cleanId,
            name: item.name.trim(),
            asset_number: item.asset_number?.trim() || null,
            units: Number(item.units) || 1,
            deposit_amount: Number(item.deposit_amount) || 0,
            date_issued: item.date_issued || defaultDate,
            date_handed_over: item.date_issued || defaultDate,
            status: item.status || 'Issued',
            returned: item.status === 'Returned'
          });
        }
      });

      if (assetsToInsert.length > 0) {
        await supabase.from('employee_assets').insert(assetsToInsert);
      }

      // 7. Snapshot deposits into employee_deposits
      const depositRows = assetsToInsert
        .filter(a => Number(a.deposit_amount) > 0)
        .map(a => ({
          employee_id: cleanId,
          deposit_type: a.name.toLowerCase().includes('accommodation') ? 'accommodation' : 'uniform',
          amount: Number(a.deposit_amount)
        }));
      if (depositRows.length > 0) {
        await supabase.from('employee_deposits').insert(depositRows);
      }

      // 8. Snapshot initial salary into salary_history
      if (form.current_fixed_salary || form.current_variable_salary) {
        const { data: settings } = await supabase.from('payroll_settings').select('*').eq('id', 1).single();
        const split = computeSalarySplit(form.current_fixed_salary, settings);
        await supabase.from('salary_history').insert([{
          employee_id: cleanId,
          fixed: Number(form.current_fixed_salary) || 0,
          variable: Number(form.current_variable_salary) || 0,
          ...split,
          effective_from: form.date_of_joining || new Date().toISOString().slice(0, 10),
          reason: 'Starting salary (Onboarding)'
        }]);
      }

      // 9. Save Onboarding Acknowledgment record
      const activeClauseNames = clauseTemplates.filter(t => selectedClauses[t.id]).map(t => t.name);
      const ackPayload = {
        employee_id: cleanId,
        clauses_merged: activeClauseNames,
        pdf_url: signedDocPath,
        signed_collected: isSignedCollected,
        signed_collected_date: isSignedCollected ? signedDate : null,
        signed_by_employee: form.name.trim(),
        signed_by_hr: (await supabase.auth.getUser()).data.user?.email || 'HR Operations'
      };
      const { data: ackData } = await supabase.from('onboarding_acknowledgments').insert([ackPayload]).select().maybeSingle();
      if (ackData?.id) {
        await supabase.from('employees').update({ acknowledgment_id: ackData.id }).eq('employee_id', cleanId);
      }

      // Reset form & state
      setForm(initialEmptyForm);
      setAssetsForm({
        ...initialAssetsForm,
        uniform: { ...initialAssetsForm.uniform, deposit_amount: depositSettings.uniform_deposit_amount ?? 500 },
        accommodation: { ...initialAssetsForm.accommodation, deposit_amount: depositSettings.accommodation_deposit_amount ?? 2000 }
      });
      setPhotoFile(null);
      setPhotoPreview(null);
      setIdFrontFile(null);
      setIdBackFile(null);
      setSignedFile(null);
      setIsSignedCollected(false);
      setShowForm(false);
      setSubmitting(false);
      setMessage(`✓ ${form.name.trim()} successfully onboarded with status: ${calcOnboardingStatus}!`);
      load();
    } catch (err) {
      setError(err.message || 'Failed to create employee.');
      setSubmitting(false);
    }
  }

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: '0 0 4px 0' }}>Employees</h1>
          <p style={{ color: '#666', margin: 0 }}>Showing staff directory with multi-department & status filters.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={() => setShowForm(s => !s)}
            style={{
              background: showForm ? '#e5e7eb' : '#2563eb',
              color: showForm ? '#1f2937' : 'white',
              border: 'none',
              padding: '9px 18px',
              borderRadius: 6,
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer'
            }}
          >
            {showForm ? '✕ Close Form' : '+ Add New Employee'}
          </button>
        </div>
      </div>

      {/* Multi-Select Toggle Filters Bar */}
      <div style={{ background: 'white', padding: '12px 16px', borderRadius: 8, border: '1px solid #e5e7eb', marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Status Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#475569', minWidth: 60 }}>Status:</span>
          {[
            { id: 'active', label: '✓ Active', activeColor: '#059669', activeBg: '#ecfdf5', activeBorder: '#a7f3d0' },
            { id: 'on-notice', label: '⏳ On Notice', activeColor: '#d97706', activeBg: '#fffbeb', activeBorder: '#fde68a' },
            { id: 'exited', label: '🚪 Exited', activeColor: '#dc2626', activeBg: '#fef2f2', activeBorder: '#fecaca' }
          ].map(st => {
            const isSelected = selectedStatuses.includes(st.id);
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => {
                  setSelectedStatuses(prev => {
                    if (prev.includes(st.id)) {
                      return prev.length === 1 ? prev : prev.filter(x => x !== st.id);
                    } else {
                      return [...prev, st.id];
                    }
                  });
                }}
                style={{
                  padding: '4px 10px',
                  borderRadius: 16,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: isSelected ? st.activeBg : '#f8fafc',
                  color: isSelected ? st.activeColor : '#64748b',
                  border: isSelected ? `1.5px solid ${st.activeBorder}` : '1px solid #cbd5e1',
                  transition: 'all 0.15s ease'
                }}
              >
                {st.label}
              </button>
            );
          })}
        </div>

        {/* Department Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#475569', minWidth: 60 }}>Department:</span>
          <button
            type="button"
            onClick={() => setSelectedDepts([])}
            style={{
              padding: '4px 10px',
              borderRadius: 16,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              background: selectedDepts.length === 0 ? '#1e40af' : '#f8fafc',
              color: selectedDepts.length === 0 ? 'white' : '#64748b',
              border: selectedDepts.length === 0 ? '1.5px solid #1e40af' : '1px solid #cbd5e1'
            }}
          >
            All Departments
          </button>
          {departments.map(dept => {
            const isSelected = selectedDepts.includes(dept);
            return (
              <button
                key={dept}
                type="button"
                onClick={() => {
                  setSelectedDepts(prev => {
                    if (prev.includes(dept)) {
                      return prev.filter(d => d !== dept);
                    } else {
                      return [...prev, dept];
                    }
                  });
                }}
                style={{
                  padding: '4px 10px',
                  borderRadius: 16,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: isSelected ? '#eff6ff' : '#f8fafc',
                  color: isSelected ? '#1d4ed8' : '#64748b',
                  border: isSelected ? '1.5px solid #93c5fd' : '1px solid #cbd5e1'
                }}
              >
                {dept}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #f87171', color: '#991b1b', padding: '10px 16px', borderRadius: 6, marginTop: 14, fontWeight: 500 }}>
          {error}
        </div>
      )}
      {message && (
        <div style={{ background: '#ecfdf5', border: '1px solid #10b981', color: '#065f46', padding: '10px 16px', borderRadius: 6, marginTop: 14, fontWeight: 600 }}>
          {message}
        </div>
      )}

      {/* =========================================================================
          ADD NEW EMPLOYEE ONBOARDING FORM DRAWER
          ========================================================================= */}
      {showForm && (
        <form onSubmit={handleAdd} style={{ background: 'white', padding: 24, borderRadius: 10, marginTop: 16, border: '1.5px solid #2563eb', boxShadow: '0 4px 12px rgba(37,99,235,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '1.5px solid #e5e7eb', paddingBottom: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 20, color: '#1e3a8a', fontWeight: 800 }}>
                📋 New Employee Onboarding Sheet
              </h2>
              <p style={{ color: '#4b5563', margin: '4px 0 0 0', fontSize: 13 }}>
                Complete all job details, personal history, photo, statutory, and salary numbers for onboarding records.
              </p>
            </div>
            <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 600 }}>* Required fields</span>
          </div>

          {/* SECTION 1: Role, Identification & Dates */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1d4ed8', background: '#eff6ff', padding: '6px 12px', borderRadius: 6, marginBottom: 14 }}>
              1. Job & Organizational Details
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Employee ID (Petpooja Code) <span style={{ color: '#dc2626' }}>*</span>
                <input
                  required
                  placeholder="e.g. 101, 102"
                  value={form.employee_id}
                  onChange={e => setForm({ ...form, employee_id: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, fontFamily: 'monospace', fontWeight: 700, boxSizing: 'border-box' }}
                />
              </label>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Full Legal Name <span style={{ color: '#dc2626' }}>*</span>
                <input
                  required
                  placeholder="Full name as per Aadhaar/Bank"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, fontWeight: 600, boxSizing: 'border-box' }}
                />
              </label>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Department
                <select
                  value={form.department}
                  onChange={e => setForm({ ...form, department: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, background: 'white', boxSizing: 'border-box' }}
                >
                  {departments.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </label>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Designation (Role)
                <input
                  list="desig-options"
                  placeholder="Select or type designation"
                  value={form.designation}
                  onChange={e => setForm({ ...form, designation: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, boxSizing: 'border-box' }}
                />
                <datalist id="desig-options">
                  {designations.map(d => (
                    <option key={d.id} value={d.name}>{d.department ? `(${d.department})` : ''}</option>
                  ))}
                </datalist>
              </label>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Employment Type
                <select
                  value={form.employment_type}
                  onChange={e => setForm({ ...form, employment_type: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, background: 'white', boxSizing: 'border-box' }}
                >
                  <option value="full-time">Full-time</option>
                  <option value="probation">Probation</option>
                  <option value="contract">Contract</option>
                  <option value="part-time">Part-time</option>
                </select>
              </label>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Date of Joining
                <input
                  type="date"
                  value={form.date_of_joining}
                  onChange={e => setForm({ ...form, date_of_joining: e.target.value })}
                  style={{ width: '100%', padding: '6px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, boxSizing: 'border-box' }}
                />
              </label>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Probation End Date
                <input
                  type="date"
                  value={form.probation_end_date}
                  onChange={e => setForm({ ...form, probation_end_date: e.target.value })}
                  style={{ width: '100%', padding: '6px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, boxSizing: 'border-box' }}
                />
              </label>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Reporting Manager
                <select
                  value={form.reporting_manager_id}
                  onChange={e => setForm({ ...form, reporting_manager_id: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, background: 'white', boxSizing: 'border-box' }}
                >
                  <option value="">None (Top of hierarchy / Direct Admin)</option>
                  {allEmployees.filter(m => m.status !== 'exited').map(m => (
                    <option key={m.employee_id} value={m.employee_id}>
                      {m.name} ({m.designation || 'Staff'}{m.department ? ` • ${m.department}` : ''})
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Standard Hours / Day
                <input
                  type="number"
                  value={form.standard_hours_per_day}
                  onChange={e => setForm({ ...form, standard_hours_per_day: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, boxSizing: 'border-box' }}
                />
              </label>
            </div>
          </div>

          {/* SECTION 2: Personal Details & Passport Photo */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#047857', background: '#ecfdf5', padding: '6px 12px', borderRadius: 6, marginBottom: 14 }}>
              2. Personal Details, Contact & Passport Photo
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Phone Number
                <input
                  type="tel"
                  placeholder="Primary phone number"
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, boxSizing: 'border-box' }}
                />
              </label>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Email Address
                <input
                  type="email"
                  placeholder="Personal email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, boxSizing: 'border-box' }}
                />
              </label>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Date of Birth
                <input
                  type="date"
                  value={form.dob}
                  onChange={e => setForm({ ...form, dob: e.target.value })}
                  style={{ width: '100%', padding: '6px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, boxSizing: 'border-box' }}
                />
              </label>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Gender
                <select
                  value={form.gender}
                  onChange={e => setForm({ ...form, gender: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, background: 'white', boxSizing: 'border-box' }}
                >
                  <option value="">Select gender…</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </label>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Blood Group
                <input
                  placeholder="e.g. O+, B+, A+"
                  value={form.blood_group}
                  onChange={e => setForm({ ...form, blood_group: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, boxSizing: 'border-box' }}
                />
              </label>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Emergency Contact Name
                <input
                  placeholder="e.g. Relative / Spouse name"
                  value={form.emergency_contact_name}
                  onChange={e => setForm({ ...form, emergency_contact_name: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, boxSizing: 'border-box' }}
                />
              </label>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Emergency Contact Phone
                <input
                  placeholder="Emergency contact phone"
                  value={form.emergency_contact_phone}
                  onChange={e => setForm({ ...form, emergency_contact_phone: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, boxSizing: 'border-box' }}
                />
              </label>

              {/* Passport Photo Upload Box */}
              <div style={{ border: '1px dashed #059669', borderRadius: 8, padding: 12, background: '#f0fdf4', display: 'flex', gap: 12, alignItems: 'center' }}>
                {photoPreview ? (
                  <img src={photoPreview} alt="Preview" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6, border: '1px solid #cbd5e1' }} />
                ) : (
                  <div style={{ width: 64, height: 64, borderRadius: 6, background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: '#64748b' }}>
                    📷
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#065f46', marginBottom: 3 }}>
                    Passport-Size Photo
                  </label>
                  <input type="file" accept="image/*" onChange={handlePhotoChange} style={{ fontSize: 11 }} />
                </div>
              </div>
            </div>

            {/* Address, Previous History & Education */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginTop: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Residential Address
                <textarea
                  placeholder="Permanent / Local residential address"
                  value={form.address}
                  onChange={e => setForm({ ...form, address: e.target.value })}
                  rows={2}
                  style={{ width: '100%', padding: '7px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, boxSizing: 'border-box' }}
                />
              </label>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Previous Work History
                <textarea
                  placeholder="Prior restaurant, hotel or retail experience"
                  value={form.previous_work_history}
                  onChange={e => setForm({ ...form, previous_work_history: e.target.value })}
                  rows={2}
                  style={{ width: '100%', padding: '7px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, boxSizing: 'border-box' }}
                />
              </label>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Education History
                <textarea
                  placeholder="Degrees, culinary certifications, 10th/12th"
                  value={form.education_history}
                  onChange={e => setForm({ ...form, education_history: e.target.value })}
                  rows={2}
                  style={{ width: '100%', padding: '7px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, boxSizing: 'border-box' }}
                />
              </label>
            </div>
          </div>

          {/* SECTION 3: Identity Proofs & Scans */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#b45309', background: '#fffbeb', padding: '6px 12px', borderRadius: 6, marginBottom: 14 }}>
              3. Identification Documents & Scans
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, alignItems: 'center' }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                ID Proof Document Type
                <select
                  value={form.id_proof_type}
                  onChange={e => setForm({ ...form, id_proof_type: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, background: 'white', boxSizing: 'border-box' }}
                >
                  <option value="Aadhaar">Aadhaar Card</option>
                  <option value="PAN">PAN Card</option>
                  <option value="Passport">Passport</option>
                  <option value="Driving License">Driving License</option>
                  <option value="Voter ID">Voter ID</option>
                </select>
              </label>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                ID Proof Document Number
                <input
                  placeholder="e.g. Aadhaar / PAN number"
                  value={form.id_proof_number}
                  onChange={e => setForm({ ...form, id_proof_number: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, boxSizing: 'border-box' }}
                />
              </label>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                ID Document — Front Scan
                <input
                  type="file"
                  onChange={e => setIdFrontFile(e.target.files?.[0] || null)}
                  style={{ width: '100%', padding: '4px', marginTop: 4, fontSize: 11 }}
                />
              </label>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                ID Document — Back Scan
                <input
                  type="file"
                  onChange={e => setIdBackFile(e.target.files?.[0] || null)}
                  style={{ width: '100%', padding: '4px', marginTop: 4, fontSize: 11 }}
                />
              </label>
            </div>
          </div>

          {/* SECTION 4: Salary & Variable Pay Schemes */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#7c3aed', background: '#f5f3ff', padding: '6px 12px', borderRadius: 6, marginBottom: 14 }}>
              4. Compensation & Variable Pay Schemes
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Fixed Salary (₹/month)
                <input
                  type="number"
                  placeholder="e.g. 18000"
                  value={form.current_fixed_salary}
                  onChange={e => setForm({ ...form, current_fixed_salary: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, fontWeight: 700, boxSizing: 'border-box' }}
                />
              </label>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Variable Pay Target Pool (₹/month)
                <input
                  type="number"
                  placeholder="e.g. 1500"
                  value={form.current_variable_salary}
                  onChange={e => setForm({ ...form, current_variable_salary: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, fontWeight: 700, boxSizing: 'border-box' }}
                />
              </label>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Variable Pay Incentive Scheme
                <select
                  value={form.variable_pay_scheme}
                  onChange={e => setForm({ ...form, variable_pay_scheme: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, background: 'white', boxSizing: 'border-box' }}
                >
                  <option value="">None (Standard / Manual Variable %)</option>
                  {schemes.map(s => (
                    <option key={s.name} value={s.name}>{s.display_name}</option>
                  ))}
                </select>
              </label>
            </div>

            {/* Statutory applicability */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 14 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={form.pf_applicable}
                  onChange={e => setForm({ ...form, pf_applicable: e.target.checked })}
                />
                PF Applicable
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={form.esi_applicable}
                  onChange={e => setForm({ ...form, esi_applicable: e.target.checked })}
                />
                ESI Applicable
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={form.accommodation_provided || assetsForm.accommodation.enabled}
                  onChange={e => {
                    const checked = e.target.checked;
                    setForm({ ...form, accommodation_provided: checked });
                    setAssetsForm(prev => ({
                      ...prev,
                      accommodation: { ...prev.accommodation, enabled: checked }
                    }));
                  }}
                />
                Company Accommodation Provided
              </label>
            </div>
          </div>

          {/* SECTION 5: Assets Issued & Allocation */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#e0f2fe', padding: '6px 12px', borderRadius: 6, marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0369a1' }}>
                5. Assets Issued & Deposit Tracking
              </div>
              <span style={{ fontSize: 11, color: '#0284c7', fontWeight: 600 }}>
                Uniforms, accommodation keys & equipment
              </span>
            </div>

            {/* Default Asset 1: Uniform */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: assetsForm.uniform.enabled ? 12 : 0 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#1e293b', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={assetsForm.uniform.enabled}
                    onChange={e => setAssetsForm(prev => ({
                      ...prev,
                      uniform: { ...prev.uniform, enabled: e.target.checked }
                    }))}
                  />
                  👕 Uniform Issued
                </label>
                {assetsForm.uniform.enabled && (
                  <span style={{ fontSize: 11, background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
                    Status: Issued
                  </span>
                )}
              </div>

              {assetsForm.uniform.enabled && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, paddingTop: 4 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>
                    Units / Sets
                    <input
                      type="number"
                      min="1"
                      value={assetsForm.uniform.units}
                      onChange={e => setAssetsForm(prev => ({
                        ...prev,
                        uniform: { ...prev.uniform, units: e.target.value }
                      }))}
                      placeholder="e.g. 2"
                      style={{ width: '100%', padding: '6px 9px', marginTop: 4, borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
                    />
                  </label>

                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>
                    Size / Spec / Tag #
                    <input
                      type="text"
                      value={assetsForm.uniform.asset_number}
                      onChange={e => setAssetsForm(prev => ({
                        ...prev,
                        uniform: { ...prev.uniform, asset_number: e.target.value }
                      }))}
                      placeholder="e.g. Size L (2 Shirts, 2 Aprons)"
                      style={{ width: '100%', padding: '6px 9px', marginTop: 4, borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
                    />
                  </label>

                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>
                    Deposit Amount (₹)
                    <input
                      type="number"
                      value={assetsForm.uniform.deposit_amount}
                      onChange={e => setAssetsForm(prev => ({
                        ...prev,
                        uniform: { ...prev.uniform, deposit_amount: e.target.value }
                      }))}
                      placeholder="e.g. 500"
                      style={{ width: '100%', padding: '6px 9px', marginTop: 4, borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
                    />
                  </label>

                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>
                    Date Issued
                    <input
                      type="date"
                      value={assetsForm.uniform.date_issued || form.date_of_joining || ''}
                      onChange={e => setAssetsForm(prev => ({
                        ...prev,
                        uniform: { ...prev.uniform, date_issued: e.target.value }
                      }))}
                      style={{ width: '100%', padding: '6px 9px', marginTop: 4, borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
                    />
                  </label>
                </div>
              )}
            </div>

            {/* Default Asset 2: Accommodation */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: assetsForm.accommodation.enabled ? 12 : 0 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#1e293b', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={assetsForm.accommodation.enabled}
                    onChange={e => {
                      const checked = e.target.checked;
                      setAssetsForm(prev => ({
                        ...prev,
                        accommodation: { ...prev.accommodation, enabled: checked }
                      }));
                      setForm(prev => ({ ...prev, accommodation_provided: checked }));
                    }}
                  />
                  🏠 Company Accommodation & Facility Keys
                </label>
                {assetsForm.accommodation.enabled && (
                  <span style={{ fontSize: 11, background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
                    Status: Issued
                  </span>
                )}
              </div>

              {assetsForm.accommodation.enabled && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, paddingTop: 4 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>
                    Room / Key / Bed #
                    <input
                      type="text"
                      value={assetsForm.accommodation.asset_number}
                      onChange={e => setAssetsForm(prev => ({
                        ...prev,
                        accommodation: { ...prev.accommodation, asset_number: e.target.value }
                      }))}
                      placeholder="e.g. Room 3B - Bed 2 (Key #08)"
                      style={{ width: '100%', padding: '6px 9px', marginTop: 4, borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
                    />
                  </label>

                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>
                    Units
                    <input
                      type="number"
                      min="1"
                      value={assetsForm.accommodation.units}
                      onChange={e => setAssetsForm(prev => ({
                        ...prev,
                        accommodation: { ...prev.accommodation, units: e.target.value }
                      }))}
                      placeholder="1"
                      style={{ width: '100%', padding: '6px 9px', marginTop: 4, borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
                    />
                  </label>

                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>
                    Deposit Amount (₹)
                    <input
                      type="number"
                      value={assetsForm.accommodation.deposit_amount}
                      onChange={e => setAssetsForm(prev => ({
                        ...prev,
                        accommodation: { ...prev.accommodation, deposit_amount: e.target.value }
                      }))}
                      placeholder="e.g. 2000"
                      style={{ width: '100%', padding: '6px 9px', marginTop: 4, borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
                    />
                  </label>

                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>
                    Date Issued
                    <input
                      type="date"
                      value={assetsForm.accommodation.date_issued || form.date_of_joining || ''}
                      onChange={e => setAssetsForm(prev => ({
                        ...prev,
                        accommodation: { ...prev.accommodation, date_issued: e.target.value }
                      }))}
                      style={{ width: '100%', padding: '6px 9px', marginTop: 4, borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
                    />
                  </label>
                </div>
              )}
            </div>

            {/* Custom Assets List */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>
                  📦 Additional Custom Assets (Tools, Knives, POS Tablets, Locker Keys)
                </div>
                <button
                  type="button"
                  onClick={() => setAssetsForm(prev => ({
                    ...prev,
                    custom: [
                      ...prev.custom,
                      {
                        id: Date.now(),
                        name: '',
                        asset_number: '',
                        units: 1,
                        deposit_amount: 0,
                        date_issued: form.date_of_joining || new Date().toISOString().slice(0, 10),
                        status: 'Issued'
                      }
                    ]
                  }))}
                  style={{
                    background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe',
                    padding: '4px 10px', borderRadius: 5, fontSize: 12, fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  + Add Custom Asset
                </button>
              </div>

              {assetsForm.custom.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>
                  No extra custom assets added yet. Click "+ Add Custom Asset" above to issue knives, POS tabs, or tools.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {assetsForm.custom.map((item, idx) => (
                    <div key={item.id || idx} style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: 6, padding: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr)) auto', gap: 8, alignItems: 'center' }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>
                        Asset Name *
                        <input
                          type="text"
                          placeholder="e.g. Chef Knife Kit"
                          value={item.name}
                          onChange={e => {
                            const val = e.target.value;
                            setAssetsForm(prev => ({
                              ...prev,
                              custom: prev.custom.map((c, i) => i === idx ? { ...c, name: val } : c)
                            }));
                          }}
                          style={{ width: '100%', padding: '5px 8px', marginTop: 2, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 12, boxSizing: 'border-box' }}
                        />
                      </label>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>
                        Tag / Serial #
                        <input
                          type="text"
                          placeholder="e.g. TAB-04"
                          value={item.asset_number}
                          onChange={e => {
                            const val = e.target.value;
                            setAssetsForm(prev => ({
                              ...prev,
                              custom: prev.custom.map((c, i) => i === idx ? { ...c, asset_number: val } : c)
                            }));
                          }}
                          style={{ width: '100%', padding: '5px 8px', marginTop: 2, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 12, boxSizing: 'border-box' }}
                        />
                      </label>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>
                        Qty / Units
                        <input
                          type="number"
                          min="1"
                          placeholder="1"
                          value={item.units}
                          onChange={e => {
                            const val = e.target.value;
                            setAssetsForm(prev => ({
                              ...prev,
                              custom: prev.custom.map((c, i) => i === idx ? { ...c, units: val } : c)
                            }));
                          }}
                          style={{ width: '100%', padding: '5px 8px', marginTop: 2, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 12, boxSizing: 'border-box' }}
                        />
                      </label>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>
                        Deposit (₹)
                        <input
                          type="number"
                          placeholder="0"
                          value={item.deposit_amount}
                          onChange={e => {
                            const val = e.target.value;
                            setAssetsForm(prev => ({
                              ...prev,
                              custom: prev.custom.map((c, i) => i === idx ? { ...c, deposit_amount: val } : c)
                            }));
                          }}
                          style={{ width: '100%', padding: '5px 8px', marginTop: 2, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 12, boxSizing: 'border-box' }}
                        />
                      </label>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>
                        Date Issued
                        <input
                          type="date"
                          value={item.date_issued}
                          onChange={e => {
                            const val = e.target.value;
                            setAssetsForm(prev => ({
                              ...prev,
                              custom: prev.custom.map((c, i) => i === idx ? { ...c, date_issued: val } : c)
                            }));
                          }}
                          style={{ width: '100%', padding: '5px 8px', marginTop: 2, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 12, boxSizing: 'border-box' }}
                        />
                      </label>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>
                        Status
                        <select
                          value={item.status}
                          onChange={e => {
                            const val = e.target.value;
                            setAssetsForm(prev => ({
                              ...prev,
                              custom: prev.custom.map((c, i) => i === idx ? { ...c, status: val } : c)
                            }));
                          }}
                          style={{ width: '100%', padding: '5px 8px', marginTop: 2, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 12, background: 'white', boxSizing: 'border-box' }}
                        >
                          <option value="Issued">Issued</option>
                          <option value="Returned">Returned</option>
                          <option value="Lost">Lost</option>
                          <option value="Damaged">Damaged</option>
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() => setAssetsForm(prev => ({
                          ...prev,
                          custom: prev.custom.filter((_, i) => i !== idx)
                        }))}
                        style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', fontWeight: 800, cursor: 'pointer', fontSize: 14, padding: '6px 10px', borderRadius: 4, marginTop: 14 }}
                        title="Remove custom asset"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* SECTION 6: Bank & Payment Account Details */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#374151', background: '#f3f4f6', padding: '6px 12px', borderRadius: 6, marginBottom: 14 }}>
              6. Bank Details & Statutory Registration (Admin Confidential)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Account Holder Name
                <input
                  placeholder="As per bank passbook"
                  value={form.bank_account_holder_name}
                  onChange={e => setForm({ ...form, bank_account_holder_name: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, boxSizing: 'border-box' }}
                />
              </label>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Bank Name
                <input
                  placeholder="e.g. HDFC, SBI, Federal Bank"
                  value={form.bank_name}
                  onChange={e => setForm({ ...form, bank_name: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, boxSizing: 'border-box' }}
                />
              </label>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Bank Account Number
                <input
                  placeholder="Account number"
                  value={form.bank_account_number}
                  onChange={e => setForm({ ...form, bank_account_number: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, fontFamily: 'monospace', boxSizing: 'border-box' }}
                />
              </label>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Bank IFSC Code
                <input
                  placeholder="e.g. HDFC0001234"
                  value={form.bank_ifsc_code}
                  onChange={e => setForm({ ...form, bank_ifsc_code: e.target.value.toUpperCase() })}
                  style={{ width: '100%', padding: '7px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, fontFamily: 'monospace', boxSizing: 'border-box' }}
                />
              </label>

              {form.pf_applicable && (
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                  PF Registration Number
                  <input
                    placeholder="PF Number"
                    value={form.pf_number}
                    onChange={e => setForm({ ...form, pf_number: e.target.value })}
                    style={{ width: '100%', padding: '7px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, boxSizing: 'border-box' }}
                  />
                </label>
              )}

              {form.esi_applicable && (
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                  ESI Registration Number
                  <input
                    placeholder="ESI Number"
                    value={form.esi_number}
                    onChange={e => setForm({ ...form, esi_number: e.target.value })}
                    style={{ width: '100%', padding: '7px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, boxSizing: 'border-box' }}
                  />
                </label>
              )}
            </div>
          </div>

          {/* =========================================================================
              SECTION 7: ONBOARDING COMPLIANCE CLAUSES & COMPILED PDF DOWNLOAD
              ========================================================================= */}
          <div style={{ marginBottom: 24, border: '1.5px solid #3b82f6', borderRadius: 8, padding: 18, background: '#f8fafc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#1e40af', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>📜</span> 7. Onboarding Terms, Compliance Contract & Physical Signature Gate
                </div>
                <div style={{ fontSize: 12, color: '#475569', marginTop: 3 }}>
                  Clauses are dynamically merged with live employee details, salary split, assets & policies.
                </div>
              </div>

              {/* Instant Download / Print Button */}
              <button
                type="button"
                onClick={handleDownloadPrintClick}
                style={{
                  background: '#1e40af', color: 'white', border: 'none',
                  padding: '10px 20px', borderRadius: 6, fontWeight: 700, fontSize: 13,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                  boxShadow: '0 2px 6px rgba(30,64,175,0.25)'
                }}
              >
                <span>🖨️</span> Download / Print Compiled Agreement (PDF)
              </button>
            </div>

            {/* Checklist of Auto-ticked Clauses */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                  Select Policies & Clauses to Include in Agreement:
                </div>
                <a
                  href="/documents?category=onboarding_documentation"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 11, color: '#2563eb', textDecoration: 'none', fontWeight: 700, background: '#eff6ff', padding: '3px 8px', borderRadius: 4, border: '1px solid #bfdbfe' }}
                >
                  ⚙️ View & Edit Master Clauses →
                </a>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
                {clauseTemplates.map(c => {
                  const isSelected = !!selectedClauses[c.id];
                  return (
                    <label
                      key={c.id}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 8,
                        background: isSelected ? 'white' : '#f1f5f9',
                        padding: '8px 12px', borderRadius: 6,
                        border: isSelected ? '1px solid #93c5fd' : '1px solid #cbd5e1',
                        cursor: 'pointer', fontSize: 12
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={e => setSelectedClauses(prev => ({ ...prev, [c.id]: e.target.checked }))}
                        style={{ marginTop: 2 }}
                      />
                      <div>
                        <strong style={{ color: isSelected ? '#1e293b' : '#64748b' }}>{c.name}</strong>
                        {c.default_applicable === 'assets_assigned' && (
                          <span style={{ fontSize: 10, color: '#0369a1', marginLeft: 6, fontWeight: 600 }}>[Auto for Assets]</span>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* =========================================================================
                PERMANENT, ALWAYS-VISIBLE SIGNED DOCUMENT UPLOAD & VERIFICATION CARD
                ========================================================================= */}
            <div style={{ background: '#ffffff', border: '1.5px solid #10b981', borderRadius: 8, padding: 16, boxShadow: '0 1px 4px rgba(16,185,129,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12, borderBottom: '1px solid #e2e8f0', paddingBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#065f46', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>✍️</span> Physical Signed Document Collection & Upload
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12,
                  background: isSignedCollected ? '#dcfce7' : '#fef3c7',
                  color: isSignedCollected ? '#15803d' : '#b45309'
                }}>
                  {isSignedCollected ? '🟢 Signed Document Verified (Active)' : '🟡 Pending Physical Signature (Draft / Docs Pending)'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, alignItems: 'start' }}>
                {/* 1. File Upload Box */}
                <div style={{ border: '2px dashed #93c5fd', borderRadius: 8, padding: 14, background: '#f8fafc', textAlign: 'center' }}>
                  <div style={{ fontSize: 24, marginBottom: 4 }}>📄</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1e3a8a', marginBottom: 4 }}>
                    Upload Scanned Signed Agreement
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>
                    Accepted: PDF, Scanned Photo (.jpg, .png)
                  </div>
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    onChange={e => {
                      const file = e.target.files?.[0] || null;
                      setSignedFile(file);
                      if (file) {
                        setIsSignedCollected(true);
                      }
                    }}
                    style={{ fontSize: 12, maxWidth: '100%' }}
                  />
                  {signedFile && (
                    <div style={{ marginTop: 8, fontSize: 11, color: '#15803d', fontWeight: 700 }}>
                      ✓ Selected: {signedFile.name} ({(signedFile.size / 1024).toFixed(1)} KB)
                    </div>
                  )}
                </div>

                {/* 2. Verification Checkbox & Date */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, fontWeight: 700, color: '#15803d', cursor: 'pointer', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: 10, borderRadius: 6 }}>
                    <input
                      type="checkbox"
                      checked={isSignedCollected}
                      onChange={e => setIsSignedCollected(e.target.checked)}
                      style={{ marginTop: 3 }}
                    />
                    <div>
                      <span>Physical signature collected & verified on Day 1</span>
                      <div style={{ fontSize: 11, fontWeight: 500, color: '#166534', marginTop: 2 }}>
                        Tick this when candidate has physically signed and returned the agreement.
                      </div>
                    </div>
                  </label>

                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                    Date Signed & Collected:
                    <input
                      type="date"
                      value={signedDate}
                      onChange={e => setSignedDate(e.target.value)}
                      style={{ width: '100%', padding: '6px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 8: HR Notes */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
              Onboarding / HR Notes
              <textarea
                placeholder="Any special onboarding notes, equipment issued, or shift guidelines"
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                rows={2}
                style={{ width: '100%', padding: '7px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, boxSizing: 'border-box' }}
              />
            </label>
          </div>

          {/* Actions Footer with Draft vs Complete Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', padding: '10px 18px', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleAdd(null, true)}
              style={{
                background: '#f8fafc', color: '#334155', border: '1px solid #cbd5e1',
                padding: '10px 18px', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer'
              }}
            >
              💾 Save as Onboarding Draft
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                background: isSignedCollected ? '#15803d' : '#2563eb',
                color: 'white', border: 'none',
                padding: '10px 24px', borderRadius: 6, fontWeight: 700, fontSize: 14, cursor: 'pointer'
              }}
            >
              {submitting ? 'Saving Employee & Uploading Scans...' : (isSignedCollected ? '✓ Complete & Activate Employee' : '💾 Save Employee Onboarding')}
            </button>
          </div>
        </form>
      )}

      {/* =========================================================================
          IN-PAGE MODAL PREVIEW FOR ONBOARDING AGREEMENT
          ========================================================================= */}
      {previewModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.65)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
        }}>
          <div style={{
            background: 'white', width: '100%', maxWidth: 840, maxHeight: '90vh',
            borderRadius: 10, display: 'flex', flexDirection: 'column', overflow: 'hidden',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)'
          }}>
            {/* Modal Top Bar */}
            <div style={{ background: '#1e3a8a', color: 'white', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>📋 Onboarding Compliance Agreement Preview</div>
                <div style={{ fontSize: 12, opacity: 0.85 }}>{compiledDocData.name} ({compiledDocData.designation}) • Ready for Print / Physical Sign-off</div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={triggerBrowserPrint}
                  style={{ background: '#10b981', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  🖨️ Print Agreement / Save PDF
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewModalOpen(false)}
                  style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', padding: '8px 12px', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}
                >
                  ✕ Close
                </button>
              </div>
            </div>

            {/* Modal Document Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 32, background: '#f8fafc' }}>
              <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 6, padding: 32, boxShadow: '0 2px 4px rgba(0,0,0,0.05)', maxWidth: 720, margin: '0 auto' }}>
                {/* Header */}
                <div style={{ borderBottom: '2px solid #111', paddingBottom: 12, marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 'bold', fontFamily: 'Georgia, serif', color: '#111827' }}>ATELIER HOSPITALITY</div>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: '#6b7280', fontWeight: 600 }}>Official Appointment & Onboarding Compliance Agreement</div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>
                    <div>Ref Code: <strong>{compiledDocData.refCode}</strong></div>
                    <div>Date: {compiledDocData.doj}</div>
                  </div>
                </div>

                {/* Summary Box */}
                <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, padding: 12, marginBottom: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, fontSize: 12 }}>
                  <div><span style={{ fontSize: 9, textTransform: 'uppercase', color: '#6b7280', fontWeight: 'bold', display: 'block' }}>Candidate Name</span><strong>{compiledDocData.name}</strong></div>
                  <div><span style={{ fontSize: 9, textTransform: 'uppercase', color: '#6b7280', fontWeight: 'bold', display: 'block' }}>Designation</span><span>{compiledDocData.designation}</span></div>
                  <div><span style={{ fontSize: 9, textTransform: 'uppercase', color: '#6b7280', fontWeight: 'bold', display: 'block' }}>Department</span><span>{compiledDocData.department}</span></div>
                  <div><span style={{ fontSize: 9, textTransform: 'uppercase', color: '#6b7280', fontWeight: 'bold', display: 'block' }}>Date of Joining</span><span>{compiledDocData.doj}</span></div>
                  <div><span style={{ fontSize: 9, textTransform: 'uppercase', color: '#6b7280', fontWeight: 'bold', display: 'block' }}>Fixed Salary (CTC)</span><span>{compiledDocData.fixedSalary}</span></div>
                  <div><span style={{ fontSize: 9, textTransform: 'uppercase', color: '#6b7280', fontWeight: 'bold', display: 'block' }}>Variable Target</span><span>{compiledDocData.variableTarget}</span></div>
                  <div><span style={{ fontSize: 9, textTransform: 'uppercase', color: '#6b7280', fontWeight: 'bold', display: 'block' }}>Employment Type</span><span style={{ textTransform: 'capitalize' }}>{compiledDocData.empType}</span></div>
                  <div><span style={{ fontSize: 9, textTransform: 'uppercase', color: '#6b7280', fontWeight: 'bold', display: 'block' }}>Contact Phone</span><span>{compiledDocData.phone}</span></div>
                </div>

                {/* Clauses */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {compiledDocData.clauses.map(c => (
                    <div key={c.id}>
                      <h4 style={{ fontFamily: 'Georgia, serif', fontSize: 13, fontWeight: 'bold', margin: '0 0 4px 0', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: 2 }}>
                        {c.name}
                      </h4>
                      <p style={{ margin: 0, lineHeight: 1.6, color: '#374151', fontSize: 11, whiteSpace: 'pre-wrap' }}>
                        {c.text}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Declaration */}
                <div style={{ background: '#f9fafb', border: '1px solid #d1d5db', borderRadius: 6, padding: 12, margin: '24px 0 32px 0', fontSize: 11 }}>
                  <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Declaration & Acceptance:</div>
                  <div style={{ color: '#374151', lineHeight: 1.5 }}>
                    I, <strong>{compiledDocData.name}</strong>, acknowledge that I have read, understood, and received a copy of the above terms of employment, compensation breakdown, code of conduct, POSH guidelines, and asset allocation schedule. I unconditionally agree to abide by all the policies and procedures established by Atelier.
                  </div>
                </div>

                {/* Signatures */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, textAlign: 'center', marginTop: 30, paddingTop: 20, borderTop: '1px solid #ccc' }}>
                  <div>
                    <div style={{ borderBottom: '1px solid #000', paddingBottom: 40, marginBottom: 4 }}></div>
                    <strong>{compiledDocData.name}</strong>
                    <div style={{ fontSize: 9, color: '#6b7280', textTransform: 'uppercase' }}>Employee Signature & Date</div>
                  </div>
                  <div>
                    <div style={{ borderBottom: '1px solid #000', paddingBottom: 40, marginBottom: 4 }}></div>
                    <strong>Atelier Operations / HR</strong>
                    <div style={{ fontSize: 9, color: '#6b7280', textTransform: 'uppercase' }}>Authorized Management Signatory & Date</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Employees Table List */}
      <div style={{ background: 'white', borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', marginTop: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb', background: '#f9fafb', fontSize: 12, textTransform: 'uppercase', color: '#6b7280' }}>
              <th style={{ padding: '10px 14px' }}>Employee</th>
              <th style={{ padding: '10px 14px' }}>Designation</th>
              <th style={{ padding: '10px 14px' }}>Department</th>
              <th style={{ padding: '10px 14px' }}>Contact</th>
              <th style={{ padding: '10px 14px' }}>Status</th>
              <th style={{ padding: '10px 14px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const visibleData = employees.filter(emp => {
                const deptMatch = selectedDepts.length === 0 || selectedDepts.includes(emp.department);
                const statusMatch = selectedStatuses.length === 0 || selectedStatuses.includes(emp.status);
                return deptMatch && statusMatch;
              });
              if (visibleData.length === 0) return (
                <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>No staff match the selected filters.</td></tr>
              );
              return visibleData.map(emp => (
                <tr key={emp.employee_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#eff6ff', color: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 12 }}>
                        {emp.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: '#111827' }}>{emp.name}</div>
                        <div style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>ID: {emp.employee_id}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: 13, color: '#374151', fontWeight: 500 }}>{emp.designation || 'Staff'}</td>
                  <td style={{ padding: '12px 14px', fontSize: 13, color: '#374151' }}>{emp.department || 'Unassigned'}</td>
                  <td style={{ padding: '12px 14px', fontSize: 13, color: '#4b5563' }}>{emp.phone || '—'}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: emp.status === 'active' ? '#dcfce7' : emp.status === 'on-notice' ? '#fef3c7' : '#fee2e2', color: emp.status === 'active' ? '#15803d' : emp.status === 'on-notice' ? '#b45309' : '#991b1b' }}>
                        {emp.status === 'active' ? '✓ Active' : emp.status === 'on-notice' ? '⏳ On Notice' : '🚪 Exited'}
                      </span>
                      {emp.onboarding_status && (
                        <span style={{ padding: '1px 6px', borderRadius: 10, fontSize: 10, fontWeight: 600, background: emp.onboarding_status === 'Active' ? '#f0fdf4' : '#eff6ff', color: emp.onboarding_status === 'Active' ? '#166534' : '#1e40af', border: `1px solid ${emp.onboarding_status === 'Active' ? '#bbf7d0' : '#bfdbfe'}` }}>
                          {emp.onboarding_status}
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <a href={`/employees/${emp.employee_id}`} style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none', fontSize: 13 }}>View / Edit →</a>
                  </td>
                </tr>
              ));
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
}
