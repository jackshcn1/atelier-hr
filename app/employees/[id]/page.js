'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabaseClient';
import { computeSalarySplit } from '../../../lib/salarySplit';

export default function EmployeeDetail() {
  const { id } = useParams();
  const router = useRouter();
  const supabase = createClient();
  const [employee, setEmployee] = useState(null);
  const [allEmployees, setAllEmployees] = useState([]);
  const [salaryHistory, setSalaryHistory] = useState([]);
  const [trackRecord, setTrackRecord] = useState([]);
  const [newSalary, setNewSalary] = useState({ fixed: '', variable: '', effective_from: '', reason: '' });
  const [newNote, setNewNote] = useState({ type: 'note', text: '', author: '' });
  const [managerEdit, setManagerEdit] = useState('');
  const [payrollInfoSaved, setPayrollInfoSaved] = useState(false);
  const [standardHours, setStandardHours] = useState(10);
  const [variableSchemes, setVariableSchemes] = useState([]);
  const [assignedScheme, setAssignedScheme] = useState('');
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [jobDetails, setJobDetails] = useState({
    designation: '',
    department: '',
    employment_type: 'full-time',
    date_of_joining: '',
    probation_end_date: ''
  });
  const [jobSaved, setJobSaved] = useState(false);
  const [savingJob, setSavingJob] = useState(false);
  const [newEmployeeId, setNewEmployeeId] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [statusEdit, setStatusEdit] = useState('');
  const [managerAndStatusSaved, setManagerAndStatusSaved] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [exitDate, setExitDate] = useState('');
  const [viewerProfile, setViewerProfile] = useState(null);
  const [profileRole, setProfileRole] = useState('');
  const [trainingPending, setTrainingPending] = useState(false);
  const [showStageAdvance, setShowStageAdvance] = useState(false);
  const [exitReason, setExitReason] = useState('');
  const [resignationLetter, setResignationLetter] = useState(null);
  const [uploadingLetter, setUploadingLetter] = useState(false);
  const [exitRecord, setExitRecord] = useState(null);
  const [assets, setAssets] = useState([]);
  const [showAssetForm, setShowAssetForm] = useState(false);
  const [savingAsset, setSavingAsset] = useState(false);
  const [assetForm, setAssetForm] = useState({ name: '', asset_number: '', units: 1, deposit_amount: 0, date_issued: '', status: 'Issued' });
  const [documents, setDocuments] = useState([]);
  const [employeePayslips, setEmployeePayslips] = useState([]);
  const [docTemplates, setDocTemplates] = useState([]);
  const [newDocType, setNewDocType] = useState('');
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [trainingRecords, setTrainingRecords] = useState([]);
  const [newTraining, setNewTraining] = useState({ training_name: '', status: 'not-started', completed_date: '' });
  const [error, setError] = useState('');

  // Personal details (editable, moderate sensitivity — visible to department heads)
  const [personal, setPersonal] = useState({
    name: '', phone: '', email: '', dob: '', gender: '', blood_group: '',
    address: '', emergency_contact_name: '', emergency_contact_phone: '',
    id_proof_type: '', notes: '', previous_work_history: '', education_history: ''
  });
  const [personalSaved, setPersonalSaved] = useState(false);

  // Sensitive info (admin only — separate table, separate RLS)
  const [sensitive, setSensitive] = useState({
    id_proof_number: '', pf_number: '', esi_number: '',
    bank_account_holder_name: '', bank_ifsc_code: '', bank_name: '', bank_account_number: ''
  });
  const [sensitiveSaved, setSensitiveSaved] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingIdFront, setUploadingIdFront] = useState(false);
  const [uploadingIdBack, setUploadingIdBack] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [idFrontUrl, setIdFrontUrl] = useState(null);
  const [idBackUrl, setIdBackUrl] = useState(null);

  async function load() {
    const { data: emp } = await supabase.from('employees').select('*').eq('employee_id', id).single();
    setEmployee(emp);
    if (emp) {
      setManagerEdit(emp.reporting_manager_id || '');
      setStandardHours(emp.standard_hours_per_day || 10);
      setAssignedScheme(emp.variable_pay_scheme || '');
      setStatusEdit(emp.status || 'active');
      setExitDate(emp.date_of_leaving || '');
      setExitReason(emp.exit_reason || '');
      setJobDetails({
        designation: emp.designation || '',
        department: emp.department || '',
        employment_type: emp.employment_type || 'full-time',
        date_of_joining: emp.date_of_joining || '',
        probation_end_date: emp.probation_end_date || ''
      });
      setPersonal({
        name: emp.name || '', phone: emp.phone || '', email: emp.email || '',
        dob: emp.dob || '', gender: emp.gender || '', blood_group: emp.blood_group || '',
        address: emp.address || '', emergency_contact_name: emp.emergency_contact_name || '',
        emergency_contact_phone: emp.emergency_contact_phone || '', id_proof_type: emp.id_proof_type || '',
        notes: emp.notes || '', previous_work_history: emp.previous_work_history || '',
        education_history: emp.education_history || ''
      });
      if (emp.passport_photo_url) {
        const { data } = await supabase.storage.from('documents').createSignedUrl(emp.passport_photo_url, 3600);
        setPhotoUrl(data?.signedUrl || null);
      }
    }
    const { data: sens } = await supabase.from('employee_sensitive_info').select('*').eq('employee_id', id).maybeSingle();
    if (sens) {
      setSensitive({
        id_proof_number: sens.id_proof_number || '', pf_number: sens.pf_number || '', esi_number: sens.esi_number || '',
        bank_account_holder_name: sens.bank_account_holder_name || '', bank_ifsc_code: sens.bank_ifsc_code || '',
        bank_name: sens.bank_name || '', bank_account_number: sens.bank_account_number || ''
      });
      if (sens.id_proof_front_url) {
        const { data } = await supabase.storage.from('documents').createSignedUrl(sens.id_proof_front_url, 3600);
        setIdFrontUrl(data?.signedUrl || null);
      }
      if (sens.id_proof_back_url) {
        const { data } = await supabase.storage.from('documents').createSignedUrl(sens.id_proof_back_url, 3600);
        setIdBackUrl(data?.signedUrl || null);
      }
    }
    const { data: all } = await supabase.from('employees').select('employee_id, name, status, designation, department');
    setAllEmployees(all || []);
    const { data: sh } = await supabase.from('salary_history').select('*').eq('employee_id', id).order('effective_from', { ascending: false });
    setSalaryHistory(sh || []);
    const { data: tr } = await supabase.from('track_record').select('*').eq('employee_id', id).order('date', { ascending: false });
    setTrackRecord(tr || []);
    const { data: letter } = await supabase.from('documents').select('*').eq('employee_id', id).eq('doc_type', 'resignation_letter').maybeSingle();
    setResignationLetter(letter);
    const { data: exit } = await supabase.from('exit_records').select('*').eq('employee_id', id).maybeSingle();
    setExitRecord(exit);
    const { data: assetRows } = await supabase
      .from('employee_assets')
      .select('*')
      .eq('employee_id', id)
      .order('created_at', { ascending: false });
    setAssets(assetRows || []);
    const { data: docs } = await supabase.from('documents').select('*').eq('employee_id', id).order('date_added', { ascending: false });
    setDocuments(docs || []);
    if (emp?.department) {
      const { data: templates } = await supabase.from('doc_templates').select('*').eq('department', emp.department);
      setDocTemplates(templates || []);
    }
    const { data: et } = await supabase.from('employee_training').select('status').eq('employee_id', id);
    const hasPendingTraining = et && et.some(t => t.status !== 'completed');
    if (hasPendingTraining) setTrainingPending(true);
    setTrainingRecords(et || []);
    const { data: vSchemes } = await supabase.from('variable_pay_schemes').select('name, display_name').eq('is_active', true);
    setVariableSchemes(vSchemes || []);
    const { data: deptData } = await supabase.from('departments').select('name').order('name');
    setDepartments((deptData || []).map(d => d.name));
    const { data: desigData } = await supabase.from('designations').select('*').order('name');
    setDesignations(desigData || []);
    const { data: slips } = await supabase
      .from('payroll_line_items')
      .select('id, payslip_number, payroll_run_id, salary_paid_date, total_pay, net_pay, payment_status, bank_reference_number, payroll_runs(period, period_start, period_end)')
      .eq('employee_id', id)
      .not('payslip_number', 'is', null)
      .order('id', { ascending: false });
    const { data: viewer } = await supabase.auth.getUser();
    if (viewer?.user?.id) {
      const { data: vp } = await supabase.from('profiles').select('role,is_super_admin,permissions').eq('id', viewer.user.id).single();
      setViewerProfile(vp || null);
    }
    setEmployeePayslips(slips || []);
  }

  // Phase 2: Access control — salary edit only for super_admin, role='owner', or permissions.edit_salary
  const canEditSalary = viewerProfile ? (
    viewerProfile.is_super_admin === true ||
    viewerProfile.role === 'owner' ||
    (viewerProfile.permissions && typeof viewerProfile.permissions === 'object' && viewerProfile.permissions.edit_salary === true)
  ) : false;

  useEffect(() => { load(); }, [id]);

  async function addSalaryChange(e) {
    e.preventDefault();
    setError('');
    const { data: settings } = await supabase.from('payroll_settings').select('*').eq('id', 1).single();
    const split = computeSalarySplit(newSalary.fixed, settings);

    // Capture the outgoing figures before overwriting them. Salary is the most
    // sensitive number on the record, so every change is written to the audit
    // trail with both sides of the move.
    const prevFixed = Number(employee?.current_fixed_salary || 0);
    const prevVariable = Number(employee?.current_variable_salary || 0);
    const nextFixed = Number(newSalary.fixed || 0);
    const nextVariable = Number(newSalary.variable || 0);

    const { data: { user } } = await supabase.auth.getUser();
    const actorEmail = user?.email || 'unknown';

    const { error } = await supabase.from('salary_history').insert([{
      ...newSalary,
      ...split,
      employee_id: id,
      changed_by: actorEmail
    }]);
    if (error) { setError(error.message); return; }

    await supabase.from('employees').update({
      current_fixed_salary: newSalary.fixed,
      current_variable_salary: newSalary.variable
    }).eq('employee_id', id);

    await supabase.from('audit_log').insert([{
      actor: actorEmail,
      action: 'changed salary',
      record_affected:
        `${id} (${employee?.name || ''}) — fixed ₹${prevFixed.toLocaleString('en-IN')} → ₹${nextFixed.toLocaleString('en-IN')}, ` +
        `variable ₹${prevVariable.toLocaleString('en-IN')} → ₹${nextVariable.toLocaleString('en-IN')}` +
        (newSalary.reason ? ` — reason: ${newSalary.reason}` : '') +
        (newSalary.effective_from ? ` — effective ${newSalary.effective_from}` : '')
    }]);

    setNewSalary({ fixed: '', variable: '', effective_from: '', reason: '' });
    load();
  }

  async function addTrackEntry(e) {
    e.preventDefault();
    setError('');
    const { error } = await supabase.from('track_record').insert([{ ...newNote, employee_id: id }]);
    if (error) { setError(error.message); return; }
    setNewNote({ type: 'note', text: '', author: '' });
    load();
  }

  async function saveManagerAndStatus(e) {
    e.preventDefault();
    setError('');
    setSavingStatus(true);
    setManagerAndStatusSaved(false);

    const update = {
      reporting_manager_id: managerEdit || null,
      status: statusEdit,
      date_of_leaving: statusEdit === 'exited' ? (exitDate || new Date().toISOString().slice(0, 10)) : null,
      exit_reason: statusEdit === 'exited' ? (exitReason || null) : null
    };

    const { error: upErr } = await supabase.from('employees').update(update).eq('employee_id', id);
    setSavingStatus(false);

    if (upErr) {
      setError(`Failed to update status: ${upErr.message}`);
      return;
    }

    setManagerAndStatusSaved(true);
    setTimeout(() => setManagerAndStatusSaved(false), 4000);
    load();
  }

  async function saveJobDetails(e) {
    e.preventDefault();
    setError('');
    setSavingJob(true);
    setJobSaved(false);

    const { error: jobErr } = await supabase.from('employees').update({
      designation: jobDetails.designation || null,
      department: jobDetails.department || null,
      employment_type: jobDetails.employment_type || 'full-time',
      date_of_joining: jobDetails.date_of_joining || null,
      probation_end_date: jobDetails.probation_end_date || null
    }).eq('employee_id', id);

    setSavingJob(false);
    if (jobErr) {
      setError(`Failed to update job details: ${jobErr.message}`);
      return;
    }

    setJobSaved(true);
    setTimeout(() => setJobSaved(false), 4000);
    load();
  }

  async function savePersonal(e) {
    e.preventDefault();
    setError(''); setPersonalSaved(false);
    const { error } = await supabase.from('employees').update(personal).eq('employee_id', id);
    if (error) { setError(error.message); return; }
    setPersonalSaved(true);
    load();
  }

  async function saveSensitive(e) {
    e.preventDefault();
    setError(''); setSensitiveSaved(false);
    const { error } = await supabase.from('employee_sensitive_info').upsert([{ employee_id: id, ...sensitive }]);
    if (error) { setError(error.message + ' (only admins can save this section)'); return; }
    setSensitiveSaved(true);
    load();
  }

  async function uploadPassportPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    setError('');
    const path = `passport-photos/${id}-${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from('documents').upload(path, file);
    if (uploadError) { setError(uploadError.message + ' (only admins can upload files right now)'); setUploadingPhoto(false); return; }
    await supabase.from('employees').update({ passport_photo_url: path }).eq('employee_id', id);
    setUploadingPhoto(false);
    load();
  }

  async function uploadIdProof(side, e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const setLoading = side === 'front' ? setUploadingIdFront : setUploadingIdBack;
    setLoading(true);
    setError('');
    const path = `id-proofs/${id}-${side}-${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from('documents').upload(path, file);
    if (uploadError) { setError(uploadError.message + ' (only admins can upload files right now)'); setLoading(false); return; }
    const column = side === 'front' ? 'id_proof_front_url' : 'id_proof_back_url';
    const { error: dbError } = await supabase.from('employee_sensitive_info').upsert([{ employee_id: id, [column]: path }]);
    if (dbError) setError(dbError.message + ' (only admins can upload this)');
    setLoading(false);
    load();
  }

  async function savePayrollInfo(e) {
    e.preventDefault();
    setError(''); setPayrollInfoSaved(false);
    const { error } = await supabase.from('employees').update({
      standard_hours_per_day: standardHours,
      variable_pay_scheme: assignedScheme || null
    }).eq('employee_id', id);
    if (error) { setError(error.message); return; }
    setPayrollInfoSaved(true);
    load();
  }

  async function renameEmployeeId() {
    const newId = newEmployeeId.trim();
    if (!newId) return;
    setRenaming(true);
    setError('');

    // Every child table cascades on employee_id, so renaming rewrites the ID
    // inside historical payslips and salary history. Those records are what
    // payroll and statutory reporting are built on, so once a person has been
    // paid we refuse the rename rather than silently rewriting their history.
    const { data: paidRuns } = await supabase
      .from('payroll_line_items')
      .select('id, payroll_run_id')
      .eq('employee_id', id)
      .limit(1);

    if (paidRuns && paidRuns.length > 0) {
      setRenaming(false);
      setError(
        `${employee.name} has already been through payroll, so their ID can no longer be changed. ` +
        `Renaming would rewrite the ID inside their existing payslips and salary history. ` +
        `If the ID was issued incorrectly, correct it through a database migration so the change is reviewed.`
      );
      return;
    }

    const { error } = await supabase.from('employees').update({ employee_id: newId }).eq('employee_id', id);
    if (error) { setError(error.message); setRenaming(false); return; }
    await supabase.from('audit_log').insert([{
      actor: (await supabase.auth.getUser()).data.user?.email || 'unknown',
      action: 'renamed employee ID',
      record_affected: `${id} → ${newId} (${employee.name})`
    }]);
    router.push(`/employees/${newId}`);
  }

  async function deleteEmployee() {
    if (deleteConfirmText !== 'CONFIRM') return;
    setDeleting(true);
    setError('');
    const { error } = await supabase.from('employees').update({ deleted_at: new Date().toISOString() }).eq('employee_id', id);
    if (error) { setError(error.message); setDeleting(false); return; }
    await supabase.from('audit_log').insert([{
      actor: (await supabase.auth.getUser()).data.user?.email || 'unknown',
      action: 'deleted employee',
      record_affected: `${id} (${employee.name})`
    }]);
    router.push('/employees');
  }

  async function uploadResignationLetter(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLetter(true);
    setError('');
    const path = `resignation-letters/${id}-${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from('documents').upload(path, file);
    if (uploadError) { setError(uploadError.message + ' (only admins can upload files right now)'); setUploadingLetter(false); return; }
    const { error: dbError } = await supabase.from('documents').insert([{
      employee_id: id, doc_type: 'resignation_letter', status: 'on-file', file_url: path
    }]);
    if (dbError) setError(dbError.message);
    setUploadingLetter(false);
    load();
  }

  // Asset and uniform tracking now lives in the exit clearance workspace
  // (/exit-clearance?id=<employee_id>). It writes clearance_status only through
  // the settled path, which the exit_records constraints require.

  async function saveAsset(e) {
    e.preventDefault();
    if (!assetForm.name.trim()) return;
    setSavingAsset(true);
    setError('');
    try {
      const issueDate = assetForm.date_issued || new Date().toISOString().slice(0, 10);
      const { error: insErr } = await supabase.from('employee_assets').insert({
        employee_id: id,
        name: assetForm.name.trim(),
        asset_number: assetForm.asset_number.trim() || null,
        units: Number(assetForm.units) || 1,
        deposit_amount: Number(assetForm.deposit_amount) || 0,
        date_issued: issueDate,
        date_handed_over: issueDate,
        status: assetForm.status || 'Issued',
        returned: assetForm.status === 'Returned',
      });
      if (insErr) { setError(insErr.message); return; }

      // If deposit amount > 0, snapshot to employee_deposits
      if (Number(assetForm.deposit_amount) > 0) {
        await supabase.from('employee_deposits').insert([{
          employee_id: id,
          deposit_type: assetForm.name.toLowerCase().includes('accommodation') ? 'accommodation' : 'uniform',
          amount: Number(assetForm.deposit_amount)
        }]);
      }

      setAssetForm({ name: '', asset_number: '', units: 1, deposit_amount: 0, date_issued: '', status: 'Issued' });
      setShowAssetForm(false);
      load();
    } finally {
      setSavingAsset(false);
    }
  }

  async function updateAssetStatus(assetId, newStatus) {
    setError('');
    const { error: upErr } = await supabase.from('employee_assets').update({
      status: newStatus,
      returned: newStatus === 'Returned',
      date_returned: newStatus === 'Returned' ? new Date().toISOString().slice(0, 10) : null
    }).eq('id', assetId);
    if (upErr) { setError(upErr.message); return; }
    load();
  }

  async function removeAsset(assetId) {
    if (!window.confirm('Remove this asset from the employee record?')) return;
    setError('');
    const { error: delErr } = await supabase.from('employee_assets').delete().eq('id', assetId);
    if (delErr) { setError(delErr.message); return; }
    load();
  }

  async function uploadDocument(e) {
    e.preventDefault();
    const fileInput = e.target.elements.docFile;
    const file = fileInput.files?.[0];
    if (!file || !newDocType.trim()) { setError('Pick a document type and a file.'); return; }
    setUploadingDoc(true);
    setError('');
    const path = `employee-docs/${id}-${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from('documents').upload(path, file);
    if (uploadError) { setError(uploadError.message + ' (only admins can upload files right now)'); setUploadingDoc(false); return; }
    const { error: dbError } = await supabase.from('documents').insert([{
      employee_id: id, doc_type: newDocType, status: 'on-file', file_url: path
    }]);
    if (dbError) setError(dbError.message);
    setNewDocType('');
    fileInput.value = '';
    setUploadingDoc(false);
    load();
  }

  async function addTraining(e) {
    e.preventDefault();
    setError('');
    const { error } = await supabase.from('training_records').insert([{ ...newTraining, employee_id: id }]);
    if (error) { setError(error.message); return; }
    setNewTraining({ training_name: '', status: 'not-started', completed_date: '' });
    load();
  }

  async function updateTrainingStatus(trainingId, status) {
    const completed_date = status === 'completed' ? new Date().toISOString().slice(0, 10) : null;
    await supabase.from('training_records').update({ status, completed_date }).eq('id', trainingId);
    load();
  }

  if (!employee) return <p>Loading… (or you may not have access to this employee's department)</p>;

  const tenure = (() => {
    const start = new Date(employee.date_of_joining);
    const end = employee.date_of_leaving ? new Date(employee.date_of_leaving) : new Date();
    const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    return `${Math.floor(months / 12)}y ${months % 12}m`;
  })();

  const candidateManagers = allEmployees.filter(e => e.employee_id !== id && e.status !== 'exited');

  const initials = String(employee.name || 'Emp')
    .split(/\s+/)
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div style={{ paddingBottom: 40 }}>
      <a href="/employees" style={{ color: '#4b5563', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
        ← Back to all employees
      </a>

      {/* Top Employee Profile Card with Photo Thumbnail */}
      <div style={{
        background: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: 10,
        padding: '20px 24px',
        marginTop: 14,
        marginBottom: 20,
        boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
        display: 'flex',
        gap: 20,
        alignItems: 'center',
        flexWrap: 'wrap'
      }}>
        {/* Passport Photo Thumbnail / Avatar */}
        <div style={{ position: 'relative', width: 96, height: 96, flexShrink: 0 }}>
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={employee.name}
              style={{
                width: 96,
                height: 96,
                objectFit: 'cover',
                borderRadius: 8,
                border: '2px solid #e2e8f0',
                boxShadow: '0 2px 5px rgba(0,0,0,0.08)'
              }}
            />
          ) : (
            <div style={{
              width: 96,
              height: 96,
              borderRadius: 8,
              background: '#e0f2fe',
              border: '2px dashed #7dd3fc',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0369a1'
            }}>
              <span style={{ fontSize: 24, fontWeight: 800 }}>{initials}</span>
              <span style={{ fontSize: 10, fontWeight: 600, marginTop: 2 }}>No Photo</span>
            </div>
          )}

          {/* Quick upload trigger on avatar */}
          <label style={{
            position: 'absolute',
            bottom: -6,
            right: -6,
            background: '#2563eb',
            color: 'white',
            borderRadius: '50%',
            width: 26,
            height: 26,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            cursor: 'pointer',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            border: '2px solid white'
          }} title="Upload / Update Passport Photo">
            📷
            <input type="file" accept="image/*" onChange={uploadPassportPhoto} disabled={uploadingPhoto} style={{ display: 'none' }} />
          </label>
        </div>

        {/* Profile Info Details */}
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#111827' }}>
              {employee.name}
            </h1>
            {/* Phase 2: Onboarding stage pill — top right of name block */}
            {employee?.onboarding_status && (
              <span
                onClick={() => { if (canEditSalary) setShowStageAdvance(s => !s); }}
                style={{
                  padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700,
                  background: employee.onboarding_status === 'Draft' ? '#fee2e2' :
                              employee.onboarding_status === 'Documents Pending' ? '#fef3c7' :
                              employee.onboarding_status === 'Compensation Set' ? '#e0e7ff' :
                              employee.onboarding_status === 'Assets Issued' ? '#dcfce7' :
                              '#f0fdf4',
                  color: employee.onboarding_status === 'Draft' ? '#991b1b' :
                         employee.onboarding_status === 'Documents Pending' ? '#b45309' :
                         employee.onboarding_status === 'Compensation Set' ? '#3730a3' :
                         employee.onboarding_status === 'Assets Issued' ? '#166534' :
                         '#166534',
                  border: `1px solid ${employee.onboarding_status === 'Draft' ? '#fca5a5' :
                             employee.onboarding_status === 'Documents Pending' ? '#fde68a' :
                             employee.onboarding_status === 'Compensation Set' ? '#c7d2fe' :
                             employee.onboarding_status === 'Assets Issued' ? '#bbf7d0' :
                             '#bbf7d0'}`,
                  cursor: canEditSalary ? 'pointer' : 'default',
                  marginLeft: 8, whiteSpace: 'nowrap'
                }}
                onClick={() => { if (canEditSalary) setShowStageAdvance(s => !s); }}
              >
                {employee.onboarding_status === 'Active' ? '✓ Active' : employee.onboarding_status}
                {showStageAdvance && canEditSalary && (
                  <div style={{ position: 'absolute', top: 28, right: 0, background: 'white', border: '1px solid #e5e7eb', borderRadius: 6, padding: 8, minWidth: 220, zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Move to:</div>
                    {['Draft','Documents Pending','Compensation Set','Assets Issued','Active'].map(s => (
                      <button key={s} onClick={() => { supabase.from('employees').update({ onboarding_status: s }).eq('employee_id', id); setShowStageAdvance(false); load(); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '4px 6px', borderRadius: 4, border: 'none', fontSize: 12, cursor: 'pointer', background: s === employee.onboarding_status ? '#dbeafe' : 'transparent', color: '#111827', marginBottom: 2 }}>{s}</button>
                    ))}
                  </div>
                )}
              </span>
            )}
            <span style={{
              padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700,
              background: employee.status === 'active' ? '#dcfce7' : employee.status === 'on-notice' ? '#fef3c7' : '#fee2e2',
              color: employee.status === 'active' ? '#15803d' : employee.status === 'on-notice' ? '#b45309' : '#991b1b',
              border: `1px solid ${employee.status === 'active' ? '#bbf7d0' : employee.status === 'on-notice' ? '#fde68a' : '#fca5a5'}`
            }}>
              {employee.status === 'active' ? '✓ Active' : employee.status === 'on-notice' ? '⏳ On Notice' : '🚪 Exited'}
            </span>
          </div>

          {/* Phase 2: Non-blocking Training Pending banner */}
          {trainingPending && (
            <div style={{ background: '#fff3cd', border: '1px solid #ffe08a', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: '#92400e', marginLeft: 10, fontWeight: 600 }}>
              Training Pending — report manager must complete modules.
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 13, color: '#4b5563', marginBottom: 8 }}>
            <span style={{ fontWeight: 600, color: '#1f2937' }}>{employee.designation || 'Staff'}</span>
            <span>•</span>
            <span style={{ background: '#f3f4f6', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>{employee.department || 'All Departments'}</span>
            <span>•</span>
            <span style={{ fontFamily: 'monospace', background: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>
              ID: {id}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: '#6b7280' }}>
            <span>📅 Joined: <strong>{employee.date_of_joining || '—'}</strong> ({tenure})</span>
            {employee.reporting_manager_id && (
              <span>👤 Reports to: <strong>{allEmployees.find(m => m.employee_id === employee.reporting_manager_id)?.name || employee.reporting_manager_id}</strong></span>
            )}
            {employee.phone && <span>📞 {employee.phone}</span>}
            {employee.email && <span>✉️ {employee.email}</span>}
          </div>
        </div>

        {/* Top Right Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          <a
            href={`/employees/${id}/onboarding`}
            style={{
              background: '#f8fafc', border: '1px solid #cbd5e1', color: '#334155',
              padding: '6px 14px', borderRadius: 6, textDecoration: 'none', fontSize: 12, fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: 6
            }}
          >
            📄 Onboarding Doc →
          </a>
          <a
            href={`/employees/${id}/appraisal`}
            style={{
              background: '#f8fafc', border: '1px solid #cbd5e1', color: '#334155',
              padding: '6px 14px', borderRadius: 6, textDecoration: 'none', fontSize: 12, fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: 6
            }}
          >
            ⭐ Appraisals →
          </a>
          {uploadingPhoto && <span style={{ fontSize: 11, color: '#2563eb' }}>Uploading photo…</span>}
        </div>
      </div>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      {/* 1. Job & Department Assignment Section */}
      <section style={{ background: 'white', padding: 18, borderRadius: 8, marginTop: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#111827' }}>
            💼 Job, Department & Designation
          </h2>
          <a
            href="/settings/departments-designations"
            style={{ fontSize: 12, color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}
          >
            ⚙️ Manage Departments & Designations →
          </a>
        </div>
        <p style={{ color: '#6b7280', fontSize: 13, margin: '0 0 14px 0' }}>
          Assign official organization department, role designation, and employment contracts.
        </p>

        <form onSubmit={saveJobDetails} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, alignItems: 'flex-end' }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
            Department
            <select
              value={jobDetails.department}
              onChange={e => setJobDetails({ ...jobDetails, department: e.target.value })}
              style={{ width: '100%', padding: '7px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, background: 'white', boxSizing: 'border-box' }}
            >
              <option value="">Unassigned</option>
              {departments.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
            Designation (Role)
            <input
              list="desig-options"
              value={jobDetails.designation}
              onChange={e => setJobDetails({ ...jobDetails, designation: e.target.value })}
              placeholder="Select or type designation"
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
              value={jobDetails.employment_type}
              onChange={e => setJobDetails({ ...jobDetails, employment_type: e.target.value })}
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
              value={jobDetails.date_of_joining}
              onChange={e => setJobDetails({ ...jobDetails, date_of_joining: e.target.value })}
              style={{ width: '100%', padding: '6px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, boxSizing: 'border-box' }}
            />
          </label>

          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
            Probation End Date
            <input
              type="date"
              value={jobDetails.probation_end_date}
              onChange={e => setJobDetails({ ...jobDetails, probation_end_date: e.target.value })}
              style={{ width: '100%', padding: '6px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, boxSizing: 'border-box' }}
            />
          </label>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
            <button
              type="submit"
              disabled={savingJob}
              style={{
                padding: '8px 20px', background: '#2563eb', color: 'white', border: 'none',
                borderRadius: 4, fontWeight: 700, fontSize: 13, cursor: 'pointer'
              }}
            >
              {savingJob ? 'Saving…' : 'Save Job Details'}
            </button>
            {jobSaved && <span style={{ color: '#059669', fontWeight: 700, fontSize: 13 }}>✓ Job details updated!</span>}
          </div>
        </form>
      </section>

      <section style={{ background: 'white', padding: 16, borderRadius: 8, marginTop: 20 }}>
        <h2>Personal details</h2>
        <form onSubmit={savePersonal} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label>Name<input value={personal.name} onChange={e => setPersonal({ ...personal, name: e.target.value })} /></label>
          <label>Phone<input value={personal.phone} onChange={e => setPersonal({ ...personal, phone: e.target.value })} /></label>
          <label>Email<input value={personal.email} onChange={e => setPersonal({ ...personal, email: e.target.value })} /></label>
          <label>Date of birth<input type="date" value={personal.dob} onChange={e => setPersonal({ ...personal, dob: e.target.value })} /></label>
          <label>Gender
            <select value={personal.gender} onChange={e => setPersonal({ ...personal, gender: e.target.value })}>
              <option value="">Select…</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
              <option value="Prefer not to say">Prefer not to say</option>
            </select>
          </label>
          <label>Blood group<input value={personal.blood_group} onChange={e => setPersonal({ ...personal, blood_group: e.target.value })} /></label>
          <label style={{ gridColumn: 'span 2' }}>Address
            <textarea value={personal.address} onChange={e => setPersonal({ ...personal, address: e.target.value })} rows={2} style={{ display: 'block', width: '100%' }} />
          </label>
          <label>Emergency contact name<input value={personal.emergency_contact_name} onChange={e => setPersonal({ ...personal, emergency_contact_name: e.target.value })} /></label>
          <label>Emergency contact phone<input value={personal.emergency_contact_phone} onChange={e => setPersonal({ ...personal, emergency_contact_phone: e.target.value })} /></label>
          <label>ID proof document type
            <select
              value={personal.id_proof_type || 'Aadhaar'}
              onChange={e => setPersonal({ ...personal, id_proof_type: e.target.value })}
              style={{ display: 'block', width: '100%', padding: '6px 8px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', background: 'white' }}
            >
              <option value="Aadhaar">Aadhaar Card</option>
              <option value="PAN">PAN Card</option>
              <option value="Passport">Passport</option>
              <option value="Driving License">Driving License</option>
              <option value="Voter ID">Voter ID</option>
            </select>
          </label>
          <label style={{ gridColumn: 'span 2' }}>Previous work history
            <textarea value={personal.previous_work_history} onChange={e => setPersonal({ ...personal, previous_work_history: e.target.value })} rows={3} style={{ display: 'block', width: '100%' }} />
          </label>
          <label style={{ gridColumn: 'span 2' }}>Education history
            <textarea value={personal.education_history} onChange={e => setPersonal({ ...personal, education_history: e.target.value })} rows={3} style={{ display: 'block', width: '100%' }} />
          </label>
          <label style={{ gridColumn: 'span 2' }}>Notes
            <textarea value={personal.notes} onChange={e => setPersonal({ ...personal, notes: e.target.value })} rows={3} style={{ display: 'block', width: '100%' }} />
          </label>
          <button type="submit" style={{ gridColumn: 'span 2' }}>Save</button>
          {personalSaved && <span style={{ color: 'green' }}>Saved.</span>}
        </form>

        <div style={{ marginTop: 16, borderTop: '1px solid #eee', paddingTop: 16 }}>
          <label>Passport-size photo
            <input type="file" accept="image/*" onChange={uploadPassportPhoto} disabled={uploadingPhoto} style={{ display: 'block' }} />
          </label>
          {uploadingPhoto && <span>Uploading…</span>}
        </div>
      </section>

      <section style={{ background: '#fff8f0', border: '1px solid #ffe0b2', padding: 16, borderRadius: 8, marginTop: 20 }}>
        <h2>Sensitive info (admin only)</h2>
        <p style={{ color: '#777', fontSize: 14 }}>ID numbers, PF/ESI numbers, and bank details — kept separate so department heads don't automatically see them.</p>
        <form onSubmit={saveSensitive} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label>ID proof number<input value={sensitive.id_proof_number} onChange={e => setSensitive({ ...sensitive, id_proof_number: e.target.value })} /></label>
          {employee.pf_applicable && (
            <label>PF number<input value={sensitive.pf_number} onChange={e => setSensitive({ ...sensitive, pf_number: e.target.value })} /></label>
          )}
          {employee.esi_applicable && (
            <label>ESI number<input value={sensitive.esi_number} onChange={e => setSensitive({ ...sensitive, esi_number: e.target.value })} /></label>
          )}
          <label>Bank account holder name<input value={sensitive.bank_account_holder_name} onChange={e => setSensitive({ ...sensitive, bank_account_holder_name: e.target.value })} /></label>
          <label>Bank name<input value={sensitive.bank_name} onChange={e => setSensitive({ ...sensitive, bank_name: e.target.value })} /></label>
          <label>IFSC code<input value={sensitive.bank_ifsc_code} onChange={e => setSensitive({ ...sensitive, bank_ifsc_code: e.target.value })} /></label>
          <label>Account number<input value={sensitive.bank_account_number} onChange={e => setSensitive({ ...sensitive, bank_account_number: e.target.value })} /></label>
          <button type="submit" style={{ gridColumn: 'span 2' }}>Save</button>
          {sensitiveSaved && <span style={{ color: 'green' }}>Saved.</span>}
        </form>

        <div style={{ marginTop: 16, borderTop: '1px solid #ffe0b2', paddingTop: 16, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <label>ID proof — front<input type="file" onChange={e => uploadIdProof('front', e)} disabled={uploadingIdFront} style={{ display: 'block' }} /></label>
            {idFrontUrl && <img src={idFrontUrl} alt="" style={{ width: 120, marginTop: 6, borderRadius: 4 }} />}
          </div>
          <div>
            <label>ID proof — back<input type="file" onChange={e => uploadIdProof('back', e)} disabled={uploadingIdBack} style={{ display: 'block' }} /></label>
            {idBackUrl && <img src={idBackUrl} alt="" style={{ width: 120, marginTop: 6, borderRadius: 4 }} />}
          </div>
        </div>
      </section>

      <section style={{ background: 'white', padding: 16, borderRadius: 8, marginTop: 20 }}>
        <h2>Manager & Status</h2>
        <form onSubmit={saveManagerAndStatus} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Reports to
            <select
              value={managerEdit}
              onChange={e => setManagerEdit(e.target.value)}
              style={{ display: 'block', padding: '6px 8px', marginTop: 4, borderRadius: 4, border: '1px solid #ccc', background: 'white' }}
            >
              <option value="">None (top of hierarchy)</option>
              {candidateManagers.map(m => (
                <option key={m.employee_id} value={m.employee_id}>
                  {m.name} ({m.designation || 'Staff'}{m.department ? ` • ${m.department}` : ''})
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Status
            <select
              value={statusEdit}
              onChange={e => setStatusEdit(e.target.value)}
              style={{ display: 'block', padding: '6px 8px', marginTop: 4, borderRadius: 4, border: '1px solid #ccc', background: 'white' }}
            >
              <option value="active">Active</option>
              <option value="on-notice">On notice</option>
              <option value="exited">Exited</option>
            </select>
          </label>
          {statusEdit === 'exited' && (
            <>
              <label style={{ fontSize: 13, fontWeight: 600 }}>Date of leaving
                <input
                  type="date"
                  value={exitDate}
                  onChange={e => setExitDate(e.target.value)}
                  style={{ display: 'block', padding: '6px 8px', marginTop: 4, borderRadius: 4, border: '1px solid #ccc' }}
                />
              </label>
              <label style={{ fontSize: 13, fontWeight: 600 }}>Exit reason
                <select
                  value={exitReason}
                  onChange={e => setExitReason(e.target.value)}
                  style={{ display: 'block', padding: '6px 8px', marginTop: 4, borderRadius: 4, border: '1px solid #ccc', background: 'white' }}
                >
                  <option value="">Select reason…</option>
                  <option value="resigned">Resigned</option>
                  <option value="absconding">Absconding</option>
                  <option value="terminated_disciplinary">Terminated (disciplinary)</option>
                  <option value="terminated_admin">Terminated (admin)</option>
                </select>
              </label>
            </>
          )}
          <button
            type="submit"
            disabled={savingStatus}
            style={{
              padding: '7px 18px',
              background: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer'
            }}
          >
            {savingStatus ? 'Saving…' : 'Save Status'}
          </button>
          {managerAndStatusSaved && (
            <span style={{ color: '#059669', fontWeight: 700, fontSize: 13 }}>
              ✓ Status updated successfully!
            </span>
          )}
        </form>
        {statusEdit === 'exited' && (
          <p style={{ color: '#856404', marginTop: 10 }}>
            Marking this person exited: anyone who reports to them will show up under "Needs reassignment" on the Employees page until you reassign them.
          </p>
        )}
        {(statusEdit === 'on-notice' || statusEdit === 'exited') && (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 16 }}>Resignation letter</h3>
            {resignationLetter ? (
              <p>On file since {resignationLetter.date_added}.</p>
            ) : (
              <p style={{ color: '#777' }}>Not uploaded yet.</p>
            )}
            <input type="file" onChange={uploadResignationLetter} disabled={uploadingLetter} />
            {uploadingLetter && <span> Uploading…</span>}
          </div>
        )}
      </section>

      <section style={{ background: 'white', padding: 16, borderRadius: 8, marginTop: 20 }}>
        <h2>Payroll & Variable Pay Info</h2>
        <form onSubmit={savePayrollInfo} style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Standard hours/day
            <input type="number" value={standardHours} onChange={e => setStandardHours(e.target.value)} style={{ display: 'block', width: 90, padding: 6, marginTop: 4, borderRadius: 4, border: '1px solid #ccc' }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, minWidth: 260 }}>Assigned Variable Pay Scheme
            <select
              value={assignedScheme}
              onChange={e => setAssignedScheme(e.target.value)}
              style={{ display: 'block', width: '100%', padding: '6px 8px', marginTop: 4, borderRadius: 4, border: '1px solid #ccc', background: 'white' }}
            >
              <option value="">None (Standard / Manual Variable %)</option>
              {variableSchemes.map(s => (
                <option key={s.name} value={s.name}>{s.display_name}</option>
              ))}
            </select>
          </label>
          <button type="submit" style={{ padding: '7px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 4, fontWeight: 600, cursor: 'pointer' }}>
            Save Payroll Info
          </button>
          {payrollInfoSaved && <span style={{ color: 'green', fontWeight: 600 }}>✓ Saved.</span>}
        </form>

        <div style={{ marginTop: 16, borderTop: '1px solid #eee', paddingTop: 16 }}>
          <p style={{ color: '#777', fontSize: 14 }}>
            Employee ID is what Petpooja's attendance export must match to import this person's payroll — it should be
            the code Petpooja generated for them. Current ID: <strong>{id}</strong>. Only change this if it doesn't already match Petpooja.
          </p>
          <input placeholder="Correct Employee ID (Petpooja code)" value={newEmployeeId}
            onChange={e => setNewEmployeeId(e.target.value)} style={{ padding: 8, marginRight: 8 }} />
          <button onClick={renameEmployeeId} disabled={!newEmployeeId.trim() || renaming}>
            {renaming ? 'Updating…' : 'Update Employee ID'}
          </button>
        </div>
      </section>

      <section style={{ background: 'white', padding: 16, borderRadius: 8, marginTop: 20 }}>
        <h2>Salary Payslips</h2>
        {employeePayslips.length === 0 ? (
          <p style={{ color: '#777', fontSize: 14 }}>No payslips generated yet for this employee.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 10 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #eee' }}>
                  <th style={{ padding: 6 }}>Payslip ID</th>
                  <th>Period</th>
                  <th>Payment Date</th>
                  <th>Net Paid</th>
                  <th>Bank Ref (UTR)</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {employeePayslips.map(ps => {
                  const run = ps.payroll_runs;
                  const periodText = run?.period_start && run?.period_end ? `${run.period_start} to ${run.period_end}` : run?.period || '—';
                  const isPaid = ps.payment_status === 'processed';
                  return (
                    <tr key={ps.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: 6, fontFamily: 'monospace', fontWeight: 'bold', color: '#0369a1' }}>{ps.payslip_number}</td>
                      <td>{periodText}</td>
                      <td>{ps.salary_paid_date || '—'}</td>
                      <td style={{ fontWeight: 'bold', color: '#059669' }}>₹{Number(ps.total_pay || ps.net_pay || 0).toLocaleString('en-IN')}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{ps.bank_reference_number || '—'}</td>
                      <td>
                        <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 'bold', background: isPaid ? '#dcfce7' : '#fef3c7', color: isPaid ? '#15803d' : '#b45309' }}>
                          {isPaid ? '✓ Paid' : '⏳ Pending'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <a href={`/payslips/${encodeURIComponent(ps.payslip_number || ps.id)}`} target="_blank" rel="noreferrer" style={{ color: '#059669', fontWeight: 600, textDecoration: 'none' }}>
                          📄 View / Print PDF →
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={{ background: 'white', padding: 16, borderRadius: 8, marginTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 6 }}>
          <div>
            <h2 style={{ margin: 0 }}>Assets & Equipment</h2>
            <p style={{ color: '#777', fontSize: 13, margin: '2px 0 0 0' }}>
              Uniforms, accommodation keys, and tools tagged to this employee. Carries over to exit handover and deposit clearance.
            </p>
          </div>
          <button
            onClick={() => setShowAssetForm(s => !s)}
            style={{ background: '#334155', color: 'white', border: 'none', padding: '6px 14px', borderRadius: 5, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            {showAssetForm ? 'Cancel' : '+ Add asset'}
          </button>
        </div>

        {showAssetForm && (
          <form onSubmit={saveAsset} style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 8, padding: 14, marginTop: 12, marginBottom: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
                Asset Name *
                <input required value={assetForm.name} onChange={e => setAssetForm({ ...assetForm, name: e.target.value })}
                  placeholder="e.g. Uniform, POS Tab, Knife Set"
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 9px', borderRadius: 5, border: '1.5px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }} />
              </label>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
                Tag / Serial / Size
                <input value={assetForm.asset_number} onChange={e => setAssetForm({ ...assetForm, asset_number: e.target.value })}
                  placeholder="e.g. Size L, Tab #04, Room 2B"
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 9px', borderRadius: 5, border: '1.5px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }} />
              </label>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
                Units / Qty
                <input type="number" min="1" value={assetForm.units} onChange={e => setAssetForm({ ...assetForm, units: e.target.value })}
                  placeholder="1"
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 9px', borderRadius: 5, border: '1.5px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }} />
              </label>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
                Deposit Amount (₹)
                <input type="number" value={assetForm.deposit_amount} onChange={e => setAssetForm({ ...assetForm, deposit_amount: e.target.value })}
                  placeholder="0"
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 9px', borderRadius: 5, border: '1.5px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }} />
              </label>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
                Date Issued
                <input type="date" value={assetForm.date_issued} onChange={e => setAssetForm({ ...assetForm, date_issued: e.target.value })}
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 9px', borderRadius: 5, border: '1.5px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }} />
              </label>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
                Status
                <select value={assetForm.status} onChange={e => setAssetForm({ ...assetForm, status: e.target.value })}
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 9px', borderRadius: 5, border: '1.5px solid #cbd5e1', fontSize: 13, background: 'white', boxSizing: 'border-box' }}>
                  <option value="Issued">Issued</option>
                  <option value="Returned">Returned</option>
                  <option value="Lost">Lost</option>
                  <option value="Damaged">Damaged</option>
                </select>
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="submit" disabled={savingAsset}
                style={{ background: savingAsset ? '#9ca3af' : '#2563eb', color: 'white', border: 'none', padding: '7px 16px', borderRadius: 5, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                {savingAsset ? 'Saving…' : 'Save asset'}
              </button>
            </div>
          </form>
        )}

        {error && <p style={{ color: '#b91c1c', fontSize: 13, marginTop: 8 }}>{error}</p>}

        {assets.length === 0 ? (
          <p style={{ color: '#777', fontSize: 14, marginTop: 10 }}>No assets tagged to this employee.</p>
        ) : (
          <div style={{ marginTop: 10, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['Asset Name', 'Tag / Serial / Spec', 'Units', 'Deposit', 'Date Issued', 'Status', ''].map((h, i) => (
                    <th key={i} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e5e7eb', fontWeight: 700, color: '#6b7280', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {assets.map(a => {
                  const st = a.status || (a.returned ? 'Returned' : 'Issued');
                  return (
                    <tr key={a.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 600, color: '#111827' }}>{a.name}</td>
                      <td style={{ padding: '8px 10px', color: '#6b7280' }}>{a.asset_number || '—'}</td>
                      <td style={{ padding: '8px 10px', color: '#374151', fontWeight: 600 }}>{a.units ?? 1}</td>
                      <td style={{ padding: '8px 10px', color: '#059669', fontWeight: 600 }}>
                        {Number(a.deposit_amount) > 0 ? `₹${Number(a.deposit_amount).toLocaleString('en-IN')}` : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', color: '#374151' }}>{a.date_issued || a.date_handed_over || '—'}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <select
                          value={st}
                          onChange={e => updateAssetStatus(a.id, e.target.value)}
                          style={{
                            padding: '3px 8px',
                            borderRadius: 12,
                            fontSize: 12,
                            fontWeight: 700,
                            border: '1px solid transparent',
                            cursor: 'pointer',
                            background: st === 'Issued' ? '#dcfce7' : st === 'Returned' ? '#eff6ff' : st === 'Lost' ? '#fee2e2' : '#fef3c7',
                            color: st === 'Issued' ? '#166534' : st === 'Returned' ? '#1e40af' : st === 'Lost' ? '#991b1b' : '#92400e',
                            borderColor: st === 'Issued' ? '#bbf7d0' : st === 'Returned' ? '#bfdbfe' : st === 'Lost' ? '#fca5a5' : '#fde68a'
                          }}
                        >
                          <option value="Issued">✓ Issued</option>
                          <option value="Returned">↩ Returned</option>
                          <option value="Lost">⚠ Lost</option>
                          <option value="Damaged">⚡ Damaged</option>
                        </select>
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        {employee.status !== 'exited' && (
                          <button onClick={() => removeAsset(a.id)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, fontWeight: 700 }} title="Remove asset">×</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {['on-notice', 'exited'].includes(employee.status) && (
        <section style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: 16, borderRadius: 8, marginTop: 20 }}>
          <h2 style={{ marginTop: 0 }}>Exit clearance</h2>
          <p style={{ color: '#92400e', fontSize: 14 }}>
            {employee.status === 'on-notice'
              ? 'This employee is on notice. Handover and clearance can be phased across the notice period.'
              : 'This employee has left. Clearance stays here until it is fully settled.'}
          </p>
          <div style={{ fontSize: 13, color: '#374151', marginBottom: 6 }}>
            Uniform returned:{' '}
            <strong>{exitRecord?.uniform_returned === true ? 'Yes' : exitRecord?.uniform_returned === false ? 'No' : 'Not confirmed'}</strong>
          </div>
          <p style={{ fontSize: 13 }}>
            Clearance status:{' '}
            <strong style={{ color: exitRecord?.clearance_status === 'cleared' ? '#059669' : '#b45309' }}>
              {exitRecord?.clearance_status === 'cleared' ? 'Cleared' : 'Pending'}
            </strong>
            {exitRecord?.settled_on && <> (settled {exitRecord.settled_on})</>}
          </p>
          <p style={{ marginTop: 12 }}>
            <a href={`/exit-clearance?id=${id}`}>Open exit clearance workspace →</a><br />
            <a href={`/employees/${id}/work-certificate`}>View / print work certificate →</a>
          </p>
        </section>
      )}

      <section style={{ background: 'white', padding: 16, borderRadius: 8, marginTop: 20 }}>
        <h2>Documents</h2>
        {docTemplates.length > 0 && (() => {
          const submittedTypes = new Set(documents.map(d => d.doc_type));
          const missing = docTemplates.filter(t => t.required && !submittedTypes.has(t.doc_name));
          return missing.length > 0 ? (
            <div style={{ background: '#fff3cd', border: '1px solid #ffe08a', borderRadius: 6, padding: 10, marginBottom: 12 }}>
              <strong>Missing required documents for {employee.department}:</strong> {missing.map(m => m.doc_name).join(', ')}
            </div>
          ) : (
            <p style={{ color: 'green' }}>All required documents for {employee.department} are on file.</p>
          );
        })()}
        <ul>
          {documents.map(d => (
            <li key={d.id}>{d.doc_type} — {d.status} (added {d.date_added})</li>
          ))}
        </ul>
        <form onSubmit={uploadDocument} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input list="doc-type-options" placeholder="Document type (e.g. CV, ID Proof)" value={newDocType}
            onChange={e => setNewDocType(e.target.value)} />
          <datalist id="doc-type-options">
            {docTemplates.map(t => <option key={t.id} value={t.doc_name} />)}
          </datalist>
          <input type="file" name="docFile" />
          <button type="submit" disabled={uploadingDoc}>{uploadingDoc ? 'Uploading…' : 'Upload'}</button>
        </form>
      </section>

      <section style={{ background: 'white', padding: 16, borderRadius: 8, marginTop: 20 }}>
        <h2>Training</h2>
        <ul>
          {trainingRecords.map(t => (
            <li key={t.id} style={{ marginBottom: 6 }}>
              {t.training_name} —{' '}
              <select value={t.status} onChange={e => updateTrainingStatus(t.id, e.target.value)}>
                <option value="not-started">Not started</option>
                <option value="in-progress">In progress</option>
                <option value="completed">Completed</option>
              </select>
              {t.status === 'completed' && t.completed_date && ` (completed ${t.completed_date})`}
            </li>
          ))}
        </ul>
        <form onSubmit={addTraining} style={{ display: 'flex', gap: 8 }}>
          <input placeholder="Training name" required value={newTraining.training_name}
            onChange={e => setNewTraining({ ...newTraining, training_name: e.target.value })} />
          <button type="submit">Add training</button>
        </form>
      </section>

      <section style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: 16, marginTop: 20 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 700, color: '#1e40af' }}>Compensation</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Fixed Salary</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#111827' }}>₹{Number(employee?.current_fixed_salary || 0).toLocaleString('en-IN')}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Variable Pay Scheme</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{employee?.variable_pay_scheme || '—'}</div>
            <div style={{ fontSize: 12, color: '#4b5563', marginTop: 2 }}>Rule structure shown (not live earnings)</div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>PF Applicable</div>
            <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 700, background: employee?.pf_applicable ? '#dcfce7' : '#fee2e2', color: employee?.pf_applicable ? '#166534' : '#991b1b', border: `1px solid ${employee?.pf_applicable ? '#bbf7d0' : '#fca5a5'}` }}>{employee?.pf_applicable ? 'Yes' : 'No'}</span>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>ESI Applicable</div>
            <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 700, background: employee?.esi_applicable ? '#dcfce7' : '#fee2e2', color: employee?.esi_applicable ? '#166534' : '#991b1b', border: `1px solid ${employee?.esi_applicable ? '#bbf7d0' : '#fca5a5'}` }}>{employee?.esi_applicable ? 'Yes' : 'No'}</span>
          </div>
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>Edit restricted to owner / payroll-admin (see salary history section above).</div>
      </section>

      <section style={{ background: 'white', padding: 16, borderRadius: 8, marginTop: 20 }}>
        <h2>Salary history</h2>
        <p style={{ color: '#777', fontSize: 14 }}>Payroll split shown below is the breakdown used for gratuity/statutory purposes at the time each entry was recorded.</p>
        <ul>
          {salaryHistory.map(s => (
            <li key={s.id} style={{ marginBottom: 8 }}>
              {s.effective_from}: ₹{s.fixed} fixed + ₹{s.variable} variable — {s.reason}
              <br />
              <span style={{ color: '#777', fontSize: 13 }}>
                Split — Basic+DA: ₹{s.basic_da ?? '—'} · HRA: ₹{s.hra ?? '—'} · Other allowances: ₹{s.other_allowances ?? '—'}
              </span>
            </li>
          ))}
        </ul>
        {canEditSalary ? (
          <form onSubmit={addSalaryChange} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input type="number" placeholder="Fixed" required value={newSalary.fixed}
              onChange={e => setNewSalary({ ...newSalary, fixed: e.target.value })} />
            <input type="number" placeholder="Variable" value={newSalary.variable}
              onChange={e => setNewSalary({ ...newSalary, variable: e.target.value })} />
            <input type="date" required value={newSalary.effective_from}
              onChange={e => setNewSalary({ ...newSalary, effective_from: e.target.value })} />
            <input placeholder="Reason (e.g. annual review)" value={newSalary.reason}
              onChange={e => setNewSalary({ ...newSalary, reason: e.target.value })} />
            <button type="submit">Record change</button>
          </form>
        ) : (
          <p style={{ color: '#777', fontSize: 13, fontStyle: 'italic', marginTop: 4 }}>
            Salary edits restricted to owner / payroll-admin.
          </p>
        )}
      </section>

      <section style={{ background: 'white', padding: 16, borderRadius: 8, marginTop: 20 }}>
        <h2>Track record</h2>
        <ul>
          {trackRecord.map(t => (
            <li key={t.id}><strong>[{t.type}]</strong> {t.date}: {t.text} — {t.author}</li>
          ))}
        </ul>
        <form onSubmit={addTrackEntry} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={newNote.type} onChange={e => setNewNote({ ...newNote, type: e.target.value })}>
            <option value="note">Note</option>
            <option value="warning">Warning</option>
            <option value="merit">Merit</option>
          </select>
          <input placeholder="Details" required value={newNote.text}
            onChange={e => setNewNote({ ...newNote, text: e.target.value })} style={{ flex: 1 }} />
          <input placeholder="Your name" value={newNote.author}
            onChange={e => setNewNote({ ...newNote, author: e.target.value })} />
          <button type="submit">Add entry</button>
        </form>
      </section>

      <section style={{ background: '#fff5f5', border: '1px solid #f5c6cb', padding: 16, borderRadius: 8, marginTop: 20 }}>
        <h2 style={{ color: '#842029' }}>Delete employee</h2>
        <p style={{ color: '#842029' }}>
          This removes {employee.name} from every list, dropdown, and export. Their history isn't destroyed —
          an admin can restore them from the "Deleted" page — but treat this as a real action, not a toggle.
          Admin only; type CONFIRM below to enable the button.
        </p>
        <input placeholder='Type "CONFIRM" to enable deletion' value={deleteConfirmText}
          onChange={e => setDeleteConfirmText(e.target.value)} style={{ padding: 8, marginRight: 8 }} />
        <button onClick={deleteEmployee} disabled={deleteConfirmText !== 'CONFIRM' || deleting}
          style={{ padding: '8px 16px', background: deleteConfirmText === 'CONFIRM' ? '#dc3545' : '#ccc', color: 'white', border: 'none', borderRadius: 4 }}>
          {deleting ? 'Deleting…' : 'Delete this employee'}
        </button>
      </section>
    </div>
  );
}
