'use client';
import { useState } from 'react';
export default function AssetConfigPage() {
  const [categories, setCategories] = useState([
    'Kitchen Equipment', 'Furniture', 'Uniform', 'Electronics', 'Cleaning Supplies', 'Packaging', 'Other'
  ]);
  const [types, setTypes] = useState([
    'Chiller', 'Freezer', 'Oven', 'Grill', 'Table', 'Chair', 'Stool', 'Lamp', 'TV', 'AC', 'Uniform Top', 'Uniform Bottom'
  ]);
  const [locations, setLocations] = useState([
    'Kitchen', 'Restaurant', 'Office', 'Sales Counter', 'Employee', 'Storage', 'Outside Outlet', 'Other'
  ]);
  const [newCat, setNewCat] = useState('');
  const [newType, setNewType] = useState('');
  const [newLoc, setNewLoc] = useState('');

  const addCat = () => { if (newCat && !categories.includes(newCat)) setCategories([...categories, newCat]); setNewCat(''); };
  const addType = () => { if (newType && !types.includes(newType)) setTypes([...types, newType]); setNewType(''); };
  const addLoc = () => { if (newLoc && !locations.includes(newLoc)) setLocations([...locations, newLoc]); setNewLoc(''); };

  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-4xl mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6"><a href="/" className="btn-secondary text-xs px-3 py-1.5">← Home</a><span className="text-[#8b6f4e] text-sm">Settings / Asset Config</span></div>
        <div className="page-head mb-10"><h1 className="page-title font-serif text-4xl">Asset Config</h1><p className="page-purpose text-[#6b635c]">Configure dropdown lists for assets. Changing/removing a value that is mapped to existing assets will show warnings.</p></div>
        <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm mb-8"><div className="panel-body p-8">
          <h3 className="font-serif text-xl mb-4">Categories</h3><div className="flex gap-2 mb-4"><input className="field text-sm" placeholder="New category..." value={newCat} onChange={e=>setNewCat(e.target.value)} /><button onClick={addCat} className="btn-primary text-xs px-3">Add</button></div>
          <div className="flex flex-wrap gap-2">{categories.map(c => <span key={c} className="pill-quiet text-xs px-2 py-1">{c}</span>)}</div>
        </div></div>
        <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm mb-8"><div className="panel-body p-8">
          <h3 className="font-serif text-xl mb-4">Asset Types</h3><div className="flex gap-2 mb-4"><input className="field text-sm" placeholder="New type..." value={newType} onChange={e=>setNewType(e.target.value)} /><button onClick={addType} className="btn-primary text-xs px-3">Add</button></div>
          <div className="flex flex-wrap gap-2">{types.map(t => <span key={t} className="pill-quiet text-xs px-2 py-1">{t}</span>)}</div>
        </div></div>
        <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm"><div className="panel-body p-8">
          <h3 className="font-serif text-xl mb-4">Locations</h3><div className="flex gap-2 mb-4"><input className="field text-sm" placeholder="New location..." value={newLoc} onChange={e=>setNewLoc(e.target.value)} /><button onClick={addLoc} className="btn-primary text-xs px-3">Add</button></div>
          <div className="flex flex-wrap gap-2">{locations.map(l => <span key={l} className="pill-quiet text-xs px-2 py-1">{l}</span>)}</div>
        </div></div>
      </div>
    </main>
  );
}
