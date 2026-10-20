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
      setJob({ ...job, status: 'Approved' });
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
              <span className="pill-warn">{job.status}</span>
              <p className="text-xs text-[#6b635c]">Raised by: {job.requested_by} on {job.requested_at ? new Date(job.requested_at).toLocaleDateString() : ''}</p>
            </div>
          </div>
          {isAdmin && job.status === 'pending_approval' && (
            <button onClick={handleApprove} className="btn-primary text-sm px-4 py-2">Approve Job</button>
          )}
        </div>

        {/* Status Bar */}
        <div className="panel bg-white border border-[#ebe8e4] rounded-card p-4 mb-6">
          <div className="flex flex-wrap justify-between items-center text-xs font-medium text-[#8b6f4e] gap-2">
            <span>Pending Approval</span>
            <span>→</span>
            <span>Approved</span>
            <span>→</span>
            <span>Assigned</span>
            <span>→</span>
            <span>Awaiting POC</span>
            <span>→</span>
            <span>In Repair</span>
            <span>→</span>
            <span>Awaiting Quote</span>
            <span>→</span>
            <span>Completed</span>
          </div>
        </div>

        {/* All Sections Stacked */}
        <div className="space-y-6">
          {/* Overview */}
          <section className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6">
            <h2 className="font-serif text-xl mb-4">Overview</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div><strong className="text-[#6b635c]">Asset:</strong> {job.asset_serial}</div>
              <div><strong className="text-[#6b635c]">Service Type:</strong> {job.service_type}</div>
              <div><strong className="text-[#6b635c]">Priority:</strong> <span className="pill-bad">{job.priority}</span></div>
              <div><strong className="text-[#6b635c]">Requested By:</strong> {job.requested_by}</div>
              <div><strong className="text-[#6b635c]">Issues:</strong> {job.issues ? (Array.isArray(job.issues) ? job.issues.join(', ') : JSON.stringify(job.issues)) : 'None'}</div>
              <div><strong className="text-[#6b635c]">Comments:</strong> {job.comments}</div>
            </div>
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
              {job.maintenance_audit_logs && job.maintenance_audit_logs.length > 0 ? (
                job.maintenance_audit_logs.map((entry, idx) => (
                  <div key={idx} className="flex gap-2 border-b border-dashed border-[#ebe8e4] py-1">
                    <span className="text-[#8b6f4e] whitespace-nowrap">{new Date(entry.timestamp).toLocaleString()}</span>
                    <span className="text-[#1e1812]">{entry.user_name || 'System'} — {entry.details}</span>
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
