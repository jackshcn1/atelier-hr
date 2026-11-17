'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { normalizePaymentStatus } from '../../../lib/expenseHelpers.js';

const FILTERS = [
  { value: 'unpaid', label: 'Not paid yet' },
  { value: 'paid', label: 'Paid' },
  { value: 'all', label: 'All bills' },
];

export default function BillsPage() {
  const [bills, setBills] = useState([]);
  const [totals, setTotals] = useState(null);
  const [filter, setFilter] = useState('unpaid');
  const [openVendor, setOpenVendor] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/finance/expenses');
      const json = await res.json();
      if (json.success) {
        setBills(json.data || []);
      } else {
        setMessage(json.error || 'Could not load the bills.');
      }
    } catch (error) {
      setMessage('Could not load the bills.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Mark a bill paid (or unpaid again).
  const setPaid = async (bill, paid) => {
    const res = await fetch(`/api/finance/expenses/${bill.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payment_status: paid ? 'paid' : 'unpaid',
        ...(paid ? { payment_date: bill.payment_date || new Date().toISOString().slice(0, 10) } : {}),
      }),
    });
    const json = await res.json();
    if (json.success) {
      setMessage(paid ? 'Bill marked paid.' : 'Bill marked unpaid.');
      load();
    } else {
      setMessage(`Could not update the bill: ${json.error}`);
    }
  };

  // The bills, grouped by supplier.
  const grouped = new Map();
  for (const bill of bills) {
    const name = (bill.vendor_name || '').trim() || 'Unknown vendor';
    const line = grouped.get(name) || { vendor: name, unpaid: 0, paid: 0, billCount: 0, unpaidCount: 0, oldestDate: null, rows: [] };
    const amount = Number(bill.amount || 0) - Number(bill.debit_note || 0);
    const isPaid = normalizePaymentStatus(bill.payment_status) === 'paid';

    line.billCount += 1;
    line.rows.push(bill);
    if (isPaid) {
      line.paid += amount;
    } else {
      line.unpaid += amount;
      line.unpaidCount += 1;
      if (bill.invoice_date && (!line.oldestDate || bill.invoice_date < line.oldestDate)) {
        line.oldestDate = bill.invoice_date;
      }
    }
    grouped.set(name, line);
  }

  const vendors = [...grouped.values()].sort((a, b) => b.unpaid - a.unpaid);

  const visible = vendors.filter((line) => {
    if (filter === 'unpaid') return line.unpaidCount > 0;
    if (filter === 'paid') return line.paid > 0;
    return true;
  });

  const grandUnpaid = vendors.reduce((sum, line) => sum + line.unpaid, 0);
  const grandPaid = vendors.reduce((sum, line) => sum + line.paid, 0);
  const unpaidCount = vendors.reduce((sum, line) => sum + line.unpaidCount, 0);

  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/finance/costs" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
            ← Back to Costs &amp; Expenses
          </Link>
          <span className="text-[#8b6f4e] text-sm">Finance / Bills</span>
        </div>

        <div className="page-head mb-10">
          <h1 className="page-title font-serif text-4xl lg:text-5xl">Bills</h1>
          <p className="page-purpose text-[#6b635c] text-base lg:text-lg mt-3">
            What the restaurant owes its suppliers. The bills come from the nightly Petpooja pull;
            a bill typed by hand sits in the same list.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6">
            <p className="text-[#8b6f4e] text-sm font-medium mb-2 uppercase tracking-wide">Still owed</p>
            <p className="text-[#1e1812] text-3xl font-medium">₹{grandUnpaid.toLocaleString('en-IN')}</p>
            <p className="text-xs text-[#6b635c] mt-1">{unpaidCount} unpaid bill(s)</p>
          </div>
          <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6">
            <p className="text-[#8b6f4e] text-sm font-medium mb-2 uppercase tracking-wide">Already paid</p>
            <p className="text-[#1e1812] text-3xl font-medium">₹{grandPaid.toLocaleString('en-IN')}</p>
            <p className="text-xs text-[#6b635c] mt-1">Marked settled</p>
          </div>
          <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6">
            <p className="text-[#8b6f4e] text-sm font-medium mb-2 uppercase tracking-wide">Suppliers owed</p>
            <p className="text-[#1e1812] text-3xl font-medium">
              {vendors.filter((v) => v.unpaidCount > 0).length}
            </p>
            <p className="text-xs text-[#6b635c] mt-1">With an open bill</p>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-6 flex-wrap">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              onClick={() => setFilter(option.value)}
              className={`px-4 py-2 rounded-control text-sm border ${
                filter === option.value
                  ? 'bg-[#1e1812] text-white border-[#1e1812]'
                  : 'bg-white border-[#ebe8e4] text-[#6b635c]'
              }`}
            >
              {option.label}
            </button>
          ))}
          <Link href="/finance/costs/entry" className="btn-primary text-sm px-4 py-2 ml-auto">
            + Log a bill
          </Link>
        </div>

        {message && <p className="mb-4 text-sm text-[#6b635c]">{message}</p>}

        {isLoading ? (
          <p className="py-12 text-center text-[#6b635c]">Loading the bills…</p>
        ) : visible.length === 0 ? (
          <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-12 text-center">
            <p className="text-[#1e1812] font-medium mb-2">Nothing here</p>
            <p className="text-sm text-[#6b635c]">
              {filter === 'unpaid'
                ? 'Every bill is paid. Nothing is outstanding.'
                : 'No bills match this filter.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((line) => {
              const isOpen = openVendor === line.vendor;
              return (
                <div key={line.vendor} className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm overflow-hidden">
                  <button
                    onClick={() => setOpenVendor(isOpen ? null : line.vendor)}
                    className="w-full flex items-center justify-between gap-4 p-5 text-left hover:bg-[#faf9f7]"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-[#1e1812] truncate">{line.vendor}</p>
                      <p className="text-xs text-[#6b635c] mt-1">
                        {line.unpaidCount} unpaid of {line.billCount} bill(s)
                        {line.oldestDate && ` · oldest ${line.oldestDate}`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {line.unpaid > 0 && (
                        <p className="font-medium text-[#c44c4c]">₹{line.unpaid.toLocaleString('en-IN')}</p>
                      )}
                      {line.paid > 0 && (
                        <p className="text-xs text-[#6b635c]">₹{line.paid.toLocaleString('en-IN')} paid</p>
                      )}
                    </div>
                  </button>

                  {isOpen && (
                    <table className="w-full text-sm border-t border-[#f0ede9]">
                      <thead>
                        <tr className="table-head">
                          <th className="table-cell text-left">Bill</th>
                          <th className="table-cell text-left">Date</th>
                          <th className="table-cell text-right">Amount</th>
                          <th className="table-cell text-right">Status</th>
                          <th className="table-cell text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {line.rows
                          .filter((bill) => {
                            const isPaid = normalizePaymentStatus(bill.payment_status) === 'paid';
                            if (filter === 'unpaid') return !isPaid;
                            if (filter === 'paid') return isPaid;
                            return true;
                          })
                          .map((bill) => {
                            const isPaid = normalizePaymentStatus(bill.payment_status) === 'paid';
                            const amount = Number(bill.amount || 0) - Number(bill.debit_note || 0);
                            return (
                              <tr key={bill.id} className="border-t border-[#f0ede9]">
                                <td className="table-cell">
                                  {bill.invoice_number || '—'}
                                  {bill.description && (
                                    <span className="block text-xs text-[#6b635c]">{bill.description}</span>
                                  )}
                                </td>
                                <td className="table-cell text-[#6b635c]">{bill.invoice_date || '—'}</td>
                                <td className="table-cell text-right font-medium">₹{amount.toLocaleString('en-IN')}</td>
                                <td className="table-cell text-right">
                                  <span className={`pill ${isPaid ? 'pill-good' : 'pill-warn'}`}>
                                    {isPaid ? 'Paid' : 'Not paid'}
                                  </span>
                                  {bill.payment_date && (
                                    <span className="block text-xs text-[#6b635c] mt-1">{bill.payment_date}</span>
                                  )}
                                </td>
                                <td className="table-cell text-right">
                                  <button
                                    onClick={() => setPaid(bill, !isPaid)}
                                    className="text-[#8b6f4e] hover:underline text-xs"
                                  >
                                    {isPaid ? 'Mark unpaid' : 'Mark paid'}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
