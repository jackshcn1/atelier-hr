'use client';
import { useState, useEffect } from 'react';
import { createClient } from '../../lib/supabaseClient';

export default function MarketingPage() {
  const supabase = createClient();
  const [campaigns, setCampaigns] = useState([]);
  const [spends, setSpends] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const { data: c } = await supabase.from('marketing_spend').select('*').order('id', { ascending: false });
        setSpends(c || []);
        const { data: listings } = await supabase.from('job_listings').select('id, serial, designation, status').limit(20);
        const withSpend = (listings || []).map(l => {
          const s = (c || []).filter(x => x.job_listing_id === l.id);
          const total = s.reduce((a, b) => a + Number(b.amount || 0), 0);
          return { ...l, totalSpend: total, entries: s.length };
        });
        setCampaigns(withSpend);
      } catch (e) { console.error(e); }
    })();
  }, []);

  const totalAll = spends.reduce((a, b) => a + Number(b.amount || 0), 0);

  return (
    <div className="pb-20 max-w-5xl mx-auto px-6">
      <div className="page-head">
        <h1 className="page-title">Marketing — Recruitment Spend</h1>
        <p className="page-purpose">Track manual advertising spend by job listing. Aggregate by platform. See cost per hire in HRMS.</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="panel p-4"><div className="text-2xs uppercase font-medium text-ink-muted">Total Ad Spend (All)</div><div className="text-2xl font-serif mt-1">₹{totalAll.toLocaleString('en-IN')}</div></div>
        <div className="panel p-4"><div className="text-2xs uppercase font-medium text-ink-muted">Campaigns Tracked</div><div className="text-2xl font-serif mt-1">{campaigns.length}</div></div>
        <div className="panel p-4"><div className="text-2xs uppercase font-medium text-ink-muted">Entries</div><div className="text-2xl font-serif mt-1">{spends.length}</div></div>
      </div>

      <div className="panel overflow-hidden">
        <div className="p-4 border-b border-rule bg-page/40 font-serif text-lg">Campaigns by Job Listing</div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead><tr className="border-b border-rule bg-page/50"><th className="table-head">Serial</th><th className="table-head">Designation</th><th className="table-head">Status</th><th className="table-head">Entries</th><th className="table-head">Total Spend</th></tr></thead>
            <tbody className="divide-y divide-rule-soft">
              {campaigns.map(c => (
                <tr key={c.id} className="hover:bg-page/40">
                  <td className="table-cell font-mono">{c.serial}</td>
                  <td className="table-cell font-semibold">{c.designation}</td>
                  <td className="table-cell"><span className={c.status === 'filled' ? 'pill-good text-2xs' : 'pill-warn text-2xs'}>{c.status}</span></td>
                  <td className="table-cell">{c.entries}</td>
                  <td className="table-cell font-semibold">₹{c.totalSpend.toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
