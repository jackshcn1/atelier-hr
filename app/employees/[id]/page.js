'use client';
import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabaseClient';
import { computeSalarySplit } from '../../../lib/salarySplit';

export default function EmployeeDetail() {
  const { id } = useParams();
  const router = useRouter();
  const supabase = createClient();

  // Active Tab: 'overview' | 'personal' | 'compensation' | 'assets' | 'compliance' | 'notes'
  const [activeTab, setActiveTab] = useState('overview');

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
  const [exitReason, setExitReason] = useState('');
  const [resignationLetter, setResignationLetter] = useState(null);
  const [uploadingLetter, setUploadingLetter] = useState(false);
  const [exitRecord, setExitRecord] = useState(null);

  const [viewerProfile, setViewerProfile] = useState(null);
  const [trainingPending, setTrainingPending] = useState(false);
  const [showStageAdvance, setShowStageAdvance] = useState(false);

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
  const [successMessage, setSuccessMessage] = useState('');

  // Personal details
  const [personal, setPersonal] = useState({
    name: '', phone: '', email: '', dob: '', gender: '', blood_group: '',
    address: '', emergency_contact_name: '', emergency_contact_phone: '',
    id_proof_type: 'Aadhaar', notes: '', previous_work_history: '', education_history: ''
  });
  const [personalSaved, setPersonalSaved] = useState(false);

  // Sensitive info (admin only)
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

  // Photo Crop Modal State (square 1:1 crop enforced before upload)
  const [showCropModal, setShowCropModal] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState(null);
  const [cropImageEl, setCropImageEl] = useState(null);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 }); // px offset from center
  const [cropScale, setCropScale] = useState(1);
  const [cropDragging, setCropDragging] = useState(false);
  const [cropDragStart, setCropDragStart] = useState({ x: 0, y: 0 });
  const [cropOffsetStart, setCropOffsetStart] = useState({ x: 0, y: 0 });
  const cropCanvasRef = useRef(null);

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
        emergency_contact_phone: emp.emergency_contact_phone || '', id_proof_type: emp.id_proof_type || 'Aadhaar',
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
    const { data: et } = await supabase.from('employee_training').select('*').eq('employee_id', id);
    const hasPendingTraining = et && et.some(t => t.status !== 'completed');
    setTrainingPending(!!hasPendingTraining);
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

  // Phase 2: Role-check for salary edit (owner / super_admin / payroll-admin only)
  const canEditSalary = viewerProfile ? (
    viewerProfile.is_super_admin === true ||
    viewerProfile.role === 'owner' ||
    (viewerProfile.permissions && typeof viewerProfile.permissions === 'object' && viewerProfile.permissions.edit_salary === true)
  ) : false;

  useEffect(() => { load(); }, [id]);

  function notify(msg) {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(''), 4000);
  }

  async function addSalaryChange(e) {
    e.preventDefault();
    setError('');
    const { data: settings } = await supabase.from('payroll_settings').select('*').eq('id', 1).single();
    const split = computeSalarySplit(newSalary.fixed, settings);

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
    notify('Salary revision recorded successfully.');
    load();
  }

  async function addTrackEntry(e) {
    e.preventDefault();
    setError('');
    const { error } = await supabase.from('track_record').insert([{ ...newNote, employee_id: id }]);
    if (error) { setError(error.message); return; }
    setNewNote({ type: 'note', text: '', author: '' });
    notify('Track record note added.');
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

    if (statusEdit === 'on-notice' && !resignationLetter) {
        setError('Please upload the resignation letter before moving to "Serving Notice Period" status.');
        setSavingStatus(false);
        return;
    }

    const { error: upErr } = await supabase.from('employees').update(update).eq('employee_id', id);
    setSavingStatus(false);

    if (upErr) {
      setError(`Failed to update status: ${upErr.message}`);
      return;
    }

    setManagerAndStatusSaved(true);
    notify('Reporting manager & employment status updated.');
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
    notify('Job and contract details saved.');
    setTimeout(() => setJobSaved(false), 4000);
    load();
  }

  async function savePersonal(e) {
    e.preventDefault();
    setError(''); setPersonalSaved(false);
    const { error } = await supabase.from('employees').update(personal).eq('employee_id', id);
    if (error) { setError(error.message); return; }
    setPersonalSaved(true);
    notify('Personal details saved.');
    load();
  }

  async function saveSensitive(e) {
    e.preventDefault();
    setError(''); setSensitiveSaved(false);
    const { error } = await supabase.from('employee_sensitive_info').upsert([{ employee_id: id, ...sensitive }]);
    if (error) { setError(error.message + ' (only admins can save this section)'); return; }
    setSensitiveSaved(true);
    notify('Sensitive & bank details securely saved.');
    load();
  }

  async function uploadPassportPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    openCropModal(file);
  }

  async function uploadIdProof(side, e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const setLoading = side === 'front' ? setUploadingIdFront : setUploadingIdBack;
    setLoading(true);
    setError('');
    const path = `id-proofs/${id}-${side}-${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from('documents').upload(path, file);
    if (uploadError) { setError(uploadError.message + ' (only admins can upload this)'); setLoading(false); return; }
    const column = side === 'front' ? 'id_proof_front_url' : 'id_proof_back_url';
    const { error: dbError } = await supabase.from('employee_sensitive_info').upsert([{ employee_id: id, [column]: path }]);
    if (dbError) setError(dbError.message + ' (only admins can upload this)');
    setLoading(false);
    notify(`ID proof (${side}) uploaded.`);
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
    notify('Payroll & Variable Pay preferences updated.');
    load();
  }

  async function renameEmployeeId() {
    const newId = newEmployeeId.trim();
    if (!newId) return;
    setRenaming(true);
    setError('');

    const { data: paidRuns } = await supabase
      .from('payroll_line_items')
      .select('id, payroll_run_id')
      .eq('employee_id', id)
      .limit(1);

    if (paidRuns && paidRuns.length > 0) {
      setRenaming(false);
      setError(
        `${employee.name} has already been through payroll, so their ID can no longer be changed. ` +
        `Renaming would rewrite the ID inside their existing payslips and salary history.`
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
    notify('Resignation letter archived.');
    load();
  }

  // Photo crop helpers — enforce a square 1:1 crop before uploading
  function openCropModal(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      setCropImageSrc(e.target.result);
      setCropScale(1);
      setCropOffset({ x: 0, y: 0 });
      setCropDragging(false);
      setShowCropModal(true);
    };
    reader.readAsDataURL(file);
  }

  function closeCropModal() {
    setShowCropModal(false);
    setCropImageSrc(null);
    setCropImageEl(null);
  }

  function onCropImageLoad(img) {
    setCropImageEl(img);
    setCropScale(1);
    setCropOffset({ x: 0, y: 0 });
  }

  function applyCropAndUpload() {
    if (!cropImageEl) return;
    const canvas = cropCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const OUTPUT_SIZE = 512; // 512x512 high-res square output
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

    const img = cropImageEl;
    const imgAspect = img.naturalWidth / img.naturalHeight;
    const BOX_SIZE = 288; // 288px preview box (w-72)
    const ratio = OUTPUT_SIZE / BOX_SIZE;

    ctx.save();
    // Center of canvas
    ctx.translate(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2);
    // User drag pan offset
    ctx.translate(cropOffset.x * ratio, cropOffset.y * ratio);
    // User zoom
    ctx.scale(cropScale, cropScale);

    let renderW, renderH;
    if (imgAspect >= 1) {
      renderH = BOX_SIZE * ratio;
      renderW = renderH * imgAspect;
    } else {
      renderW = BOX_SIZE * ratio;
      renderH = renderW / imgAspect;
    }

    ctx.drawImage(img, -renderW / 2, -renderH / 2, renderW, renderH);
    ctx.restore();

    canvas.toBlob((blob) => {
      if (!blob) return;
      const croppedFile = new File([blob], `passport-${id}-${Date.now()}.jpg`, { type: 'image/jpeg' });
      uploadPassportPhotoFile(croppedFile);
    }, 'image/jpeg', 0.92);
  }

  async function uploadPassportPhotoFile(file) {
    setUploadingPhoto(true);
    setError('');
    const path = `passport-photos/${id}-${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from('documents').upload(path, file);
    if (uploadError) { setError(uploadError.message + ' (only admins can upload files right now)'); setUploadingPhoto(false); return; }
    await supabase.from('employees').update({ passport_photo_url: path }).eq('employee_id', id);
    setUploadingPhoto(false);
    closeCropModal();
    notify('Passport photo cropped & uploaded successfully.');
    load();
  }

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

      if (Number(assetForm.deposit_amount) > 0) {
        await supabase.from('employee_deposits').insert([{
          employee_id: id,
          deposit_type: assetForm.name.toLowerCase().includes('accommodation') ? 'accommodation' : 'uniform',
          amount: Number(assetForm.deposit_amount)
        }]);
      }

      setAssetForm({ name: '', asset_number: '', units: 1, deposit_amount: 0, date_issued: '', status: 'Issued' });
      setShowAssetForm(false);
      notify('Asset tagged to employee.');
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
    notify(`Asset status updated to ${newStatus}.`);
    load();
  }

  async function removeAsset(assetId) {
    if (!window.confirm('Remove this asset from the employee record?')) return;
    setError('');
    const { error: delErr } = await supabase.from('employee_assets').delete().eq('id', assetId);
    if (delErr) { setError(delErr.message); return; }
    notify('Asset removed.');
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
    notify('Document uploaded to file repository.');
    load();
  }

  async function addTraining(e) {
    e.preventDefault();
    setError('');
    const { error } = await supabase.from('training_records').insert([{ ...newTraining, employee_id: id }]);
    if (error) { setError(error.message); return; }
    setNewTraining({ training_name: '', status: 'not-started', completed_date: '' });
    notify('Training module assigned.');
    load();
  }

  async function updateTrainingStatus(trainingId, status) {
    const completed_date = status === 'completed' ? new Date().toISOString().slice(0, 10) : null;
    await supabase.from('training_records').update({ status, completed_date }).eq('id', trainingId);
    notify('Training status updated.');
    load();
  }

  if (!employee) {
    return (
      <div className="p-12 text-center text-ink-muted">
        <div className="inline-block animate-spin text-2xl mb-3">⏳</div>
        <p className="font-serif text-lg">Loading employee profile…</p>
      </div>
    );
  }

  const tenure = (() => {
    const start = new Date(employee.date_of_joining || employee.created_at);
    const end = employee.date_of_leaving ? new Date(employee.date_of_leaving) : new Date();
    const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    const y = Math.floor(months / 12);
    const m = months % 12;
    if (y === 0) return `${m} mo${m === 1 ? '' : 's'}`;
    return `${y}y ${m}m`;
  })();

  const candidateManagers = allEmployees.filter(e => e.employee_id !== id && e.status !== 'exited');

  const initials = String(employee.name || 'Emp')
    .split(/\s+/)
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const reportingManagerObj = allEmployees.find(m => m.employee_id === employee.reporting_manager_id);
  const totalAssetsDeposit = assets.reduce((sum, a) => sum + Number(a.deposit_amount || 0), 0);

  const TABS = [
    { id: 'overview', label: 'Job & Hierarchy', icon: '💼' },
    { id: 'personal', label: 'Personal & ID', icon: '👤' },
    { id: 'compensation', label: 'Compensation & Slips', icon: '💰', badge: `₹${Number(employee.current_fixed_salary || 0).toLocaleString('en-IN')}` },
    { id: 'assets', label: 'Assets & Facilities', icon: '📦', count: assets.length },
    { id: 'compliance', label: 'Compliance & Training', icon: '📑' },
    { id: 'notes', label: 'Notes & Record', icon: '📝', count: trackRecord.length }
  ];

  return (
    <div className="pb-16 max-w-7xl mx-auto">
      {/* =========================================================================
          INTERACTIVE SCREEN UI (Hidden when printing full dossier)
          ========================================================================= */}
      <div className="print:hidden">
        {/* Top Breadcrumb & Return Nav */}
        <div className="flex items-center justify-between gap-4 mb-4">
          <a href="/employees" className="btn-quiet text-xs font-semibold text-ink-muted hover:text-ink">
            ← Back to Employees Directory
          </a>
          <div className="text-2xs font-mono text-ink-muted">
            Employee Ref: <span className="font-bold text-ink">{id}</span>
          </div>
        </div>

      {/* Global Alerts & Feedback */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded-control text-xs flex items-center justify-between">
          <span>⚠️ {error}</span>
          <button onClick={() => setError('')} className="text-red-600 font-bold ml-2">✕</button>
        </div>
      )}
      {successMessage && (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-control text-xs flex items-center justify-between">
          <span>✓ {successMessage}</span>
          <button onClick={() => setSuccessMessage('')} className="text-emerald-600 font-bold ml-2">✕</button>
        </div>
      )}

      {/* =========================================================================
          EXECUTIVE HERO HEADER CARD
          ========================================================================= */}
      <div className="panel bg-surface shadow-sm mb-6 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">

          {/* Avatar & Core Metadata */}
          <div className="flex items-start gap-5">
            {/* Passport Photo / Initials Monogram */}
            <div className="relative group shrink-0">
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt={employee.name}
                  className="w-20 h-20 object-cover rounded-xl border-2 border-rule shadow-sm bg-surface"
                />
              ) : (
                <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-amber-50 to-orange-100 border-2 border-amber-200/80 flex flex-col items-center justify-center text-amber-900 shadow-sm">
                  <span className="font-serif text-2xl font-bold tracking-tight">{initials}</span>
                  <span className="text-[10px] font-semibold text-amber-700/80 mt-0.5">Staff</span>
                </div>
              )}
              {/* Photo Upload Trigger */}
              <label
                className="absolute -bottom-1.5 -right-1.5 bg-ink text-white rounded-full w-6 h-6 flex items-center justify-center text-xs shadow cursor-pointer hover:bg-accent transition-colors border-2 border-white"
                title="Upload/Update Passport Photo"
              >
                📷
                <input type="file" accept="image/*" onChange={uploadPassportPhoto} disabled={uploadingPhoto} className="hidden" />
              </label>
            </div>

            {/* Name, Roles, Badges */}
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="font-serif text-2xl lg:text-3xl font-semibold text-ink leading-tight">
                  {employee.name}
                </h1>

                {/* Status Pill */}
                <span className={`text-2xs font-semibold px-2.5 py-0.5 rounded-full border ${
                  employee.status === 'active'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : employee.status === 'on-notice'
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-red-50 text-red-800 border-red-200'
                }`}>
                  {employee.status === 'active' ? '● Active Staff' : employee.status === 'on-notice' ? '⏳ On Notice' : '🚪 Exited'}
                </span>

                {/* Onboarding Stage Stepper Pill */}
                {employee?.onboarding_status && (
                  <div className="relative inline-block">
                    <button
                      type="button"
                      onClick={() => { if (canEditSalary) setShowStageAdvance(s => !s); }}
                      className={`text-2xs font-bold px-2.5 py-0.5 rounded-full border transition-all flex items-center gap-1 ${
                        employee.onboarding_status === 'Active'
                          ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                          : employee.onboarding_status === 'Assets Issued'
                          ? 'bg-sky-100 text-sky-900 border-sky-300'
                          : employee.onboarding_status === 'Compensation Set'
                          ? 'bg-indigo-100 text-indigo-900 border-indigo-300'
                          : 'bg-amber-100 text-amber-900 border-amber-300'
                      }`}
                      title={canEditSalary ? 'Click to change onboarding stage' : 'Onboarding stage'}
                    >
                      <span>Stage: {employee.onboarding_status}</span>
                      {canEditSalary && <span className="text-3xs opacity-60">▼</span>}
                    </button>

                    {showStageAdvance && canEditSalary && (
                      <div className="absolute top-7 left-0 bg-surface border border-rule rounded-card p-2 shadow-xl z-30 min-w-[200px] animate-settle">
                        <div className="text-3xs uppercase tracking-wider font-semibold text-ink-muted px-2 py-1">
                          Move Onboarding Stage:
                        </div>
                        {['Draft', 'Documents Pending', 'Compensation Set', 'Assets Issued', 'Active'].map(st => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => {
                              supabase.from('employees').update({ onboarding_status: st }).eq('employee_id', id);
                              setShowStageAdvance(false);
                              notify(`Stage updated to ${st}`);
                              load();
                            }}
                            className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors flex items-center justify-between ${
                              st === employee.onboarding_status ? 'bg-amber-50 font-bold text-amber-900' : 'text-ink hover:bg-page'
                            }`}
                          >
                            <span>{st}</span>
                            {st === employee.onboarding_status && <span className="text-2xs text-amber-600">✓</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Designation & Department */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted mt-1.5 font-medium">
                <span className="text-ink font-semibold">{employee.designation || 'Staff Member'}</span>
                <span>•</span>
                <span className="bg-page px-2 py-0.5 rounded border border-rule-soft">{employee.department || 'Unassigned Department'}</span>
                <span>•</span>
                <span className="font-mono text-ink bg-page px-2 py-0.5 rounded border border-rule-soft">Petpooja ID: {id}</span>
                <span>•</span>
                <span className="capitalize">{employee.employment_type || 'Full-time'}</span>
              </div>

              {/* Quick Contact & Hierarchy */}
              <div className="flex flex-wrap items-center gap-4 text-xs text-ink-muted mt-2.5">
                <span>📅 Joined: <strong className="text-ink">{employee.date_of_joining || '—'}</strong> ({tenure})</span>
                {employee.reporting_manager_id && (
                  <span>👤 Reports to: <strong className="text-ink">{reportingManagerObj?.name || employee.reporting_manager_id}</strong></span>
                )}
                {employee.phone && (
                  <a href={`tel:${employee.phone}`} className="hover:text-ink text-ink-muted">📞 {employee.phone}</a>
                )}
                {employee.email && (
                  <a href={`mailto:${employee.email}`} className="hover:text-ink text-ink-muted">✉️ {employee.email}</a>
                )}
              </div>
            </div>
          </div>

          {/* Quick Actions Bar */}
          <div className="flex flex-wrap lg:flex-col items-end gap-2 shrink-0 border-t lg:border-t-0 pt-4 lg:pt-0 border-rule-soft">
            <a
              href={`/employees/${id}/onboarding`}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary text-xs"
            >
              📄 Onboarding Doc →
            </a>
            <a
              href={`/employees/${id}/appraisal`}
              className="btn-secondary text-xs"
            >
              ⭐ Appraisals →
            </a>
            <a
              href={`/exit-clearance?id=${id}`}
              className="btn-secondary text-xs text-amber-800 bg-amber-50 border-amber-200 hover:bg-amber-100"
            >
              🚪 Exit Clearance →
            </a>
            <button
              type="button"
              onClick={() => window.print()}
              className="btn-quiet text-xs"
            >
              🖨️ Print Profile
            </button>
          </div>
        </div>

        {/* Non-Blocking Training Pending Notice */}
        {trainingPending && (
          <div className="mt-4 p-3 bg-amber-50/80 border border-amber-200 rounded-control text-xs text-amber-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">🎓</span>
              <span>
                <strong>Training Modules Pending:</strong> Assigned department checklist items require manager verification.
              </span>
            </div>
            <button
              onClick={() => setActiveTab('compliance')}
              className="text-2xs font-bold text-amber-800 underline hover:text-amber-950"
            >
              View Checklists →
            </button>
          </div>
        )}
      </div>

      {/* =========================================================================
          SEGMENTED TAB NAVIGATION
          ========================================================================= */}
      <div className="flex items-center gap-1.5 border-b border-rule mb-6 overflow-x-auto pb-px scrollbar-none">
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-all border-b-2 whitespace-nowrap ${
                isActive
                  ? 'border-ink text-ink bg-surface shadow-xs'
                  : 'border-transparent text-ink-muted hover:text-ink hover:bg-page'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className={`px-1.5 py-0.2 rounded-full text-3xs font-bold ${
                  isActive ? 'bg-ink text-white' : 'bg-page text-ink-muted border border-rule-soft'
                }`}>
                  {tab.count}
                </span>
              )}
              {tab.badge && (
                <span className="text-3xs font-mono font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* =========================================================================
          TAB 1: JOB & HIERARCHY (OVERVIEW)
          ========================================================================= */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-settle">
          {/* Position & Role Configuration */}
          <div className="panel panel-body bg-surface">
            <div className="flex justify-between items-center mb-4">
              <h2 className="panel-title text-base font-bold text-ink">💼 Position & Job Configuration</h2>
              <a href="/settings/departments-designations" className="text-2xs text-accent font-semibold hover:underline">
                Manage Departments →
              </a>
            </div>

            <form onSubmit={saveJobDetails} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="field-label">Department</label>
                  <select
                    value={jobDetails.department}
                    onChange={e => setJobDetails({ ...jobDetails, department: e.target.value })}
                    className="field"
                  >
                    <option value="">Unassigned</option>
                    {departments.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="field-label">Designation / Role</label>
                  <input
                    list="desig-options"
                    value={jobDetails.designation}
                    onChange={e => setJobDetails({ ...jobDetails, designation: e.target.value })}
                    placeholder="Select or type designation"
                    className="field"
                  />
                  <datalist id="desig-options">
                    {designations.map(d => (
                      <option key={d.id} value={d.name}>{d.department ? `(${d.department})` : ''}</option>
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="field-label">Employment Type</label>
                  <select
                    value={jobDetails.employment_type}
                    onChange={e => setJobDetails({ ...jobDetails, employment_type: e.target.value })}
                    className="field"
                  >
                    <option value="full-time">Full-time</option>
                    <option value="probation">Probation</option>
                    <option value="contract">Contract</option>
                    <option value="part-time">Part-time</option>
                  </select>
                </div>

                <div>
                  <label className="field-label">Date of Joining</label>
                  <input
                    type="date"
                    value={jobDetails.date_of_joining}
                    onChange={e => setJobDetails({ ...jobDetails, date_of_joining: e.target.value })}
                    className="field"
                  />
                </div>

                <div>
                  <label className="field-label">Probation End Date</label>
                  <input
                    type="date"
                    value={jobDetails.probation_end_date}
                    onChange={e => setJobDetails({ ...jobDetails, probation_end_date: e.target.value })}
                    className="field"
                  />
                </div>

                <div>
                  <label className="field-label">Daily Standard Shift Hours</label>
                  <input
                    type="number"
                    value={standardHours}
                    onChange={e => setStandardHours(e.target.value)}
                    className="field"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-rule-soft">
                <button type="submit" disabled={savingJob} className="btn-primary text-xs">
                  {savingJob ? 'Saving…' : 'Save Position Details'}
                </button>
                {jobSaved && <span className="text-xs text-emerald-600 font-semibold">✓ Position updated!</span>}
              </div>
            </form>
          </div>

          {/* Reporting Manager & Status */}
          <div className="space-y-6">
            <div className="panel panel-body bg-surface">
              <h2 className="panel-title text-base font-bold text-ink mb-4">👤 Reporting Structure & Lifecycle</h2>

              <form onSubmit={saveManagerAndStatus} className="space-y-4">
                <div>
                  <label className="field-label">Direct Reporting Manager</label>
                  <select
                    value={managerEdit}
                    onChange={e => setManagerEdit(e.target.value)}
                    className="field"
                  >
                    <option value="">None (Top of hierarchy / Direct Admin)</option>
                    {candidateManagers.map(m => (
                      <option key={m.employee_id} value={m.employee_id}>
                        {m.name} ({m.designation || 'Staff'}{m.department ? ` • ${m.department}` : ''})
                      </option>
                    ))}
                  </select>
                  <p className="text-3xs text-ink-muted mt-1">
                    Training checklists and accountability tasks for this employee will be assigned to this manager.
                  </p>
                </div>

                <div>
                  <label className="field-label">Employment Status</label>
                  <select
                    value={statusEdit}
                    onChange={e => setStatusEdit(e.target.value)}
                    className="field"
                  >
                    <option value="active">Active Staff</option>
                    <option value="on-notice">Serving Notice Period</option>
                    <option value="exited">Exited Staff</option>
                  </select>
                </div>

                {['on-notice', 'exited'].includes(statusEdit) && (
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-control space-y-3">
                    {statusEdit === 'exited' && (
                      <>
                        <div>
                          <label className="field-label text-amber-900">Official Date of Leaving</label>
                          <input
                            type="date"
                            value={exitDate}
                            onChange={e => setExitDate(e.target.value)}
                            className="field bg-white"
                          />
                        </div>
                        <div>
                          <label className="field-label text-amber-900">Exit Reason Code</label>
                          <select
                            value={exitReason}
                            onChange={e => setExitReason(e.target.value)}
                            className="field bg-white"
                          >
                            <option value="">Select reason code…</option>
                            <option value="resigned">Voluntary Resignation</option>
                            <option value="absconding">Absconding</option>
                            <option value="terminated_disciplinary">Terminated (Disciplinary)</option>
                            <option value="terminated_admin">Terminated (Administrative)</option>
                          </select>
                        </div>
                      </>
                    )}

                    <div className="pt-2 border-t border-amber-200/80">
                      <label className="field-label text-amber-900">Resignation Letter Upload</label>
                      {resignationLetter ? (
                        <p className="text-xs text-emerald-800 font-semibold mb-2">
                          ✓ Resignation letter on file (archived {resignationLetter.date_added})
                        </p>
                      ) : (
                        <input
                          type="file"
                          onChange={uploadResignationLetter}
                          disabled={uploadingLetter}
                          className="field bg-white text-xs py-1"
                        />
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-rule-soft">
                  <button type="submit" disabled={savingStatus} className="btn-primary text-xs">
                    {savingStatus ? 'Saving…' : 'Save Status & Manager'}
                  </button>
                  {managerAndStatusSaved && <span className="text-xs text-emerald-600 font-semibold">✓ Status updated!</span>}
                </div>
              </form>
            </div>

            {/* Petpooja System ID Code Management */}
            <div className="panel panel-body bg-surface">
              <h2 className="panel-title text-base font-bold text-ink mb-1">🔗 Petpooja POS Code Alignment</h2>
              <p className="text-xs text-ink-muted mb-3">
                Attendance and biometric logs match against this code. Current code: <strong className="font-mono text-ink">{id}</strong>.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="New Petpooja code"
                  value={newEmployeeId}
                  onChange={e => setNewEmployeeId(e.target.value)}
                  className="field text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={renameEmployeeId}
                  disabled={!newEmployeeId.trim() || renaming}
                  className="btn-secondary text-xs shrink-0"
                >
                  {renaming ? 'Updating…' : 'Update Code'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: PERSONAL & SENSITIVE IDENTITY
          ========================================================================= */}
      {activeTab === 'personal' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-settle">
          {/* General Personal Details */}
          <div className="panel panel-body bg-surface">
            <h2 className="panel-title text-base font-bold text-ink mb-4">👤 Personal Information & Contact</h2>

            <form onSubmit={savePersonal} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="field-label">Full Legal Name</label>
                  <input
                    type="text"
                    value={personal.name}
                    onChange={e => setPersonal({ ...personal, name: e.target.value })}
                    className="field"
                  />
                </div>
                <div>
                  <label className="field-label">Primary Phone</label>
                  <input
                    type="tel"
                    value={personal.phone}
                    onChange={e => setPersonal({ ...personal, phone: e.target.value })}
                    className="field"
                  />
                </div>
                <div>
                  <label className="field-label">Email Address</label>
                  <input
                    type="email"
                    value={personal.email}
                    onChange={e => setPersonal({ ...personal, email: e.target.value })}
                    className="field"
                  />
                </div>
                <div>
                  <label className="field-label">Date of Birth</label>
                  <input
                    type="date"
                    value={personal.dob}
                    onChange={e => setPersonal({ ...personal, dob: e.target.value })}
                    className="field"
                  />
                </div>
                <div>
                  <label className="field-label">Gender</label>
                  <select
                    value={personal.gender}
                    onChange={e => setPersonal({ ...personal, gender: e.target.value })}
                    className="field"
                  >
                    <option value="">Select gender…</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </div>
                <div>
                  <label className="field-label">Blood Group</label>
                  <input
                    type="text"
                    placeholder="e.g. O+, B+, A+"
                    value={personal.blood_group}
                    onChange={e => setPersonal({ ...personal, blood_group: e.target.value })}
                    className="field"
                  />
                </div>
              </div>

              {/* Emergency Contact */}
              <div className="p-3.5 bg-red-50/50 border border-red-200/80 rounded-control">
                <div className="text-2xs font-bold uppercase tracking-wider text-red-900 mb-2 flex items-center gap-1.5">
                  <span>🚨 Emergency Contact Details</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="field-label text-red-950">Contact Person Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Spouse / Parent"
                      value={personal.emergency_contact_name}
                      onChange={e => setPersonal({ ...personal, emergency_contact_name: e.target.value })}
                      className="field bg-white"
                    />
                  </div>
                  <div>
                    <label className="field-label text-red-950">Emergency Contact Phone</label>
                    <input
                      type="tel"
                      placeholder="e.g. 9876543210"
                      value={personal.emergency_contact_phone}
                      onChange={e => setPersonal({ ...personal, emergency_contact_phone: e.target.value })}
                      className="field bg-white"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="field-label">Residential Address</label>
                <textarea
                  rows={2}
                  value={personal.address}
                  onChange={e => setPersonal({ ...personal, address: e.target.value })}
                  placeholder="Permanent and local residential address"
                  className="field"
                />
              </div>

              <div>
                <label className="field-label">Previous Work Experience</label>
                <textarea
                  rows={2}
                  value={personal.previous_work_history}
                  onChange={e => setPersonal({ ...personal, previous_work_history: e.target.value })}
                  placeholder="Prior restaurants, hotels, or roles"
                  className="field"
                />
              </div>

              <div>
                <label className="field-label">Education & Qualifications</label>
                <textarea
                  rows={2}
                  value={personal.education_history}
                  onChange={e => setPersonal({ ...personal, education_history: e.target.value })}
                  placeholder="Schooling, diplomas, culinary certifications"
                  className="field"
                />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-rule-soft">
                <button type="submit" className="btn-primary text-xs">
                  Save Personal Details
                </button>
                {personalSaved && <span className="text-xs text-emerald-600 font-semibold">✓ Saved!</span>}
              </div>
            </form>
          </div>

          {/* Sensitive Documents & Bank Details (Admin Only) */}
          <div className="space-y-6">
            <div className="panel panel-body bg-surface">
              <div className="flex items-center justify-between mb-4">
                <h2 className="panel-title text-base font-bold text-ink">🛡️ Identification & Government Proofs</h2>
                <span className="text-3xs uppercase tracking-wider font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded">
                  Admin Confidential
                </span>
              </div>

              <form onSubmit={saveSensitive} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="field-label">ID Proof Document Type</label>
                    <select
                      value={personal.id_proof_type || 'Aadhaar'}
                      onChange={e => setPersonal({ ...personal, id_proof_type: e.target.value })}
                      className="field"
                    >
                      <option value="Aadhaar">Aadhaar Card</option>
                      <option value="PAN">PAN Card</option>
                      <option value="Passport">Passport</option>
                      <option value="Driving License">Driving License</option>
                      <option value="Voter ID">Voter ID</option>
                    </select>
                  </div>

                  <div>
                    <label className="field-label">ID Document Number</label>
                    <input
                      type="text"
                      placeholder="e.g. 12-digit Aadhaar / 10-char PAN"
                      value={sensitive.id_proof_number}
                      onChange={e => setSensitive({ ...sensitive, id_proof_number: e.target.value })}
                      className="field font-mono"
                    />
                  </div>

                  <div>
                    <label className="field-label">PF Number (if registered)</label>
                    <input
                      type="text"
                      value={sensitive.pf_number}
                      onChange={e => setSensitive({ ...sensitive, pf_number: e.target.value })}
                      placeholder="e.g. KR/KCH/..."
                      className="field font-mono"
                    />
                  </div>

                  <div>
                    <label className="field-label">ESI Number (if registered)</label>
                    <input
                      type="text"
                      value={sensitive.esi_number}
                      onChange={e => setSensitive({ ...sensitive, esi_number: e.target.value })}
                      placeholder="e.g. 48000..."
                      className="field font-mono"
                    />
                  </div>
                </div>

                {/* ID Scan File Uploads */}
                <div className="p-3.5 bg-page border border-rule-soft rounded-control space-y-3">
                  <div className="text-2xs font-bold uppercase tracking-wider text-ink-muted">
                    ID Document File Scans
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="field-label">Front Scan</label>
                      <input
                        type="file"
                        onChange={e => uploadIdProof('front', e)}
                        disabled={uploadingIdFront}
                        className="field text-xs py-1 bg-surface"
                      />
                      {idFrontUrl && (
                        <a href={idFrontUrl} target="_blank" rel="noreferrer" className="text-2xs text-accent font-semibold mt-1 inline-block">
                          👁️ View Front Scan →
                        </a>
                      )}
                    </div>
                    <div>
                      <label className="field-label">Back Scan</label>
                      <input
                        type="file"
                        onChange={e => uploadIdProof('back', e)}
                        disabled={uploadingIdBack}
                        className="field text-xs py-1 bg-surface"
                      />
                      {idBackUrl && (
                        <a href={idBackUrl} target="_blank" rel="noreferrer" className="text-2xs text-accent font-semibold mt-1 inline-block">
                          👁️ View Back Scan →
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-rule-soft">
                  <h3 className="text-xs font-bold text-ink mb-3 uppercase tracking-wider">🏦 Bank Account & Payout Details</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="field-label">Beneficiary Account Name</label>
                      <input
                        type="text"
                        placeholder="As per bank passbook"
                        value={sensitive.bank_account_holder_name}
                        onChange={e => setSensitive({ ...sensitive, bank_account_holder_name: e.target.value })}
                        className="field"
                      />
                    </div>
                    <div>
                      <label className="field-label">Bank Name</label>
                      <input
                        type="text"
                        placeholder="e.g. HDFC, Federal Bank, SBI"
                        value={sensitive.bank_name}
                        onChange={e => setSensitive({ ...sensitive, bank_name: e.target.value })}
                        className="field"
                      />
                    </div>
                    <div>
                      <label className="field-label">Bank Account Number</label>
                      <input
                        type="text"
                        placeholder="Account digits"
                        value={sensitive.bank_account_number}
                        onChange={e => setSensitive({ ...sensitive, bank_account_number: e.target.value })}
                        className="field font-mono"
                      />
                    </div>
                    <div>
                      <label className="field-label">Bank IFSC Code</label>
                      <input
                        type="text"
                        placeholder="e.g. FDRL0001234"
                        value={sensitive.bank_ifsc_code}
                        onChange={e => setSensitive({ ...sensitive, bank_ifsc_code: e.target.value.toUpperCase() })}
                        className="field font-mono uppercase"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-rule-soft">
                  <button type="submit" className="btn-primary text-xs">
                    Save Sensitive & Bank Details
                  </button>
                  {sensitiveSaved && <span className="text-xs text-emerald-600 font-semibold">✓ Securely saved!</span>}
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 3: COMPENSATION & PAYROLL (PAYSLIPS & AUDIT)
          ========================================================================= */}
      {activeTab === 'compensation' && (
        <div className="space-y-6 animate-settle">
          {/* Executive Compensation Scorecard */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="panel panel-body bg-surface">
              <div className="text-2xs font-bold uppercase tracking-wider text-ink-muted mb-1">Fixed Monthly Salary</div>
              <div className="font-serif text-2.5xl font-bold text-ink">
                ₹{Number(employee.current_fixed_salary || 0).toLocaleString('en-IN')}
              </div>
              <div className="text-2xs text-ink-muted mt-1">Gross fixed CTC per month</div>
            </div>

            <div className="panel panel-body bg-surface">
              <div className="text-2xs font-bold uppercase tracking-wider text-ink-muted mb-1">Variable Pay Target</div>
              <div className="font-serif text-2.5xl font-bold text-accent">
                ₹{Number(employee.current_variable_salary || 0).toLocaleString('en-IN')}
              </div>
              <div className="text-2xs text-ink-muted mt-1">Monthly incentive pool at 100%</div>
            </div>

            <div className="panel panel-body bg-surface">
              <div className="text-2xs font-bold uppercase tracking-wider text-ink-muted mb-1">Incentive Scheme</div>
              <div className="text-sm font-bold text-ink truncate mt-1">
                {employee.variable_pay_scheme || 'Manual % / Standard'}
              </div>
              <div className="text-2xs text-ink-muted mt-1">Performance weighting formula</div>
            </div>

            <div className="panel panel-body bg-surface">
              <div className="text-2xs font-bold uppercase tracking-wider text-ink-muted mb-1">Statutory Coverage</div>
              <div className="flex items-center gap-2 mt-1.5">
                <span className={`text-2xs font-bold px-2 py-0.5 rounded border ${
                  employee.pf_applicable ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-page text-ink-muted border-rule'
                }`}>
                  PF: {employee.pf_applicable ? 'Applicable' : 'No'}
                </span>
                <span className={`text-2xs font-bold px-2 py-0.5 rounded border ${
                  employee.esi_applicable ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-page text-ink-muted border-rule'
                }`}>
                  ESI: {employee.esi_applicable ? 'Applicable' : 'No'}
                </span>
              </div>
              <div className="text-2xs text-ink-muted mt-1.5">Kerala statutory split rules apply</div>
            </div>
          </div>

          {/* Salary History & Revision Audit Trail */}
          <div className="panel panel-body bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="panel-title text-base font-bold text-ink">📜 Salary Revision History & Audit Trail</h2>
                <p className="text-xs text-ink-muted mt-0.5">
                  Immutable audit records used for statutory gratuity and payroll calculations. Direct in-place overwrites are forbidden.
                </p>
              </div>
              {!canEditSalary && (
                <span className="text-2xs text-ink-muted bg-page px-2.5 py-1 rounded border border-rule-soft">
                  🔒 Salary revisions restricted to Super Admin / Payroll Admin
                </span>
              )}
            </div>

            {salaryHistory.length === 0 ? (
              <p className="text-xs text-ink-muted italic py-3">No historical salary revisions logged.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-rule bg-page/50">
                      <th className="table-head">Effective Date</th>
                      <th className="table-head">Fixed Salary</th>
                      <th className="table-head">Variable Pool</th>
                      <th className="table-head">Statutory Split (Basic+DA · HRA · Other)</th>
                      <th className="table-head">Reason / Occasion</th>
                      <th className="table-head">Recorded By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule-soft">
                    {salaryHistory.map(s => (
                      <tr key={s.id} className="hover:bg-page/40">
                        <td className="py-2.5 px-3 font-semibold text-ink">{s.effective_from}</td>
                        <td className="py-2.5 px-3 font-bold text-ink">₹{Number(s.fixed || 0).toLocaleString('en-IN')}</td>
                        <td className="py-2.5 px-3 text-accent font-semibold">₹{Number(s.variable || 0).toLocaleString('en-IN')}</td>
                        <td className="py-2.5 px-3 text-ink-muted font-mono text-3xs">
                          Basic: ₹{s.basic_da ?? '—'} · HRA: ₹{s.hra ?? '—'} · Other: ₹{s.other_allowances ?? '—'}
                        </td>
                        <td className="py-2.5 px-3 text-ink-muted">{s.reason || 'Annual review / adjustment'}</td>
                        <td className="py-2.5 px-3 text-2xs text-ink-muted font-mono">{s.changed_by || 'system'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Record New Salary Revision Form (Guarded) */}
            {canEditSalary && (
              <div className="mt-6 pt-5 border-t border-rule-soft bg-page/40 -mx-6 -mb-6 p-6 rounded-b-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink mb-3">
                  + Record Salary Revision
                </h3>
                <form onSubmit={addSalaryChange} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
                  <div>
                    <label className="field-label">New Fixed (₹/mo) *</label>
                    <input
                      type="number"
                      required
                      placeholder="e.g. 20000"
                      value={newSalary.fixed}
                      onChange={e => setNewSalary({ ...newSalary, fixed: e.target.value })}
                      className="field bg-surface text-xs"
                    />
                  </div>
                  <div>
                    <label className="field-label">New Variable (₹/mo)</label>
                    <input
                      type="number"
                      placeholder="e.g. 2500"
                      value={newSalary.variable}
                      onChange={e => setNewSalary({ ...newSalary, variable: e.target.value })}
                      className="field bg-surface text-xs"
                    />
                  </div>
                  <div>
                    <label className="field-label">Effective From Date *</label>
                    <input
                      type="date"
                      required
                      value={newSalary.effective_from}
                      onChange={e => setNewSalary({ ...newSalary, effective_from: e.target.value })}
                      className="field bg-surface text-xs"
                    />
                  </div>
                  <div>
                    <label className="field-label">Revision Reason</label>
                    <input
                      type="text"
                      placeholder="e.g. Annual Appraisal, Promotion"
                      value={newSalary.reason}
                      onChange={e => setNewSalary({ ...newSalary, reason: e.target.value })}
                      className="field bg-surface text-xs"
                    />
                  </div>
                  <button type="submit" className="btn-primary text-xs w-full justify-center">
                    Record Change
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Historical Payslips Directory */}
          <div className="panel panel-body bg-surface">
            <h2 className="panel-title text-base font-bold text-ink mb-1">💳 Payslip History & Disbursals</h2>
            <p className="text-xs text-ink-muted mb-4">
              Historical payslips generated through the monthly payroll engine.
            </p>

            {employeePayslips.length === 0 ? (
              <p className="text-xs text-ink-muted italic py-3">No payslips on record yet for this employee.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-rule bg-page/50">
                      <th className="table-head">Slip Number</th>
                      <th className="table-head">Cycle Period</th>
                      <th className="table-head">Payment Date</th>
                      <th className="table-head">Net Pay</th>
                      <th className="table-head">Bank UTR / Ref</th>
                      <th className="table-head">Status</th>
                      <th className="table-head text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule-soft">
                    {employeePayslips.map(ps => {
                      const run = ps.payroll_runs;
                      const periodText = run?.period_start && run?.period_end ? `${run.period_start} to ${run.period_end}` : run?.period || '—';
                      const isPaid = ps.payment_status === 'processed';
                      return (
                        <tr key={ps.id} className="hover:bg-page/40">
                          <td className="py-2.5 px-3 font-mono font-bold text-accent">{ps.payslip_number}</td>
                          <td className="py-2.5 px-3 font-medium text-ink">{periodText}</td>
                          <td className="py-2.5 px-3 text-ink-muted">{ps.salary_paid_date || '—'}</td>
                          <td className="py-2.5 px-3 font-bold text-emerald-800">
                            ₹{Number(ps.total_pay || ps.net_pay || 0).toLocaleString('en-IN')}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-2xs text-ink-muted">{ps.bank_reference_number || '—'}</td>
                          <td className="py-2.5 px-3">
                            <span className={`text-3xs font-bold px-2 py-0.5 rounded-full border ${
                              isPaid ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'
                            }`}>
                              {isPaid ? '✓ Processed' : '⏳ Pending'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <a
                              href={`/payslips/${encodeURIComponent(ps.payslip_number || ps.id)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-semibold text-accent hover:underline"
                            >
                              View PDF →
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 4: ASSETS & FACILITIES
          ========================================================================= */}
      {activeTab === 'assets' && (
        <div className="space-y-6 animate-settle">
          {/* Summary Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="panel panel-body bg-surface">
              <div className="text-2xs font-bold uppercase tracking-wider text-ink-muted mb-1">Total Assets Tagged</div>
              <div className="font-serif text-2.5xl font-bold text-ink">{assets.length} items</div>
              <div className="text-2xs text-ink-muted mt-1">Uniforms, facilities, and tools issued</div>
            </div>
            <div className="panel panel-body bg-surface">
              <div className="text-2xs font-bold uppercase tracking-wider text-ink-muted mb-1">Total Deposit Held on File</div>
              <div className="font-serif text-2.5xl font-bold text-emerald-800">
                ₹{totalAssetsDeposit.toLocaleString('en-IN')}
              </div>
              <div className="text-2xs text-ink-muted mt-1">Refundable upon exit clearance handover</div>
            </div>
          </div>

          {/* Assets Table */}
          <div className="panel panel-body bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="panel-title text-base font-bold text-ink">📦 Assets & Equipment Inventory</h2>
                <p className="text-xs text-ink-muted mt-0.5">
                  Items issued at onboarding or during employment. Status changes carry over to exit deposit settlement.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAssetForm(s => !s)}
                className="btn-primary text-xs"
              >
                {showAssetForm ? '✕ Close Form' : '+ Issue New Asset'}
              </button>
            </div>

            {/* Collapsible Add Asset Form */}
            {showAssetForm && (
              <form onSubmit={saveAsset} className="mb-6 p-4 bg-page border border-rule rounded-control space-y-3">
                <div className="text-xs font-bold text-ink uppercase tracking-wider">
                  Issue New Asset to {employee.name}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                  <div className="lg:col-span-2">
                    <label className="field-label">Asset Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Uniform, POS Tablet, Knife Kit"
                      value={assetForm.name}
                      onChange={e => setAssetForm({ ...assetForm, name: e.target.value })}
                      className="field bg-surface text-xs"
                    />
                  </div>
                  <div>
                    <label className="field-label">Tag / Serial / Room #</label>
                    <input
                      type="text"
                      placeholder="e.g. Size L, Tab #4"
                      value={assetForm.asset_number}
                      onChange={e => setAssetForm({ ...assetForm, asset_number: e.target.value })}
                      className="field bg-surface text-xs"
                    />
                  </div>
                  <div>
                    <label className="field-label">Quantity / Units</label>
                    <input
                      type="number"
                      min="1"
                      value={assetForm.units}
                      onChange={e => setAssetForm({ ...assetForm, units: e.target.value })}
                      className="field bg-surface text-xs"
                    />
                  </div>
                  <div>
                    <label className="field-label">Deposit Amount (₹)</label>
                    <input
                      type="number"
                      value={assetForm.deposit_amount}
                      onChange={e => setAssetForm({ ...assetForm, deposit_amount: e.target.value })}
                      className="field bg-surface text-xs"
                    />
                  </div>
                  <div>
                    <label className="field-label">Date Issued</label>
                    <input
                      type="date"
                      value={assetForm.date_issued}
                      onChange={e => setAssetForm({ ...assetForm, date_issued: e.target.value })}
                      className="field bg-surface text-xs"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t border-rule-soft">
                  <button type="button" onClick={() => setShowAssetForm(false)} className="btn-secondary text-xs">
                    Cancel
                  </button>
                  <button type="submit" disabled={savingAsset} className="btn-primary text-xs">
                    {savingAsset ? 'Saving…' : 'Issue Asset'}
                  </button>
                </div>
              </form>
            )}

            {assets.length === 0 ? (
              <p className="text-xs text-ink-muted italic py-3">No assets currently tagged to this employee.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-rule bg-page/50">
                      <th className="table-head">Asset Item</th>
                      <th className="table-head">Tag / Serial / Spec</th>
                      <th className="table-head">Units</th>
                      <th className="table-head">Deposit (₹)</th>
                      <th className="table-head">Date Issued</th>
                      <th className="table-head">Current Status</th>
                      <th className="table-head text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule-soft">
                    {assets.map(a => {
                      const st = a.status || (a.returned ? 'Returned' : 'Issued');
                      return (
                        <tr key={a.id} className="hover:bg-page/40">
                          <td className="py-2.5 px-3 font-semibold text-ink">{a.name}</td>
                          <td className="py-2.5 px-3 text-ink-muted font-mono">{a.asset_number || '—'}</td>
                          <td className="py-2.5 px-3 font-medium text-ink">{a.units ?? 1}</td>
                          <td className="py-2.5 px-3 font-semibold text-emerald-800">
                            {Number(a.deposit_amount) > 0 ? `₹${Number(a.deposit_amount).toLocaleString('en-IN')}` : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-ink-muted">{a.date_issued || a.date_handed_over || '—'}</td>
                          <td className="py-2.5 px-3">
                            <select
                              value={st}
                              onChange={e => updateAssetStatus(a.id, e.target.value)}
                              className={`text-2xs font-bold px-2 py-1 rounded-control border cursor-pointer ${
                                st === 'Issued'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : st === 'Returned'
                                  ? 'bg-sky-50 text-sky-800 border-sky-300'
                                  : st === 'Lost'
                                  ? 'bg-red-50 text-red-800 border-red-300'
                                  : 'bg-amber-50 text-amber-800 border-amber-300'
                              }`}
                            >
                              <option value="Issued">✓ Issued</option>
                              <option value="Returned">↩ Returned</option>
                              <option value="Lost">⚠ Lost</option>
                              <option value="Damaged">⚡ Damaged</option>
                            </select>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {employee.status !== 'exited' && (
                              <button
                                type="button"
                                onClick={() => removeAsset(a.id)}
                                className="text-red-600 hover:text-red-800 text-xs font-bold px-1.5"
                                title="Remove asset"
                              >
                                ✕
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 5: COMPLIANCE, DOCUMENTS & TRAINING
          ========================================================================= */}
      {activeTab === 'compliance' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-settle">
          {/* Training Checklist Check-off */}
          <div className="panel panel-body bg-surface">
            <h2 className="panel-title text-base font-bold text-ink mb-1">🎓 Training Checklists & Accountability</h2>
            <p className="text-xs text-ink-muted mb-4">
              Department training modules to be checked off by the reporting manager.
            </p>

            {trainingRecords.length === 0 ? (
              <p className="text-xs text-ink-muted italic py-2">No training modules currently assigned.</p>
            ) : (
              <div className="space-y-2 mb-5">
                {trainingRecords.map(t => (
                  <div key={t.id} className="p-3 bg-page border border-rule-soft rounded-control flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-ink">{t.training_name || `Module #${t.checklist_id || t.id}`}</div>
                      {t.status === 'completed' && t.completed_date && (
                        <div className="text-3xs text-emerald-700 mt-0.5">Completed {t.completed_date}</div>
                      )}
                    </div>
                    <select
                      value={t.status}
                      onChange={e => updateTrainingStatus(t.id, e.target.value)}
                      className="field text-xs py-1 w-32 bg-surface"
                    >
                      <option value="not-started">Not started</option>
                      <option value="in-progress">In progress</option>
                      <option value="completed">✓ Completed</option>
                    </select>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={addTraining} className="pt-3 border-t border-rule-soft flex gap-2">
              <input
                type="text"
                required
                placeholder="Assign new training module…"
                value={newTraining.training_name}
                onChange={e => setNewTraining({ ...newTraining, training_name: e.target.value })}
                className="field text-xs"
              />
              <button type="submit" className="btn-secondary text-xs shrink-0">
                + Assign
              </button>
            </form>
          </div>

          {/* Documents Repository */}
          <div className="panel panel-body bg-surface">
            <h2 className="panel-title text-base font-bold text-ink mb-1">📁 Document Repository & Compliance</h2>
            <p className="text-xs text-ink-muted mb-4">
              Signed policies, certificates, and compliance paperwork on file.
            </p>

            {/* Department missing checklist */}
            {docTemplates.length > 0 && (() => {
              const submittedTypes = new Set(documents.map(d => d.doc_type));
              const missing = docTemplates.filter(t => t.required && !submittedTypes.has(t.doc_name));
              return missing.length > 0 ? (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-control text-xs text-amber-900">
                  <strong>Missing required paperwork for {employee.department}:</strong> {missing.map(m => m.doc_name).join(', ')}
                </div>
              ) : (
                <div className="mb-4 p-2.5 bg-emerald-50 border border-emerald-200 rounded-control text-2xs text-emerald-800 font-semibold">
                  ✓ All required departmental compliance documents on file.
                </div>
              );
            })()}

            {documents.length === 0 ? (
              <p className="text-xs text-ink-muted italic py-2">No documents uploaded to this file.</p>
            ) : (
              <div className="space-y-2 mb-5">
                {documents.map(d => (
                  <div key={d.id} className="p-2.5 bg-page border border-rule-soft rounded-control flex items-center justify-between text-xs">
                    <div>
                      <span className="font-semibold text-ink">{d.doc_type}</span>
                      <span className="text-3xs text-ink-muted ml-2">(added {d.date_added})</span>
                    </div>
                    <span className="text-3xs font-bold uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                      {d.status || 'On File'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Upload Document Form */}
            <form onSubmit={uploadDocument} className="pt-3 border-t border-rule-soft space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <input
                    list="doc-type-options"
                    placeholder="Document Type (e.g. CV, ID)"
                    value={newDocType}
                    onChange={e => setNewDocType(e.target.value)}
                    className="field text-xs"
                  />
                  <datalist id="doc-type-options">
                    {docTemplates.map(t => <option key={t.id} value={t.doc_name} />)}
                  </datalist>
                </div>
                <div>
                  <input
                    type="file"
                    name="docFile"
                    className="field text-xs py-1"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button type="submit" disabled={uploadingDoc} className="btn-primary text-xs">
                  {uploadingDoc ? 'Uploading…' : 'Upload Document'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 6: NOTES & RECORD (ADMIN DANGER ZONE)
          ========================================================================= */}
      {activeTab === 'notes' && (
        <div className="space-y-6 animate-settle">
          {/* Track Record & Notes */}
          <div className="panel panel-body bg-surface">
            <h2 className="panel-title text-base font-bold text-ink mb-1">📝 Performance & Track Record</h2>
            <p className="text-xs text-ink-muted mb-4">
              Permanent internal log of notes, warnings, and exceptional performance merits.
            </p>

            {trackRecord.length === 0 ? (
              <p className="text-xs text-ink-muted italic py-3">No track record entries logged.</p>
            ) : (
              <div className="space-y-2.5 mb-6">
                {trackRecord.map(t => (
                  <div key={t.id} className="p-3.5 bg-page border border-rule-soft rounded-control">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className={`text-3xs font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                        t.type === 'warning'
                          ? 'bg-red-100 text-red-800'
                          : t.type === 'merit'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-indigo-100 text-indigo-800'
                      }`}>
                        {t.type === 'warning' ? '⚠️ Warning' : t.type === 'merit' ? '⭐ Merit' : '📌 Note'}
                      </span>
                      <span className="text-3xs text-ink-muted">{t.date} · Author: {t.author || 'Admin'}</span>
                    </div>
                    <p className="text-xs text-ink mt-1.5 whitespace-pre-wrap">{t.text}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Add Note / Merit Form */}
            <form onSubmit={addTrackEntry} className="pt-4 border-t border-rule-soft grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <div>
                <label className="field-label">Entry Type</label>
                <select
                  value={newNote.type}
                  onChange={e => setNewNote({ ...newNote, type: e.target.value })}
                  className="field text-xs"
                >
                  <option value="note">📌 Note</option>
                  <option value="warning">⚠️ Warning</option>
                  <option value="merit">⭐ Merit / Commendation</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="field-label">Details / Description *</label>
                <input
                  type="text"
                  required
                  placeholder="Record description…"
                  value={newNote.text}
                  onChange={e => setNewNote({ ...newNote, text: e.target.value })}
                  className="field text-xs"
                />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Your Name"
                  value={newNote.author}
                  onChange={e => setNewNote({ ...newNote, author: e.target.value })}
                  className="field text-xs"
                />
                <button type="submit" className="btn-primary text-xs shrink-0">
                  + Add
                </button>
              </div>
            </form>
          </div>

          {/* Danger Zone: Delete Employee */}
          <div className="panel panel-body bg-red-50/50 border border-red-200">
            <h2 className="panel-title text-base font-bold text-red-900 mb-1">🚨 Administrative Danger Zone</h2>
            <p className="text-xs text-red-800/80 mb-4 max-w-2xl">
              Soft-deleting removes {employee.name} from all active directories, shifts, and exports. Historical payslips and audit trails are preserved.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                placeholder='Type "CONFIRM" to delete'
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                className="field bg-white text-xs max-w-xs border-red-300 font-mono"
              />
              <button
                type="button"
                onClick={deleteEmployee}
                disabled={deleteConfirmText !== 'CONFIRM' || deleting}
                className="btn-danger text-xs"
              >
                {deleting ? 'Deleting…' : 'Delete Employee Record'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div> {/* End print:hidden interactive UI */}

      {/* =========================================================================
          SQUARE 1:1 PHOTO CROPPER MODAL (Enforces 1:1 aspect ratio, pan & zoom)
          ========================================================================= */}
      {showCropModal && (
        <div className="fixed inset-0 bg-ink/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-settle">
          <div className="bg-surface border border-rule rounded-card max-w-md w-full shadow-2xl p-6 text-center">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-rule-soft">
              <h3 className="font-serif text-lg font-bold text-ink">Crop Passport Photo</h3>
              <button
                type="button"
                onClick={closeCropModal}
                className="text-ink-muted hover:text-ink text-sm p-1 rounded hover:bg-page"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-ink-muted mb-4">
              Drag to reposition or use zoom to fit inside the square avatar frame.
            </p>

            {/* Square Viewport Frame */}
            <div className="flex justify-center mb-4">
              <div
                className="w-72 h-72 rounded-2xl bg-page border-2 border-accent overflow-hidden relative shadow-inner cursor-grab active:cursor-grabbing select-none"
                onMouseDown={(e) => {
                  setCropDragging(true);
                  setCropDragStart({ x: e.clientX, y: e.clientY });
                  setCropOffsetStart({ ...cropOffset });
                }}
                onMouseMove={(e) => {
                  if (cropDragging) {
                    setCropOffset({
                      x: cropOffsetStart.x + (e.clientX - cropDragStart.x),
                      y: cropOffsetStart.y + (e.clientY - cropDragStart.y)
                    });
                  }
                }}
                onMouseUp={() => setCropDragging(false)}
                onMouseLeave={() => setCropDragging(false)}
                onTouchStart={(e) => {
                  if (e.touches[0]) {
                    setCropDragging(true);
                    setCropDragStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
                    setCropOffsetStart({ ...cropOffset });
                  }
                }}
                onTouchMove={(e) => {
                  if (cropDragging && e.touches[0]) {
                    setCropOffset({
                      x: cropOffsetStart.x + (e.touches[0].clientX - cropDragStart.x),
                      y: cropOffsetStart.y + (e.touches[0].clientY - cropDragStart.y)
                    });
                  }
                }}
                onTouchEnd={() => setCropDragging(false)}
              >
                {cropImageSrc && (
                  <img
                    src={cropImageSrc}
                    alt="Crop preview"
                    draggable={false}
                    onLoad={(e) => onCropImageLoad(e.currentTarget)}
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      width: cropImageEl && (cropImageEl.naturalWidth / cropImageEl.naturalHeight >= 1) ? 'auto' : '100%',
                      height: cropImageEl && (cropImageEl.naturalWidth / cropImageEl.naturalHeight >= 1) ? '100%' : 'auto',
                      transform: `translate(-50%, -50%) translate(${cropOffset.x}px, ${cropOffset.y}px) scale(${cropScale})`,
                      transformOrigin: 'center center',
                      maxWidth: 'none',
                      maxHeight: 'none',
                      userSelect: 'none',
                      pointerEvents: 'none'
                    }}
                  />
                )}
                {/* Visual Square Grid Overlay */}
                <div className="absolute inset-0 pointer-events-none border border-white/40 rounded-2xl grid grid-cols-3 grid-rows-3">
                  <div className="border-r border-b border-white/20"></div>
                  <div className="border-r border-b border-white/20"></div>
                  <div className="border-b border-white/20"></div>
                  <div className="border-r border-b border-white/20"></div>
                  <div className="border-r border-b border-white/20"></div>
                  <div className="border-b border-white/20"></div>
                  <div className="border-r border-white/20"></div>
                  <div className="border-r border-white/20"></div>
                  <div></div>
                </div>
              </div>
            </div>

            {/* Zoom Slider Control */}
            <div className="flex items-center justify-between gap-3 px-2 mb-6">
              <span className="text-2xs font-semibold text-ink-muted">🔍 Zoom:</span>
              <input
                type="range"
                min="0.6"
                max="3"
                step="0.05"
                value={cropScale}
                onChange={(e) => setCropScale(parseFloat(e.target.value))}
                className="flex-1 accent-accent cursor-pointer h-1.5 bg-rule rounded-lg"
              />
              <span className="text-2xs font-mono font-bold text-ink w-8 text-right">
                {cropScale.toFixed(1)}x
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2.5 pt-3 border-t border-rule-soft">
              <button
                type="button"
                onClick={closeCropModal}
                disabled={uploadingPhoto}
                className="btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyCropAndUpload}
                disabled={uploadingPhoto}
                className="btn-primary text-xs flex items-center gap-1.5"
              >
                {uploadingPhoto ? 'Uploading…' : '✓ Crop & Save Photo'}
              </button>
            </div>
          </div>

          {/* Hidden Offscreen Canvas for Pixel Output */}
          <canvas ref={cropCanvasRef} className="hidden" />
        </div>
      )}

      {/* =========================================================================
          PRINT-ONLY COMPREHENSIVE DOSSIER (Collates details from ALL pages/tabs)
          ========================================================================= */}
      <div className="hidden print:block font-sans text-xs text-gray-900 leading-relaxed max-w-4xl mx-auto">
        {/* Document Header */}
        <div className="border-b-2 border-gray-900 pb-3 mb-5 flex justify-between items-end">
          <div>
            <div className="text-3xs uppercase tracking-widest font-bold text-gray-500">
              Atelier Hospitality HRMS · Official Personnel Dossier
            </div>
            <h1 className="font-serif text-2xl font-bold text-gray-900 mt-0.5">
              Employee Master Record — {employee.name}
            </h1>
          </div>
          <div className="text-right text-3xs text-gray-500 font-mono">
            <div>Employee ID: {id}</div>
            <div>Printed: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
          </div>
        </div>

        {/* Core Profile Snapshot */}
        <div className="border border-gray-300 rounded p-3 mb-4 bg-gray-50/60">
          <div className="flex gap-4 items-start">
            {photoUrl ? (
              <img src={photoUrl} alt="" className="w-16 h-16 object-cover rounded border border-gray-300" />
            ) : (
              <div className="w-16 h-16 rounded bg-gray-200 flex items-center justify-center font-bold text-lg text-gray-600 border border-gray-300">
                {initials}
              </div>
            )}
            <div className="flex-1 grid grid-cols-3 gap-x-4 gap-y-2">
              <div>
                <div className="text-3xs uppercase text-gray-500 font-bold">Full Legal Name</div>
                <div className="font-bold text-sm text-gray-900">{employee.name}</div>
              </div>
              <div>
                <div className="text-3xs uppercase text-gray-500 font-bold">Designation / Role</div>
                <div className="font-semibold text-gray-900">{employee.designation || 'Staff'}</div>
              </div>
              <div>
                <div className="text-3xs uppercase text-gray-500 font-bold">Department</div>
                <div className="font-semibold text-gray-900">{employee.department || 'Unassigned'}</div>
              </div>
              <div>
                <div className="text-3xs uppercase text-gray-500 font-bold">Status & Onboarding Stage</div>
                <div className="font-semibold capitalize text-gray-900">
                  {employee.status || 'Active'} · Stage: {employee.onboarding_status || 'Active'}
                </div>
              </div>
              <div>
                <div className="text-3xs uppercase text-gray-500 font-bold">Date of Joining</div>
                <div className="font-semibold text-gray-900">{employee.date_of_joining || '—'} ({tenure})</div>
              </div>
              <div>
                <div className="text-3xs uppercase text-gray-500 font-bold">Reporting Manager</div>
                <div className="font-semibold text-gray-900">{reportingManagerObj?.name || employee.reporting_manager_id || 'Direct Admin'}</div>
              </div>
              <div>
                <div className="text-3xs uppercase text-gray-500 font-bold">Primary Contact Phone</div>
                <div className="font-mono text-gray-900">{employee.phone || '—'}</div>
              </div>
              <div>
                <div className="text-3xs uppercase text-gray-500 font-bold">Email Address</div>
                <div className="text-gray-900">{employee.email || '—'}</div>
              </div>
              <div>
                <div className="text-3xs uppercase text-gray-500 font-bold">Contract & Daily Hours</div>
                <div className="capitalize text-gray-900">{employee.employment_type || 'Full-time'} · {standardHours} hrs/day</div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 1: Personal, Demographic & Emergency Details */}
        <div className="mb-4">
          <div className="text-xs uppercase font-bold tracking-wider text-gray-900 border-b border-gray-400 pb-1 mb-2">
            1. Personal Demographics & Emergency Contacts
          </div>
          <div className="grid grid-cols-3 gap-x-4 gap-y-2 text-xs border border-gray-200 rounded p-3">
            <div>
              <span className="text-gray-500 text-3xs uppercase block font-bold">Date of Birth</span>
              <span className="font-medium text-gray-900">{personal.dob || '—'}</span>
            </div>
            <div>
              <span className="text-gray-500 text-3xs uppercase block font-bold">Gender</span>
              <span className="font-medium text-gray-900">{personal.gender || '—'}</span>
            </div>
            <div>
              <span className="text-gray-500 text-3xs uppercase block font-bold">Blood Group</span>
              <span className="font-medium text-gray-900">{personal.blood_group || '—'}</span>
            </div>
            <div className="col-span-3">
              <span className="text-gray-500 text-3xs uppercase block font-bold">Residential Address</span>
              <span className="font-medium text-gray-900">{personal.address || '—'}</span>
            </div>
            <div className="col-span-3 bg-red-50 border border-red-200 rounded p-2 grid grid-cols-2 gap-2">
              <div>
                <span className="text-red-900 text-3xs uppercase block font-bold">Emergency Contact Person</span>
                <span className="font-bold text-red-950">{personal.emergency_contact_name || '—'}</span>
              </div>
              <div>
                <span className="text-red-900 text-3xs uppercase block font-bold">Emergency Phone</span>
                <span className="font-bold text-red-950 font-mono">{personal.emergency_contact_phone || '—'}</span>
              </div>
            </div>
            {personal.previous_work_history && (
              <div className="col-span-3">
                <span className="text-gray-500 text-3xs uppercase block font-bold">Prior Experience</span>
                <span className="text-gray-800">{personal.previous_work_history}</span>
              </div>
            )}
            {personal.education_history && (
              <div className="col-span-3">
                <span className="text-gray-500 text-3xs uppercase block font-bold">Education & Qualifications</span>
                <span className="text-gray-800">{personal.education_history}</span>
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Statutory ID & Bank Details */}
        <div className="mb-4">
          <div className="text-xs uppercase font-bold tracking-wider text-gray-900 border-b border-gray-400 pb-1 mb-2">
            2. Government ID Proofs & Bank Payout Account
          </div>
          <div className="grid grid-cols-3 gap-x-4 gap-y-2 text-xs border border-gray-200 rounded p-3">
            <div>
              <span className="text-gray-500 text-3xs uppercase block font-bold">ID Proof Document</span>
              <span className="font-medium text-gray-900">{personal.id_proof_type || 'Aadhaar Card'}</span>
            </div>
            <div>
              <span className="text-gray-500 text-3xs uppercase block font-bold">ID Document Number</span>
              <span className="font-mono font-medium text-gray-900">{sensitive.id_proof_number || '—'}</span>
            </div>
            <div>
              <span className="text-gray-500 text-3xs uppercase block font-bold">PF / ESI Coverage</span>
              <span className="font-medium text-gray-900">
                PF: {employee.pf_applicable ? (sensitive.pf_number || 'Applicable') : 'No'} · ESI: {employee.esi_applicable ? (sensitive.esi_number || 'Applicable') : 'No'}
              </span>
            </div>
            <div>
              <span className="text-gray-500 text-3xs uppercase block font-bold">Bank Beneficiary Name</span>
              <span className="font-medium text-gray-900">{sensitive.bank_account_holder_name || employee.name}</span>
            </div>
            <div>
              <span className="text-gray-500 text-3xs uppercase block font-bold">Bank Name & IFSC</span>
              <span className="font-medium text-gray-900">{sensitive.bank_name || '—'} · {sensitive.bank_ifsc_code || '—'}</span>
            </div>
            <div>
              <span className="text-gray-500 text-3xs uppercase block font-bold">Bank Account Number</span>
              <span className="font-mono font-bold text-gray-900">{sensitive.bank_account_number || '—'}</span>
            </div>
          </div>
        </div>

        {/* Section 3: Compensation & Historical Salary Split */}
        <div className="mb-4">
          <div className="text-xs uppercase font-bold tracking-wider text-gray-900 border-b border-gray-400 pb-1 mb-2">
            3. Compensation Structure & Historical Salary Revisions
          </div>
          <div className="grid grid-cols-3 gap-4 p-3 bg-gray-50 border border-gray-200 rounded mb-2 text-xs">
            <div>
              <div className="text-3xs uppercase text-gray-500 font-bold">Current Fixed CTC</div>
              <div className="text-base font-bold text-gray-900">₹{Number(employee.current_fixed_salary || 0).toLocaleString('en-IN')} / mo</div>
            </div>
            <div>
              <div className="text-3xs uppercase text-gray-500 font-bold">Variable Pay Pool Target</div>
              <div className="text-base font-bold text-gray-900">₹{Number(employee.current_variable_salary || 0).toLocaleString('en-IN')} / mo</div>
            </div>
            <div>
              <div className="text-3xs uppercase text-gray-500 font-bold">Assigned Incentive Scheme</div>
              <div className="font-semibold text-gray-900">{employee.variable_pay_scheme || 'Standard / Manual %'}</div>
            </div>
          </div>

          {salaryHistory.length > 0 && (
            <table className="w-full text-2xs border border-gray-200 text-left">
              <thead className="bg-gray-100 font-bold text-gray-700 border-b border-gray-300">
                <tr>
                  <th className="p-1.5">Effective Date</th>
                  <th className="p-1.5">Fixed</th>
                  <th className="p-1.5">Variable</th>
                  <th className="p-1.5">Statutory Split (Basic · HRA · Other)</th>
                  <th className="p-1.5">Reason</th>
                  <th className="p-1.5">Recorded By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {salaryHistory.map(s => (
                  <tr key={s.id}>
                    <td className="p-1.5 font-semibold">{s.effective_from}</td>
                    <td className="p-1.5 font-bold">₹{Number(s.fixed || 0).toLocaleString('en-IN')}</td>
                    <td className="p-1.5">₹{Number(s.variable || 0).toLocaleString('en-IN')}</td>
                    <td className="p-1.5 font-mono text-3xs">Basic: ₹{s.basic_da ?? '—'} · HRA: ₹{s.hra ?? '—'} · Other: ₹{s.other_allowances ?? '—'}</td>
                    <td className="p-1.5 text-gray-600">{s.reason || '—'}</td>
                    <td className="p-1.5 text-gray-500 text-3xs font-mono">{s.changed_by || 'system'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Section 4: Assets & Facilities Issued */}
        <div className="mb-4">
          <div className="text-xs uppercase font-bold tracking-wider text-gray-900 border-b border-gray-400 pb-1 mb-2">
            4. Assets & Equipment Inventory ({assets.length} items · ₹{totalAssetsDeposit.toLocaleString('en-IN')} deposit held)
          </div>
          {assets.length === 0 ? (
            <p className="text-2xs text-gray-500 italic p-2 border border-gray-200 rounded">No assets tagged to this employee.</p>
          ) : (
            <table className="w-full text-2xs border border-gray-200 text-left">
              <thead className="bg-gray-100 font-bold text-gray-700 border-b border-gray-300">
                <tr>
                  <th className="p-1.5">Asset Name</th>
                  <th className="p-1.5">Tag / Spec / Room #</th>
                  <th className="p-1.5">Units</th>
                  <th className="p-1.5">Deposit Amount</th>
                  <th className="p-1.5">Date Issued</th>
                  <th className="p-1.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {assets.map(a => (
                  <tr key={a.id}>
                    <td className="p-1.5 font-semibold">{a.name}</td>
                    <td className="p-1.5 font-mono">{a.asset_number || '—'}</td>
                    <td className="p-1.5">{a.units ?? 1}</td>
                    <td className="p-1.5 font-semibold">{Number(a.deposit_amount) > 0 ? `₹${Number(a.deposit_amount).toLocaleString('en-IN')}` : '—'}</td>
                    <td className="p-1.5">{a.date_issued || a.date_handed_over || '—'}</td>
                    <td className="p-1.5 font-bold">{a.status || (a.returned ? 'Returned' : 'Issued')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Section 5: Compliance, Training & Documents on File */}
        <div className="mb-4">
          <div className="text-xs uppercase font-bold tracking-wider text-gray-900 border-b border-gray-400 pb-1 mb-2">
            5. Compliance, Training Checklists & Documents on File
          </div>
          <div className="grid grid-cols-2 gap-3 text-2xs">
            <div className="border border-gray-200 rounded p-2">
              <div className="font-bold text-gray-700 uppercase mb-1 text-3xs">Training Checklists</div>
              {trainingRecords.length === 0 ? (
                <div className="text-gray-500 italic">None assigned</div>
              ) : (
                <ul className="space-y-1">
                  {trainingRecords.map(t => (
                    <li key={t.id} className="flex justify-between">
                      <span>{t.training_name || `Module #${t.id}`}</span>
                      <span className="font-bold uppercase text-3xs">{t.status} {t.completed_date ? `(${t.completed_date})` : ''}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border border-gray-200 rounded p-2">
              <div className="font-bold text-gray-700 uppercase mb-1 text-3xs">Documents on File</div>
              {documents.length === 0 ? (
                <div className="text-gray-500 italic">No files on file</div>
              ) : (
                <ul className="space-y-1">
                  {documents.map(d => (
                    <li key={d.id} className="flex justify-between">
                      <span>{d.doc_type}</span>
                      <span className="text-gray-500 text-3xs font-mono">{d.date_added} · {d.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Section 6: Performance Record (if any) */}
        {trackRecord.length > 0 && (
          <div className="mb-4">
            <div className="text-xs uppercase font-bold tracking-wider text-gray-900 border-b border-gray-400 pb-1 mb-2">
              6. Performance Record & Track Log
            </div>
            <div className="space-y-1 text-2xs border border-gray-200 rounded p-2.5">
              {trackRecord.map(t => (
                <div key={t.id} className="flex gap-2">
                  <span className="font-bold font-mono text-3xs uppercase text-gray-600">[{t.type}] {t.date}:</span>
                  <span className="text-gray-800">{t.text}</span>
                  <span className="text-gray-400 text-3xs">({t.author || 'Admin'})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Signatures & Verification */}
        <div className="mt-8 pt-6 border-t border-gray-400 grid grid-cols-2 gap-12 text-center text-xs">
          <div>
            <div className="border-b border-gray-400 pb-8 mb-2"></div>
            <div className="font-bold text-gray-900">{employee.name}</div>
            <div className="text-3xs text-gray-500 uppercase font-semibold">Employee Signature & Date</div>
          </div>
          <div>
            <div className="border-b border-gray-400 pb-8 mb-2"></div>
            <div className="font-bold text-gray-900">Atelier Hospitality Operations / HR</div>
            <div className="text-3xs text-gray-500 uppercase font-semibold">Authorized Signatory & Date</div>
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
            font-size: 12px !important;
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
