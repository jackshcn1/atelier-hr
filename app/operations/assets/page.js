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
    name: '', category: '', type: '', quantity: '',
    brand: '', model: '', serial: '', vendor: '', purchaseDate: '',
    newOrUsed: 'Brand New', condition: 'Brand New', status: 'Available',
    location: '', assignedEmployee: '',
    warrantyMonths: 0, extendedWarranty: false, extendedWarrantyMonths: 12,
    warrantyContact: '', buyingPrice: '', notes: '',
  });
  const [groups, setGroups] = useState([
    { category: 'Kitchen Equipment', name: 'Chiller', total: 3, brand: 'Hoshizaki', condition: 'Brand New', status: 'Available', location: 'Kitchen', expanded: false },
    { category: 'Furniture', name: 'Chair', total: 60, brand: 'Western', condition: 'Good', status: 'Available', location: 'Restaurant', expanded: false },
    { category: 'Uniform', name: 'Staff Uniform', total: 20, brand: 'Local Tailor', condition: 'Brand New', status: 'Available', location: 'Employee', expanded: false },
  ]);
  const [expandedId, setExpandedId] = useState(null);
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

  const [serials, setSerials] = useState([]);

  const handleQuantityChange = (e) => {
    const qty = parseInt(e.target.value) || 1;
    setForm({ ...form, quantity: qty, serial: '' });
    // Generate empty serial fields matching new quantity
    setSerials(Array.from({ length: qty }, (_, i) => i === 0 ? form.serial || '' : ''));
  };
  const handleAdd = () => {
    if (form.name.trim() === '') return;
    const qty = parseInt(form.quantity) || 1;
    const baseSerial = form.serial || generateSerial();
    setSerialError('');
    // Create qty separate line items with unique asset IDs and serials
    const newItems = Array.from({ length: qty }, (_, i) => ({
      category: form.category || 'General',
      name: form.name || 'Asset',
      total: 1,
      brand: form.brand,
      newOrUsed: form.newOrUsed,
      condition: form.condition,
      status: form.status,
      location: form.location || 'TBD',
      expanded: false,
      serialNum: baseSerial + '-' + (i + 1),
    }));
    setGroups(prev => [...prev, ...newItems]);
    setShowForm(false);
    setForm({ name: '', category: '', type: '', quantity: 1, brand: '', model: '', serial: '', vendor: '', purchaseDate: '', newOrUsed: 'Brand New', condition: 'Brand New', status: 'Available', location: '', assignedEmployee: '', warrantyMonths: 12, extendedWarranty: false, buyingPrice: '', notes: '' });
    setSerials([]);
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

        <div className="flex justify-between items-center mb-6">
          <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm px-4 py-2">+ Add Asset</button>
          <button onClick={() => setExpandedId('ALL')} className="btn-secondary text-xs px-3 py-1.5">Expand All</button>
        </div>

        {showForm && (
          <form onSubmit={e => { e.preventDefault(); handleAdd(); }} className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm mb-8">
            <div className="panel-body p-8 lg:p-10">
              <h3 className="font-serif text-xl mb-2">New Asset — Master Entry</h3>
              <p className="text-xs text-[#8b6f4e] mb-6">Asset # auto-generates based on quantity. Serial numbers enter individually.</p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* 1. Auto Asset # (locked) */}
                <div className="md:col-span-2 lg:col-span-3">
                  <label className="text-xs font-medium text-[#6b635c] mb-1 block">Auto-Generated Asset Numbers (locked, based on quantity)</label>
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: Math.max(1, parseInt(form.quantity) || 1) }, (_, i) => (
                      <div key={i} className="field text-sm bg-[#f6f4f2] text-[#8b6f4e] w-40 text-center select-none cursor-default">{(form.category ? form.category.replace(/[^a-zA-Z]/g,'').substring(0,2).toUpperCase() : 'XX') + (form.name ? form.name.replace(/[^a-zA-Z]/g,'').substring(0,2).toUpperCase() : 'YY')}{String(i+1).padStart(5,'0')}</div>
                    ))}
                  </div>
                </div>

                {/* 2. Asset Name */}
                <input className="field text-sm" placeholder="Asset Name *" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} />

                {/* 3. Brand */}
                <input className="field text-sm" placeholder="Brand" list="brand-list" value={form.brand} onChange={e=>setForm({...form,brand:e.target.value})} />
                <datalist id="brand-list">{[...new Set(groups.map(g => g.brand))].map(b => <option key={b} value={b} />)}</datalist>

                {/* 4. Type of Asset */}
                <select className="field text-sm bg-white" value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>
                  <option value="">Type of Asset</option>
                  {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  <option value="__new__">+ Add new type...</option>
                </select>

                {/* 5. Category */}
                <select className="field text-sm bg-white" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>
                  <option value="">Category</option>
                  {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>

                {/* 6. Quantity */}
                <input className="field text-sm" type="number" placeholder="Quantity" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})} />

                {/* 7. Model Number */}
                <input className="field text-sm" placeholder="Model Number" list="model-list" value={form.model} onChange={e=>setForm({...form,model:e.target.value})} />
                <datalist id="model-list">{[...new Set(groups.map(g => g.name))].map(m => <option key={m} value={m} />)}</datalist>

                {/* 8. Serial Numbers */}
                <div className="md:col-span-2 lg:col-span-3">
                  <label className="text-xs font-medium text-[#6b635c] mb-1 block">Serial Numbers (one per unit)</label>
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: Math.max(1, parseInt(form.quantity) || 1) }, (_, i) => (
                      <input key={i} className="field text-sm w-36" placeholder={`Serial ${i + 1}`} value={serials[i] || ''} onChange={e => { const updated = [...serials]; updated[i] = e.target.value; setSerials(updated); setForm({...form, serial: updated[0] || ''}); }} />
                    ))}
                  </div>
                </div>

                {/* 9. Purchase Date */}
                <input className="field text-sm" type="date" placeholder="Purchase / Transfer Date" value={form.purchaseDate} onChange={e=>setForm({...form,purchaseDate:e.target.value})} />

                {/* 10. Brand New / Used */}
                <select className="field text-sm bg-white" value={form.newOrUsed} onChange={e=>setForm({...form,newOrUsed:e.target.value})}>
                  <option>Brand New</option><option>Used</option>
                </select>

                {/* 11. Condition */}
                <select className="field text-sm bg-white" value={form.condition} onChange={e=>setForm({...form,condition:e.target.value})}>
                  <option>Brand New</option><option>Good</option><option>Requires Maintenance</option><option>Bad</option><option>Damaged/Unusable</option>
                </select>

                {/* 12. Status */}
                <select className="field text-sm bg-white" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>
                  <option>Available</option><option>In-use</option><option>Employee-assigned</option><option>Maintenance</option><option>Returned</option><option>Discarded</option><option>Transferred</option><option>Sold</option>
                </select>

                {/* 13. Location */}
                <select className="field text-sm bg-white" value={form.location} onChange={e=>setForm({...form,location:e.target.value})}>
                  <option value="">Location</option>
                  {LOCATION_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>

                {/* 14. Assigned Employee (only if Employee selected) */}
                {form.location === 'Employee' && (
                  <input className="field text-sm" placeholder="Assigned Employee" value={form.assignedEmployee} onChange={e=>setForm({...form,assignedEmployee:e.target.value})} />
                )}

                {/* 15. Vendor */}
                <input className="field text-sm" placeholder="Vendor" list="vendor-list" value={form.vendor} onChange={e=>setForm({...form,vendor:e.target.value})} />
                <datalist id="vendor-list">{vendorSuggestions.map(v => <option key={v} value={v} />)}</datalist>

                {/* 16. Invoice Number */}
                <input className="field text-sm" placeholder="Invoice Number" value={form.invoiceNumber || ''} onChange={e=>setForm({...form,invoiceNumber:e.target.value})} />

                {/* 17. Warranty Period */}
                <input className="field text-sm" type="number" placeholder="Warranty Period (months)" value={form.warrantyMonths === 0 ? '' : form.warrantyMonths} onChange={e=>setForm({...form,warrantyMonths:parseInt(e.target.value)||0})} />

                {/* 18. Extended Warranty */}
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.extendedWarranty} onChange={e=>setForm({...form,extendedWarranty:e.target.checked})} /> Extended Warranty</label>
                  {form.extendedWarranty && (
                    <input className="field text-sm" type="number" placeholder="Extended Period (months)" value={form.extendedWarrantyMonths} onChange={e=>setForm({...form,extendedWarrantyMonths:parseInt(e.target.value)||0})} />
                  )}
                </div>

                {/* 19. Warranty Contact Number */}
                <input className="field text-sm" placeholder="Warranty Contact Number" value={form.warrantyContact} onChange={e=>setForm({...form,warrantyContact:e.target.value})} />

                {/* 20. Buying Price */}
                <input className="field text-sm" placeholder="Buying Price (₹)" value={form.buyingPrice} onChange={e=>setForm({...form,buyingPrice:e.target.value})} />

                {/* 21. Notes */}
                <textarea className="field text-sm md:col-span-2 lg:col-span-2" rows={2} placeholder="Notes" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} />

                {/* 22. Attach invoice */}
                <label className="block text-sm text-[#6b635c] md:col-span-2 lg:col-span-2">Invoice Upload (Google Drive shared folder link or upload)</label>
                <input className="field text-sm md:col-span-2 lg:col-span-2" type="file" accept=".pdf,.jpg,.png" onChange={e => { const file = e.target.files?.[0]; if (file) alert('File selected: ' + file.name + '. In production, this uploads to a shared Google Drive folder (not Supabase).'); }} />
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
                  <p className="text-xs text-[#6b635c] mt-1">
                    Category: {g.category} · Units: {g.total}
                    <span className="ml-2 inline-flex gap-1">
                      <span className="px-1.5 py-0.5 rounded-full bg-page text-ink-muted">{g.location || 'Kitchen'}</span>
                    </span>
                  </p>
                </div>
                <span className="btn-secondary text-xs px-3 py-1">{expandedId === 'ALL' || expandedId === (g.category + g.name + idx) ? 'Collapse' : 'Expand'}</span>
              </button>
              {(expandedId === (g.category + g.name + idx) || expandedId === 'ALL') && (
                <div className="panel-body border-t border-[#ebe8e4]">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-[#faf8f6]"><th className="table-head text-left px-2 py-1">Asset #</th><th className="table-head text-left px-2 py-1">Brand / Model</th><th className="table-head text-left px-2 py-1">Serial #</th><th className="table-head text-left px-2 py-1">Condition</th><th className="table-head text-left px-2 py-1">Status</th><th className="table-head text-left px-2 py-1">Location</th><th className="table-head text-left px-2 py-1">Notes</th></tr></thead>
                    <tbody>
                      {Array.from({ length: g.total }, (_, i) => i + 1).map(num => {
                        const assetId = (g.category ? g.category.replace(/[^a-zA-Z]/g,'').substring(0,2).toUpperCase() : 'XX') + (g.name ? g.name.replace(/[^a-zA-Z]/g,'').substring(0,2).toUpperCase() : 'YY') + String(num).padStart(5,'0');
                        return (
                          <tr key={num} className="border-b border-[#ebe8e4] hover:bg-[#faf8f6]/40">
                            <td className="table-cell px-2 py-1.5 text-[#8b6f4e] font-medium whitespace-nowrap"><a href={`/operations/assets/${encodeURIComponent(assetId)}`} className="hover:underline text-ink">{assetId}</a></td>
                            <td className="table-cell px-2 py-1.5 whitespace-nowrap">{g.brand || '—'} / {g.name || 'Standard'}</td>
                            <td className="table-cell px-2 py-1.5 whitespace-nowrap text-xs">SN-{num}</td>
                            <td className="table-cell px-2 py-1.5 whitespace-nowrap"><span className={g.condition === 'Brand New' || g.condition === 'Good' ? 'pill-good text-[10px]' : g.condition === 'Requires Maintenance' ? 'pill-warn text-[10px]' : 'pill-bad text-[10px]'}>{g.condition}</span></td>
                            <td className="table-cell px-2 py-1.5 whitespace-nowrap"><span className={g.status === 'Available' ? 'pill-good text-[10px]' : g.status === 'In-use' ? 'pill-quiet text-[10px]' : g.status === 'Employee-assigned' ? 'pill-warn text-[10px]' : g.status === 'Maintenance' ? 'pill-bad text-[10px]' : g.status === 'Returned' ? 'pill-warn text-[10px]' : g.status === 'Discarded' ? 'pill-bad text-[10px]' : 'pill-quiet text-[10px]'}>{g.status}</span></td>
                            <td className="table-cell px-2 py-1.5 whitespace-nowrap text-xs">{g.location || '—'}</td>
                            <td className="table-cell px-2 py-1.5 whitespace-nowrap text-xs">Standard notes</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="mt-4 pt-4 border-t border-[#ebe8e4] flex gap-3 flex-wrap">
                    <span className="text-xs text-[#6b635c]">Individual assets listed above — click any ID to view/edit.</span>
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
