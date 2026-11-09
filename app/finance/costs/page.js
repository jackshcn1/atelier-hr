'use client';

import Link from 'next/link';
import FinanceDashboard from '@/app/components/FinanceDashboard';

export default function CostsExpensesPage() {
  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/finance" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
            ← Back to Finance
          </Link>
          <span className="text-[#8b6f4e] text-sm">Finance / Costs & Expenses</span>
        </div>

        <div className="page-head mb-12 flex justify-between items-center">
          <div>
            <h1 className="page-title font-serif text-4xl lg:text-5xl">Costs & Expenses</h1>
            <p className="page-purpose text-[#6b635c] text-base lg:text-lg mt-3">
              Manage operational costs, vendor bills, and budget tracking
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/finance/costs/entry" className="btn-primary text-sm px-4 py-2">
              + New Variable Cost
            </Link>
            <Link href="/finance/costs/fixed" className="btn-secondary text-sm px-4 py-2">
              Fixed Costs
            </Link>
            <Link href="/finance/costs/petty" className="btn-secondary text-sm px-4 py-2">
              Petty Expenses
            </Link>
          </div>
        </div>

        <FinanceDashboard />
      </div>
    </main>
  );
}
