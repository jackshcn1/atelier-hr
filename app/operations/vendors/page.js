'use client';
import { useState } from 'react';
import Link from 'next/link';

export default function VendorsPage() {
  const [vendors, setVendors] = useState([
    { id: 1, name: 'Hoshizaki', desc: 'Kitchen cooling equipment', poc: 'John Doe', email: 'john@hoshizaki.com', phone: '9876543210' },
    { id: 2, name: 'Western', desc: 'Furniture and seating', poc: 'Jane Smith', email: 'jane@western.com', phone: '9876543211' },
    { id: 3, name: 'Local Tailor', desc: 'Staff uniforms', poc: 'Mr. Khan', email: 'khan@tailor.com', phone: '9876543212' },
  ]);

  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-6xl mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">← Home</Link>
          <span className="text-[#8b6f4e] text-sm">Operations / Vendors</span>
        </div>
        <div className="page-head mb-10">
          <h1 className="page-title font-serif text-4xl lg:text-5xl">Vendors</h1>
          <p className="page-purpose text-[#6b635c] text-base lg:text-lg mt-3">List of vendors, contact details, and purchase history.</p>
        </div>

        <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm">
          <div className="panel-body p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#ebe8e4] bg-[#faf8f6]">
                  <th className="table-head text-left px-5 py-3">Vendor Name</th>
                  <th className="table-head text-left px-5 py-3">Description</th>
                  <th className="table-head text-left px-5 py-3">POC</th>
                  <th className="table-head text-left px-5 py-3">Email</th>
                  <th className="table-head text-left px-5 py-3">Phone</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map(v => (
                  <tr key={v.id} className="border-b border-[#ebe8e4] hover:bg-[#faf8f6]">
                    <td className="table-cell px-5 py-3 font-medium">{v.name}</td>
                    <td className="table-cell px-5 py-3 text-[#6b635c]">{v.desc}</td>
                    <td className="table-cell px-5 py-3">{v.poc}</td>
                    <td className="table-cell px-5 py-3 text-[#8b6f4e]">{v.email}</td>
                    <td className="table-cell px-5 py-3 text-[#6b635c]">{v.phone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
