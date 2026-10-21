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

  const handleStageChange = async (newStage) => {
    const oldStatus = job.status;
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
            <h2 className="font-serif text-xl mb-4">Maintenance POC</h2>
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
