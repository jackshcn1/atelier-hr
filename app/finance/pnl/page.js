'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import FinanceMonthPicker, { monthFromLocation, setMonthInLocation } from '../../components/FinanceMonthPicker';

/**
 * The P&L statement, for a plain calendar month.
 *
 * The figures used to be placeholders — a hardcoded revenue of 50 lakh and
 * profit multipliers applied to it — so the page showed a confident profit
 * that was never measured. Everything here is now a real number:
 *
 *   gross profit     revenue - the variable costs of the month
 *   operating profit gross profit - the month's standing costs
 *   net profit       operating profit (there is no interest, depreciation or
 *                    tax in the books yet, so there is nothing between them)
 */
export default function PnLPage() {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async (target) => {
    setIsLoading(true);
    try {
      const query = target ? `?month=${encodeURIComponent(target)}` : '';
      const response = await fetch(`/api/finance/pnl${query}`);
      const payload = await response.json();
      if (payload.success) {
        setData(payload.data);
        setMonthInLocation(payload.data.period.key);
      }
    } catch (error) {
      console.error('Error fetching P&L:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load(monthFromLocation());
  }, [load]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
        <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
          <div className="text-center py-12">
            <p className="text-[#8b6f4e] text-sm">Loading P&L...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
        <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
          <div className="text-center py-12">
            <p className="text-[#8b6f4e] text-sm">No P&L data available</p>
          </div>
        </div>
      </div>
    );
  }

  const {
    revenue, revenue_synced, revenue_as_of, total_expenses, cost_of_revenue,
    operating_costs, gross_profit, operating_profit, net_profit, profit_margin, period,
  } = data;

  const isProfit = net_profit >= 0;
  // The health note used to be a fixed sentence. It now says what the month
  // actually did.
  const health = !revenue_synced
    ? { tone: 'warn', label: 'Waiting', text: 'Revenue for this month has not been pulled from Petpooja yet' }
    : isProfit
      ? { tone: 'good', label: 'In profit', text: `Revenue covers the month's costs, leaving ${profit_margin.toFixed(1)}% margin` }
      : { tone: 'bad', label: 'At a loss', text: `The month's costs are above its revenue by ${Math.abs(profit_margin).toFixed(1)}% of revenue` };

  const toneClass = {
    good: 'bg-emerald-500',
    warn: 'bg-amber-500',
    bad: 'bg-rose-600',
  }[health.tone];

  return (
    <div className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/finance" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
            ← Back to Finance
          </Link>
          <span className="text-[#8b6f4e] text-sm">Finance / P&L</span>
        </div>

        <div className="page-head mb-8 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="page-title font-serif text-4xl lg:text-5xl">P&L Statement</h1>
            <p className="page-purpose text-[#6b635c] text-base lg:text-lg mt-3">
              {period.label} — calendar month
              {period.isCurrentMonth ? `, month so far (1 – ${period.through})` : ''}
            </p>
          </div>
          <FinanceMonthPicker month={period.key} currentMonth={period.key} onChange={(key) => load(key)} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6">
            <p className="text-[#8b6f4e] text-sm font-medium mb-2 uppercase tracking-wide">Revenue</p>
            <p className="text-[#1e1812] text-3xl font-medium">₹{revenue.toLocaleString('en-IN')}</p>
            <p className="text-xs text-[#8b6f4e] mt-2">
              {revenue_synced ? `Petpooja sales to ${revenue_as_of}` : 'Not synced yet for this month'}
            </p>
          </div>
          <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6">
            <p className="text-[#8b6f4e] text-sm font-medium mb-2 uppercase tracking-wide">Total Expenses</p>
            <p className="text-[#1e1812] text-3xl font-medium">₹{total_expenses.toLocaleString('en-IN')}</p>
            <p className="text-xs text-[#8b6f4e] mt-2">
              Cost of revenue ₹{cost_of_revenue.toLocaleString('en-IN')} + operating ₹{operating_costs.toLocaleString('en-IN')}
            </p>
          </div>
          <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6">
            <p className="text-[#8b6f4e] text-sm font-medium mb-2 uppercase tracking-wide">Gross Profit</p>
            <p className="text-[#1e1812] text-3xl font-medium">₹{gross_profit.toLocaleString('en-IN')}</p>
            <p className="text-xs text-[#8b6f4e] mt-2">Revenue minus the variable costs of the month</p>
          </div>
          <div className="panel bg-white border border-[#1e1812] rounded-card shadow-sm p-6">
            <p className="text-[#1e1812] text-sm font-medium mb-2 uppercase tracking-wide">Operating Profit</p>
            <p className="text-[#1e1812] text-3xl font-medium">₹{operating_profit.toLocaleString('en-IN')}</p>
            <p className="text-xs text-[#8b6f4e] mt-2">After the month's standing costs</p>
          </div>
          <div className={`panel bg-white border rounded-card shadow-sm p-6 ${isProfit ? 'border-[#c44c4c]' : 'border-[#c44c4c]'}`}>
            <p className="text-[#c44c4c] text-sm font-medium mb-2 uppercase tracking-wide">Net Profit</p>
            <p className="text-[#1e1812] text-3xl font-medium">₹{net_profit.toLocaleString('en-IN')}</p>
            <p className="text-xs text-[#8b6f4e] mt-2">Operating profit — no interest, depreciation or tax is on the books yet</p>
          </div>
          <div className="panel bg-white border border-[#6b635c] rounded-card shadow-sm p-6">
            <p className="text-[#6b635c] text-sm font-medium mb-2 uppercase tracking-wide">Profit Margin</p>
            <p className="text-[#6b635c] text-2xl font-medium">{profit_margin.toFixed(1)}%</p>
            <p className="text-xs text-[#8b6f4e] mt-2">Net profit as a share of the month's revenue</p>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-medium text-[#1e1812] mb-4">Financial Health</h2>
          <div className="flex items-center justify-between space-x-6">
            <div className="flex items-center">
              <div className={`p-2 ${toneClass} rounded-full text-white text-xs`}>
                {health.label}
              </div>
              <p className="ml-2 text-[#1e1812]">{health.text}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
