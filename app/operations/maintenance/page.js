'use client';
import Link from 'next/link';
export default function MaintenancePage() {
  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
        <div className="page-head mb-10">
          <h1 className="page-title font-serif text-4xl lg:text-5xl">Maintenance</h1>
          <p className="page-purpose text-[#6b635c] text-base lg:text-lg mt-3">Work orders, technician assignments, and equipment upkeep scheduling</p>
        </div>
        <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm">
          <div className="panel-body p-8 lg:p-10">
            <h3 className="font-serif text-xl mb-4">Work Orders</h3>
            <p className="text-sm text-[#6b635c] mb-6">Scheduled maintenance, repairs, and technician tracking for all registered assets.</p>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-[#ebe8e4] bg-[#faf8f6]"><th className="table-head text-left px-4 py-3 font-medium">Order</th><th className="table-head text-left px-4 py-3 font-medium">Asset</th><th className="table-head text-left px-4 py-3 font-medium">Priority</th><th className="table-head text-left px-4 py-3 font-medium">Status</th><th className="table-head text-left px-4 py-3 font-medium">Technician</th></tr></thead>
              <tbody>
                <tr className="border-b border-[#ebe8e4] hover:bg-[#faf8f6]"><td className="table-cell px-4 py-3 font-medium">WO-001</td><td className="table-cell px-4 py-3">Printer HP LaserJet (AST-003)</td><td className="table-cell px-4 py-3"><span className="pill-bad">High</span></td><td className="table-cell px-4 py-3"><span className="pill-warn">In Progress</span></td><td className="table-cell px-4 py-3">Arjun K</td></tr>
                <tr className="border-b border-[#ebe8e4] hover:bg-[#faf8f6]"><td className="table-cell px-4 py-3 font-medium">WO-002</td><td className="table-cell px-4 py-3">Projector Epson (AST-002)</td><td className="table-cell px-4 py-3"><span className="pill-quiet">Normal</span></td><td className="table-cell px-4 py-3"><span className="pill-good">Completed</span></td><td className="table-cell px-4 py-3">Suresh P</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
