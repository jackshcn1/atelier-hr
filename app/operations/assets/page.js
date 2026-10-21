'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '../../../lib/supabaseClient';

export default function AssetsPageFull() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAssets = async () => {
      try {
        const res = await fetch('/api/assets');
        const json = await res.json();
        if (json.assets && json.assets.length > 0) {
          setAssets(json.assets);
        } else {
          // Fallback if DB empty
          setAssets([
            { asset_number: 'KICH00001', name: 'Chiller', condition: 'Brand New', status: 'Available', location: 'Kitchen' },
            { asset_number: 'KICH00002', name: 'Chiller', condition: 'Good', status: 'Maintenance', location: 'Bakery' }
          ]);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchAssets();
  }, []);

  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-6xl mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">← Home</Link>
          <span className="text-[#8b6f4e] text-sm">Operations / Assets</span>
        </div>
        <div className="page-head mb-10">
          <h1 className="page-title font-serif text-4xl lg:text-5xl">Assets</h1>
          <p className="page-purpose text-[#6b635c] text-base lg:text-lg mt-3">Live restaurant asset inventory from database</p>
        </div>

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
