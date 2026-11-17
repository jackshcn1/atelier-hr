'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

// The standing costs of a restaurant, listed so they can be filled in one by
// one. Only the names are here — the amounts are the owner's to enter, and
// nothing is guessed.
//
// A cost that comes once a year is billed once a year, so it is entered as
// an annual amount and recognised a twelfth of it every month.
const SUGGESTIONS = [
  'Kitchen rent',
  'Staff salaries',
  'Electricity',
  'LPG / cooking gas',
  'Water',
  'Internet & phone',
  'POS & software subscription',
  'Music licence',
  'Insurance',
  'AMC / equipment lease',
  'Pest control & cleaning',
  'Marketing',
];

export default function FixedCostsPage() {
  const [fixedCosts, setFixedCosts] = useState([]);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchFixedCosts();
  }, []);

  async function fetchFixedCosts() {
    try {
      const res = await fetch('/api/finance/fixed-costs');
      const json = await res.json();
      if (json.success) setFixedCosts(json.data);
    } catch (error) {
      setMessage('Could not load the fixed costs.');
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!name || !amount) return;

    const res = await fetch('/api/finance/fixed-costs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, amount: parseFloat(amount), billing_cycle: billingCycle })
    });
    const json = await res.json();
    if (json.success) {
      setName('');
      setAmount('');
      setMessage('');
      fetchFixedCosts();
    } else {
      setMessage(`Could not save: ${json.error}`);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Remove this fixed cost?')) return;
    const res = await fetch(`/api/finance/fixed-costs?id=${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) fetchFixedCosts();
  }

  // Clicking a suggestion drops its name into the form, so only the amount
  // has to be typed.
  const useSuggestion = (suggestion) => {
    setName(suggestion);
    setAmount('');
    document.getElementById('fixed-cost-amount')?.focus();
  };

  const totalMonthlyFixed = fixedCosts.reduce((sum, item) => {
    const monthlyAmt = item.billing_cycle === 'annual' ? Number(item.amount) / 12 : Number(item.amount);
    return sum + monthlyAmt;
  }, 0);

  const existingNames = new Set(fixedCosts.map((item) => item.name.toLowerCase()));
  const missing = SUGGESTIONS.filter((suggestion) => !existingNames.has(suggestion.toLowerCase()));

  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812] p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/finance/costs" className="btn-secondary text-xs px-3 py-1.5">← Back to Costs</Link>
          <span className="text-[#8b6f4e] text-sm">Finance / Fixed Costs</span>
        </div>

        <div className="page-head mb-8">
          <h1 className="page-title font-serif text-4xl">Fixed Costs</h1>
          <p className="page-purpose text-[#6b635c] text-base mt-3">
            The bills that are the same every month — rent, salaries, power. These are what turn
            gross profit into net profit, so until they are entered the profit figure is not the real one.
          </p>
        </div>

        <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6 mb-8">
          <p className="text-[#8b6f4e] text-sm font-medium mb-2 uppercase tracking-wide">Recognised every month</p>
          <p className="text-[#1e1812] text-4xl font-medium mb-1">₹{totalMonthlyFixed.toLocaleString('en-IN')}</p>
          <p className="text-xs text-[#6b635c]">
            {fixedCosts.length} cost(s) configured. An annual bill is recognised a twelfth of it each month.
          </p>
        </div>

        {missing.length > 0 && (
          <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6 mb-8">
            <h2 className="text-lg font-semibold mb-1">Common costs</h2>
            <p className="text-sm text-[#6b635c] mb-4">
              Click one to start a new line — only the amount is left to type. Skip anything that does not apply.
            </p>
            <div className="flex flex-wrap gap-2">
              {missing.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => useSuggestion(suggestion)}
                  className="btn-secondary text-xs px-3 py-1.5"
                >
                  + {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Add a fixed cost</h2>
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="field-label block text-xs font-semibold mb-1">Cost Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control text-sm" placeholder="e.g. Kitchen rent" required />
            </div>
            <div>
              <label className="field-label block text-xs font-semibold mb-1">Amount (₹)</label>
              <input id="fixed-cost-amount" type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control text-sm" placeholder="40000" required />
            </div>
            <div>
              <label className="field-label block text-xs font-semibold mb-1">Billing Cycle</label>
              <select value={billingCycle} onChange={e => setBillingCycle(e.target.value)} className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control text-sm">
                <option value="monthly">Monthly</option>
                <option value="annual">Annual (split 12 months)</option>
              </select>
            </div>
            <button type="submit" className="btn-primary py-2 px-4 text-sm">Add Fixed Cost</button>
          </form>
          {message && <p className="mt-4 text-sm text-[#6b635c]">{message}</p>}
        </div>

        <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm overflow-hidden">
          <h2 className="text-xl font-semibold p-6 pb-4">Configured Fixed Costs</h2>
          {loading ? <p className="p-6 pt-0">Loading…</p> : fixedCosts.length === 0 ? (
            <div className="p-6 pt-0">
              <p className="text-[#6b635c]">No fixed costs configured yet.</p>
              <p className="text-sm text-[#6b635c] mt-1">
                Until there are some, the P&amp;L shows gross profit only — it cannot show a real profit.
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="table-head">
                  <th className="table-cell">Name</th>
                  <th className="table-cell">Amount (₹)</th>
                  <th className="table-cell">Cycle</th>
                  <th className="table-cell">Monthly Recognition</th>
                  <th className="table-cell text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {fixedCosts.map(item => {
                  const monthly = item.billing_cycle === 'annual' ? Number(item.amount) / 12 : Number(item.amount);
                  return (
                    <tr key={item.id} className="border-t border-[#f0ede9]">
                      <td className="table-cell font-medium">{item.name}</td>
                      <td className="table-cell">₹{Number(item.amount).toLocaleString('en-IN')}</td>
                      <td className="table-cell capitalize">{item.billing_cycle}</td>
                      <td className="table-cell font-semibold text-[#8b6f4e]">₹{monthly.toLocaleString('en-IN', { maximumFractionDigits: 2 })} / mo</td>
                      <td className="table-cell text-right">
                        <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:underline text-xs">Remove</button>
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
