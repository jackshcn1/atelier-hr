'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function PettyCashPage() {
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddMoney, setShowAddMoney] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);

  // Form states
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [vendorName, setVendorName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    fetchLedger();
  }, []);

  async function fetchLedger() {
    const res = await fetch('/api/finance/petty-cash');
    const json = await res.json();
    if (json.success) setLedger(json.data);
    setLoading(false);
  }

  const balance = ledger.reduce((acc, curr) => {
    return curr.type === 'deposit' ? acc + parseFloat(curr.amount) : acc - parseFloat(curr.amount);
  }, 0);

  async function handleDeposit(e) {
    e.preventDefault();
    const res = await fetch('/api/finance/petty-cash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'deposit',
        amount: parseFloat(amount),
        payment_method: paymentMethod,
        date,
        description
      })
    });
    const json = await res.json();
    if (json.success) {
      setShowAddMoney(false);
      resetForm();
      fetchLedger();
    }
  }

  async function handleExpense(e) {
    e.preventDefault();
    const res = await fetch('/api/finance/petty-cash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'expense',
        amount: parseFloat(amount),
        vendor_name: vendorName,
        payment_method: paymentMethod,
        date,
        description
      })
    });
    const json = await res.json();
    if (json.success) {
      setShowAddExpense(false);
      resetForm();
      fetchLedger();
    }
  }

  function resetForm() {
    setAmount('');
    setVendorName('');
    setDescription('');
    setDate(new Date().toISOString().split('T')[0]);
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
          <div class="row"><span>Voucher ID:</span> <span>${item.id.slice(0,8)}</span></div>
          <div class="row"><span>Paid To:</span> <span>${item.vendor_name || 'N/A'}</span></div>
          <div class="row"><span>Amount:</span> <span>₹${item.amount}</span></div>
          <div class="row"><span>Mode:</span> <span>${item.payment_method}</span></div>
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

  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812] p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/finance/costs" className="btn-secondary text-xs px-3 py-1.5">← Back to Costs</Link>
          <span className="text-[#8b6f4e] text-sm">Finance / Petty Cash Ledger</span>
        </div>

        <div className="flex justify-between items-center mb-6">
          <h1 className="font-serif text-3xl">Petty Cash Ledger</h1>
          <div className="flex gap-2">
            <button onClick={() => setShowAddMoney(true)} className="btn-primary text-sm px-4 py-2">Add Money</button>
            <button onClick={() => setShowAddExpense(true)} className="btn-secondary text-sm px-4 py-2">Add Expense</button>
          </div>
        </div>

        <div className="panel bg-white p-6 rounded-card border mb-8 flex justify-between items-center">
          <div>
            <span className="text-xs text-[#8b6f4e] uppercase font-semibold">Current Petty Cash Balance</span>
            <div className={`text-4xl font-serif mt-1 ${balance < 0 ? 'text-red-600' : 'text-green-700'}`}>
              ₹{balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Add Money Modal */}
        {showAddMoney && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white p-6 rounded-card max-w-md w-full">
              <h2 className="font-serif text-xl mb-4">Top Up Petty Cash Balance</h2>
              <form onSubmit={handleDeposit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-1">Amount (₹)</label>
                  <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="w-full border p-2 rounded text-sm" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Source / Mode</label>
                  <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="w-full border p-2 rounded text-sm">
                    <option value="Cash">Cash</option>
                    <option value="Check">Check</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Date Received / Cashed</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full border p-2 rounded text-sm" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Description / Ref</label>
                  <input type="text" value={description} onChange={e => setDescription(e.target.value)} className="w-full border p-2 rounded text-sm" placeholder="e.g. Weekly Cashier Float Top Up" />
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button type="button" onClick={() => setShowAddMoney(false)} className="btn-quiet text-sm px-4 py-2">Cancel</button>
                  <button type="submit" className="btn-primary text-sm px-4 py-2">Deposit</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Add Expense Modal */}
        {showAddExpense && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white p-6 rounded-card max-w-md w-full">
              <h2 className="font-serif text-xl mb-4">Add Petty Cash Expense</h2>
              <form onSubmit={handleExpense} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-1">Vendor / Party Name</label>
                  <input type="text" value={vendorName} onChange={e => setVendorName(e.target.value)} className="w-full border p-2 rounded text-sm" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Amount (₹)</label>
                  <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="w-full border p-2 rounded text-sm" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Payment Method</label>
                  <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="w-full border p-2 rounded text-sm">
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Date</label>
                  <input type="date" value={date} max={new Date().toISOString().split('T')[0]} onChange={e => setDate(e.target.value)} className="w-full border p-2 rounded text-sm" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Description</label>
                  <input type="text" value={description} onChange={e => setDescription(e.target.value)} className="w-full border p-2 rounded text-sm" />
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button type="button" onClick={() => setShowAddExpense(false)} className="btn-quiet text-sm px-4 py-2">Cancel</button>
                  <button type="submit" className="btn-primary text-sm px-4 py-2">Save Expense</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Ledger Table */}
        <div className="panel bg-white p-6 rounded-card border">
          <h2 className="text-xl font-semibold mb-4">Transaction History</h2>
          {loading ? <p>Loading...</p> : ledger.length === 0 ? <p className="text-gray-500">No transactions recorded.</p> : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Type</th>
                  <th className="pb-2">Party / Vendor</th>
                  <th className="pb-2">Mode</th>
                  <th className="pb-2">Amount</th>
                  <th className="pb-2 text-right">Chellan</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map(item => (
                  <tr key={item.id} className="border-b">
                    <td className="py-3 text-xs">{item.date}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${item.type === 'deposit' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {item.type.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 font-medium">{item.vendor_name || item.description || 'Top Up'}</td>
                    <td className="py-3 text-xs">{item.payment_method}</td>
                    <td className={`py-3 font-semibold ${item.type === 'deposit' ? 'text-green-700' : 'text-red-700'}`}>
                      {item.type === 'deposit' ? '+' : '-'}₹{parseFloat(item.amount).toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 text-right">
                      {item.type === 'expense' && (
                        <button onClick={() => printChellan(item)} className="text-xs btn-quiet px-2 py-1">Print Chellan</button>
                      )}
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
