'use client';
import { useState } from 'react';
import Link from 'next/link';

export default function AssetsPage() {
  const [bulk, setBulk] = useState({ category: '', name: '', quantity: 1, condition: 'Good', status: 'available', date: '2026-10-08' });
  const [groups, setGroups] = useState([
    { category: 'Uniform', total: 20, assigned: 10, available: 8, maintenance: 0, bad: 2, returned: 0, expanded: false },
    { category: 'Chairs', total: 60, assigned: 0, available: 55, maintenance: 2, bad: 2, discarded: 1, returned: 0, expanded: false },
  ]);

  const handleBulk = () => {
    const qty = parseInt(bulk.quantity) || 1;
    setGroups(prev => [...prev, { category: bulk.category || bulk.name, total: qty, assigned: 0, available: qty, maintenance: 0, bad: 0, returned: 0, expanded: false }]);
    setBulk({ category: '', name: '', quantity: 1, condition: 'Good', status: 'available', date: '2026-10-08' });
  };

  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">← Home</Link>
          <span className="text-[#8b6f4e] text-sm">Operations / Assets</span>
        </div>
        <div className="page-head mb-10">
          <h1 className="page-title font-serif text-4xl lg:text-5xl">Assets</h1>
          <p className="page-purpose text-[#6b635c] text-base lg:text-lg mt-3">Restaurant inventory with employee assignment links — bulk entry + category view</p>
        </div>

        {/* Bulk Entry */}
        <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm mb-8">
          <div className="panel-body p-8 lg:p-10">
            <h3 className="font-serif text-xl mb-4">Quick Entry (Bulk)</h3>
            <p className="text-sm text-[#6b635c] mb-4">Enter quantity + common details. The system auto-generates asset numbers (e.g., CHAIR-001 to CHAIR-060).</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <input className="field text-sm" placeholder="Category (Chairs)" value={bulk.category} onChange={e=>setBulk({...bulk,category:e.target.value})} />
              <input className="field text-sm" placeholder="Name" value={bulk.name} onChange={e=>setBulk({...bulk,name:e.target.value})} />
              <input className="field text-sm" type="number" placeholder="Quantity" value={bulk.quantity} onChange={e=>setBulk({...bulk,quantity:e.target.value})} />
              <select className="field text-sm" value={bulk.condition} onChange={e=>setBulk({...bulk,condition:e.target.value})}><option>New</option><option>Good</option><option>Damaged</option><option>Bad</option></select>
              <select className="field text-sm" value={bulk.status} onChange={e=>setBulk({...bulk,status:e.target.value})}><option>available</option><option>assigned</option><option>maintenance</option><option>returned</option><option>discarded</option></select>
              <button onClick={handleBulk} className="btn-primary text-sm whitespace-nowrap">Generate Assets</button>
            </div>
          </div>
        </div>

        {/* High-Level Category Table */}
        <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm">
          <div className="panel-body p-8 lg:p-10">
            <h3 className="font-serif text-xl mb-4">Inventory Summary</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#ebe8e4] bg-[#faf8f6]">
                    <th className="table-head text-left px-4 py-3 font-medium">Category</th>
                    <th className="table-head text-left px-4 py-3 font-medium">Total</th>
                    <th className="table-head text-left px-4 py-3 font-medium">Assigned</th>
                    <th className="table-head text-left px-4 py-3 font-medium">Available</th>
                    <th className="table-head text-left px-4 py-3 font-medium">Maint.</th>
                    <th className="table-head text-left px-4 py-3 font-medium">Bad / Returned</th>
                    <th className="table-head text-left px-4 py-3 font-medium">Discarded</th>
                    <th className="table-head text-left px-4 py-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map(g => (
                    <>
                      <tr key={g.category} className="border-b border-[#ebe8e4] bg-[#faf8f6]/40 hover:bg-[#faf8f6]">
                        <td className="table-cell px-4 py-3 font-medium">{g.category}</td>
                        <td className="table-cell px-4 py-3">{g.total}</td>
                        <td className="table-cell px-4 py-3"><span className="pill-good">{g.assigned}</span></td>
                        <td className="table-cell px-4 py-3"><span className="pill-quiet">{g.available}</span></td>
                        <td className="table-cell px-4 py-3"><span className="pill-warn">{g.maintenance}</span></td>
                        <td className="table-cell px-4 py-3"><span className="pill-bad">{g.bad + g.returned}</span></td>
                        <td className="table-cell px-4 py-3"><span className="pill-bad">{g.discarded || 0}</span></td>
                        <td className="table-cell px-4 py-3">
                          <button onClick={() => setGroups(groups.map(x => x.category === g.category ? { ...x, expanded: !x.expanded } : x))} className="btn-secondary text-xs px-2 py-1">{g.expanded ? 'Collapse' : 'Expand'}</button>
                        </td>
                      </tr>
                      {g.expanded && (
                        <tr><td colSpan={8} className="bg-[#faf8f6]/30 px-4 py-2 text-xs text-[#6b635c]">Individual items shown here (e.g., CHAIR-001 assigned to Rahuk, CHAIR-002 available, etc.)</td></tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
