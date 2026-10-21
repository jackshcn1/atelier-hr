'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '../../../lib/supabaseClient';

const CATEGORY_OPTIONS = ['Kitchen Equipment', 'Furniture', 'Uniform', 'Electronics', 'Cleaning Supplies', 'Packaging', 'Other'];
const TYPE_OPTIONS = ['Chiller', 'Freezer', 'Oven', 'Grill', 'Table', 'Chair', 'Stool', 'Lamp', 'TV', 'AC'];

export default function AssetsPageFull() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', category: 'Kitchen Equipment', type: 'Chiller', condition: 'Brand New', status: 'Available', location: 'Kitchen', asset_number: 'KICH00003' });

  const fallbackAssets = [
    { asset_number: 'KICH00001', name: 'Chiller', condition: 'Brand New', status: 'Available', location: 'Kitchen' },
    { asset_number: 'KICH00002', name: 'Chiller', condition: 'Good', status: 'Maintenance', location: 'Bakery' }
  ];

  useEffect(() => {
    const fetchAssets = async () => {
      try {
        const res = await fetch('/api/assets');
        const json = await res.json();
        if (json.assets && json.assets.length > 0) {
          setAssets(json.assets);
        } else {
          setAssets(fallbackAssets);
        }
      } catch (e) {
        setAssets(fallbackAssets);
      } finally {
        setLoading(false);
      }
    };
    fetchAssets();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    const newAsset = { ...form };
    setAssets(prev => [newAsset, ...prev]);
    setShowForm(false);
    setForm({ name: '', category: 'Kitchen Equipment', type: 'Chiller', condition: 'Brand New', status: 'Available', location: 'Kitchen', asset_number: 'KICH000' + (assets.length + 3) });
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
          <p className="page-purpose text-[#6b635c] text-base lg:text-lg mt-3">Live restaurant asset inventory</p>
        </div>

        <div className="flex justify-between items-center mb-6">
          <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm px-4 py-2">+ Add Asset</button>
        </div>

        {showForm && (
          <form onSubmit={handleAdd} className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6 mb-8">
            <h3 className="font-serif text-xl mb-4">Add New Asset</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 text-sm">
              <input className="field text-sm" placeholder="Asset Number (e.g. KICH00003)" value={form.asset_number} onChange={e => setForm({...form, asset_number: e.target.value})} required />
              <input className="field text-sm" placeholder="Asset Name" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
              <select className="field text-sm bg-white" value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
                {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select className="field text-sm bg-white" value={form.condition} onChange={e => setForm({...form, condition: e.target.value})}>
                <option>Brand New</option><option>Good</option><option>Requires Maintenance</option><option>Bad</option>
              </select>
              <select className="field text-sm bg-white" value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                <option>Available</option><option>In-use</option><option>Maintenance</option><option>Returned</option>
              </select>
              <input className="field text-sm" placeholder="Location" value={form.location} onChange={e => setForm({...form, location: e.target.value})} />
            </div>
            <div className="flex gap-3">
              <button type="submit" className="btn-primary text-sm px-4 py-2">Save Asset</button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary text-sm px-4 py-2">Cancel</button>
            </div>
          </form>
        )}

        {loading ? <div>Loading assets...</div> : (
          <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#faf8f6]">
                  <th className="table-head text-left px-2 py-2">Asset #</th>
                  <th className="table-head text-left px-2 py-2">Name</th>
                  <th className="table-head text-left px-2 py-2">Condition</th>
                  <th className="table-head text-left px-2 py-2">Status</th>
                  <th className="table-head text-left px-2 py-2">Location</th>
                </tr>
              </thead>
              <tbody>
                {assets.map(a => (
                  <tr key={a.asset_number || a.id} className="border-b border-[#ebe8e4]">
                    <td className="table-cell px-2 py-2 font-medium"><Link href={`/operations/assets/${encodeURIComponent(a.asset_number)}`} className="hover:underline">{a.asset_number}</Link></td>
                    <td className="table-cell px-2 py-2">{a.name}</td>
                    <td className="table-cell px-2 py-2"><span className={a.condition === 'Requires Maintenance' ? 'pill-warn text-[10px]' : 'pill-good text-[10px]'}>{a.condition || 'Good'}</span></td>
                    <td className="table-cell px-2 py-2"><span className={a.status === 'Maintenance' ? 'pill-bad text-[10px]' : 'pill-good text-[10px]'}>{a.status || 'Available'}</span></td>
                    <td className="table-cell px-2 py-2">{a.location || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
