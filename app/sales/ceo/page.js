'use client';
export default function CEOPage() {
  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
        <div className="page-head mb-10">
          <h1 className="page-title font-serif text-4xl lg:text-5xl">CEO Dashboard</h1>
          <p className="page-purpose text-[#6b635c] text-base lg:text-lg mt-3">Executive-level KPIs, strategic trends, and organizational performance</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8 mb-10">
          {[
            { label: 'Revenue (MTD)', value: '₹8.42L', change: '+14%' },
            { label: 'Avg Sale Value', value: '₹3,850', change: '+6.2%' },
            { label: 'Employee Productivity', value: '92%', change: 'Stable' },
            { label: 'New Customers', value: '42', change: '+12%' },
          ].map((k) => (
            <div key={k.label} className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6 lg:p-8">
              <p className="text-xs uppercase tracking-wider text-[#8b6f4e] font-medium mb-3">{k.label}</p>
              <p className="font-serif text-3xl text-[#1e1812] mb-2">{k.value}</p>
              <p className="text-sm font-medium text-[#6b4423]">{k.change} this month</p>
            </div>
          ))}
        </div>
        <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm">
          <div className="panel-body p-8 lg:p-10">
            <h3 className="font-serif text-xl mb-4">Strategic Insights</h3>
            <ul className="space-y-3 text-sm text-[#4a3f35]">
              <li>• Sales growth is accelerating in the final quarter; focus on retention.</li>
              <li>• Operations asset utilization is at 92% — consider capacity planning.</li>
              <li>• Compliance renewals are clustered in Q2; schedule in advance.</li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
