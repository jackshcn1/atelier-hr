'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '../../../lib/supabaseClient';

export default function MaintenancePage() {
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
  const statusLabel = (s) => (s === 'pending_approval' ? 'Pending approval' : s);

  const [jobs, setJobs] = useState([]);
  const [isAdmin] = useState(true);
  const [sortBy, setSortBy] = useState('date');
  const [requestFilter, setRequestFilter] = useState('All');
  const [serviceFilter, setServiceFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [completionFilter, setCompletionFilter] = useState('All');
  const [dateRange, setDateRange] = useState('All');
  const [customDays, setCustomDays] = useState(7);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      fetch('/api/maintenance/jobs', {
        headers: session ? { 'Authorization': `Bearer ${session.access_token}` } : {}
      })
        .then(r => r.json())
        .then(d => { if (d.jobs) setJobs(d.jobs); })
        .catch(err => console.error('Fetch jobs error:', err));
    });
  }, []);

  const handleApprove = (jobId) => {
    // Implement API call for approval
    console.log('Approve', jobId);
  };

  const now = new Date();
  const filterByDateRange = (j) => {
    if (dateRange === 'All') return true;
    const d = new Date(j.requested_at || now);
    const diffMs = now - d;
    const diffDays = diffMs / (1000*60*60*24);
    if (dateRange === '3 days') return diffDays <= 3;
    if (dateRange === '1 week') return diffDays <= 7;
    if (dateRange === '1 month') return diffDays <= 30;
    if (dateRange === '60 days') return diffDays <= 60;
    if (dateRange === 'custom') return diffDays <= customDays;
    return true;
  };
  const filteredJobs = jobs
    .filter(j => {
      if (!filterByDateRange(j)) return false;
      if (serviceFilter !== 'All' && j.service_type !== serviceFilter) return false;
      if (statusFilter !== 'All' && j.status !== statusFilter) return false;
      if (completionFilter !== 'All') {
        const hasCompletion = !!j.completion_type && j.completion_type.trim() !== '';
        if (completionFilter === 'Completed' && !hasCompletion) return false;
        if (completionFilter === 'Pending' && hasCompletion) return false;
      }
      return true;
    })
    .sort((a, b) => {
        if (sortBy === 'date') return new Date(b.requested_at || 0) - new Date(a.requested_at || 0);
        return 0;
    });

  const pendingCount = jobs.filter(j => j.status === 'Pending approval').length;

  const pendingApprovalJobs = jobs.filter(j => j.status === 'pending_approval');

  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-6xl mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="btn-secondary text-xs px-3 py-1.5">← Home</Link>
          <span className="text-[#8b6f4e] text-sm">Operations / Maintenance</span>
        </div>
        <div className="page-head mb-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="page-title font-serif text-4xl lg:text-5xl">Maintenance & Work Orders</h1>
          </div>
          <Link href="/operations/maintenance-pocs" className="btn-secondary text-sm px-4 py-2 self-start">View POC Directory →</Link>
        </div>

        {/* Super Admin Approval Banner */}
        {isAdmin && pendingApprovalJobs.length > 0 && (
          <div className="mb-8 p-5 bg-[#fffbeb] border border-[#fef3c7] rounded-card shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="font-serif text-lg text-[#92400e]">⚠️ Approval Action Required</h3>
              <p className="text-xs text-[#b45309] mt-1">There are {pendingApprovalJobs.length} maintenance request(s) waiting for super-admin approval.</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {pendingApprovalJobs.map(j => (
                <div key={j.id} className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-control border border-[#fde68a] text-xs">
                  <span>{j.id}</span>
                  <Link href={`/operations/maintenance/${j.id}`} className="hover:underline text-ink font-medium">Open Job →</Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filters/Sort */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6 items-end">
            <div>
                <span className="text-xs font-medium text-[#6b635c] mb-1 block">Raised in last:</span>
                <select className="field text-sm bg-white" onChange={e => { setDateRange(e.target.value); setRequestFilter(e.target.value); }}>
                    <option value="All">All time</option>
                    <option value="3 days">3 days</option>
                    <option value="1 week">1 week</option>
                    <option value="1 month">1 month</option>
                    <option value="60 days">60 days</option>
                    <option value="custom">Custom…</option>
                </select>
            </div>
            <div>
                <span className="text-xs font-medium text-[#6b635c] mb-1 block">Service type:</span>
                <select className="field text-sm bg-white" value={serviceFilter} onChange={e => setServiceFilter(e.target.value)}>
                    <option value="All">All</option>
                    <option value="Routine Service">Routine Service</option>
                    <option value="Faulty or defective repair">Faulty or defective repair</option>
                </select>
            </div>
            <div>
                <span className="text-xs font-medium text-[#6b635c] mb-1 block">Status:</span>
                <select className="field text-sm bg-white" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    <option value="All">All</option>
                    <option value="pending_approval">Pending approval</option>
                    <option value="Approved">Approved</option>
                    <option value="Assigned">Assigned</option>
                    <option value="Awaiting POC">Awaiting POC</option>
                    <option value="In Repair">In Repair</option>
                    <option value="Awaiting Quote">Awaiting Quote</option>
                    <option value="Completed">Completed</option>
                    <option value="Rejected">Rejected</option>
                </select>
            </div>
            <div>
                <span className="text-xs font-medium text-[#6b635c] mb-1 block">Completion:</span>
                <select className="field text-sm bg-white" value={completionFilter} onChange={e => setCompletionFilter(e.target.value)}>
                    <option value="All">All</option>
                    <option value="Completed">Completed</option>
                    <option value="Pending">Pending</option>
                </select>
            </div>
            {dateRange === 'custom' && (
                <div className="sm:col-span-2 lg:col-span-4 flex items-center gap-2">
                    <input type="number" min="1" max="365" value={customDays} onChange={e => setCustomDays(Number(e.target.value))} className="field text-sm w-24 bg-white" />
                    <span className="text-xs text-[#8b6f4e]">days ago</span>
                </div>
            )}
        </div>

        <table className="w-full text-sm bg-white border border-[#ebe8e4] rounded-card p-4">
          <thead>
            <tr className="border-b border-[#ebe8e4]">
              <th className="px-4 py-3 text-left">Job ID</th>
              <th className="px-4 py-3 text-left">Asset number</th>
              <th className="px-4 py-3 text-left">Asset name</th>
              <th className="px-4 py-3 text-left">Request date</th>
              <th className="px-4 py-3 text-left">Current Status</th>
              <th className="px-4 py-3 text-left">Completion Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredJobs.map(job => (
              <tr key={job.id} className="border-b border-[#ebe8e4]">
                <td className="px-4 py-3"><Link href={`/operations/maintenance/${job.id}`} className="text-[#8b6f4e] hover:underline">{job.id}</Link></td>
                <td className="px-4 py-3">{job.asset_serial || '-'}</td>
                <td className="px-4 py-3">{job.assets ? (job.assets.name || '-') : (job.asset_name || '-')}</td>
                <td className="px-4 py-3">{job.requested_at ? new Date(job.requested_at).toLocaleDateString() : '-'}</td>
                <td className="px-4 py-3">
                    <span className={`${statusColors[job.status] || 'pill-quiet'} text-xs px-2 py-0.5 rounded-full`}>{statusLabel(job.status)}</span>
                </td>
                <td className="px-4 py-3">{(job.completion_type && job.completion_type.trim() !== '') ? job.completion_type : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
