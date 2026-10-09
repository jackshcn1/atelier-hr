'use client';
import Link from 'next/link';
import { useState } from 'react';

export default function OperationsOverview() {
  const [filter, setFilter] = useState('all');

  const sections = [
    {
      title: 'Assets',
      href: '/operations/assets',
      desc: 'Inventory tracking with employee linkages (asset number, possession status, condition)',
      stat: '42 assets',
      status: 'Active',
      pill: 'pill-good',
    },
    {
      title: 'Maintenance',
      href: '/operations/maintenance',
      desc: 'Work orders, technician assignments, and scheduling for equipment upkeep',
      stat: '8 open orders',
      status: 'In Progress',
      pill: 'pill-warn',
    },
    {
      title: 'Compliance',
      href: '/operations/compliance',
      desc: 'License tracking, certification expiry alerts, and inspection records',
      stat: '3 pending renewals',
      status: 'Due Soon',
      pill: 'pill-bad',
    },
  ];

  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">← Home</Link>
          <span className="text-[#8b6f4e] text-sm">Module / Operations</span>
        </div>
        <div className="flex items-center gap-3 mb-6">
          <a href="/" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">← Home</a>
          <span className="text-[#8b6f4e] text-sm">Module / Operations</span>
        </div>
        <div className="page-head mb-12">
          <h1 className="page-title font-serif text-4xl lg:text-5xl">Operations</h1>
          <p className="page-purpose text-[#6b635c] text-base lg:text-lg mt-3">Asset management, maintenance scheduling, and compliance tracking</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {sections.map((s) => (
            <a key={s.title} href={s.href} className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm hover:shadow-md transition-all duration-300 group block">
              <div className="panel-body p-8 lg:p-10 flex flex-col h-full">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-serif text-2xl text-[#1e1812] lg:text-3xl">{s.title}</h2>
                  <span className={`pill text-xs font-medium px-2.5 py-0.5 rounded-full ${s.pill}`}>{s.status}</span>
                </div>
                <p className="text-[#6b635c] text-sm leading-relaxed mb-6">{s.desc}</p>
                <div className="mt-auto pt-5 border-t border-[#ebe8e4] flex items-center justify-between">
                  <span className="text-sm font-medium text-[#1e1812]">{s.stat}</span>
                  <span className="text-sm text-[#8b6f4e] font-medium group-hover:text-[#6b4423] transition-colors">Open →</span>
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}
