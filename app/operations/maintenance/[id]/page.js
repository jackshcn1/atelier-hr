'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

export default function MaintenanceJobDetailPage() {
  const params = useParams();
  const jobId = params?.id || 'MNT-103';

  // Mock job data for display
  const mockJob = {
    id: jobId,
    asset: 'Chiller FM-300U (KICH00001)',
    status: 'Pending approval',
    requestedBy: 'John Doe',
    date: '2026-10-17',
    serviceType: 'Faulty or defective repair',
    priority: 'Urgent',
    issues: ['Cooling issue', 'Not functioning'],
    comments: 'Compressor noise loud, not maintaining temperature.',
    assignedPOC: 'CoolBreeze HVAC Services',
    auditLog: [
      { timestamp: '2026-10-17 10:15', user: 'John Doe', action: 'created', details: 'Maintenance request raised for asset KICH00001' },
      { timestamp: '2026-10-17 10:30', user: 'John Doe', action: 'updated', details: 'Status changed from In-use to Maintenance' },
    ],
    quotes: [
      { vendor: 'CoolBreeze HVAC Services', type: 'Overall job', cost: '₹6,500', delivery: '2 days', status: 'Pending approval' },
    ],
  };

  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-4xl mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/operations/maintenance" className="btn-secondary text-xs px-3 py-1.5">← Maintenance</Link>
        </div>

        <div className="page-head mb-8">
          <h1 className="font-serif text-3xl text-[#1e1812]">Maintenance Job {mockJob.id}</h1>
          <div className="flex items-center gap-4 mt-2">
            <span className="pill-warn">{mockJob.status}</span>
            <p className="text-xs text-[#6b635c]">Raised by: {mockJob.requestedBy} on {mockJob.date}</p>
          </div>
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
              <div><strong className="text-[#6b635c]">Asset:</strong> {mockJob.asset}</div>
              <div><strong className="text-[#6b635c]">Service Type:</strong> {mockJob.serviceType}</div>
              <div><strong className="text-[#6b635c]">Priority:</strong> <span className="pill-bad">{mockJob.priority}</span></div>
              <div><strong className="text-[#6b635c]">Requested By:</strong> {mockJob.requestedBy}</div>
              <div><strong className="text-[#6b635c]">Issues:</strong> {mockJob.issues.join(', ')}</div>
              <div><strong className="text-[#6b635c]">Comments:</strong> {mockJob.comments}</div>
            </div>
          </section>

          {/* Maintenance POC */}
          <section className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6">
            <h2 className="font-serif text-xl mb-4">Maintenance POC</h2>
            <p className="text-sm"><strong>Assigned:</strong> {mockJob.assignedPOC || 'Not yet assigned'}</p>
            <p className="text-xs text-[#6b635c] mt-2">Speciality filter available. Add new POC from directory.</p>
          </section>

          {/* Quotes & Estimates */}
          <section className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6">
            <h2 className="font-serif text-xl mb-4">Quotes & Estimates</h2>
            {mockJob.quotes.map((q, i) => (
              <div key={i} className="text-sm bg-[#f6f4f2] p-3 rounded mb-2">
                <div className="font-medium">{q.vendor} — {q.type}</div>
                <div className="text-[#6b635c]">Cost: {q.cost} | Delivery: {q.delivery} | Status: {q.status}</div>
              </div>
            ))}
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
              {mockJob.auditLog.map((entry, idx) => (
                <div key={idx} className="flex gap-2 border-b border-dashed border-[#ebe8e4] py-1">
                  <span className="text-[#8b6f4e] whitespace-nowrap">{entry.timestamp}</span>
                  <span className="text-[#1e1812]">{entry.user} — {entry.details}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
