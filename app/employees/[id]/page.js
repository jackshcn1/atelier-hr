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
  const [newEmployeeId, setNewEmployeeId] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [statusEdit, setStatusEdit] = useState('');
  const [exitDate, setExitDate] = useState('');
  const [exitReason, setExitReason] = useState('');
  const [resignationLetter, setResignationLetter] = useState(null);
  const [uploadingLetter, setUploadingLetter] = useState(false);
  const [exitRecord, setExitRecord] = useState(null);
  const [newAsset, setNewAsset] = useState('');
  const [uniformReturned, setUniformReturned] = useState(false);
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
      setStatusEdit(emp.status || 'active');
      setExitDate(emp.date_of_leaving || '');
      setExitReason(emp.exit_reason || '');
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
    const { data: all } = await supabase.from('employees').select('employee_id, name, status');
    setAllEmployees(all || []);
    const { data: sh } = await supabase.from('salary_history').select('*').eq('employee_id', id).order('effective_from', { ascending: false });
    setSalaryHistory(sh || []);
    const { data: tr } = await supabase.from('track_record').select('*').eq('employee_id', id).order('date', { ascending: false });
    setTrackRecord(tr || []);
    const { data: letter } = await supabase.from('documents').select('*').eq('employee_id', id).eq('doc_type', 'resignation_letter').maybeSingle();
    setResignationLetter(letter);
    const { data: exit } = await supabase.from('exit_records').select('*').eq('employee_id', id).maybeSingle();
    setExitRecord(exit);
    setUniformReturned(exit?.uniform_returned || false);
    const { data: docs } = await supabase.from('documents').select('*').eq('employee_id', id).order('date_added', { ascending: false });
    setDocuments(docs || []);
    if (emp?.department) {
      const { data: templates } = await supabase.from('doc_templates').select('*').eq('department', emp.department);
      setDocTemplates(templates || []);
    }
    const { data: training } = await supabase.from('training_records').select('*').eq('employee_id', id);
    setTrainingRecords(training || []);
    const { data: slips } = await supabase
      .from('payroll_line_items')
      .select('id, payslip_number, payroll_run_id, salary_paid_date, total_pay, net_pay, payment_status, bank_reference_number, payroll_runs(period, period_start, period_end)')
      .eq('employee_id', id)
      .not('payslip_number', 'is', null)
      .order('id', { ascending: false });
    setEmployeePayslips(slips || []);
  }

  useEffect(() => { load(); }, [id]);

  async function addSalaryChange(e) {
    e.preventDefault();
    setError('');
    const { data: settings } = await supabase.from('payroll_settings').select('*').eq('id', 1).single();
    const split = computeSalarySplit(newSalary.fixed, settings);
    const { error } = await supabase.from('salary_history').insert([{ ...newSalary, ...split, employee_id: id }]);
    if (error) { setError(error.message); return; }
    await supabase.from('employees').update({
      current_fixed_salary: newSalary.fixed,
      current_variable_salary: newSalary.variable
    }).eq('employee_id', id);
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
    const update = {
      reporting_manager_id: managerEdit || null,
      status: statusEdit,
      date_of_leaving: statusEdit === 'exited' ? (exitDate || new Date().toISOString().slice(0, 10)) : null,
      exit_reason: statusEdit === 'exited' ? (exitReason || null) : null
    };
    const { error } = await supabase.from('employees').update(update).eq('employee_id', id);
    if (error) { setError(error.message); return; }
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
      standard_hours_per_day: standardHours
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

  async function addAsset(e) {
    e.preventDefault();
    if (!newAsset.trim()) return;
    const currentAssets = exitRecord?.assets_issued || [];
    const updatedAssets = [...currentAssets, { name: newAsset.trim(), returned: false }];
    const { error } = await supabase.from('exit_records').upsert([{ employee_id: id, assets_issued: updatedAssets }]);
    if (error) { setError(error.message); return; }
    setNewAsset('');
    load();
  }

  async function toggleAssetReturned(index) {
    const assets = [...(exitRecord?.assets_issued || [])];
    assets[index] = { ...assets[index], returned: !assets[index].returned };
    const { error } = await supabase.from('exit_records').upsert([{ employee_id: id, assets_issued: assets }]);
    if (error) { setError(error.message); return; }
    load();
  }

  async function saveUniformReturned() {
    const allAssetsReturned = (exitRecord?.assets_issued || []).every(a => a.returned);
    const clearance_status = allAssetsReturned && uniformReturned ? 'cleared' : 'pending';
    const { error } = await supabase.from('exit_records').upsert([{
      employee_id: id, uniform_returned: uniformReturned, clearance_status
    }]);
    if (error) { setError(error.message); return; }
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

  const directReports = allEmployees.filter(e => e.employee_id !== id);

  return (
    <div>
      <a href="/employees">← Back to employees</a>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        {photoUrl && <img src={photoUrl} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8 }} />}
        <div>
          <h1 style={{ margin: 0 }}>{employee.name}</h1>
          <p style={{ margin: 0 }}>{employee.designation} — {employee.department}</p>
        </div>
      </div>
      <p>In service: {tenure} · Status: {employee.status}{employee.exit_reason ? ` (${employee.exit_reason.replace('_', ' ')})` : ''}</p>
      <p><a href={`/employees/${id}/onboarding`}>View / print onboarding acknowledgment document →</a></p>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

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
          <label>ID proof type (e.g. Aadhaar, PAN)<input value={personal.id_proof_type} onChange={e => setPersonal({ ...personal, id_proof_type: e.target.value })} /></label>
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
        <h2>Manager & status</h2>
        <form onSubmit={saveManagerAndStatus} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <label>Reports to
            <select value={managerEdit} onChange={e => setManagerEdit(e.target.value)}>
              <option value="">None (top of hierarchy)</option>
              {directReports.map(m => (
                <option key={m.employee_id} value={m.employee_id}>{m.name}{m.status === 'exited' ? ' (exited)' : ''}</option>
              ))}
            </select>
          </label>
          <label>Status
            <select value={statusEdit} onChange={e => setStatusEdit(e.target.value)}>
              <option value="active">Active</option>
              <option value="on-notice">On notice</option>
              <option value="exited">Exited</option>
            </select>
          </label>
          {statusEdit === 'exited' && (
            <>
              <label>Date of leaving
                <input type="date" value={exitDate} onChange={e => setExitDate(e.target.value)} />
              </label>
              <label>Exit reason
                <select value={exitReason} onChange={e => setExitReason(e.target.value)}>
                  <option value="">Select reason…</option>
                  <option value="resigned">Resigned</option>
                  <option value="absconding">Absconding</option>
                  <option value="terminated_disciplinary">Terminated (disciplinary)</option>
                  <option value="terminated_admin">Terminated (admin)</option>
                </select>
              </label>
            </>
          )}
          <button type="submit">Save</button>
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
        <h2>Payroll info</h2>
        <form onSubmit={savePayrollInfo} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <label>Standard hours/day
            <input type="number" value={standardHours} onChange={e => setStandardHours(e.target.value)} style={{ display: 'block', width: 80 }} />
          </label>
          <button type="submit">Save</button>
          {payrollInfoSaved && <span style={{ color: 'green' }}>Saved.</span>}
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
        <h2>Assets & exit clearance</h2>
        <p style={{ color: '#777', fontSize: 14 }}>Track anything issued to this employee (laptop, keys, etc.) and check them off as returned at exit.</p>
        <ul>
          {(exitRecord?.assets_issued || []).map((a, i) => (
            <li key={i}>
              <label>
                <input type="checkbox" checked={!!a.returned} onChange={() => toggleAssetReturned(i)} /> {a.name} {a.returned ? '(returned)' : ''}
              </label>
            </li>
          ))}
        </ul>
        <form onSubmit={addAsset} style={{ display: 'flex', gap: 8 }}>
          <input placeholder="Asset name (e.g. Laptop)" value={newAsset} onChange={e => setNewAsset(e.target.value)} />
          <button type="submit">Add asset</button>
        </form>
        <label style={{ display: 'block', marginTop: 12 }}>
          <input type="checkbox" checked={uniformReturned} onChange={e => setUniformReturned(e.target.checked)} /> Uniform returned
        </label>
        <button onClick={saveUniformReturned} style={{ marginTop: 8 }}>Save clearance status</button>
        <p style={{ marginTop: 8 }}>Clearance status: <strong>{exitRecord?.clearance_status || 'pending'}</strong></p>
        <p style={{ marginTop: 12 }}>
          <a href={`/employees/${id}/exit-clearance`}>View / print exit clearance document →</a><br />
          <a href={`/employees/${id}/work-certificate`}>View / print work certificate →</a>
        </p>
      </section>

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
