'use client';
import Link from 'next/link';
export default function SalesOverviewPage() {
  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">← Home</Link>
          <span className="text-[#8b6f4e] text-sm">Module / Sales</span>
        </div>
        <div className="flex items-center gap-3 mb-6">
          <a href="/" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">← Home</a>
          <span className="text-[#8b6f4e] text-sm">Module / Sales</span>
        </div>
        <div className="page-head mb-12">
          <h1 className="page-title font-serif text-4xl lg:text-5xl">Sales</h1>
          <p className="page-purpose text-[#6b635c] text-base lg:text-lg mt-3">Daily analytics, CEO-level insights, and performance reporting</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
          <a href="/sales/analytics" className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm hover:shadow-md transition-all duration-300 block">
            <div className="panel-body p-8 lg:p-10 flex flex-col h-full">
              <h2 className="font-serif text-2xl text-[#1e1812] mb-2">Analytics</h2>
              <p className="text-[#8b6f4e] text-sm font-medium mb-3 tracking-wide uppercase">Daily Performance</p>
              <p className="text-[#6b635c] text-sm leading-relaxed mb-6">Daily sales figures, revenue trends, and source breakdown.</p>
              <span className="mt-auto text-sm font-medium text-[#8b6f4e]">Open Dashboard →</span>
            </div>
          </a>
          <a href="/sales/ceo" className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm hover:shadow-md transition-all duration-300 block">
            <div className="panel-body p-8 lg:p-10 flex flex-col h-full">
              <h2 className="font-serif text-2xl text-[#1e1812] mb-2">CEO Dashboard</h2>
              <p className="text-[#8b6f4e] text-sm font-medium mb-3 tracking-wide uppercase">Executive Insights</p>
              <p className="text-[#6b635c] text-sm leading-relaxed mb-6">High-level KPIs, trend analysis, and strategic metrics.</p>
              <span className="mt-auto text-sm font-medium text-[#8b6f4e]">View Insights →</span>
            </div>
          </a>
        </div>
      </div>
    </main>
  );
}
