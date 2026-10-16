'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

export default function AssetDetailPage() {
  const params = useParams();
  const assetId = params?.id || '';
  const [form, setForm] = useState({
    name: 'Chiller',
    category: 'Kitchen Equipment',
    type: 'Chiller',
    brand: 'Hoshizaki',
    model: 'FM-300U',
    serial: 'KICH00001',
    vendor: 'Thomson',
    purchaseDate: '2025-03-10',
    newOrUsed: 'Brand New',
    condition: 'Brand New',
    status: 'Available',
    location: 'Kitchen',
    assignedEmployee: '',
    warrantyMonths: 12,
    warrantyContact: '+91 98765 43210',
    extendedWarranty: false,
    extendedWarrantyMonths: 12,
    buyingPrice: '85000',
    notes: 'Main kitchen chiller — keep clean.',
  });
  const [saved, setSaved] = useState(false);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({ ...form, [name]: type === 'checkbox' ? checked : value });
  };

  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-3xl mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/operations/assets" className="btn-secondary text-xs px-3 py-1.5">← Assets</Link>
        </div>
        <div className="page-head mb-8">
          <h1 className="font-serif text-3xl text-[#1e1812]">Asset Details</h1>
          <p className="text-xs text-[#6b635c] mt-1">Locked ID: {assetId}</p>
        </div>

        <form onSubmit={e => { e.preventDefault(); setSaved(true); setTimeout(() => setSaved(false), 2500); }} className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm">
          <div className="panel-body p-6 lg:p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <label className="block">
                <span className="text-xs font-medium text-[#6b635c] mb-1 block">Asset #</span>
                <input className="field text-sm bg-[#f6f4f2] text-[#8b6f4e]" disabled value={form.serial} />
                <span className="text-xs text-[#8b6f4e] mt-1 block">Locked — cannot edit</span>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-[#6b635c] mb-1 block">Asset Name</span>
                <input name="name" value={form.name} onChange={handleChange} className="field text-sm" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-[#6b635c] mb-1 block">Brand</span>
                <input name="brand" value={form.brand} onChange={handleChange} className="field text-sm" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-[#6b635c] mb-1 block">Model</span>
                <input name="model" value={form.model} onChange={handleChange} className="field text-sm" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-[#6b635c] mb-1 block">Condition</span>
                <select name="condition" value={form.condition} onChange={handleChange} className="field text-sm bg-white">
                  <option>Brand New</option><option>Good</option><option>Requires Maintenance</option><option>Bad</option><option>Damaged/Unusable</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-[#6b635c] mb-1 block">Status</span>
                <select name="status" value={form.status} onChange={handleChange} className="field text-sm bg-white">
                  <option>Available</option><option>In-use</option><option>Employee-assigned</option><option>Maintenance</option><option>Returned</option><option>Discarded</option><option>Transferred</option><option>Sold</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-[#6b635c] mb-1 block">Location</span>
                <input name="location" value={form.location} onChange={handleChange} className="field text-sm" />
              </label>
              <label className="block md:col-span-2">
                <span className="text-xs font-medium text-[#6b635c] mb-1 block">Notes</span>
                <textarea name="notes" value={form.notes} onChange={handleChange} rows={3} className="field text-sm w-full" />
              </label>
            </div>

            <div className="flex gap-3 mt-6 pt-6 border-t border-[#ebe8e4]">
              <button type="submit" className="btn-primary text-sm px-5">Save Changes</button>
              <Link href="/operations/assets" className="btn-secondary text-sm px-5">Back</Link>
            </div>
          </div>
        </form>
        {saved && <div className="mt-3 text-sm text-green-700 font-medium">Changes saved successfully.</div>}
      </div>
    </main>
  );
}
