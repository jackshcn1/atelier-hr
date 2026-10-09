'use client';
import { useState } from 'react';
import Link from 'next/link';

export default function AssetsPageFull() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '', category: '', type: '', quantity: 1,
    brand: '', model: '', serial: '', vendor: '', purchaseDate: '',
    condition: 'Good', status: 'available', location: '', assignedEmployee: '',
    warrantyMonths: 12, extendedWarranty: false,
    buyingPrice: '', notes: '', attachmentUrl: '',
  });
  const [groups, setGroups] = useState([
    { category: 'Kitchen Equipment', name: 'Chiller', total: 3, brand: 'Hoshizaki', condition: 'Good', status: 'available', location: 'Kitchen', expanded: false },
    { category: 'Furniture', name: 'Chair', total: 60, brand: 'Western', condition: 'Good', status: 'available', location: 'Restaurant', expanded: false },
    { category: 'Uniform', name: 'Staff Uniform', total: 20, brand: 'Local Tailor', condition: 'Good', status: 'available', location: 'Employee', expanded: false },
  ]);
  const [expandedId, setExpandedId] = useState(null);

  const handleAdd = () => {
    const qty = parseInt(form.quantity) || 1;
    setGroups(prev => [...prev, {
      category: form.category || 'General',
      name: form.name || 'Asset',
      total: qty,
      brand: form.brand,
      condition: form.condition,
      status: form.status,
      location: form.location || 'TBD',
      expanded: true,
    }]);
    setShowForm(false);
    setForm({ name: '', category: '', type: '', quantity: 1, brand: '', model: '', serial: '', vendor: '', purchaseDate: '', condition: 'Good', status: 'available', location: '', assignedEmployee: '', warrantyMonths: 12, extendedWarranty: false, buyingPrice: '', notes: '', attachmentUrl: '' });
  };

  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-6xl mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">← Home</Link>
          <span className="text-[#8b6f4e] text-sm">Operations / Assets</span>
        </div>

        <div className="page-head mb-8">
          <h1 className="page-title font-serif text-4xl lg:text-5xl">Assets</h1>
          <p className="page-purpose text-[#6b635c] text-base lg:text-lg mt-3">Complete restaurant asset inventory — individual tracking, bulk entry, full master records</p>
        </div>

        {/* Add Asset Button */}
        <div className="flex justify-end mb-6">
          <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm px-4 py-2">+ Add Asset</button>
        </div>

        {/* Full Form */}
        {showForm && (
          <form onSubmit={e => { e.preventDefault(); handleAdd(); }} className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm mb-8">
            <div className="panel-body p-8 lg:p-10">
              <h3 className="font-serif text-xl mb-6">New Asset — Master Entry (All 17 Fields)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <input className="field text-sm" placeholder="Asset Name *" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} />
                <input className="field text-sm" placeholder="Category (Kitchen Equipment)" value={form.category} onChange={e=>setForm({...form,category:e.target.value})} />
                <input className="field text-sm" placeholder="Type of Asset" value={form.type} onChange={e=>setForm({...form,type:e.target.value})} />
                <input className="field text-sm" type="number" placeholder="Quantity" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})} />
                <input className="field text-sm" placeholder="Brand" value={form.brand} onChange={e=>setForm({...form,brand:e.target.value})} />
                <input className="field text-sm" placeholder="Model Name" value={form.model} onChange={e=>setForm({...form,model:e.target.value})} />
                <input className="field text-sm" placeholder="Serial Number" value={form.serial} onChange={e=>setForm({...form,serial:e.target.value})} />
                <input className="field text-sm" placeholder="Vendor" value={form.vendor} onChange={e=>setForm({...form,vendor:e.target.value})} />
                <input className="field text-sm" placeholder="Purchase Date" type="date" value={form.purchaseDate} onChange={e=>setForm({...form,purchaseDate:e.target.value})} />
                <select className="field text-sm" value={form.condition} onChange={e=>setForm({...form,condition:e.target.value})}>
                  <option>New</option><option>Good</option><option>Damaged</option><option>Bad</option>
                </select>
                <select className="field text-sm" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>
                  <option>available</option><option>assigned</option><option>maintenance</option><option>returned</option><option>discarded</option>
                </select>
                <input className="field text-sm" placeholder="Location (Kitchen, Office...)" value={form.location} onChange={e=>setForm({...form,location:e.target.value})} />
                <input className="field text-sm" placeholder="Assigned Employee ID / Name" value={form.assignedEmployee} onChange={e=>setForm({...form,assignedEmployee:e.target.value})} />
                <input className="field text-sm" type="number" placeholder="Warranty Period (months)" value={form.warrantyMonths} onChange={e=>setForm({...form,warrantyMonths:e.target.value})} />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.extendedWarranty} onChange={e=>setForm({...form,extendedWarranty:e.target.checked})} /> Extended Warranty</label>
                <input className="field text-sm" placeholder="Buying Price (₹)" value={form.buyingPrice} onChange={e=>setForm({...form,buyingPrice:e.target.value})} />
                <textarea className="field text-sm md:col-span-2 lg:col-span-3" rows={2} placeholder="Notes" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} />
                <input className="field text-sm md:col-span-2 lg:col-span-3" placeholder="Invoice Attachment URL" value={form.attachmentUrl} onChange={e=>setForm({...form,attachmentUrl:e.target.value})} />
              </div>
              <div className="flex gap-3 mt-4">
                <button type="submit" className="btn-primary text-sm px-5">Save Asset</button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary text-sm px-5">Cancel</button>
              </div>
            </div>
          </form>
        )}

        {/* Asset Groups */}
        <div className="space-y-4">
          {groups.map((g, idx) => (
            <div key={g.category + idx} className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm">
              <button onClick={() => setExpandedId(expandedId === (g.category + idx) ? null : (g.category + idx))} className="w-full text-left px-6 py-5 flex items-center justify-between hover:bg-[#faf8f6] transition-colors">
                <div>
                  <h3 className="font-serif text-xl text-[#1e1812]">{g.name}</h3>
                  <p className="text-xs text-[#6b635c] mt-1">Category: {g.category} · Brand: {g.brand} · Units: {g.total} · Condition: <span className={`font-medium ${g.condition === 'Good' ? 'text-green-700' : g.condition === 'Damaged' ? 'text-amber-700' : 'text-red-700'}`}>{g.condition}</span> · Status: <span className="font-medium">{g.status}</span> · Location: {g.location}</p>
                </div>
                <span className="btn-secondary text-xs px-3 py-1">{expandedId === (g.category + idx) ? 'Collapse' : 'Expand'}</span>
              </button>
              {expandedId === (g.category + idx) && (
                <div className="panel-body border-t border-[#ebe8e4]">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-[#faf8f6]"><th className="table-head text-left px-4 py-2">Asset #</th><th className="table-head text-left px-4 py-2">Name</th><th className="table-head text-left px-4 py-2">Brand / Model</th><th className="table-head text-left px-4 py-2">Serial</th><th className="table-head text-left px-4 py-2">Condition</th><th className="table-head text-left px-4 py-2">Status</th><th className="table-head text-left px-4 py-2">Location</th><th className="table-head text-left px-4 py-2">Assigned</th><th className="table-head text-left px-4 py-2">Warranty Till</th><th className="table-head text-left px-4 py-2">Notes</th></tr></thead>
                    <tbody>
                      {Array.from({ length: g.total }, (_, i) => i + 1).map(num => (
                        <tr key={num} className="border-b border-[#ebe8e4] hover:bg-[#faf8f6]/40">
                          <td className="table-cell px-4 py-3 text-[#8b6f4e] font-medium">{g.category.substring(0,4).toUpperCase()}-{String(num).padStart(3,'0')}</td>
                          <td className="table-cell px-4 py-3 font-medium">{g.name}</td>
                          <td className="table-cell px-4 py-3">{g.brand} / Standard</td>
                          <td className="table-cell px-4 py-3 text-xs">SN-{num}-{g.category.substring(0,2).toUpperCase()}</td>
                          <td className="table-cell px-4 py-3"><span className={g.condition === 'Good' ? 'pill-good' : g.condition === 'Damaged' ? 'pill-warn' : 'pill-bad'}>{g.condition}</span></td>
                          <td className="table-cell px-4 py-3"><span className={g.status === 'available' ? 'pill-good' : g.status === 'assigned' ? 'pill-quiet' : g.status === 'maintenance' ? 'pill-warn' : 'pill-bad'}>{g.status}</span></td>
                          <td className="table-cell px-4 py-3 text-xs">{g.location}</td>
                          <td className="table-cell px-4 py-3 text-xs">{g.status === 'assigned' ? 'Employee ' + (num % 3 + 1) : 'Unassigned'}</td>
                          <td className="table-cell px-4 py-3 text-xs">2027-05-10</td>
                          <td className="table-cell px-4 py-3 text-xs">Standard item</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-4 pt-4 border-t border-[#ebe8e4] flex gap-3 flex-wrap">
                    <a href={`/operations/assets/${g.category}-${g.name}`} className="btn-secondary text-xs px-3 py-1.5">View Full Record →</a>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
