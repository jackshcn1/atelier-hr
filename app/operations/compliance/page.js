'use client';
export default function CompliancePage() {
  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
        <div className="page-head mb-10">
          <h1 className="page-title font-serif text-4xl lg:text-5xl">Compliance</h1>
          <p className="page-purpose text-[#6b635c] text-base lg:text-lg mt-3">License tracking, certification expiry alerts, and inspection records</p>
        </div>
        <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm">
          <div className="panel-body p-8 lg:p-10">
            <h3 className="font-serif text-xl mb-4">Active Licenses</h3>
            <p className="text-sm text-[#6b635c] mb-6">Regulatory compliance, insurance, and facility certifications.</p>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-[#ebe8e4] bg-[#faf8f6]"><th className="table-head text-left px-4 py-3 font-medium">License</th><th className="table-head text-left px-4 py-3 font-medium">Number</th><th className="table-head text-left px-4 py-3 font-medium">Expiry</th><th className="table-head text-left px-4 py-3 font-medium">Status</th></tr></thead>
              <tbody>
                <tr className="border-b border-[#ebe8e4] hover:bg-[#faf8f6]"><td className="table-cell px-4 py-3 font-medium">Fire Safety Certificate</td><td className="table-cell px-4 py-3">FSC-2026-01</td><td className="table-cell px-4 py-3">2026-09-15</td><td className="table-cell px-4 py-3"><span className="pill-bad">Expiring Soon</span></td></tr>
                <tr className="border-b border-[#ebe8e4] hover:bg-[#faf8f6]"><td className="table-cell px-4 py-3 font-medium">Food Safety License</td><td className="table-cell px-4 py-3">FSL-0123-2024</td><td className="table-cell px-4 py-3">2027-01-30</td><td className="table-cell px-4 py-3"><span className="pill-good">Active</span></td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
