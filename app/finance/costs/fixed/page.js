'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import FinanceMonthPicker, { monthFromLocation, setMonthInLocation } from '../../../components/FinanceMonthPicker';

// The standing costs — the checklist of what the restaurant expects to pay
// every month.
//
// The amount here is what the month is **expected** to cost. When the
// invoice for that month arrives it replaces the expected amount rather
// than adding to it, so the same rent is never counted twice.
//
// Only the names are listed below — the amounts are the owner's to enter,
// and nothing is guessed.
const SUGGESTIONS = [
  'Outlet Rent',
  'Staff Accommodation Rent',
  'Sequire Pest Control',
  'Internal Signage Rental',
  'Digital Marketing Retainer',
  'Airtel Broadband',
  'Petpooja Annual Bill',
  'Electricity',
  'Gas',
  'Water',
  'Insurance',
  'AMC / equipment lease',
];

export default function FixedCostsPage() {
  const [standing, setStanding] = useState([]);
  const [totals, setTotals] = useState(null);
  const [period, setPeriod] = useState(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const load = useCallback(async (month) => {
    setLoading(true);
    try {
      const query = month ? `?month=${encodeURIComponent(month)}` : '';
      const res = await fetch(`/api/finance/fixed-costs${query}`);
      const json = await res.json();
      if (json.success) {
        setStanding(json.data);
        setTotals(json.totals);
        setPeriod(json.period);
        setMonthInLocation(json.period.key);
      }
    } catch (error) {
      setMessage('Could not load the standing costs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(monthFromLocation());
  }, [load]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!name || !amount) return;

    const res = await fetch('/api/finance/fixed-costs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        category: category || name,
        amount: parseFloat(amount),
        billing_cycle: billingCycle,
      })
    });
    const json = await res.json();
    if (json.success) {
      setName('');
      setCategory('');
      setAmount('');
      setMessage('');
      load(period?.key);
    } else {
      setMessage(`Could not save: ${json.error}`);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Remove this standing cost?\n\nThe invoices already recorded against it are not touched.')) return;
    const res = await fetch(`/api/finance/fixed-costs?id=${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) load(period?.key);
  }

  // Clicking a suggestion drops its name into the form, so only the amount
  // is left to type.
  const useSuggestion = (suggestion) => {
    setName(suggestion);
    setCategory(suggestion);
    setAmount('');
    document.getElementById('fixed-cost-amount')?.focus();
  };

  const existingNames = new Set(standing.map((item) => item.name.toLowerCase()));
  const missing = SUGGESTIONS.filter((suggestion) => !existingNames.has(suggestion.toLowerCase()));

  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-4xl mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/finance/costs" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
            ← Back to Costs &amp; Expenses
          </Link>
          <span className="text-[#8b6f4e] text-sm">Finance / Standing Costs</span>
        </div>

        <div className="page-head mb-8">
          <h1 className="page-title font-serif text-4xl lg:text-5xl">Standing Costs</h1>
          <p className="page-purpose text-[#6b635c] text-base lg:text-lg mt-3">
            The bills that are the same every month — rent, pest control, broadband. The amount here is
            what the month is <em>expected</em> to cost; when the invoice arrives it replaces that amount
            rather than adding to it, so nothing is counted twice.
          </p>
        </div>

        {period && (
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <p className="text-sm text-[#6b635c]">
              {period.label}
              {period.isCurrentMonth && (
                <span className="text-[#8b6f4e]"> · month so far (1 – {period.through})</span>
              )}
            </p>
            <FinanceMonthPicker month={period.key} currentMonth={period.key} onChange={(key) => load(key)} />
          </div>
        )}

        <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6 mb-8">
          <p className="text-[#8b6f4e] text-sm font-medium mb-2 uppercase tracking-wide">
            Counted for {period?.label || 'this month'}
          </p>
          <p className="text-[#1e1812] text-4xl font-medium mb-1">
            ₹{Number(totals?.recognised || 0).toLocaleString('en-IN')}
          </p>
          <p className="text-xs text-[#6b635c]">
            {totals?.standingCount === 0
              ? 'No standing costs are set up yet, so the profit shown does not include rent or power.'
              : (totals?.awaitingInvoice || 0) > 0
                ? `${totals.awaitingInvoice} of ${totals.standingCount} standing costs are still waiting for their invoice — their expected amounts are used until it arrives.`
                : `${totals?.standingCount || 0} standing cost(s), all with their invoice in.`}
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
          <h2 className="text-xl font-semibold mb-4">Add a standing cost</h2>
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="field-label block text-xs font-semibold mb-1">Cost Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control text-sm" placeholder="e.g. Outlet Rent" required />
            </div>
            <div>
              <label className="field-label block text-xs font-semibold mb-1">Expected Amount (₹)</label>
              <input id="fixed-cost-amount" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control text-sm" placeholder="262663" required />
            </div>
            <div>
              <label className="field-label block text-xs font-semibold mb-1">Billing Cycle</label>
              <select value={billingCycle} onChange={(e) => setBillingCycle(e.target.value)} className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control text-sm">
                <option value="monthly">Monthly</option>
                <option value="annual">Annual (split 12 months)</option>
              </select>
            </div>
            <button type="submit" className="btn-primary py-2 px-4 text-sm">Add</button>
          </form>
          {message && <p className="mt-4 text-sm text-[#6b635c]">{message}</p>}
        </div>

        <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm overflow-hidden">
          <h2 className="text-xl font-semibold p-6 pb-4">The standing costs</h2>
          {loading ? (
            <p className="p-6 pt-0 text-[#6b635c]">Loading…</p>
          ) : standing.length === 0 ? (
            <div className="p-6 pt-0">
              <p className="text-[#6b635c]">None set up yet.</p>
              <p className="text-sm text-[#6b635c] mt-1">
                Until there are some, the P&amp;L shows gross profit only — it cannot show a real profit.
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="table-head">
                  <th className="table-cell">Name</th>
                  <th className="table-cell">Expected (₹)</th>
                  <th className="table-cell">Cycle</th>
                  <th className="table-cell">Counted for the month</th>
                  <th className="table-cell">Invoice</th>
                  <th className="table-cell text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {standing.map((row) => (
                  <tr key={row.id} className="border-t border-[#f0ede9]">
                    <td className="table-cell font-medium">{row.name}</td>
                    <td className="table-cell">₹{Number(row.expected).toLocaleString('en-IN')}</td>
                    <td className="table-cell capitalize">{row.billing_cycle}</td>
                    <td className="table-cell font-semibold text-[#8b6f4e]">
                      ₹{Number(row.amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>
                    <td className="table-cell">
                      {row.received ? (
                        <span className="pill pill-good">Received</span>
                      ) : (
                        <span className="pill pill-warn">Expected amount used</span>
                      )}
                    </td>
                    <td className="table-cell text-right">
                      <button onClick={() => handleDelete(row.id)} className="text-red-600 hover:underline text-xs">Remove</button>
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
