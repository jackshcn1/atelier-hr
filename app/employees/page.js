'use client';
import { useEffect, useState } from 'react';
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

export default function EmployeesPage() {
  const supabase = createClient();
  const [employees, setEmployees] = useState([]); // active + on-notice only
  const [allEmployees, setAllEmployees] = useState([]); // every status, for manager lookups
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [schemes, setSchemes] = useState([]);
  const [depositSettings, setDepositSettings] = useState({ uniform_deposit_amount: 500, accommodation_deposit_amount: 2000 });
  const [form, setForm] = useState(initialEmptyForm);
  const [assetsForm, setAssetsForm] = useState(initialAssetsForm);
  const [showForm, setShowForm] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [idFrontFile, setIdFrontFile] = useState(null);
  const [idBackFile, setIdBackFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const [visible, all, depts, desigs, schemeData, depSetData] = await Promise.all([
      supabase.from('employees').select('*').in('status', ['active', 'on-notice']).is('deleted_at', null).order('name'),
      supabase.from('employees').select('*').is('deleted_at', null),
      supabase.from('departments').select('name').order('name'),
      supabase.from('designations').select('*').order('name'),
      supabase.from('variable_pay_schemes').select('name, display_name').eq('is_active', true),
      supabase.from('deposit_settings').select('*').eq('id', 1).maybeSingle()
    ]);

    if (visible.error) setError(visible.error.message);
    else setEmployees(visible.data || []);
    setAllEmployees(all.data || []);
    setDepartments((depts.data || []).map(d => d.name));
    setDesignations(desigs.data || []);
    setSchemes(schemeData.data || []);
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
  }

  useEffect(() => { load(); }, []);

  function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
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

      // 3. Insert into employees table
      const isAccommodationActive = !!assetsForm.accommodation.enabled || !!form.accommodation_provided;

      // Calculate Onboarding Stage Gate (Tier 1 vs Tier 2)
      const hasId = !!(form.id_proof_number.trim() || idFrontUrl);
      const hasBank = !!(form.bank_account_number.trim() && form.bank_ifsc_code.trim());
      const hasComp = Number(form.current_fixed_salary) > 0;
      const hasContact = !!(form.emergency_contact_name.trim() && form.emergency_contact_phone.trim());

      let calcOnboardingStatus = 'Draft';
      if (hasComp && hasBank && hasId && hasContact) {
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

      // 4. Insert into employee_sensitive_info table
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

      // 5. Insert Assets into employee_assets
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
        const { error: assetErr } = await supabase.from('employee_assets').insert(assetsToInsert);
        if (assetErr) {
          console.error('Error saving assets:', assetErr);
        }
      }

      // 6. Snapshot deposits into employee_deposits
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

      // 7. Snapshot initial salary into salary_history
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
      setShowForm(false);
      setSubmitting(false);
      load();
    } catch (err) {
      setError(err.message || 'Failed to create employee.');
      setSubmitting(false);
    }
  }

  async function reassign(employeeId, newManagerId) {
    await supabase.from('employees').update({ reporting_manager_id: newManagerId || null }).eq('employee_id', employeeId);
    load();
  }

  const exitedIds = new Set(allEmployees.filter(e => e.status === 'exited').map(e => e.employee_id));
  const needsReassignment = allEmployees.filter(e =>
    e.status !== 'exited' && e.reporting_manager_id && exitedIds.has(e.reporting_manager_id)
  );

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: '0 0 4px 0' }}>Employees</h1>
          <p style={{ color: '#666', margin: 0 }}>Showing active and on-notice staff records.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <a href="/orgchart" style={{ fontSize: 13, color: '#2563eb', textDecoration: 'none', fontWeight: 700, background: '#eff6ff', padding: '6px 12px', borderRadius: 6, border: '1px solid #bfdbfe' }}>
            👥 Org Chart →
          </a>
          <a href="/employees/all" style={{ fontSize: 13, color: '#4b5563', textDecoration: 'none', fontWeight: 600 }}>View all (incl. past) →</a>
          <a href="/employees/deleted" style={{ fontSize: 13, color: '#4b5563', textDecoration: 'none', fontWeight: 600 }}>Deleted →</a>
          <a href="/employees/bulk-import" style={{ fontSize: 13, color: '#4b5563', textDecoration: 'none', fontWeight: 600 }}>Bulk import →</a>
          <button
            onClick={() => setShowForm(s => !s)}
            style={{
              background: showForm ? '#e5e7eb' : '#2563eb',
              color: showForm ? '#1f2937' : 'white',
              border: 'none',
              padding: '9px 18px',
              borderRadius: 6,
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer'
            }}
          >
            {showForm ? '✕ Close Form' : '+ Add New Employee'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #f87171', color: '#991b1b', padding: 12, borderRadius: 6, margin: '16px 0' }}>
          {error}
        </div>
      )}

      {/* Needs Reassignment Alert */}
      {needsReassignment.length > 0 && (
        <div style={{ background: '#fff3cd', border: '1px solid #ffe08a', borderRadius: 8, padding: 16, margin: '16px 0' }}>
          <strong>⚠ Needs reassignment — {needsReassignment.length} employee(s) report to someone who has exited</strong>
          <ul style={{ marginTop: 10, paddingLeft: 20 }}>
            {needsReassignment.map(e => (
              <li key={e.employee_id} style={{ marginBottom: 6 }}>
                {e.name} — new manager:{' '}
                <select defaultValue="" onChange={ev => reassign(e.employee_id, ev.target.value)}>
                  <option value="">Choose manager…</option>
                  {employees.filter(m => m.employee_id !== e.employee_id).map(m => (
                    <option key={m.employee_id} value={m.employee_id}>{m.name}</option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Comprehensive New Employee Onboarding Sheet */}
      {showForm && (
        <form onSubmit={handleAdd} style={{
          background: 'white',
          border: '1px solid #cbd5e1',
          borderRadius: 10,
          padding: 24,
          margin: '20px 0',
          boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
        }}>
          <div style={{ borderBottom: '2px solid #111827', paddingBottom: 10, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#111827' }}>
                📋 New Employee Onboarding Sheet
              </h2>
              <p style={{ margin: '3px 0 0 0', fontSize: 13, color: '#6b7280' }}>
                Complete all job details, personal history, photo, statutory, and salary numbers for onboarding records.
              </p>
            </div>
            <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 600 }}>* Required fields</span>
          </div>

          {/* SECTION 1: Core Job & Role Details */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1e40af', background: '#eff6ff', padding: '6px 12px', borderRadius: 6, marginBottom: 14 }}>
              1. Job & Organizational Details
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Employee ID (Petpooja Code) <span style={{ color: '#dc2626' }}>*</span>
                <input
                  placeholder="e.g. ATL0023"
                  required
                  value={form.employee_id}
                  onChange={e => setForm({ ...form, employee_id: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, boxSizing: 'border-box' }}
                />
              </label>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Full Legal Name <span style={{ color: '#dc2626' }}>*</span>
                <input
                  placeholder="e.g. Ravi Kumar"
                  required
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, boxSizing: 'border-box' }}
                />
              </label>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Department
                <select
                  value={form.department}
                  onChange={e => setForm({ ...form, department: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, background: 'white', boxSizing: 'border-box' }}
                >
                  {departments.length > 0 ? (
                    departments.map(d => <option key={d} value={d}>{d}</option>)
                  ) : (
                    <>
                      <option value="Service">Service</option>
                      <option value="Kitchen">Kitchen</option>
                      <option value="Housekeeping">Housekeeping</option>
                      <option value="Cash/ Counter/ Customer Care">Cash/ Counter/ Customer Care</option>
                      <option value="Admin">Admin</option>
                      <option value="Security">Security</option>
                    </>
                  )}
                </select>
              </label>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Designation (Role)
                <input
                  list="add-employee-desig-options"
                  placeholder="Select or type designation"
                  value={form.designation}
                  onChange={e => setForm({ ...form, designation: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, boxSizing: 'border-box' }}
                />
                <datalist id="add-employee-desig-options">
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
                  {employees.map(m => (
                    <option key={m.employee_id} value={m.employee_id}>{m.name} ({m.designation || 'Staff'})</option>
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

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, alignItems: 'start' }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Phone Number
                <input
                  placeholder="10-digit mobile"
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, boxSizing: 'border-box' }}
                />
              </label>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Email Address
                <input
                  type="email"
                  placeholder="employee@atelier.com"
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

          {/* Onboarding Notes */}
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

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', padding: '10px 20px', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                background: '#059669', color: 'white', border: 'none',
                padding: '10px 28px', borderRadius: 6, fontWeight: 700, fontSize: 14, cursor: 'pointer'
              }}
            >
              {submitting ? 'Saving Employee & Uploading Scans...' : '💾 Complete Onboarding & Save Employee'}
            </button>
          </div>
        </form>
      )}

      {/* Employees Table List */}
      <div style={{ background: 'white', borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', marginTop: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb', background: '#f9fafb', fontSize: 12, textTransform: 'uppercase', color: '#6b7280' }}>
              <th style={{ padding: '12px 16px' }}>Employee</th>
              <th>Designation</th>
              <th>Department</th>
              <th>Contact</th>
              <th>Status</th>
              <th style={{ textAlign: 'right', paddingRight: 16 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {employees.map(emp => {
              const initials = String(emp.name || 'E').split(/\s+/).map(n => n[0]).slice(0, 2).join('').toUpperCase();

              return (
                <tr key={emp.employee_id} style={{ borderBottom: '1px solid #f3f4f6', fontSize: 13 }}>
                  <td style={{ padding: '10px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {emp.passport_photo_url ? (
                        <img
                          src={`https://wzxswmopfxnucmeygqeg.supabase.co/storage/v1/object/public/documents/${emp.passport_photo_url}`}
                          alt=""
                          onError={(e) => { e.target.style.display = 'none'; }}
                          style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '1px solid #cbd5e1' }}
                        />
                      ) : (
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#e0f2fe', color: '#0369a1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>
                          {initials}
                        </div>
                      )}
                      <div>
                        <a href={`/employees/${emp.employee_id}`} style={{ fontWeight: 700, color: '#111827', textDecoration: 'none' }}>
                          {emp.name}
                        </a>
                        <span style={{ display: 'block', fontSize: 11, fontFamily: 'monospace', color: '#6b7280' }}>
                          ID: {emp.employee_id}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td style={{ fontWeight: 500, color: '#374151' }}>{emp.designation || '—'}</td>
                  <td>
                    <span style={{ background: '#f1f5f9', color: '#334155', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                      {emp.department || '—'}
                    </span>
                  </td>
                  <td style={{ color: '#6b7280', fontSize: 12 }}>
                    {emp.phone || emp.email || '—'}
                  </td>
                  <td>
                    <span style={{
                      padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                      background: emp.status === 'active' ? '#dcfce7' : '#fef3c7',
                      color: emp.status === 'active' ? '#15803d' : '#b45309'
                    }}>
                      {emp.status === 'active' ? '✓ Active' : '⏳ On Notice'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', paddingRight: 16 }}>
                    <a
                      href={`/employees/${emp.employee_id}`}
                      style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none', fontSize: 13 }}
                    >
                      View / Edit →
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {employees.length === 0 && (
          <div style={{ padding: 30, textAlign: 'center', color: '#6b7280' }}>
            No active employees found. Click "+ Add New Employee" above to add your first staff member.
          </div>
        )}
      </div>
    </div>
  );
}
