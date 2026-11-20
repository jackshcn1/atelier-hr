'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

// The petty cash float.
//
// One form with two kinds of entry:
//
//   Cash entry  money loaded into the float — it goes up
//   Expense     money spent out of the float — it comes down
//
// The balance is the running difference between the two, and it is the money
// actually in the drawer. An expense over the balance shows red: the float
// has been overdrawn and needs a top-up.

const EXPENSE_CATEGORIES = [
  'Groceries',
  'Cleaning & supplies',
  'Petty repairs',
  'Transport / delivery',
  'Ice & gas',
  'Packaging',
  'Staff meal',
  'Other',
];

const CASH_SOURCES = [
  'From the till',
  'Bank withdrawal',
  'Owner top-up',
  'Cash collected',
];

const PAYMENT_METHODS = ['Cash', 'UPI', 'Card', 'Bank transfer'];

export default function PettyCashPage() {
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState('expense');
  const [message, setMessage] = useState('');

  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]);
  const [source, setSource] = useState(CASH_SOURCES[0]);
  const [reference, setReference] = useState('');

  useEffect(() => {
    fetchLedger();
  }, []);

  async function fetchLedger() {
    try {
      const res = await fetch('/api/finance/petty-cash');
      const json = await res.json();
      if (json.success) setLedger(json.data);
    } catch (error) {
      setMessage('Could not load the petty cash ledger.');
    } finally {
      setLoading(false);
    }
  }

  // The balance is the running difference: money in minus money out.
  const balance = ledger.reduce(
    (acc, row) => (row.type === 'deposit' ? acc + Number(row.amount || 0) : acc - Number(row.amount || 0)),
    0
  );

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage('');

    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setMessage('Give an amount above zero.');
      return;
    }
    if (kind === 'expense' && !vendorName.trim()) {
      setMessage('Say who it was paid to.');
      return;
    }

    const body = kind === 'deposit'
      ? {
          type: 'deposit',
          amount: value,
          date,
          description: description.trim() || 'Cash loaded into petty cash',
          payment_method: source,
        }
      : {
          type: 'expense',
          amount: value,
          date,
          description: description.trim() || null,
          vendor_name: vendorName.trim(),
          category,
          payment_method: paymentMethod,
          reference: reference.trim() || null,
        };

    try {
      const res = await fetch('/api/finance/petty-cash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();

      if (!json.success) {
        setMessage(`Could not save: ${json.error}`);
        return;
      }

      setAmount('');
      setDescription('');
      setVendorName('');
      setReference('');
      setMessage(kind === 'deposit' ? 'Cash loaded into petty cash.' : 'Expense recorded — it comes off the float.');
      fetchLedger();
    } catch (error) {
      setMessage('Could not save the entry.');
    }
  }

  function printChellan(item) {
    const win = window.open('', '_blank');
    win.document.write(`
      <html>
        <head>
          <title>PETTY CASH CHELLAN</title>
          <style>
            body { font-family: monospace; padding: 20px; max-width: 400px; border: 1px solid #000; margin: auto; }
            h2 { text-align: center; margin-bottom: 20px; }
            .row { display: flex; justify-content: space-between; margin-bottom: 10px; }
            .sig { margin-top: 50px; display: flex; justify-content: space-between; }
          </style>
        </head>
        <body>
          <h2>ATELIER - PETTY CASH CHELLAN</h2>
          <div class="row"><span>Date:</span> <span>${item.date}</span></div>
          <div class="row"><span>Voucher ID:</span> <span>${item.id.slice(0, 8)}</span></div>
          <div class="row"><span>Paid To:</span> <span>${item.vendor_name || 'N/A'}</span></div>
          <div class="row"><span>Amount:</span> <span>₹${item.amount}</span></div>
          <div class="row"><span>Mode:</span> <span>${item.payment_method || 'N/A'}</span></div>
          <div class="row"><span>Description:</span> <span>${item.description || 'N/A'}</span></div>
          <div class="sig">
            <div>_________________<br/>Cashier Signature</div>
            <div>_________________<br/>Receiver Signature</div>
          </div>
          <script>window.print();</script>
        </body>
      </html>
    `);
  }

  const isCashEntry = kind === 'deposit';

  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/finance/invoice-entry" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
            ← Back to Invoice Entry
          </Link>
          <span className="text-[#8b6f4e] text-sm">Finance / Petty Cash</span>
        </div>

        <div className="page-head mb-8">
          <h1 className="page-title font-serif text-4xl lg:text-5xl">Petty Cash</h1>
          <p className="page-purpose text-[#6b635c] text-base lg:text-lg mt-3">
            The cash float. A cash entry loads money into it; an expense takes money out of it.
            The balance is what is actually in the drawer.
          </p>
        </div>

        <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6 mb-8">
          <p className="text-[#8b6f4e] text-sm font-medium mb-2 uppercase tracking-wide">Balance in the float</p>
          <p className={`font-serif text-4xl ${balance < 0 ? 'text-rose-700' : 'text-[#1e1812]'}`}>
            ₹{balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
          {balance < 0 && (
            <p className="text-sm text-rose-700 mt-2">
              The float has been overdrawn — it needs a cash entry to cover the difference.
            </p>
          )}
        </div>

        <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6 lg:p-8 mb-8 max-w-2xl">
          <div className="panel-body">
            <div className="flex gap-2 mb-8">
              <button
                type="button"
                onClick={() => setKind('deposit')}
                className={`px-5 py-2.5 rounded-control text-sm border ${
                  isCashEntry ? 'bg-[#1e1812] text-white border-[#1e1812]' : 'border-[#ebe8e4] text-[#6b635c]'
                }`}
              >
                Cash entry
              </button>
              <button
                type="button"
                onClick={() => setKind('expense')}
                className={`px-5 py-2.5 rounded-control text-sm border ${
                  !isCashEntry ? 'bg-[#1e1812] text-white border-[#1e1812]' : 'border-[#ebe8e4] text-[#6b635c]'
                }`}
              >
                Expense
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="field">
                  <label className="field-label block text-sm font-medium mb-2">Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    required
                    className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus:border-[#8b6f4e]"
                  />
                </div>

                <div className="field">
                  <label className="field-label block text-sm font-medium mb-2">Date</label>
                  <input
                    type="date"
                    value={date}
                    max={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus:border-[#8b6f4e]"
                  />
                </div>

                {isCashEntry ? (
                  <>
                    <div className="field">
                      <label className="field-label block text-sm font-medium mb-2">Money came from</label>
                      <select
                        value={source}
                        onChange={(e) => setSource(e.target.value)}
                        className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus:border-[#8b6f4e]"
                      >
                        {CASH_SOURCES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field md:col-span-2">
                      <label className="field-label block text-sm font-medium mb-2">Note</label>
                      <input
                        type="text"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="e.g. Monday float for the kitchen"
                        className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus:border-[#8b6f4e]"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="field">
                      <label className="field-label block text-sm font-medium mb-2">Paid to</label>
                      <input
                        type="text"
                        value={vendorName}
                        onChange={(e) => setVendorName(e.target.value)}
                        placeholder="Who was paid"
                        required
                        className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus:border-[#8b6f4e]"
                      />
                    </div>
                    <div className="field">
                      <label className="field-label block text-sm font-medium mb-2">Category</label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus:border-[#8b6f4e]"
                      >
                        {EXPENSE_CATEGORIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label className="field-label block text-sm font-medium mb-2">Paid by</label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus:border-[#8b6f4e]"
                      >
                        {PAYMENT_METHODS.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label className="field-label block text-sm font-medium mb-2">Receipt / reference</label>
                      <input
                        type="text"
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        placeholder="Bill number or receipt"
                        className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus:border-[#8b6f4e]"
                      />
                    </div>
                    <div className="field md:col-span-2">
                      <label className="field-label block text-sm font-medium mb-2">What it was for</label>
                      <input
                        type="text"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="e.g. Two bags of ice for the weekend"
                        className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus:border-[#8b6f4e]"
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="flex gap-4 pt-2">
                <button type="submit" className="btn-primary px-6 py-3">
                  {isCashEntry ? 'Load cash' : 'Record expense'}
                </button>
              </div>

              {message && (
                <p className="text-sm text-[#6b635c]">{message}</p>
              )}
            </form>
          </div>
        </div>

        <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm overflow-hidden">
          <h2 className="text-lg font-medium text-[#1e1812] p-6 pb-4">The ledger</h2>
          {loading ? (
            <p className="p-6 pt-0 text-[#6b635c]">Loading…</p>
          ) : ledger.length === 0 ? (
            <p className="p-6 pt-0 text-[#6b635c]">
              Nothing recorded yet. A cash entry loads the float to begin with.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="table-head">
                  <th className="table-cell text-left">Date</th>
                  <th className="table-cell text-left">Entry</th>
                  <th className="table-cell text-left">Details</th>
                  <th className="table-cell text-right">In</th>
                  <th className="table-cell text-right">Out</th>
                  <th className="table-cell text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((item) => {
                  const isDeposit = item.type === 'deposit';
                  return (
                    <tr key={item.id} className="border-t border-[#f0ede9]">
                      <td className="table-cell text-[#6b635c] whitespace-nowrap">{item.date}</td>
                      <td className="table-cell">
                        <span className={`pill ${isDeposit ? 'pill-good' : 'pill-warn'}`}>
                          {isDeposit ? 'Cash entry' : 'Expense'}
                        </span>
                      </td>
                      <td className="table-cell">
                        <span className="font-medium">{item.vendor_name || item.description || '—'}</span>
                        {isDeposit && item.description && item.vendor_name && (
                          <span className="block text-xs text-[#6b635c]">{item.description}</span>
                        )}
                        {item.payment_method && (
                          <span className="block text-xs text-[#6b635c]">{item.payment_method}</span>
                        )}
                      </td>
                      <td className="table-cell text-right text-emerald-700 whitespace-nowrap">
                        {isDeposit ? `₹${Number(item.amount).toLocaleString('en-IN')}` : ''}
                      </td>
                      <td className="table-cell text-right text-rose-700 whitespace-nowrap">
                        {!isDeposit ? `₹${Number(item.amount).toLocaleString('en-IN')}` : ''}
                      </td>
                      <td className="table-cell text-right">
                        {!isDeposit && (
                          <button onClick={() => printChellan(item)} className="text-[#8b6f4e] hover:underline text-xs">
                            Print chellan
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}
