'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

export default function MaintenanceJobDetailPage() {
  const params = useParams();
  const jobId = params?.id || 'MNT-103';
  const [activeTab, setActiveTab] = useState('Overview');

  const tabs = ['Overview', 'Maintenance POC', 'Quotes & Estimates', 'Completion Report', 'Audit Log'];

  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-4xl mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/operations/maintenance" className="btn-secondary text-xs px-3 py-1.5">← Maintenance</Link>
        </div>
        <div className="page-head mb-8">
          <h1 className="font-serif text-3xl text-[#1e1812]">Maintenance Job {jobId}</h1>
          <div className="flex items-center gap-4 mt-2">
            <span className="pill-warn">Pending Approval</span>
            <p className="text-xs text-[#6b635c]">Raised by: John Doe (Employee) on 2026-10-17</p>
          </div>
        </div>

        {/* Status Bar */}
        <div className="panel bg-white border border-[#ebe8e4] rounded-card p-4 mb-6">
           <div className="flex justify-between items-center text-xs font-medium text-[#8b6f4e]">
             <span>Pending Approval</span>
             <span>Approved</span>
             <span>Assigned</span>
             <span>Awaiting POC</span>
             <span>In Repair</span>
             <span>Awaiting Quote</span>
             <span>Completed</span>
           </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-[#ebe8e4]">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? 'border-[#1e1812] text-[#1e1812]' : 'border-transparent text-[#6b635c] hover:text-[#1e1812]'}`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-8">
          {activeTab === 'Overview' && <div>Maintenance Job Overview details...</div>}
          {activeTab === 'Maintenance POC' && <div>Maintenance POC Mapping...</div>}
          {activeTab === 'Quotes & Estimates' && <div>Quotes & Estimates Management...</div>}
          {activeTab === 'Completion Report' && <div>Completion Reporting...</div>}
          {activeTab === 'Audit Log' && <div>Job Audit Log...</div>}
        </div>
      </div>
    </main>
  );
}
