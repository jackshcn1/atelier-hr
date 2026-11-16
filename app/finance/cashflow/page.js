'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import FinanceMonthPicker, { monthFromLocation, setMonthInLocation } from '../../components/FinanceMonthPicker';

export default function CashflowPage() {
  const [transactions, setTransactions] = useState([]);
  const [totals, setTotals] = useState({ inflow: 0, outflow: 0, net: 0 });
  const [period, setPeriod] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async (target) => {
    setIsLoading(true);
    try {
      const query = target ? `?month=${encodeURIComponent(target)}` : '';
      const response = await fetch(`/api/finance/cashflow${query}`);
      const data = await response.json();
      if (data.success) {
        setTransactions(data.data.transactions);
        setTotals(data.data.totals);
        setPeriod(data.data.period);
        setMonthInLocation(data.data.period.key);
      }
    } catch (error) {
      console.error('Error fetching cashflow:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load(monthFromLocation());
  }, [load]);

  const totalInflow = totals.inflow;
  const totalOutflow = totals.outflow;
  const netCashflow = totals.net;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
        <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
          <div className="text-center py-12">
            <p className="text-[#8b6f4e] text-sm">Loading cashflow...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/finance" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
            ← Back to Finance
          </Link>
          <span className="text-[#8b6f4e] text-sm">Finance / Cashflow</span>
        </div>

        <div className="page-head mb-8 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="page-title font-serif text-4xl lg:text-5xl">Cashflow</h1>
            <p className="page-purpose text-[#6b635c] text-base lg:text-lg mt-3">
              {period
                ? `${period.label} — calendar month${period.isCurrentMonth ? `, month so far (1 – ${period.through})` : ''}`
                : 'Calendar month cash inflows and outflows'}
            </p>
          </div>
          {period && (
            <FinanceMonthPicker month={period.key} currentMonth={period.key} onChange={(key) => load(key)} />
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6">
            <p className="text-[#8b6f4e] text-sm font-medium mb-2 uppercase tracking-wide">Total Inflow</p>
            <p className="text-[#1e1812] text-3xl font-medium">₹{totalInflow.toLocaleString('en-IN')}</p>
          </div>
          <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6">
            <p className="text-[#8b6f4e] text-sm font-medium mb-2 uppercase tracking-wide">Total Outflow</p>
            <p className="text-[#1e1812] text-3xl font-medium">₹{totalOutflow.toLocaleString('en-IN')}</p>
          </div>
          <div className={`panel border border-[#ebe8e4] rounded-card shadow-sm p-6 ${netCashflow >= 0 ? 'border-[#8b6f4e]' : 'border-[#c44c4c]'}`}>
            <p className="text-[#8b6f4e] text-sm font-medium mb-2 uppercase tracking-wide">Net Cashflow</p>
            <p className={`text-3xl font-medium ${netCashflow >= 0 ? 'text-[#8b6f4e]' : 'text-[#c44c4c]'}`}>
              ₹{netCashflow.toLocaleString('en-IN')}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-medium text-[#1e1812] mb-4">
            {period ? `Transactions in ${period.label}` : 'Recent Transactions'}
          </h2>
          <div className="space-y-3">
            {transactions.length === 0 ? (
              <div className="text-center py-8 text-[#6b635c] text-sm">No cashflow transactions in this month</div>
            ) : (
              transactions.map(tx => (
                <div key={tx.id} className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-[#1e1812]">{tx.description}</span>
                    <span className={`text-sm ${tx.type === 'inflow' ? 'text-[#8b6f4e] font-medium' : 'text-[#c44c4c] font-medium'}`}>
                      {tx.type === 'inflow' ? '+' : '–'} ₹{Number(tx.amount || 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <p className="text-xs text-[#6b635c] mb-2">{tx.category || 'Uncategorized'} • {tx.date || tx.created_at}</p>
                  <div className="flex items-center gap-4 text-xs text-[#8b6f4e]">
                    <span>{tx.type === 'inflow' ? 'Inflow' : 'Outflow'}</span>
                    <span>{tx.mode || '-'}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
