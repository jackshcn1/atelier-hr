'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '../../../lib/supabaseClient';

export default function MaintenancePage() {
  const [jobs, setJobs] = useState([]);
  const [isAdmin] = useState(true);
  const [filter, setFilter] = useState('All');
  const [sortBy, setSortBy] = useState('date');

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

  const filteredJobs = jobs
    .filter(j => filter === 'All' || j.status === filter)
    .sort((a, b) => {
        if (sortBy === 'date') return new Date(b.requested_at) - new Date(a.requested_at);
        return 0;
    });

  const pendingCount = jobs.filter(j => j.status === 'Pending approval').length;

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

        {/* Filters/Sort */}
        <div className="flex gap-4 mb-6">
            <select className="field text-sm" onChange={(e) => setFilter(e.target.value)}>
                <option value="All">All Statuses</option>
                <option value="Pending approval">Pending approval</option>
                <option value="Completed">Completed</option>
            </select>
        </div>

        <table className="w-full text-sm bg-white border border-[#ebe8e4] rounded-card p-4">
          <thead>
            <tr className="border-b border-[#ebe8e4]">
              <th className="px-4 py-3 text-left">Job ID</th>
              <th className="px-4 py-3 text-left">Asset</th>
              <th className="px-4 py-3 text-left">Completion Type</th>
              <th className="px-4 py-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredJobs.map(job => (
              <tr key={job.id} className="border-b border-[#ebe8e4]">
                <td className="px-4 py-3"><Link href={`/operations/maintenance/${job.id}`} className="text-[#8b6f4e] hover:underline">{job.id}</Link></td>
                <td className="px-4 py-3">{job.asset_serial}</td>
                <td className="px-4 py-3">{job.completion_type || '-'}</td>
                <td className="px-4 py-3">{job.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
