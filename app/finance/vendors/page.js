'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

const BLANK = {
  name: '',
  contact_person: '',
  phone: '',
  email: '',
  website: '',
  description: '',
};

export default function VendorsPage() {
  const [vendors, setVendors] = useState([]);
  const [notOnList, setNotOnList] = useState([]);
  const [totals, setTotals] = useState({ vendorCount: 0, unpaid: 0 });
  const [form, setForm] = useState(BLANK);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/finance/vendors');
      const json = await res.json();
      if (json.success) {
        setVendors(json.data);
        setNotOnList(json.notOnList || []);
        setTotals(json.totals || { vendorCount: 0, unpaid: 0 });
      }
    } catch (error) {
      setMessage('Could not load the supplier list.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    setIsSaving(true);
    setMessage('');

    try {
      const res = await fetch('/api/finance/vendors', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? { id: editing, ...form } : form),
      });
      const json = await res.json();

      if (json.success) {
        setMessage(editing ? 'Supplier updated.' : 'Supplier added.');
        setForm(BLANK);
        setEditing(null);
        load();
      } else {
        setMessage(`Could not save: ${json.error}`);
      }
    } catch (error) {
      setMessage('Could not save the supplier.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (vendor) => {
    if (!confirm(`Remove ${vendor.name} from the supplier list?\n\nThe bills already recorded against them are not touched.`)) return;

    const res = await fetch(`/api/finance/vendors?id=${vendor.id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      setMessage('Supplier removed.');
      load();
    } else {
      setMessage(`Could not remove: ${json.error}`);
    }
  };

  const startEdit = (vendor) => {
    setEditing(vendor.id);
    setForm({
      name: vendor.name || '',
      contact_person: vendor.contact_person || '',
      phone: vendor.phone || '',
      email: vendor.email || '',
      website: vendor.website || '',
      description: vendor.description || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const shown = vendors.filter((vendor) =>
    search ? vendor.name.toLowerCase().includes(search.toLowerCase()) : true
  );

  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/finance/costs" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
            ← Back to Costs &amp; Expenses
          </Link>
          <span className="text-[#8b6f4e] text-sm">Finance / Suppliers</span>
        </div>

        <div className="page-head mb-10">
          <h1 className="page-title font-serif text-4xl lg:text-5xl">Suppliers</h1>
          <p className="page-purpose text-[#6b635c] text-base lg:text-lg mt-3">
            Who the restaurant buys from, and what is still owed to each of them.
            The list fills itself from the bills — a new supplier appears the morning after its first bill.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6">
            <p className="text-[#8b6f4e] text-sm font-medium mb-2 uppercase tracking-wide">Suppliers</p>
            <p className="text-[#1e1812] text-3xl font-medium">{totals.vendorCount}</p>
          </div>
          <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6">
            <p className="text-[#8b6f4e] text-sm font-medium mb-2 uppercase tracking-wide">Still owed</p>
            <p className="text-[#1e1812] text-3xl font-medium">₹{Number(totals.unpaid || 0).toLocaleString('en-IN')}</p>
            <p className="text-xs text-[#6b635c] mt-1">Across every unpaid bill</p>
          </div>
          <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6">
            <p className="text-[#8b6f4e] text-sm font-medium mb-2 uppercase tracking-wide">Bills owed</p>
            <Link href="/finance/bills" className="text-[#1e1812] text-3xl font-medium hover:underline">See the list →</Link>
            <p className="text-xs text-[#6b635c] mt-1">What the restaurant owes, bill by bill</p>
          </div>
        </div>

        {notOnList.length > 0 && (
          <div className="panel bg-amber-50 border border-amber-200 rounded-card p-5 mb-10">
            <p className="font-medium text-amber-900 mb-1">
              {notOnList.length} supplier{notOnList.length === 1 ? '' : 's'} on the bills but not on the list
            </p>
            <p className="text-sm text-amber-800 mb-3">
              These name a supplier on a bill but are missing from the list, so they cannot be picked when a bill is typed by hand.
            </p>
            <div className="flex flex-wrap gap-2">
              {notOnList.map((name) => (
                <button
                  key={name}
                  onClick={() => {
                    setForm({ ...BLANK, name });
                    setEditing(null);
                  }}
                  className="btn-secondary text-xs px-3 py-1.5"
                >
                  + {name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6 mb-10">
          <h2 className="text-lg font-medium text-[#1e1812] mb-4">
            {editing ? 'Edit supplier' : 'Add a supplier'}
          </h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="field-label block text-xs font-semibold mb-1">Name</label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                required
                placeholder="e.g. Ambrosia - The Classic Bakehouse"
                className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus:border-[#8b6f4e]"
              />
            </div>
            <div>
              <label className="field-label block text-xs font-semibold mb-1">Contact Person</label>
              <input
                type="text"
                name="contact_person"
                value={form.contact_person}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus:border-[#8b6f4e]"
              />
            </div>
            <div>
              <label className="field-label block text-xs font-semibold mb-1">Phone</label>
              <input
                type="text"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus:border-[#8b6f4e]"
              />
            </div>
            <div>
              <label className="field-label block text-xs font-semibold mb-1">Email</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus:border-[#8b6f4e]"
              />
            </div>
            <div>
              <label className="field-label block text-xs font-semibold mb-1">What they supply</label>
              <input
                type="text"
                name="description"
                value={form.description}
                onChange={handleChange}
                placeholder="e.g. Bakery goods"
                className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus:border-[#8b6f4e]"
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={isSaving} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
                {isSaving ? 'Saving...' : editing ? 'Save changes' : 'Add supplier'}
              </button>
              {editing && (
                <button type="button" onClick={() => { setEditing(null); setForm(BLANK); }} className="btn-secondary px-4 py-2 text-sm">
                  Cancel
                </button>
              )}
            </div>
          </form>
          {message && <p className="mt-4 text-sm text-[#6b635c]">{message}</p>}
        </div>

        <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-4 p-5 border-b border-[#f0ede9]">
            <h2 className="text-lg font-medium text-[#1e1812]">Supplier list</h2>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a supplier"
              className="px-3 py-2 border border-[#ebe8e4] rounded-control text-sm focus:outline-none focus:border-[#8b6f4e]"
            />
          </div>

          {shown.length === 0 ? (
            <p className="p-8 text-center text-[#6b635c]">No suppliers yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="table-head">
                  <th className="table-cell text-left">Supplier</th>
                  <th className="table-cell text-left">Contact</th>
                  <th className="table-cell text-right">Bills</th>
                  <th className="table-cell text-right">Owed</th>
                  <th className="table-cell text-right">Paid</th>
                  <th className="table-cell text-right">Last bill</th>
                  <th className="table-cell text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((vendor) => (
                  <tr key={vendor.id} className="border-t border-[#f0ede9]">
                    <td className="table-cell">
                      <span className="font-medium">{vendor.name}</span>
                      {vendor.description && (
                        <span className="block text-xs text-[#6b635c]">{vendor.description}</span>
                      )}
                    </td>
                    <td className="table-cell text-[#6b635c]">
                      {vendor.contact_person || '—'}
                      {vendor.phone && <span className="block text-xs">{vendor.phone}</span>}
                    </td>
                    <td className="table-cell text-right">{vendor.bills.billCount}</td>
                    <td className={`table-cell text-right font-medium ${vendor.bills.unpaid > 0 ? 'text-[#c44c4c]' : 'text-[#6b635c]'}`}>
                      {vendor.bills.unpaid > 0 ? `₹${vendor.bills.unpaid.toLocaleString('en-IN')}` : '—'}
                    </td>
                    <td className="table-cell text-right text-[#6b635c]">
                      {vendor.bills.paid > 0 ? `₹${vendor.bills.paid.toLocaleString('en-IN')}` : '—'}
                    </td>
                    <td className="table-cell text-right text-[#6b635c]">
                      {vendor.bills.lastBillDate || '—'}
                    </td>
                    <td className="table-cell text-right whitespace-nowrap">
                      <button onClick={() => startEdit(vendor)} className="text-[#8b6f4e] hover:underline text-xs mr-3">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(vendor)} className="text-red-600 hover:underline text-xs">
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}
