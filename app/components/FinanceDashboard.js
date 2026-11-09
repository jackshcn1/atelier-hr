'use client';

import { useState, useEffect } from 'react';

export default function FinanceDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/finance/dashboard')
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          setData(res.data);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-sm text-[#6b635c] p-6">Calculating live financial metrics & 6-month averages...</div>;
  if (!data) return <div className="text-sm text-red-600 p-6">Failed to load dashboard metrics.</div>;

  const Meter = ({ label, actual, forecast }) => {
    const percentage = forecast > 0 ? Math.min((actual / forecast) * 100, 100) : 0;
    const exceeded = actual > forecast;
    return (
      <div className="mb-4">
        <div className="flex justify-between text-xs mb-1">
          <span>{label}</span>
          <span className="font-semibold">₹{Number(actual).toLocaleString()} / ₹{Number(forecast).toLocaleString()}</span>
        </div>
        <div className="w-full bg-gray-200 h-4 rounded overflow-hidden">
          <div
            className={`h-full ${exceeded ? 'bg-red-500' : 'bg-green-600'}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      <div className="panel bg-white p-6 border rounded-card shadow-sm">
        <h3 className="font-serif text-lg mb-4">Live Actuals vs 6-Mo Historical Forecast</h3>
        <Meter label="Revenue" actual={data.actuals.revenue} forecast={data.forecast.revenue} />
        <Meter label="Fixed Costs" actual={data.actuals.fixed} forecast={data.forecast.fixed} />
        <Meter label="Variable Costs" actual={data.actuals.variable} forecast={data.forecast.variable} />
        <Meter label="Petty Expenses" actual={data.actuals.petty} forecast={data.forecast.petty} />
      </div>
    </div>
  );
}
