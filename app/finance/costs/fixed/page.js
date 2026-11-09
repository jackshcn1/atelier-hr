'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function FixedCostsPage() {
  const [fixedCosts, setFixedCosts] = useState([]);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFixedCosts();
  }, []);

  async function fetchFixedCosts() {
    const res = await fetch('/api/finance/fixed-costs');
    const json = await res.json();
    if (json.success) setFixedCosts(json.data);
    setLoading(false);
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
      fetchFixedCosts();
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this fixed cost?')) return;
    const res = await fetch(`/api/finance/fixed-costs?id=${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) fetchFixedCosts();
  }

  const totalMonthlyFixed = fixedCosts.reduce((sum, item) => {
    const monthlyAmt = item.billing_cycle === 'annual' ? item.amount / 12 : item.amount;
    return sum + monthlyAmt;
  }, 0);

  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812] p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/finance/costs" className="btn-secondary text-xs px-3 py-1.5">← Back to Costs</Link>
          <span className="text-[#8b6f4e] text-sm">Finance / Fixed Costs Configuration</span>
        </div>

        <h1 className="font-serif text-3xl mb-6">Fixed Costs Configuration</h1>

        <div className="panel bg-white p-6 rounded-card border mb-8">
          <h2 className="text-xl font-semibold mb-4">Total Monthly Recognized Fixed Cost: ₹{totalMonthlyFixed.toFixed(2)}</h2>
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-xs font-semibold mb-1">Cost Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full border p-2 rounded text-sm" placeholder="e.g. POS Subscription" required />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Amount (₹)</label>
              <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="w-full border p-2 rounded text-sm" placeholder="40000" required />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Billing Cycle</label>
              <select value={billingCycle} onChange={e => setBillingCycle(e.target.value)} className="w-full border p-2 rounded text-sm">
                <option value="monthly">Monthly</option>
                <option value="annual">Annual (Split 12 mos)</option>
              </select>
            </div>
            <button type="submit" className="btn-primary py-2 px-4 text-sm">Add Fixed Cost</button>
          </form>
        </div>

        <div className="panel bg-white p-6 rounded-card border">
          <h2 className="text-xl font-semibold mb-4">Configured Fixed Costs</h2>
          {loading ? <p>Loading...</p> : fixedCosts.length === 0 ? <p className="text-gray-500">No fixed costs configured.</p> : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2">Name</th>
                  <th className="pb-2">Amount (₹)</th>
                  <th className="pb-2">Cycle</th>
                  <th className="pb-2">Monthly Recognition</th>
                  <th className="pb-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {fixedCosts.map(item => {
                  const monthly = item.billing_cycle === 'annual' ? item.amount / 12 : item.amount;
                  return (
                    <tr key={item.id} className="border-b">
                      <td className="py-3 font-medium">{item.name}</td>
                      <td className="py-3">₹{item.amount.toLocaleString()}</td>
                      <td className="py-3 capitalize">{item.billing_cycle}</td>
                      <td className="py-3 font-semibold text-[#8b6f4e]">₹{monthly.toFixed(2)} / mo</td>
                      <td className="py-3 text-right">
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
