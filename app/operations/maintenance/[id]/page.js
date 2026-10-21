'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '../../../../lib/supabaseClient';

export default function MaintenanceJobDetailPage() {
  const params = useParams();
  const jobId = params?.id || 'MNT-103';

  const [isAdmin] = useState(true);
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const canEdit = job && (job.status !== 'Completed' && job.status !== 'Rejected' && job.status !== 'Approved');
  const isAdminCanEdit = isAdmin && canEdit;
  const isSuperAdmin = true; // Placeholder for actual role check
  const allowEdit = isSuperAdmin && canEdit;
  // Combine DB audit rows (persisted) with synthesized lifecycle milestones only if genuinely missing.
  // All real audit events (created, approved, rejected, stage_changed, overview_updated) are stored by /api/maintenance/audit.
  const auditEntries = (job?.maintenance_audit_logs || []).slice();
  if (job?.requested_at && !auditEntries.some(e => String(e.action || '').toLowerCase() === 'created')) {
    auditEntries.unshift({ timestamp: job.requested_at, user_name: job.requested_by || 'System', action: 'created', details: `Job ${job.id} raised for ${job.asset_serial}` });
  }
  if (job?.status === 'Approved' && !auditEntries.some(e => String(e.action || '').toLowerCase() === 'approved')) {
    auditEntries.push({ timestamp: new Date().toISOString(), user_name: 'Super Admin', action: 'approved', details: 'Maintenance request approved' });
  }
  if (job?.status === 'Rejected' && job?.rejection_reason && !auditEntries.some(e => String(e.action || '').toLowerCase() === 'rejected')) {
    auditEntries.push({ timestamp: new Date().toISOString(), user_name: 'Super Admin', action: 'rejected', details: `Rejected — ${job.rejection_reason}` });
  }
  // Sort by timestamp so audit order is preserved regardless of push/unshift
  auditEntries.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const [rejectionReason, setRejectionReason] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ service_type: '', comments: '', priority: 'normal' });
  const [showCompletedPicker, setShowCompletedPicker] = useState(false);
  const [completedStatus, setCompletedStatus] = useState('Available');
  const [pendingStageChange, setPendingStageChange] = useState(null);

  const SPECIALITY_OPTIONS = [
  'AC Technician', 'Appliance Repair', 'Carpenter', 'Electrician', 'General Contractor', 'Masonry', 'Painter', 'Plumber', 'Other', 'Add New'
];

  const loadPOCs = async (searchTerm = '', specialityFilter = 'All') => {
    setPocLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set('search', searchTerm);
      if (specialityFilter && specialityFilter !== 'All') params.set('speciality', specialityFilter);
      const res = await fetch(`/api/maintenance/pocs?${params.toString()}`);
      const d = await res.json();
      setPocs(d.pocs || []);
    } catch (_) {
      setPocs([]);
    } finally {
      setPocLoading(false);
    }
  };

  const openPocPicker = () => {
    setShowPocPicker(true);
    setPocSearch('');
    setPocSpeciality('All');
    loadPOCs('', 'All');
  };

  const handleAssignPoc = async (poc) => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/maintenance/jobs/${jobId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': session ? `Bearer ${session.access_token}` : ''
        },
        body: JSON.stringify({ assigned_poc_id: poc.id })
      });
      if (!res.ok) throw new Error('Failed to assign POC');
      setShowPocPicker(false);
      const refreshRes = await fetch(`/api/maintenance/jobs/${jobId}`, {
        headers: session ? { 'Authorization': `Bearer ${session.access_token}` } : {}
      });
      const d = await refreshRes.json();
      if (d.job) setJob(d.job);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleAddNewPoc = () => {
    setShowPocForm(true);
    setDuplicatePoc(null);
  };

  const checkPocDup = async () => {
    const c = (pocForm.contact || '').trim();
    if (!c) return false;
    const res = await fetch(`/api/maintenance/pocs?contact=${encodeURIComponent(c)}`);
    const d = await res.json();
    const match = (d.pocs || []).find(p => (p.contact_primary || '').replace(/[\s\-()]/g, '') === c.replace(/[\s\-()]/g, '') || (p.contact_alternate || '').replace(/[\s\-()]/g, '') === c.replace(/[\s\-()]/g, ''));
    return match || null;
  };

  const handleSaveNewPoc = async (e) => {
    e.preventDefault();
    setPocSaving(true);
    setDuplicatePoc(null);
    const dup = await checkPocDup();
    if (dup) {
      setDuplicatePoc(dup);
      setPocSaving(false);
      return;
    }
    try {
      const res = await fetch('/api/maintenance/pocs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: pocForm.name,
          speciality: pocForm.speciality,
          contact_primary: pocForm.contact,
          contact_alternate: pocForm.alternateContact || null,
          reference: pocForm.reference || null,
          notes: pocForm.notes || null,
          star_rating: pocForm.rating,
          attachment_url: null
        })
      });
      const d = await res.json();
      if (d.poc) {
        // Assign the new POC to this job
        await fetch(`/api/maintenance/jobs/${jobId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': '' },
          body: JSON.stringify({ assigned_poc_id: d.poc.id })
        });
        setShowPocPicker(false);
        setShowPocForm(false);
        setPocForm({ name: '', speciality: 'Electrician', contact: '', alternateContact: '', reference: '', notes: '', rating: 5 });
        // Refresh job to reflect assigned POC
        const refreshRes = await fetch(`/api/maintenance/jobs/${jobId}`);
        const refreshD = await refreshRes.json();
        if (refreshD.job) setJob(refreshD.job);
      } else if (d.error === 'duplicate_contact') {
        setDuplicatePoc(d.existing_poc);
      } else {
        alert('Failed to create POC: ' + (d.error || 'Unknown'));
      }
    } catch (_) {
      alert('Error creating POC');
    } finally {
      setPocSaving(false);
    }
  };

  // POC picker
  const [showPocPicker, setShowPocPicker] = useState(false);
  const [pocs, setPocs] = useState([]);
  const [pocSearch, setPocSearch] = useState('');
  const [pocSpeciality, setPocSpeciality] = useState('All');
  const [pocLoading, setPocLoading] = useState(false);
  const [showPocForm, setShowPocForm] = useState(false);
  const [pocForm, setPocForm] = useState({ name: '', speciality: 'Electrician', contact: '', alternateContact: '', reference: '', notes: '', rating: 5 });
  const [duplicatePoc, setDuplicatePoc] = useState(null);
  const [pocSaving, setPocSaving] = useState(false);

  const ASSET_STATUS_OPTIONS = ['Available', 'In-use', 'Employee-assigned', 'Returned', 'Discarded', 'Transferred', 'Sold'];
  const statusColors = {
    'pending_approval': 'pill-warn',
    'Approved': 'pill-good',
    'Assigned': 'pill-quiet',
    'Awaiting POC': 'pill-quiet',
    'In Repair': 'pill-warn',
    'Awaiting Quote': 'pill-warn',
    'Completed': 'pill-good',
    'Rejected': 'pill-bad'
  };
  const priorityColors = {
    'Low': 'pill-good',
    'Normal': 'pill-warn',
    'Urgent': 'pill-bad'
  };
  const statusLabel = (s) => (s === 'pending_approval' ? 'Pending approval' : s);

  const confirmComplete = async () => {
    setShowCompletedPicker(false);
    if (!pendingStageChange) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/maintenance/jobs/${jobId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': session ? `Bearer ${session.access_token}` : ''
        },
        body: JSON.stringify({ status: pendingStageChange, asset_status: completedStatus })
      });
      if (!res.ok) throw new Error('Failed to complete job');
      const d = await res.json();
      if (d.job) setJob(d.job);
      setPendingStageChange(null);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStageChange = async (newStage) => {
    const oldStatus = job.status;
    if (newStage === 'Completed') {
      // Completing a job asks the user which status the asset should carry.
      setPendingStageChange(newStage);
      setShowCompletedPicker(true);
      return;
    }
    setJob(prev => ({ ...prev, status: newStage }));
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/maintenance/jobs/${jobId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': session ? `Bearer ${session.access_token}` : ''
        },
        body: JSON.stringify({ status: newStage })
      });
      if (!res.ok) throw new Error('Failed to update stage');
      try {
        await fetch('/api/maintenance/audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': session ? `Bearer ${session.access_token}` : '' },
          body: JSON.stringify({ job_id: jobId, user_name: 'Super Admin', action: 'stage_changed', details: `Stage changed from ${oldStatus} to ${newStage}` })
        });
      } catch (_) {}
      const refreshRes = await fetch(`/api/maintenance/jobs/${jobId}`, {
        headers: session ? { 'Authorization': `Bearer ${session.access_token}` } : {}
      });
      const d = await refreshRes.json();
      if (d.job) setJob(d.job);
    } catch (err) {
      setJob(prev => ({ ...prev, status: oldStatus }));
      alert(err.message);
    }
  };

  const handleApprove = async () => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/maintenance/jobs/${jobId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ status: 'Approved' })
      });
      if (!res.ok) throw new Error('Failed to approve');
      try {
        await fetch('/api/maintenance/audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({ job_id: jobId, user_name: 'Super Admin', action: 'approved', details: 'Maintenance request approved' })
        });
      } catch (_) {}
      setJob({ ...job, status: 'Approved' });
    } catch (err) {
      alert(err.message);
    }
  };

  const handleUpdateOverview = async () => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/maintenance/jobs/${jobId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': session ? `Bearer ${session.access_token}` : ''
        },
        body: JSON.stringify(editForm)
      });
      if (!res.ok) throw new Error('Failed to update job');
      try {
        await fetch('/api/maintenance/audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': session ? `Bearer ${session.access_token}` : '' },
          body: JSON.stringify({ job_id: jobId, user_name: 'Super Admin', action: 'overview_updated', details: 'Overview details updated' })
        });
      } catch (_) {}
      const refreshRes = await fetch(`/api/maintenance/jobs/${jobId}`, {
        headers: session ? { 'Authorization': `Bearer ${session.access_token}` } : {}
      });
      const d = await refreshRes.json();
      if (d.job) setJob(d.job);
      setIsEditing(false);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleReject = async () => {
    const reason = (rejectionReason || '').trim();
    if (!reason) {
      alert('Please enter a rejection reason.');
      return;
    }
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Authentication required.');

      const res = await fetch(`/api/maintenance/jobs/${jobId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ status: 'Rejected', rejection_reason: reason })
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Failed to reject');

      // Record rejection in the job audit log
      try {
        await fetch('/api/maintenance/audit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            job_id: jobId,
            user_name: 'Super Admin',
            action: 'rejected',
            details: `Maintenance request rejected by Super Admin — ${reason}`,
            comment: reason,
          })
        });
      } catch (_) {}

      setJob({ ...job, status: 'Rejected', rejection_reason: reason });
      setShowRejectDialog(false);
      setRejectionReason('');
    } catch (err) {
      alert(err.message);
    }
  };

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      try {
        const res = await fetch(`/api/maintenance/jobs/${jobId}`, {
          headers: session ? { 'Authorization': `Bearer ${session.access_token}` } : {}
        });
        const d = await res.json().catch(() => ({}));
        if (d.job) {
          setJob(d.job);
          setLoading(false);
          return;
        }
        setError(d.error || `Request failed with status ${res.status}`);

        // Fallback: query Supabase directly from the browser (session-scoped by RLS)
        const { data: direct, error: directErr } = await supabase
          .from('maintenance_jobs')
          .select('*')
          .eq('id', jobId)
          .maybeSingle();
        if (direct) {
          setJob({ ...direct, maintenance_pocs: null, job_quotes: [], maintenance_audit_logs: [] });
        } else if (directErr) {
          setError(`${d.error || 'Request failed'} | Fallback: ${directErr.message}`);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    });
  }, [jobId]);

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading job details...</div>;
  if (!job) return <div className="min-h-screen flex items-center justify-center">Job not found.{error ? ` (${error})` : ''}</div>;


  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-4xl mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/operations/maintenance" className="btn-secondary text-xs px-3 py-1.5">← Maintenance</Link>
        </div>

        <div className="page-head mb-8 flex justify-between items-start">
          <div>
            <h1 className="font-serif text-3xl text-[#1e1812]">Maintenance Job {job.id}</h1>
            <div className="flex items-center gap-4 mt-2">
              <span className={`${statusColors[job.status] || 'pill-quiet'} text-xs px-2 py-0.5 rounded-full`}>{statusLabel(job.status)}</span>
              <p className="text-xs text-[#6b635c]">Raised by: {job.requested_by} on {job.requested_at ? new Date(job.requested_at).toLocaleDateString() : ''}</p>
            </div>
          </div>
          {isAdmin && job.status === 'pending_approval' && (
            <div className="flex gap-2">
              <button onClick={handleApprove} className="btn-primary text-sm px-4 py-2">Approve Job</button>
              <button onClick={() => setShowRejectDialog(true)} className="btn-secondary text-sm px-4 py-2">Reject Job</button>
            </div>
          )}
        </div>

        {/* Rejection Reason Dialog */}
        {showRejectDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-card shadow-2xl max-w-md mx-4 p-6 border border-[#ebe8e4]">
              <h3 className="font-serif text-xl mb-2">Reject Maintenance Request</h3>
              <p className="text-xs text-[#6b635c] mb-4">Job {job.id} for asset {job.asset_serial} will move to <strong>Rejected</strong>. The asset status stays unchanged.</p>
              <label className="block">
                <span className="text-xs font-medium text-[#6b635c] mb-1 block">Rejection Reason</span>
                <textarea
                  rows={4}
                  className="field text-sm w-full"
                  placeholder="Why is this request being rejected?"
                  value={rejectionReason}
                  onChange={e => setRejectionReason(e.target.value)}
                  autoFocus
                />
              </label>
              <div className="flex gap-3 mt-5">
                <button onClick={handleReject} className="btn-primary text-sm px-4 py-2">Confirm Reject</button>
                <button onClick={() => { setShowRejectDialog(false); setRejectionReason(''); }} className="btn-secondary text-sm px-4 py-2">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Completed Status Picker */}
        {showCompletedPicker && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-card shadow-2xl max-w-md mx-4 p-6 border border-[#ebe8e4]">
              <h3 className="font-serif text-xl mb-2">Complete Maintenance Job</h3>
              <p className="text-xs text-[#6b635c] mb-4">
                Job {job.id} for asset {job.asset_serial}. Choose the status the asset should carry once the job is completed.
              </p>
              <label className="block">
                <span className="text-xs font-medium text-[#6b635c] mb-1 block">Asset Status After Completion</span>
                <select
                  className="field text-sm w-full bg-white"
                  value={completedStatus}
                  onChange={e => setCompletedStatus(e.target.value)}
                  autoFocus
                >
                  {ASSET_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <div className="flex gap-3 mt-5">
                <button onClick={confirmComplete} className="btn-primary text-sm px-4 py-2">Complete Job</button>
                <button onClick={() => { setShowCompletedPicker(false); setPendingStageChange(null); }} className="btn-secondary text-sm px-4 py-2">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Audit + Stage */}
        <div className="panel bg-white border border-[#ebe8e4] rounded-card p-4 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs font-medium text-[#8b6f4e]">
              <span>Maintenance Job Progress Stage</span>
            </div>
            {isAdmin && job?.status !== 'Rejected' && job?.status !== 'Completed' && (
              <label className="flex items-center gap-2">
                <span className="text-xs font-medium text-[#6b635c]">Stage:</span>
                <select className={`field text-sm w-48 ${statusColors[job.status] || ''}`} value={job.status} onChange={e => handleStageChange(e.target.value)}>
                  {['pending_approval','Approved','Assigned','Awaiting POC','In Repair','Awaiting Quote','Completed'].map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
                </select>
              </label>
            )}
            {job?.status === 'Completed' && (
              <span className="pill-good text-sm px-4 py-2">Job Locked — Completed</span>
            )}
            {job?.status === 'Rejected' && (
              <span className="pill-bad text-sm px-4 py-2">Job Rejected</span>
            )}
          </div>
        </div>

        {/* POC Picker */}
        {showPocPicker && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-card shadow-2xl max-w-2xl mx-4 p-6 border border-[#ebe8e4] w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-serif text-xl">Assign Maintenance POC</h3>
                <button onClick={() => setShowPocPicker(false)} className="btn-quiet text-xs px-2 py-1">Close</button>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <span className="text-xs font-medium text-[#6b635c]">Speciality:</span>
                {['All', ...SPECIALITY_OPTIONS].map(s => (
                  <button key={s} onClick={() => { setPocSpeciality(s); loadPOCs(pocSearch, s); }} className={`text-xs px-2 py-0.5 rounded-control ${pocSpeciality === s ? 'bg-[#1e1812] text-white' : 'bg-white border border-[#ebe8e4]'}`}>{s}</button>
                ))}
                <input className="field text-xs flex-1 min-w-[140px]" placeholder="Search name / contact" value={pocSearch} onChange={e => { setPocSearch(e.target.value); loadPOCs(e.target.value, pocSpeciality); }} />
              </div>

              {/* List */}
              <div className="space-y-2 max-h-[50vh] overflow-y-auto mb-4">
                {pocLoading ? <div className="text-sm text-[#6b635c]">Loading POCs...</div> : (
                  pocs.length === 0 ? <div className="text-sm text-[#6b635c]">No matching POCs.</div> : pocs.map(p => (
                    <div key={p.id} className="flex items-center justify-between bg-[#f6f4f2] p-3 rounded">
                      <div>
                        <div className="font-medium text-sm">{p.name}</div>
                        <div className="text-xs text-[#6b635c]">{p.speciality} · {p.contact_primary || ''}</div>
                      </div>
                      <button onClick={() => handleAssignPoc(p)} className="btn-primary text-xs px-3 py-1">Select</button>
                    </div>
                  ))
                )}
              </div>

              <div className="flex gap-3 pt-3 border-t border-[#ebe8e4]">
                <button onClick={handleAddNewPoc} className="btn-secondary text-sm px-4 py-2">+ Add New POC</button>
                <button onClick={() => setShowPocPicker(false)} className="btn-quiet text-sm px-4 py-2">Cancel</button>
              </div>

              {/* Add POC Form */}
              {showPocForm && (
                <div className="mt-4 pt-4 border-t border-[#ebe8e4] bg-[#faf8f6] p-4 rounded">
                  <h4 className="font-serif text-lg mb-3">Add New Maintenance POC</h4>
                  <form onSubmit={handleSaveNewPoc} className="space-y-3 text-sm">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input required className="field text-sm" placeholder="POC Name *" value={pocForm.name} onChange={e => setPocForm({...pocForm, name: e.target.value})} />
                      <select className="field text-sm bg-white" value={pocForm.speciality} onChange={e => setPocForm({...pocForm, speciality: e.target.value})}>
                        {SPECIALITY_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <input required className="field text-sm" placeholder="Primary Contact *" value={pocForm.contact} onChange={e => setPocForm({...pocForm, contact: e.target.value})} />
                      <input className="field text-sm" placeholder="Alternate Contact" value={pocForm.alternateContact} onChange={e => setPocForm({...pocForm, alternateContact: e.target.value})} />
                    </div>
                    <input className="field text-sm w-full" placeholder="Reference / Source" value={pocForm.reference} onChange={e => setPocForm({...pocForm, reference: e.target.value})} />
                    <textarea rows={2} className="field text-sm w-full" placeholder="Notes..." value={pocForm.notes} onChange={e => setPocForm({...pocForm, notes: e.target.value})} />

                    {duplicatePoc && (
                      <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs">
                        <div className="font-medium text-amber-800">Contact already exists:</div>
                        <div className="text-amber-900">{duplicatePoc.name} — {duplicatePoc.speciality} — {duplicatePoc.contact_primary || ''}</div>
                        <div className="text-amber-700 mt-1">Is this the POC you are looking for?</div>
                        <div className="flex gap-2 mt-2">
                          <button type="button" onClick={() => { setShowPocPicker(false); handleAssignPoc(duplicatePoc); }} className="btn-primary text-xs px-2 py-1">Yes — use this POC</button>
                          <button type="button" onClick={() => setDuplicatePoc(null)} className="btn-secondary text-xs px-2 py-1">No — try different contact</button>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-3 pt-2">
                      <button type="submit" disabled={pocSaving} className="btn-primary text-sm px-4 py-2">{pocSaving ? 'Saving...' : 'Save POC & Assign'}</button>
                      <button type="button" onClick={() => { setShowPocForm(false); setDuplicatePoc(null); }} className="btn-secondary text-sm px-4 py-2">Cancel</button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
        )}

        {/* All Sections Stacked */}
        <div className="space-y-6">
          {/* Overview */}
          <section className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif text-xl">Overview</h2>
              {allowEdit && (
                <button onClick={() => setIsEditing(!isEditing)} className="btn-secondary text-xs px-3 py-1">{isEditing ? 'Cancel' : 'Edit'}</button>
              )}
              {!allowEdit && (
                <span className="pill-quiet text-xs">Locked — {job.status.toLowerCase()}</span>
              )}
            </div>
            {isEditing ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <label><span className="text-xs font-medium text-[#6b635c] mb-1 block">Service Type</span><select className="field text-sm bg-white" value={editForm.service_type} onChange={e=>setEditForm({...editForm,service_type:e.target.value})}><option>Routine Service</option><option>Faulty or defective repair</option></select></label>
                <label><span className="text-xs font-medium text-[#6b635c] mb-1 block">Priority</span><select className="field text-sm bg-white" value={editForm.priority} onChange={e=>setEditForm({...editForm,priority:e.target.value})}><option>Low</option><option>Normal</option><option>Urgent</option></select></label>
                <label className="md:col-span-2"><span className="text-xs font-medium text-[#6b635c] mb-1 block">Comments</span><textarea rows={3} className="field text-sm w-full" value={editForm.comments} onChange={e=>setEditForm({...editForm,comments:e.target.value})}/></label>
                <div className="md:col-span-2 flex gap-3 pt-2"><button onClick={handleUpdateOverview} className="btn-primary text-xs px-3 py-1">Save</button><button onClick={()=>setIsEditing(false)} className="btn-secondary text-xs px-3 py-1">Cancel</button></div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div><strong className="text-[#6b635c]">Asset:</strong> {job.asset_serial}</div>
                <div><strong className="text-[#6b635c]">Service Type:</strong> {job.service_type}</div>
                <div><strong className="text-[#6b635c]">Priority:</strong> <span className={`${priorityColors[job.priority] || 'pill-quiet'} text-sm`}>{job.priority}</span></div>
                <div><strong className="text-[#6b635c]">Requested By:</strong> {job.requested_by}</div>
                <div><strong className="text-[#6b635c]">Issues:</strong> {job.issues ? (typeof job.issues === 'object' && !Array.isArray(job.issues) ? Object.entries(job.issues).filter(([,_v])=>_v===true).map(([k])=>k).join(', ') || 'None' : (Array.isArray(job.issues) ? job.issues.join(', ') : String(job.issues))) : 'None'}</div>
                <div><strong className="text-[#6b635c]">Comments:</strong> {job.comments}</div>
              </div>
            )}
          </section>

          {/* Maintenance POC */}
          <section className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif text-xl">Maintenance POC</h2>
              <button onClick={openPocPicker} className="btn-secondary text-xs px-3 py-1">+ Assign / Pick POC</button>
            </div>
            <p className="text-sm"><strong>Assigned:</strong> {job.maintenance_pocs?.name || 'Not yet assigned'}</p>
            <p className="text-xs text-[#6b635c] mt-2">Speciality filter available. Add new POC from directory.</p>
          </section>

          {/* Quotes & Estimates */}
          <section className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6">
            <h2 className="font-serif text-xl mb-4">Quotes & Estimates</h2>
            {job.job_quotes && job.job_quotes.length > 0 ? (
              job.job_quotes.map((q, i) => (
                <div key={i} className="text-sm bg-[#f6f4f2] p-3 rounded mb-2">
                  <div className="font-medium">{q.vendor_name} — {q.quote_type}</div>
                  <div className="text-[#6b635c]">Cost: {q.cost} | Delivery: {q.estimated_delivery} | Status: {q.status}</div>
                  {q.is_approved && (
                    <div className="text-xs text-green-600 mt-1">✓ Approved by Super Admin</div>
                  )}
                </div>
              ))
            ) : (
              <p className="text-xs text-gray-400 italic">No quotes submitted yet.</p>
            )}
          </section>

          {/* Completion Report */}
          <section className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6">
            <h2 className="font-serif text-xl mb-4">Completion Report</h2>
            <p className="text-xs text-[#6b635c]">Not completed yet — editable until status reaches Completed.</p>
          </section>

          {/* Audit Log */}
          <section className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6">
            <h2 className="font-serif text-xl mb-4">Audit Log</h2>
            <div className="space-y-2 text-xs">
              {auditEntries.length > 0 ? (
                auditEntries.map((entry, idx) => (
                  <div key={idx} className="flex gap-2 border-b border-dashed border-[#ebe8e4] py-1">
                    <span className="text-[#8b6f4e] whitespace-nowrap">{entry.timestamp ? new Date(entry.timestamp).toLocaleString() : ''}</span>
                    <span className="text-[#1e1812]">{entry.user_name || 'System'} — {entry.details || entry.action}</span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-gray-400 italic">No audit records found.</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
