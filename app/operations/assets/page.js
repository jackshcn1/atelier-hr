'use client';
import { useState } from 'react';
import Link from 'next/link';

export default function AssetsPage() {
  const [items, setItems] = useState([
    { id: 1, name: 'Laptop Dell Latitude', assetNumber: 'AST-001', assigned: 'Rahul Menon', status: 'assigned', condition: 'Good', date: '2025-03-12' },
    { id: 2, name: 'Projector Epson', assetNumber: 'AST-002', assigned: 'Unassigned', status: 'available', condition: 'Good', date: '2025-01-20' },
    { id: 3, name: 'Printer HP LaserJet', assetNumber: 'AST-003', assigned: 'Sreeja Nair', status: 'maintenance', condition: 'Needs Repair', date: '2024-11-05' },
  ]);

  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">← Home</Link>
          <span className="text-[#8b6f4e] text-sm">Operations / Assets</span>
        </div>
        <div className="page-head mb-10">
          <h1 className="page-title font-serif text-4xl lg:text-5xl">Assets</h1>
          <p className="page-purpose text-[#6b635c] text-base lg:text-lg mt-3">Inventory with employee assignment links (asset number + possession status)</p>
        </div>

        <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm">
          <div className="panel-body p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#ebe8e4] bg-[#faf8f6]">
                  <th className="table-head text-left px-5 py-3 font-medium text-[#6b635c]">Name</th>
                  <th className="table-head text-left px-5 py-3 font-medium text-[#6b635c]">Asset #</th>
                  <th className="table-head text-left px-5 py-3 font-medium text-[#6b635c]">Assigned To</th>
                  <th className="table-head text-left px-5 py-3 font-medium text-[#6b635c]">Status</th>
                  <th className="table-head text-left px-5 py-3 font-medium text-[#6b635c]">Condition</th>
                  <th className="table-head text-left px-5 py-3 font-medium text-[#6b635c]">Purchase Date</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className="border-b border-[#ebe8e4] hover:bg-[#faf8f6] transition-colors">
                    <td className="table-cell px-5 py-3 font-medium">{i.name}</td>
                    <td className="table-cell px-5 py-3 text-[#8b6f4e]">{i.assetNumber}</td>
                    <td className="table-cell px-5 py-3">{i.assigned}</td>
                    <td className="table-cell px-5 py-3"><span className={i.status === 'assigned' ? 'pill-good' : i.status === 'available' ? 'pill-quiet' : 'pill-warn'}>{i.status}</span></td>
                    <td className="table-cell px-5 py-3">{i.condition}</td>
                    <td className="table-cell px-5 py-3 text-[#6b635c]">{i.date}</td>
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
