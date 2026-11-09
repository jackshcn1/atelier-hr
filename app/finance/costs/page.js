'use client';

import Link from 'next/link';

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

        <div className="page-head mb-12">
          <h1 className="page-title font-serif text-4xl lg:text-5xl">Costs & Expenses</h1>
          <p className="page-purpose text-[#6b635c] text-base lg:text-lg mt-3">
            Manage operational costs, vendor bills, and budget tracking
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link href="/finance/costs/entry" className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-8 hover:shadow-md transition-all">
            <h2 className="font-serif text-2xl mb-2">Manual Entry</h2>
            <p className="text-[#6b635c] text-sm">Log new expenses and vendor invoices</p>
          </Link>
          <Link href="/finance/costs/review" className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-8 hover:shadow-md transition-all">
            <h2 className="font-serif text-2xl mb-2">Review Dashboard</h2>
            <p className="text-[#6b635c] text-sm">Approve or reject pending expenses</p>
          </Link>
        </div>
      </div>
    </main>
  );
}
