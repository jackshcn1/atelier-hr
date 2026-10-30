'use client';

import Link from 'next/link';

export default function FinanceOverviewPage() {
  const financeModules = [
    {
      title: 'Costs & Expenses',
      subtitle: 'Cost Tracking',
      description: 'Monitor operational expenses, vendor bills, and departmental budgets.',
      href: '/finance/costs',
    },
    {
      title: 'Cashflow',
      subtitle: 'Liquidity & Inflows',
      description: 'Track daily cash inflows, outflows, working capital, and projections.',
      href: '/finance/cashflow',
    },
    {
      title: 'P&L Statement',
      subtitle: 'Profitability',
      description: 'View consolidated profit and loss statements, margins, and financial health.',
      href: '/finance/pnl',
    },
  ];

  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
            ← Home
          </Link>
          <span className="text-[#8b6f4e] text-sm">Module / Finance</span>
        </div>

        <div className="page-head mb-12">
          <h1 className="page-title font-serif text-4xl lg:text-5xl">Finance</h1>
          <p className="page-purpose text-[#6b635c] text-base lg:text-lg mt-3">
            Financial management, cost tracking, cashflow, and P&L analytics
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {financeModules.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm hover:shadow-md transition-all duration-300 block hover:-translate-y-0.5"
            >
              <div className="panel-body p-8 lg:p-10 flex flex-col h-full">
                <h2 className="font-serif text-2xl text-[#1e1812] mb-2">{item.title}</h2>
                <p className="text-[#8b6f4e] text-sm font-medium mb-3 tracking-wide uppercase">
                  {item.subtitle}
                </p>
                <p className="text-[#6b635c] text-sm leading-relaxed mb-6">
                  {item.description}
                </p>
                <span className="mt-auto text-sm font-medium text-[#8b6f4e] inline-flex items-center gap-1">
                  Open Sub-module →
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
