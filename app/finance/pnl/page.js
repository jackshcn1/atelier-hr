'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function PnLPage() {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchPnL = async () => {
      try {
        const response = await fetch('/api/finance/pnl');
        const data = await response.json();
        if (data.success) {
          setData(data.data);
        }
      } catch (error) {
        console.error('Error fetching P&L:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPnL();
  }, []);

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

  const { revenue, total_expenses, gross_profit, operating_profit, net_profit, profit_margin } = data;
  const total_assets = revenue * 1.5; // Simplified asset calculation

  return (
    <div className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/finance" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
            ← Back to Finance
          </Link>
          <span className="text-[#8b6f4e] text-sm">Finance / P&L</span>
        </div>

        <div className="page-head mb-8">
          <h1 className="page-title font-serif text-4xl lg:text-5xl">P&L Statement</h1>
          <p className="page-purpose text-[#6b635c] text-base lg:text-lg mt-3">
            View consolidated profit and loss statements, margins, and financial health
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6">
            <p className="text-[#8b6f4e] text-sm font-medium mb-2 uppercase tracking-wide">Revenue</p>
            <p className="text-[#1e1812] text-3xl font-medium">₹{revenue.toLocaleString('en-IN')}</p>
          </div>
          <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6">
            <p className="text-[#8b6f4e] text-sm font-medium mb-2 uppercase tracking-wide">Total Expenses</p>
            <p className="text-[#1e1812] text-3xl font-medium">₹{total_expenses.toLocaleString('en-IN')}</p>
          </div>
          <div className="panel bg-white border border-[#8b6f4e] rounded-card shadow-sm p-6">
            <p className="text-[#8b6f4e] text-sm font-medium mb-2 uppercase tracking-wide">Gross Profit</p>
            <p className="text-[#1e1812] text-3xl font-medium">₹{gross_profit.toLocaleString('en-IN')}</p>
          </div>
          <div className="panel bg-white border border-[#1e1812] rounded-card shadow-sm p-6">
            <p className="text-[#1e1812] text-sm font-medium mb-2 uppercase tracking-wide">Operating Profit</p>
            <p className="text-[#1e1812] text-3xl font-medium">₹{operating_profit.toLocaleString('en-IN')}</p>
          </div>
          <div className="panel bg-white border border-[#c44c4c] rounded-card shadow-sm p-6">
            <p className="text-[#c44c4c] text-sm font-medium mb-2 uppercase tracking-wide">Net Profit</p>
            <p className="text-[#c44c4c] text-3xl font-medium">₹{net_profit.toLocaleString('en-IN')}</p>
          </div>
          <div className="panel bg-white border border-[#6b635c] rounded-card shadow-sm p-6">
            <p className="text-[#6b635c] text-sm font-medium mb-2 uppercase tracking-wide">Profit Margin</p>
            <p className="text-[#6b635c] text-2xl font-medium">{profit_margin.toFixed(1)}%</p>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-medium text-[#1e1812] mb-4">Financial Health</h2>
          <div className="flex items-center justify-between space-x-6">
            <div className="flex items-center">
              <div className="p-2 bg-[#8b6f4e] rounded-full text-white text-xs">
                Strong
              </div>
              <p className="ml-2 text-[#1e1812]">Revenue covers costs comfortably</p>
            </div>
            <div className="flex items-center">
              <div className="p-2 bg-[#c44c4c] rounded-full text-white text-xs">
                Caution
              </div>
              <p className="ml-2 text-[#c44c4c]">Operating margin below 15%</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}