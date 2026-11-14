'use client';

import { useState, useEffect } from 'react';

export default function FinanceDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [drilldown, setDrilldown] = useState(null);

  useEffect(() => {
    fetch('/api/finance/dashboard')
      .then(r => r.json())
      .then(res => {
        if (res.success) setData(res.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-sm text-[#6b635c] p-6 animate-pulse">Loading telemetry...</div>;
  if (!data) return <div className="text-sm text-red-600 p-6">Load failed.</div>;

  const isProfit = data.net_pl >= 0;
  const formatINR = (num) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num);

  const DrilldownModal = ({ title, items, onClose }) => (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6 max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h4 className="font-serif text-lg">{title}</h4>
          <button onClick={onClose} className="text-gray-500">Close</button>
        </div>
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex justify-between p-3 border-b border-[#f2efec]">
              <span className="text-sm text-[#6b635c]">{item.label}</span>
              <span className="text-sm font-semibold">{formatINR(item.amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const Meter = ({ label, actual, forecast, type }) => {
    const percentage = forecast > 0 ? Math.min((actual / forecast) * 100, 100) : 0;
    const exceeded = actual > forecast;
    const color = exceeded ? 'bg-[#b22222]' : 'bg-[#6b8e23]';
    return (
      <button 
        className="mb-4 w-full text-left hover:bg-[#faf8f6] p-2 rounded-lg transition"
        onClick={() => {
            // Mock drilldown data
            const items = type === 'revenue' 
                ? [{label: 'Today', amount: actual}, {label: 'Yesterday', amount: actual * 0.9}]
                : [{label: 'Internet Bill', amount: actual * 0.4}, {label: 'Maintenance', amount: actual * 0.6}];
            setDrilldown({ title: label, items });
        }}
      >
        <div className="flex justify-between text-xs mb-1">
          <span className="text-[#6b635c]">{label}</span>
          <span className="font-semibold text-[#1e1812]">{formatINR(actual)} / {formatINR(forecast)}</span>
        </div>
        <div className="w-full bg-[#f2efec] h-3 rounded-full overflow-hidden">
          <div className={`h-full ${color}`} style={{ width: `${percentage}%` }} />
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-6">
      {drilldown && <DrilldownModal title={drilldown.title} items={drilldown.items} onClose={() => setDrilldown(null)} />}
      
      <div className="flex justify-end">
        <div className={`px-5 py-3 rounded-xl border flex items-center gap-3 shadow-sm ${isProfit ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'}`}>
          <span className="text-xs font-medium uppercase tracking-wider">{isProfit ? 'Net Profit' : 'Net Loss'} as of Today</span>
          <span className="text-lg font-serif font-bold">
            {isProfit ? '+' : ''}{formatINR(Math.abs(data.net_pl))}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-2xl border border-[#ebe8e4] shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#f2efec]">
              <h3 className="font-serif text-xl font-medium text-[#1e1812]">Revenue Channels</h3>
              <span className="text-xs font-medium px-2.5 py-1 bg-[#f6f4f2] text-[#8b6f4e] rounded-full">Click to Drilldown</span>
            </div>
            <Meter type="revenue" label="Dine-in" actual={data.revenue.breakdown.dine_in} forecast={data.revenue.breakdown.dine_in * 1.1} />
            <Meter type="revenue" label="Pick Up" actual={data.revenue.breakdown.pick_up} forecast={data.revenue.breakdown.pick_up * 1.1} />
            <Meter type="revenue" label="Delivery" actual={data.revenue.breakdown.delivery} forecast={data.revenue.breakdown.delivery * 1.1} />
          </div>
          <div className="mt-8 pt-4 border-t border-[#ebe8e4] flex flex-col gap-2 bg-[#faf8f6] p-4 rounded-xl">
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-[#1e1812]">Total Revenue</span>
              <span className="text-lg font-serif font-bold text-emerald-800">{formatINR(data.revenue.total)}</span>
            </div>
            <div className="text-xs text-[#6b635c] text-right">
              {formatINR(1050000)} YTD / {formatINR(2500000)} Forecasted
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-[#ebe8e4] shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#f2efec]">
              <h3 className="font-serif text-xl font-medium text-[#1e1812]">Cost Breakdown</h3>
              <span className="text-xs font-medium px-2.5 py-1 bg-[#f6f4f2] text-[#8b6f4e] rounded-full">Click to Drilldown</span>
            </div>
            <Meter type="cost" label="Fixed Costs" actual={data.costs.fixed} forecast={data.costs.fixed * 1.05} />
            <Meter type="cost" label="Variable Costs" actual={data.costs.variable} forecast={data.costs.variable * 1.1} />
            <Meter type="cost" label="Petty Expenses" actual={data.costs.petty} forecast={data.costs.petty * 1.05} />
          </div>
          <div className="mt-8 pt-4 border-t border-[#ebe8e4] flex flex-col gap-2 bg-[#faf8f6] p-4 rounded-xl">
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-[#1e1812]">Total Costs</span>
              <span className="text-lg font-serif font-bold text-rose-800">{formatINR(data.costs.total)}</span>
            </div>
            <div className="text-xs text-[#6b635c] text-right">
              {formatINR(850000)} YTD / {formatINR(1800000)} Forecasted
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
