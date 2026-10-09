'use client';
import { useState } from 'react';
import Link from 'next/link';

const CATEGORY_OPTIONS = [
  'Kitchen Equipment', 'Furniture', 'Uniform', 'Electronics', 'Cleaning Supplies', 'Packaging', 'Other'
];
const TYPE_OPTIONS = [
  'Chiller', 'Freezer', 'Oven', 'Grill', 'Table', 'Chair', 'Stool', 'Lamp', 'TV', 'AC', 'Uniform Top', 'Uniform Bottom'
];
const LOCATION_OPTIONS = [
  'Kitchen', 'Restaurant', 'Office', 'Sales Counter', 'Employee', 'Storage', 'Outside Outlet', 'Other'
];

export default function AssetsPageFull() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '', category: '', type: '', quantity: 1,
    brand: '', model: '', serial: '', vendor: '', purchaseDate: '',
    newOrUsed: 'Brand New', condition: 'Brand New', status: 'Available',
    location: '', assignedEmployee: '',
    warrantyMonths: 12, extendedWarranty: false,
    buyingPrice: '', notes: '',
  });
  const [groups, setGroups] = useState([
    { category: 'Kitchen Equipment', name: 'Chiller', total: 3, brand: 'Hoshizaki', condition: 'Brand New', status: 'Available', location: 'Kitchen', expanded: false },
    { category: 'Furniture', name: 'Chair', total: 60, brand: 'Western', condition: 'Good', status: 'Available', location: 'Restaurant', expanded: false },
    { category: 'Uniform', name: 'Staff Uniform', total: 20, brand: 'Local Tailor', condition: 'Brand New', status: 'Available', location: 'Employee', expanded: false },
  ]);
  const [vendorSuggestions, setVendorSuggestions] = useState(['Thomson', 'Hoshizaki', 'Western', 'Local Tailor']);
  const [geoSuggestions, setGeoSuggestions] = useState(['Kitchen', 'Restaurant', 'Office', 'Sales Counter', 'Employee', 'Storage', 'Outside Outlet']);
  const [newType, setNewType] = useState('');
  const [serialGenerated, setSerialGenerated] = useState(false);
  const [serialError, setSerialError] = useState('');

  const generateSerial = () => {
    const catPrefix = form.category ? form.category.replace(/[^a-zA-Z]/g, '').substring(0, 2).toUpperCase() : 'XX';
    const typePrefix = form.type ? form.type.replace(/[^a-zA-Z]/g, '').substring(0, 2).toUpperCase() : 'YY';
    const count = groups.filter(g => g.category === form.category && g.name === form.type).reduce((a, b) => a + b.total, 0) + 1;
    return `${catPrefix}${typePrefix}${String(count).padStart(5, '0')}`;
  };

  const validateSerial = () => {
    if (!form.category || !form.type) return false;
    const prefix = form.category.replace(/[^a-zA-Z]/g, '').substring(0, 2).toUpperCase() + form.type.replace(/[^a-zA-Z]/g, '').substring(0, 2).toUpperCase();
    const numberPart = form.serial.replace(prefix, '');
    const alreadyExists = false; // Would check DB in real implementation
    return numberPart.length === 5 && !alreadyExists;
  };

  const handleAdd = () => {
    if (form.name.trim() === '') return;
    const qty = parseInt(form.quantity) || 1;
    const serial = form.serial || generateSerial();
    setSerialError('');
    setGroups(prev => [...prev, {
      category: form.category || 'General',
      name: form.name || 'Asset',
      total: qty,
      brand: form.brand,
      newOrUsed: form.newOrUsed,
      condition: form.condition,
      status: form.status,
      location: form.location || 'TBD',
      expanded: true,
    }]);
    setShowForm(false);
    setForm({ name: '', category: '', type: '', quantity: 1, brand: '', model: '', serial: '', vendor: '', purchaseDate: '', newOrUsed: 'Brand New', condition: 'Brand New', status: 'Available', location: '', assignedEmployee: '', warrantyMonths: 12, extendedWarranty: false, buyingPrice: '', notes: '' });
  };

  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-6xl mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">← Home</Link>
          <span className="text-[#8b6f4e] text-sm">Operations / Assets</span>
        </div>
        <div className="page-head mb-10">
          <h1 className="page-title font-serif text-4xl lg:text-5xl">Assets</h1>
          <p className="page-purpose text-[#6b635c] text-base lg:text-lg mt-3">Complete restaurant asset inventory — master entry form, category groups, expand for details</p>
        </div>

        <div className="flex justify-end mb-6">
          <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm px-4 py-2">+ Add Asset</button>
        </div>

        {showForm && (
          <form onSubmit={e => { e.preventDefault(); handleAdd(); }} className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm mb-8">
            <div className="panel-body p-8 lg:p-10">
              <h3 className="font-serif text-xl mb-2">New Asset — Master Entry</h3>
              <p className="text-xs text-[#8b6f4e] mb-6">All 17 fields. Category/Type dropdowns configurable from Settings. Serial number auto-generates (CC-TTTTT format).</p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <input className="field text-sm" placeholder="Asset Name *" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} />

                <select className="field text-sm bg-white" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>
                  <option value="">Category</option>
                  {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>

                <select className="field text-sm bg-white" value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>
                  <option value="">Type of Asset</option>
                  {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  <option value="__new__">+ Add new type...</option>
                </select>

                <input className="field text-sm" type="number" placeholder="Quantity" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})} />
                <input className="field text-sm" placeholder="Brand" value={form.brand} onChange={e=>setForm({...form,brand:e.target.value})} />
                <input className="field text-sm" placeholder="Model Name" value={form.model} onChange={e=>setForm({...form,model:e.target.value})} />

                <div className="flex gap-2 col-span-1 md:col-span-2 lg:col-span-3">
                  <input className="field text-sm flex-1" placeholder="Serial Number (auto: CC-TTTTT)" value={form.serial} onChange={e=>{
                    setForm({...form,serial:e.target.value});
                    const val = e.target.value;
                    const cat = form.category ? form.category.replace(/[^a-zA-Z]/g,'').substring(0,2).toUpperCase() : 'XX';
                    const typ = form.type ? form.type.replace(/[^a-zA-Z]/g,'').substring(0,2).toUpperCase() : 'YY';
                    const num = val.substring(cat.length + typ.length);
                    if (val.startsWith(cat+typ) && num.length !== 5) setSerialError('Serial must include 5-digit number after prefix');
                    else setSerialError('');
                  }} />
                </div>
                {serialError && <span className="text-xs text-red-600 col-span-3">{serialError}</span>}

                <input className="field text-sm" placeholder="Vendor" value={form.vendor} onChange={e=>setForm({...form,vendor:e.target.value})} />
                <input className="field text-sm" type="date" placeholder="Purchase Date" value={form.purchaseDate} onChange={e=>setForm({...form,purchaseDate:e.target.value})} />

                <select className="field text-sm bg-white" value={form.newOrUsed} onChange={e=>setForm({...form,newOrUsed:e.target.value})}>
                  <option>Brand New</option><option>Used</option>
                </select>

                <select className="field text-sm bg-white" value={form.condition} onChange={e=>setForm({...form,condition:e.target.value})}>
                  <option>Brand New</option><option>Good</option><option>Requires Maintenance</option><option>Bad</option><option>Damaged/Unusable</option>
                </select>

                <select className="field text-sm bg-white" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>
                  <option>Available</option><option>In-use</option><option>Employee-assigned</option><option>Maintenance</option><option>Returned</option><option>Discarded</option><option>Transferred</option><option>Sold</option>
                </select>

                <select className="field text-sm bg-white" value={form.location} onChange={e=>setForm({...form,location:e.target.value})}>
                  <option value="">Location</option>
                  {LOCATION_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                <input className="field text-sm" placeholder="Assigned Employee" value={form.assignedEmployee} onChange={e=>setForm({...form,assignedEmployee:e.target.value})} />

                <input className="field text-sm" type="number" placeholder="Warranty Period (months)" value={form.warrantyMonths} onChange={e=>setForm({...form,warrantyMonths:e.target.value})} />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.extendedWarranty} onChange={e=>setForm({...form,extendedWarranty:e.target.checked})} /> Extended Warranty</label>

                <input className="field text-sm" placeholder="Buying Price (₹)" value={form.buyingPrice} onChange={e=>setForm({...form,buyingPrice:e.target.value})} />

                <textarea className="field text-sm md:col-span-2 lg:col-span-2" rows={2} placeholder="Notes" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} />

                <label className="block text-sm text-[#6b635c] md:col-span-2 lg:col-span-2">Invoice Upload (Google Drive shared folder link or upload)</label>
                <input className="field text-sm md:col-span-2 lg:col-span-2" type="file" accept=".pdf,.jpg,.png" onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) alert('File selected: ' + file.name + '. In production, this uploads to a shared Google Drive folder (not Supabase).');
                }} />
              </div>
              <div className="flex gap-3 mt-6">
                <button type="submit" className="btn-primary text-sm px-5">Save Asset</button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary text-sm px-5">Cancel</button>
              </div>
            </div>
          </form>
        )}

        <div className="space-y-4">
          {groups.map((g, idx) => (
            <div key={g.category + g.name + idx} className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm">
              <button onClick={() => setExpandedId(expandedId === (g.category + g.name + idx) ? null : (g.category + g.name + idx))} className="w-full text-left px-6 py-5 flex items-center justify-between hover:bg-[#faf8f6] transition-colors">
                <div>
                  <h3 className="font-serif text-xl text-[#1e1812]">{g.name}</h3>
                  <p className="text-xs text-[#6b635c] mt-1">Category: {g.category} · Brand: {g.brand} · Units: {g.total} · Condition: <span className={`font-medium ${g.condition === 'Brand New' ? 'text-green-700' : g.condition === 'Good' ? 'text-[#6b635c]' : g.condition === 'Requires Maintenance' ? 'text-amber-700' : 'text-red-700'}`}>{g.condition}</span> · Status: <span className="font-medium">{g.status}</span> · New/Used: {g.newOrUsed || '—'} · Location: {g.location}</p>
                </div>
                <span className="btn-secondary text-xs px-3 py-1">{expandedId === (g.category + g.name + idx) ? 'Collapse' : 'Expand'}</span>
              </button>
              {expandedId === (g.category + g.name + idx) && (
                <div className="panel-body border-t border-[#ebe8e4]">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-[#faf8f6]"><th className="table-head text-left px-4 py-2">Asset #</th><th className="table-head text-left px-4 py-2">Name</th><th className="table-head text-left px-4 py-2">Brand / Model</th><th className="table-head text-left px-4 py-2">Serial</th><th className="table-head text-left px-4 py-2">Condition</th><th className="table-head text-left px-4 py-2">Status</th><th className="table-head text-left px-4 py-2">Location</th><th className="table-head text-left px-4 py-2">Assigned</th><th className="table-head text-left px-4 py-2">Warranty Till</th><th className="table-head text-left px-4 py-2">Notes</th></tr></thead>
                    <tbody>
                      {Array.from({ length: g.total }, (_, i) => i + 1).map(num => (
                        <tr key={num} className="border-b border-[#ebe8e4] hover:bg-[#faf8f6]/40">
                          <td className="table-cell px-4 py-3 text-[#8b6f4e] font-medium">{(g.category ? g.category.replace(/[^a-zA-Z]/g,'').substring(0,2).toUpperCase() : 'XX') + (g.name ? g.name.replace(/[^a-zA-Z]/g,'').substring(0,2).toUpperCase() : 'YY')}{String(num).padStart(5,'0')}</td>
                          <td className="table-cell px-4 py-3 font-medium">{g.name}</td>
                          <td className="table-cell px-4 py-3">{g.brand || '—'} / {g.name || 'Standard'}</td>
                          <td className="table-cell px-4 py-3 text-xs">SN-{num}-{(g.category ? g.category.replace(/[^a-zA-Z]/g,'').substring(0,2).toUpperCase() : 'XX')}</td>
                          <td className="table-cell px-4 py-3"><span className={g.condition === 'Brand New' || g.condition === 'Good' ? 'pill-good' : g.condition === 'Requires Maintenance' ? 'pill-warn' : 'pill-bad'}>{g.condition}</span></td>
                          <td className="table-cell px-4 py-3"><span className={g.status === 'Available' ? 'pill-good' : g.status === 'In-use' ? 'pill-quiet' : g.status === 'Employee-assigned' ? 'pill-warn' : g.status === 'Maintenance' ? 'pill-bad' : g.status === 'Returned' ? 'pill-warn' : g.status === 'Discarded' ? 'pill-bad' : g.status === 'Transferred' || g.status === 'Sold' ? 'pill-quiet' : 'pill-quiet'}>{g.status}</span></td>
                          <td className="table-cell px-4 py-3 text-xs">{g.location || '—'}</td>
                          <td className="table-cell px-4 py-3 text-xs">{g.status === 'Employee-assigned' ? 'Employee '+ (num % 3 + 1) : '—'}</td>
                          <td className="table-cell px-4 py-3 text-xs">2027-05-10</td>
                          <td className="table-cell px-4 py-3 text-xs">Standard item notes</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-4 pt-4 border-t border-[#ebe8e4] flex gap-3 flex-wrap">
                    <Link href={`/operations/assets/${encodeURIComponent(g.category)}-${encodeURIComponent(g.name)}`} className="btn-secondary text-xs px-3 py-1.5">View Full Record →</Link>
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
