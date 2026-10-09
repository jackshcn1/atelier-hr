'use client';
import Link from 'next/link';
export default function SalesAnalyticsPage() {
  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <a href="/" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">← Home</a>
          <span className="text-[#8b6f4e] text-sm">Module / Sales / Analytics</span>
        </div>
        <div className="page-head mb-10">
          <h1 className="page-title font-serif text-4xl lg:text-5xl">Sales Analytics</h1>
          <p className="page-purpose text-[#6b635c] text-base lg:text-lg mt-3">Daily figures, revenue trends, and source breakdowns</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 mb-10">
          {[
            { label: 'Today Revenue', value: '₹2,84,500', change: '+12.3%' },
            { label: 'Weekly Average', value: '₹2.1L', change: '+8.1%' },
            { label: 'Top Source', value: 'Online Orders', change: '42%' },
          ].map((k) => (
            <div key={k.label} className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-8 lg:p-10">
              <p className="text-sm text-[#6b635c] mb-1">{k.label}</p>
              <p className="font-serif text-3xl lg:text-4xl text-[#1e1812] mb-2">{k.value}</p>
              <p className="text-sm font-medium text-[#6b4423]">{k.change}</p>
            </div>
          ))}
        </div>
        <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm">
          <div className="panel-body p-8 lg:p-10">
            <h3 className="font-serif text-xl mb-4">Daily Data</h3>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-[#ebe8e4] bg-[#faf8f6]"><th className="table-head text-left px-4 py-3 font-medium">Date</th><th className="table-head text-left px-4 py-3 font-medium">Amount</th><th className="table-head text-left px-4 py-3 font-medium">Source</th><th className="table-head text-left px-4 py-3 font-medium">Product</th></tr></thead>
              <tbody>
                <tr className="border-b border-[#ebe8e4] hover:bg-[#faf8f6]"><td className="table-cell px-4 py-3">2026-10-08</td><td className="table-cell px-4 py-3">₹84,500</td><td className="table-cell px-4 py-3">Online</td><td className="table-cell px-4 py-3">Item-A</td></tr>
                <tr className="border-b border-[#ebe8e4] hover:bg-[#faf8f6]"><td className="table-cell px-4 py-3">2026-10-07</td><td className="table-cell px-4 py-3">₹1,10,000</td><td className="table-cell px-4 py-3">Retail</td><td className="table-cell px-4 py-3">Item-B</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
