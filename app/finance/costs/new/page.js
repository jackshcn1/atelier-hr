'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import SupplierPicker from '../../../components/SupplierPicker';

// A new expense — variable, fixed or petty.
//
// The **sheet is the record**: the entry is written into the accountant's
// Google Sheet and then pulled into the books, so there is one place an
// amount is written and one way into the books.
//
// The supplier is a type-ahead over the supplier list: as you type, the
// suppliers that match come up; a name that is not on the list can be added
// there and then, and it is on the list for next time.

const PETTY_KINDS = [
  { value: 'expense', label: 'Expense', hint: 'money out of the float' },
  { value: 'deposit', label: 'Cash top-up', hint: 'money into the float' },
];

const BLANK = {
  type: 'variable',
  costType: '',
  vendor: '',
  amount: '',
  invoiceDate: '',
  paidOn: '',
  invoiceNo: '',
  description: '',
  pettyKind: 'expense',
};

const inputClass =
  'w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus:border-[#8b6f4e]';

export default function NewExpensePage() {
  const [form, setForm] = useState(BLANK);
  const [costTypes, setCostTypes] = useState({ variable: [], fixed: [] });
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);

  // The cost types the sheet already uses — so the form offers what is
  // already in use. If the sheet cannot be read, the field is still free text.
  useEffect(() => {
    fetch('/api/finance/expenses/sheet')
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data?.costTypes) setCostTypes(d.data.costTypes);
      })
      .catch(() => {});
  }, []);

  const set = (name, value) => setForm((prev) => ({ ...prev, [name]: value }));

  // ---- saving ------------------------------------------------------------
  const handleSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    setSaved(null);

    try {
      const response = await fetch('/api/finance/expenses/sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const result = await response.json();

      if (result.success) {
        setSaved(result.data);
        setMessage(
          result.data.petty
            ? 'Petty entry saved to the sheet and added to the float.'
            : 'Bill saved to the sheet and added to the books.',
        );
        setForm({ ...BLANK, type: form.type });
      } else {
        setMessage(result.error || 'Could not save the entry.');
      }
    } catch (error) {
      setMessage('Network error occurred.');
    } finally {
      setBusy(false);
    }
  };

  const isPetty = form.type === 'petty';
  const typeOptions = costTypes[form.type === 'fixed' ? 'fixed' : 'variable'] || [];

  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/finance/costs" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
            ← Back to Costs &amp; Expenses
          </Link>
          <span className="text-[#8b6f4e] text-sm">Finance / Costs &amp; Expenses / New Expense</span>
        </div>

        <div className="page-head mb-8">
          <h1 className="page-title font-serif text-4xl lg:text-5xl">New Expense</h1>
          <p className="page-purpose text-[#6b635c] text-base lg:text-lg mt-3">
            Electricity, gas, water, rent, marketing, petty cash — anything the
            Petpooja pull does not know about. It is written into the accountant&apos;s
            sheet, and the sheet is what the books follow.
          </p>
        </div>

        <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm max-w-2xl mx-auto">
          <div className="panel-body p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* ---- kind of cost ------------------------------------------ */}
              <div className="field">
                <label className="field-label block text-sm font-medium mb-2">Kind of cost</label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { value: 'variable', label: 'Variable' },
                    { value: 'fixed', label: 'Fixed' },
                    { value: 'petty', label: 'Petty cash' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => set('type', option.value)}
                      className={`px-4 py-2 rounded-control text-sm border ${
                        form.type === option.value
                          ? 'bg-[#1e1812] text-white border-[#1e1812]'
                          : 'border-[#ebe8e4] text-[#6b635c]'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-[#6b635c] mt-1.5">
                  {form.type === 'variable'
                    ? 'Variable costs go with the cost of making a sale — electricity, gas, waste.'
                    : form.type === 'fixed'
                      ? 'Fixed costs are the same every month — rent, pest control, broadband, marketing.'
                      : 'Petty cash is spent out of the float in the drawer.'}
                </p>
              </div>

              {/* ---- petty: in or out of the float ------------------------ */}
              {isPetty && (
                <div className="field">
                  <label className="field-label block text-sm font-medium mb-2">Expense or top-up</label>
                  <div className="flex gap-2 flex-wrap">
                    {PETTY_KINDS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => set('pettyKind', option.value)}
                        className={`px-4 py-2 rounded-control text-sm border ${
                          form.pettyKind === option.value
                            ? 'bg-[#1e1812] text-white border-[#1e1812]'
                            : 'border-[#ebe8e4] text-[#6b635c]'
                        }`}
                      >
                        {option.label}
                        <span className="ml-2 text-xs opacity-70">{option.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ---- cost type -------------------------------------------- */}
              {!isPetty && (
                <div className="field">
                  <label className="field-label block text-sm font-medium mb-2">What it was for</label>
                  <input
                    type="text"
                    list="cost-types"
                    name="costType"
                    value={form.costType}
                    onChange={(e) => set('costType', e.target.value)}
                    placeholder={form.type === 'fixed' ? 'Outlet Rent' : 'Gas'}
                    required
                    className={inputClass}
                  />
                  <datalist id="cost-types">
                    {typeOptions.map((option) => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                  <p className="text-xs text-[#6b635c] mt-1.5">
                    {typeOptions.length > 0
                      ? 'What the sheet already uses — pick one, or type your own.'
                      : 'What the bill was for.'}
                  </p>
                </div>
              )}

              {/* ---- the supplier ----------------------------------------- */}
              <SupplierPicker
                value={form.vendor}
                onChange={(value) => set('vendor', value)}
                label={isPetty ? 'Paid to' : 'Supplier'}
                id="vendor"
              />

              {/* ---- amount and date --------------------------------------- */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="field">
                  <label className="field-label block text-sm font-medium mb-2">Amount (₹)</label>
                  <input
                    type="number"
                    name="amount"
                    value={form.amount}
                    onChange={(e) => set('amount', e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    min="0.01"
                    required
                    className={inputClass}
                  />
                </div>

                <div className="field">
                  <label className="field-label block text-sm font-medium mb-2">
                    {isPetty ? 'Date of the expense' : 'Date of the invoice'}
                  </label>
                  <input
                    type="date"
                    name="invoiceDate"
                    value={form.invoiceDate}
                    onChange={(e) => set('invoiceDate', e.target.value)}
                    required
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="field">
                  <label className="field-label block text-sm font-medium mb-2">Paid on</label>
                  <input
                    type="date"
                    name="paidOn"
                    value={form.paidOn}
                    onChange={(e) => set('paidOn', e.target.value)}
                    className={inputClass}
                  />
                  <p className="text-xs text-[#6b635c] mt-1.5">Leave it empty if it has not been paid.</p>
                </div>

                <div className="field">
                  <label className="field-label block text-sm font-medium mb-2">Invoice number</label>
                  <input
                    type="text"
                    name="invoiceNo"
                    value={form.invoiceNo}
                    onChange={(e) => set('invoiceNo', e.target.value)}
                    placeholder="If there is one"
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="field">
                <label className="field-label block text-sm font-medium mb-2">
                  {isPetty ? 'What it was for' : 'Description'}
                </label>
                <input
                  type="text"
                  name="description"
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  placeholder={isPetty ? 'Groceries for the weekend' : 'Outlet rent for November'}
                  className={inputClass}
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button type="submit" disabled={busy} className="btn-primary text-sm px-5 py-2.5">
                  {busy ? 'Saving…' : 'Save to the sheet'}
                </button>
                <Link href="/finance/costs" className="btn-secondary text-sm px-4 py-2">
                  Cancel
                </Link>
              </div>

              {message && (
                <p
                  className={`text-sm ${
                    saved ? 'text-[#3f6b4f]' : 'text-[#8b3a2e]'
                  }`}
                >
                  {message}
                </p>
              )}

              {saved?.bill && (
                <div className="border border-[#ebe8e4] rounded-control p-4 text-sm">
                  <p className="font-medium mb-1">In the books</p>
                  <p className="text-[#6b635c]">
                    {saved.bill.vendor_name} · {saved.bill.category} · ₹
                    {Number(saved.bill.amount).toLocaleString('en-IN')} ·{' '}
                    {saved.bill.invoice_date} · {saved.bill.payment_status}
                  </p>
                  <Link href="/finance/bills" className="btn-secondary text-xs px-3 py-1.5 mt-3 inline-flex">
                    See the bills
                  </Link>
                </div>
              )}
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
