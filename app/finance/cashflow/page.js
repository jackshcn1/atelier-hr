'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import FinanceMonthPicker, { monthFromLocation, setMonthInLocation } from '../../components/FinanceMonthPicker';

export default function CashflowPage() {
  const [transactions, setTransactions] = useState([]);
  const [totals, setTotals] = useState({ inflow: 0, outflow: 0, net: 0 });
  const [receivables, setReceivables] = useState({ customers: [], totals: null });
  const [period, setPeriod] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const [form, setForm] = useState({
    type: 'inflow',
    description: '',
    category: '',
    amount: '',
    date: '',
    mode: 'Cash',
    reference: '',
  });

  const load = useCallback(async (target) => {
    setIsLoading(true);
    try {
      const query = target ? `?month=${encodeURIComponent(target)}` : '';
      const response = await fetch(`/api/finance/cashflow${query}`);
      const data = await response.json();
      if (data.success) {
        setTransactions(data.data.transactions);
        setTotals(data.data.totals);
        setReceivables(data.data.receivables || { customers: [], totals: null });
        setPeriod(data.data.period);
        setMonthInLocation(data.data.period.key);
      }
    } catch (error) {
      console.error('Error fetching cashflow:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load(monthFromLocation());
  }, [load]);

  const saveTransaction = async (event) => {
    event.preventDefault();
    setSaveMessage('');
    const amount = Number(form.amount);
    if (!form.description || !Number.isFinite(amount) || amount <= 0) {
      setSaveMessage('Give a description and an amount above zero.');
      return;
    }
    try {
      const response = await fetch('/api/finance/cashflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: form.type,
          description: form.description,
          category: form.category || null,
          amount,
          date: form.date || new Date().toISOString().slice(0, 10),
          mode: form.mode || null,
          reference: form.reference || null,
        }),
      });
      const result = await response.json();
      if (!result.success) {
        setSaveMessage(result.error || 'Could not save the transaction.');
        return;
      }
      setForm({ type: form.type, description: '', category: '', amount: '', date: form.date, mode: 'Cash', reference: '' });
      setSaveMessage('Saved.');
      load(period?.key);
    } catch (error) {
      setSaveMessage(error.message || 'Could not save the transaction.');
    }
  };

  const totalInflow = totals.inflow;
  const totalOutflow = totals.outflow;
  const netCashflow = totals.net;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
        <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
          <div className="text-center py-12">
            <p className="text-[#8b6f4e] text-sm">Loading cashflow...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/finance" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
            ← Back to Finance
          </Link>
          <span className="text-[#8b6f4e] text-sm">Finance / Cashflow</span>
        </div>

        <div className="page-head mb-8 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="page-title font-serif text-4xl lg:text-5xl">Cashflow</h1>
            <p className="page-purpose text-[#6b635c] text-base lg:text-lg mt-3">
              {period
                ? `${period.label} — calendar month${period.isCurrentMonth ? `, month so far (1 – ${period.through})` : ''}`
                : 'Calendar month cash inflows and outflows'}
            </p>
          </div>
          {period && (
            <FinanceMonthPicker month={period.key} currentMonth={period.key} onChange={(key) => load(key)} />
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6">
            <p className="text-[#8b6f4e] text-sm font-medium mb-2 uppercase tracking-wide">Total Inflow</p>
            <p className="text-[#1e1812] text-3xl font-medium">₹{totalInflow.toLocaleString('en-IN')}</p>
          </div>
          <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6">
            <p className="text-[#8b6f4e] text-sm font-medium mb-2 uppercase tracking-wide">Total Outflow</p>
            <p className="text-[#1e1812] text-3xl font-medium">₹{totalOutflow.toLocaleString('en-IN')}</p>
          </div>
          <div className={`panel border border-[#ebe8e4] rounded-card shadow-sm p-6 ${netCashflow >= 0 ? 'border-[#8b6f4e]' : 'border-[#c44c4c]'}`}>
            <p className="text-[#8b6f4e] text-sm font-medium mb-2 uppercase tracking-wide">Net Cashflow</p>
            <p className={`text-3xl font-medium ${netCashflow >= 0 ? 'text-[#8b6f4e]' : 'text-[#c44c4c]'}`}>
              ₹{netCashflow.toLocaleString('en-IN')}
            </p>
          </div>
        </div>

        {/* The money owed by customers — expected to come in, not cash in hand. */}
        <section className="mb-12">
          <div className="flex items-baseline justify-between flex-wrap gap-3 mb-4">
            <h2 className="text-lg font-medium text-[#1e1812]">Money owed by customers</h2>
            {receivables.totals?.asOf && (
              <p className="text-xs text-[#6b635c]">
                As of {new Date(receivables.totals.asOf).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            )}
          </div>

          {receivables.totals?.customerCount > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6">
                  <p className="text-[#8b6f4e] text-sm font-medium mb-2 uppercase tracking-wide">Outstanding</p>
                  <p className="text-[#1e1812] text-3xl font-medium">₹{receivables.totals.outstanding.toLocaleString('en-IN')}</p>
                  <p className="text-xs text-[#6b635c] mt-1">
                    {receivables.totals.invoiceCount} invoice(s) across {receivables.totals.customerCount} customer(s)
                  </p>
                </div>
                <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6">
                  <p className="text-[#8b6f4e] text-sm font-medium mb-2 uppercase tracking-wide">Overdue</p>
                  <p className={`text-3xl font-medium ${receivables.totals.overdue > 0 ? 'text-[#c44c4c]' : 'text-[#1e1812]'}`}>
                    ₹{receivables.totals.overdue.toLocaleString('en-IN')}
                  </p>
                  <p className="text-xs text-[#6b635c] mt-1">Older than 30 days</p>
                </div>
                <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6">
                  <p className="text-[#8b6f4e] text-sm font-medium mb-2 uppercase tracking-wide">Customers</p>
                  <p className="text-[#1e1812] text-3xl font-medium">{receivables.totals.customerCount}</p>
                  <p className="text-xs text-[#6b635c] mt-1">With an open invoice</p>
                </div>
              </div>

              <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="table-head">
                      <th className="table-cell text-left">Customer</th>
                      <th className="table-cell text-right">Invoices</th>
                      <th className="table-cell text-right">Outstanding</th>
                      <th className="table-cell text-right">Overdue</th>
                      <th className="table-cell text-right">Oldest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receivables.customers.map((row) => (
                      <tr key={row.customer} className="border-t border-[#f0ede9]">
                        <td className="table-cell">{row.customer}</td>
                        <td className="table-cell text-right">{row.invoices}</td>
                        <td className="table-cell text-right font-medium">₹{row.amount.toLocaleString('en-IN')}</td>
                        <td className={`table-cell text-right ${row.overdueAmount > 0 ? 'text-[#c44c4c]' : 'text-[#6b635c]'}`}>
                          {row.overdueAmount > 0 ? `₹${row.overdueAmount.toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td className="table-cell text-right text-[#6b635c]">{row.oldestDays}d</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-8 text-center">
              <p className="text-[#6b635c] text-sm">
                No money owed is recorded for {period?.label || 'this month'}.
              </p>
              <p className="text-xs text-[#8b6f4e] mt-2">
                It comes from the Petpooja Due Payment report, which the finance sync pulls once a day.
              </p>
            </div>
          )}
        </section>

        {/* Add a cash movement. */}
        <section className="mb-12">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <h2 className="text-lg font-medium text-[#1e1812]">Add a cash movement</h2>
            <button
              type="button"
              className="btn-secondary text-sm px-4 py-2"
              onClick={() => setIsAdding((open) => !open)}
            >
              {isAdding ? 'Close' : '+ New transaction'}
            </button>
          </div>

          {isAdding && (
            <form onSubmit={saveTransaction} className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="field-label" htmlFor="cf-type">Direction</label>
                  <select id="cf-type" name="type" className="field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                    <option value="inflow">Money in</option>
                    <option value="outflow">Money out</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="field-label" htmlFor="cf-description">What was it</label>
                  <input id="cf-description" name="description" className="field" placeholder="e.g. Swiggy payout" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="field-label" htmlFor="cf-amount">Amount (₹)</label>
                  <input id="cf-amount" name="amount" className="field" inputMode="decimal" placeholder="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </div>
                <div>
                  <label className="field-label" htmlFor="cf-date">Date</label>
                  <input id="cf-date" name="date" type="date" className="field" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </div>
                <div>
                  <label className="field-label" htmlFor="cf-mode">How</label>
                  <select id="cf-mode" name="mode" className="field" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
                    {['Cash', 'UPI', 'NEFT', 'RTGS', 'Credit Card'].map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="cf-category">Category</label>
                  <input id="cf-category" name="category" className="field" placeholder="e.g. Sales" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button type="submit" className="btn-primary text-sm px-5 py-2">Save transaction</button>
                {saveMessage && <p className="text-sm text-[#6b635c]">{saveMessage}</p>}
              </div>
            </form>
          )}
        </section>

        <div className="space-y-4">
          <h2 className="text-lg font-medium text-[#1e1812] mb-4">
            {period ? `Transactions in ${period.label}` : 'Recent Transactions'}
          </h2>
          <div className="space-y-3">
            {transactions.length === 0 ? (
              <div className="text-center py-8 text-[#6b635c] text-sm">
                No cashflow transactions in this month — add one above.
              </div>
            ) : (
              transactions.map(tx => (
                <div key={tx.id} className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-[#1e1812]">{tx.description}</span>
                    <span className={`text-sm ${tx.type === 'inflow' ? 'text-[#8b6f4e] font-medium' : 'text-[#c44c4c] font-medium'}`}>
                      {tx.type === 'inflow' ? '+' : '–'} ₹{Number(tx.amount || 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <p className="text-xs text-[#6b635c] mb-2">{tx.category || 'Uncategorized'} • {tx.date || tx.created_at}</p>
                  <div className="flex items-center gap-4 text-xs text-[#8b6f4e]">
                    <span>{tx.type === 'inflow' ? 'Inflow' : 'Outflow'}</span>
                    <span>{tx.mode || '-'}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
