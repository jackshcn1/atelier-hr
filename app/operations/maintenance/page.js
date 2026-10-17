'use client';
import { useState } from 'react';
import Link from 'next/link';

export default function MaintenancePage() {
  const [jobs, setJobs] = useState([
    {
      id: 'MNT-101',
      asset: 'Chiller FM-300U (KICH00001)',
      serviceType: 'Faulty or defective repair',
      priority: 'Urgent',
      status: 'Pending approval',
      requestedBy: 'John Doe',
      date: '2026-10-17'
    },
    {
      id: 'MNT-102',
      asset: 'Printer HP LaserJet (AST-003)',
      serviceType: 'Routine Service',
      priority: 'Normal',
      status: 'Approved to proceed',
      requestedBy: 'Sarah Miller',
      date: '2026-10-16'
    }
  ]);

  const [isAdmin] = useState(true); // Super Admin simulation

  const handleApprove = (jobId) => {
    setJobs(jobs.map(j => j.id === jobId ? {...j, status: 'Approved to proceed'} : j));
  };

  const pendingCount = jobs.filter(j => j.status === 'Pending approval').length;

  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="btn-secondary text-xs px-3 py-1.5">← Home</Link>
          <span className="text-[#8b6f4e] text-sm">Operations / Maintenance</span>
        </div>
        <div className="page-head mb-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="page-title font-serif text-4xl lg:text-5xl">Maintenance & Work Orders</h1>
            <p className="page-purpose text-[#6b635c] text-base lg:text-lg mt-3">Track equipment upkeep, service requests, POC mapping, quotes, and approvals</p>
          </div>
          <Link href="/operations/maintenance-pocs" className="btn-secondary text-sm px-4 py-2 self-start">View POC Directory →</Link>
        </div>

        {/* Super Admin Approval Banner */}
        {isAdmin && pendingCount > 0 && (
          <div className="mb-8 p-5 bg-[#fffbeb] border border-[#fef3c7] rounded-card shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="font-serif text-lg text-[#92400e]">⚠️ Approval Action Required</h3>
              <p className="text-xs text-[#b45309] mt-1">There are {pendingCount} maintenance request(s) waiting for super-admin approval.</p>
            </div>
            <div className="flex gap-2">
              {jobs.filter(j => j.status === 'Pending approval').map(j => (
                <div key={j.id} className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-control border border-[#fde68a] text-xs">
                  <span>{j.id}</span>
                  <Link href={`/operations/maintenance/${j.id}`} className="hover:underline text-ink font-medium">Open Job →</Link>
                  <button onClick={() => handleApprove(j.id)} className="btn-primary text-xs px-2 py-1">Approve</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm">
          <div className="panel-body p-8 lg:p-10">
            <h3 className="font-serif text-xl mb-4">Active Maintenance Jobs</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#ebe8e4] bg-[#faf8f6]">
                  <th className="table-head text-left px-4 py-3 font-medium">Job ID</th>
                  <th className="table-head text-left px-4 py-3 font-medium">Asset</th>
                  <th className="table-head text-left px-4 py-3 font-medium">Service Type</th>
                  <th className="table-head text-left px-4 py-3 font-medium">Priority</th>
                  <th className="table-head text-left px-4 py-3 font-medium">Status</th>
                  <th className="table-head text-left px-4 py-3 font-medium">Requested By</th>
                  <th className="table-head text-left px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(job => (
                  <tr key={job.id} className="border-b border-[#ebe8e4] hover:bg-[#faf8f6]">
                    <td className="table-cell px-4 py-3 font-medium text-[#8b6f4e]">
                      <Link href={`/operations/maintenance/${job.id}`} className="hover:underline text-ink">{job.id}</Link>
                    </td>
                    <td className="table-cell px-4 py-3">{job.asset}</td>
                    <td className="table-cell px-4 py-3">{job.serviceType}</td>
                    <td className="table-cell px-4 py-3">
                      <span className={job.priority === 'Urgent' ? 'pill-bad' : 'pill-quiet'}>{job.priority}</span>
                    </td>
                    <td className="table-cell px-4 py-3">
                      <span className={job.status === 'Pending approval' ? 'pill-warn' : 'pill-good'}>{job.status}</span>
                    </td>
                    <td className="table-cell px-4 py-3 text-xs text-[#6b635c]">{job.requestedBy} ({job.date})</td>
                    <td className="table-cell px-4 py-3">
                      <Link href={`/operations/maintenance/${job.id}`} className="btn-secondary text-xs px-3 py-1">View Job →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
