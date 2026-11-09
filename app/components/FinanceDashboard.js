'use client';

import { useState, useEffect } from 'react';

export default function FinanceDashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    // Mocking forecast data for now as per instructions (needs build)
    setData({
      forecast: { revenue: 600000, fixed: 50000, variable: 100000, petty: 20000 },
      actuals: { revenue: 120000, fixed: 45000, variable: 80000, petty: 15000 }
    });
  }, []);

  if (!data) return <div>Loading dashboard...</div>;

  const Meter = ({ label, actual, forecast }) => {
    const percentage = Math.min((actual / forecast) * 100, 100);
    const exceeded = actual > forecast;
    return (
      <div className="mb-4">
        <div className="flex justify-between text-xs mb-1">
          <span>{label}</span>
          <span className="font-semibold">₹{actual.toLocaleString()} / ₹{forecast.toLocaleString()}</span>
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
        <h3 className="font-serif text-lg mb-4">Forecast vs Actuals</h3>
        <Meter label="Revenue" actual={data.actuals.revenue} forecast={data.forecast.revenue} />
        <Meter label="Fixed Costs" actual={data.actuals.fixed} forecast={data.forecast.fixed} />
        <Meter label="Variable Costs" actual={data.actuals.variable} forecast={data.forecast.variable} />
        <Meter label="Petty Expenses" actual={data.actuals.petty} forecast={data.forecast.petty} />
      </div>
    </div>
  );
}
