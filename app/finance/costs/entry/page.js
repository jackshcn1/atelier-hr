'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

// The categories a cost can fall under. These are the buckets the P&L and
// the cost breakdown group by.
const CATEGORIES = [
  'Rent',
  'Salaries',
  'Electricity',
  'Gas',
  'Water',
  'Internet',
  'Vendor',
  'Maintenance',
  'Marketing',
  'Office Supplies',
  'Other',
];

const PAYMENT_MODES = ['UPI', 'NEFT', 'RTGS', 'Cash', 'Credit Card'];

const BLANK = {
  category: '',
  cost_type: 'variable',
  entry_type: 'actual',
  status: 'pending',
  amount: '',
  vendor_name: '',
  invoice_number: '',
  invoice_date: '',
  description: '',
  payment_status: 'unpaid',
  payment_date: '',
  payment_mode: '',
  bank_reference: '',
};

export default function ExpenseEntryForm() {
  const [vendors, setVendors] = useState([]);
  const [formData, setFormData] = useState(BLANK);
  const [otherVendor, setOtherVendor] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    fetch('/api/finance/vendors')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setVendors(d.data);
      })
      .catch(() => {});
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Picking "another supplier" clears the vendor that was chosen, so the
  // name typed in is the one that is used.
  const handleVendorChoice = (e) => {
    const value = e.target.value;
    if (value === '__other__') {
      setOtherVendor(true);
      setFormData((prev) => ({ ...prev, vendor_name: '' }));
      return;
    }
    setOtherVendor(false);
    setFormData((prev) => ({ ...prev, vendor_name: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage('');
    setSaved(null);

    try {
      const response = await fetch('/api/finance/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (result.success) {
        setSaved(result.data);
        setMessage('Bill saved.');
        setFormData({ ...BLANK, cost_type: formData.cost_type });
      } else {
        setMessage(`Error: ${result.error}`);
      }
    } catch (error) {
      setMessage('Network error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/finance/costs" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
            ← Back to Costs &amp; Expenses
          </Link>
          <span className="text-[#8b6f4e] text-sm">Finance / Costs &amp; Expenses / Entry</span>
        </div>

        <div className="page-head mb-8">
          <h1 className="page-title font-serif text-4xl lg:text-5xl">Log a Bill</h1>
          <p className="page-purpose text-[#6b635c] text-base lg:text-lg mt-3">
            A bill the Petpooja pull does not know about — a cash payment, a local bill, a recharge.
            It goes into the same ledger as the synced bills.
          </p>
        </div>

        <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm max-w-2xl mx-auto">
          <div className="panel-body p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="field">
                  <label className="field-label block text-sm font-medium mb-2">Kind of cost</label>
                  <div className="flex gap-2">
                    {[
                      { value: 'variable', label: 'Variable' },
                      { value: 'fixed', label: 'Fixed' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, cost_type: option.value }))}
                        className={`px-4 py-2 rounded-control text-sm border ${
                          formData.cost_type === option.value
                            ? 'bg-[#1e1812] text-white border-[#1e1812]'
                            : 'border-[#ebe8e4] text-[#6b635c]'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-[#6b635c] mt-1.5">
                    Variable costs go with the cost of making a sale. Fixed costs are the same every month.
                  </p>
                </div>

                <div className="field">
                  <label className="field-label block text-sm font-medium mb-2">Category</label>
                  <select
                    name="category"
                    value={formData.category}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus:border-[#8b6f4e]"
                  >
                    <option value="">Select Category</option>
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label className="field-label block text-sm font-medium mb-2">Vendor</label>
                  {otherVendor ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        name="vendor_name"
                        value={formData.vendor_name}
                        onChange={handleInputChange}
                        placeholder="Supplier name"
                        required
                        className="flex-1 px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus:border-[#8b6f4e]"
                      />
                      <button
                        type="button"
                        onClick={() => { setOtherVendor(false); setFormData((prev) => ({ ...prev, vendor_name: '' })); }}
                        className="btn-secondary text-xs px-3"
                      >
                        Pick
                      </button>
                    </div>
                  ) : (
                    <select
                      name="vendor_name"
                      value={formData.vendor_name}
                      onChange={handleVendorChoice}
                      required
                      className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus:border-[#8b6f4e]"
                    >
                      <option value="">Select Vendor</option>
                      {vendors.map((v) => (
                        <option key={v.id} value={v.name}>{v.name}</option>
                      ))}
                      <option value="__other__">Another supplier…</option>
                    </select>
                  )}
                </div>

                <div className="field">
                  <label className="field-label block text-sm font-medium mb-2">Amount (₹)</label>
                  <input
                    type="number"
                    name="amount"
                    value={formData.amount}
                    onChange={handleInputChange}
                    placeholder="0.00"
                    step="0.01"
                    min="0.01"
                    required
                    className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus:border-[#8b6f4e]"
                  />
                </div>

                <div className="field">
                  <label className="field-label block text-sm font-medium mb-2">Invoice Number</label>
                  <input
                    type="text"
                    name="invoice_number"
                    value={formData.invoice_number}
                    onChange={handleInputChange}
                    placeholder="Invoice #"
                    className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus:border-[#8b6f4e]"
                  />
                </div>

                <div className="field">
                  <label className="field-label block text-sm font-medium mb-2">Invoice Date</label>
                  <input
                    type="date"
                    name="invoice_date"
                    value={formData.invoice_date}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus:border-[#8b6f4e]"
                  />
                </div>

                <div className="field md:col-span-2">
                  <label className="field-label block text-sm font-medium mb-2">Description</label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder="What this bill was for..."
                    rows="2"
                    className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus:border-[#8b6f4e]"
                  />
                </div>

                <div className="field">
                  <label className="field-label block text-sm font-medium mb-2">Paid or not</label>
                  <div className="flex gap-2">
                    {[
                      { value: 'unpaid', label: 'Not paid yet' },
                      { value: 'paid', label: 'Paid' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, payment_status: option.value }))}
                        className={`px-4 py-2 rounded-control text-sm border ${
                          formData.payment_status === option.value
                            ? 'bg-[#1e1812] text-white border-[#1e1812]'
                            : 'border-[#ebe8e4] text-[#6b635c]'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <label className="field-label block text-sm font-medium mb-2">Payment Date</label>
                  <input
                    type="date"
                    name="payment_date"
                    value={formData.payment_date}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus:border-[#8b6f4e]"
                  />
                </div>

                <div className="field">
                  <label className="field-label block text-sm font-medium mb-2">Payment Mode</label>
                  <select
                    name="payment_mode"
                    value={formData.payment_mode}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus:border-[#8b6f4e]"
                  >
                    <option value="">Select Mode</option>
                    {PAYMENT_MODES.map((mode) => (
                      <option key={mode} value={mode}>{mode}</option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label className="field-label block text-sm font-medium mb-2">Bank Reference (UTR)</label>
                  <input
                    type="text"
                    name="bank_reference"
                    value={formData.bank_reference}
                    onChange={handleInputChange}
                    placeholder="UTR / Reference #"
                    className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus:border-[#8b6f4e]"
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button type="submit" disabled={isSubmitting} className="btn-primary px-6 py-3 disabled:opacity-50">
                  {isSubmitting ? 'Saving...' : 'Save Bill'}
                </button>

                <button
                  type="button"
                  onClick={() => { setFormData({ ...BLANK, cost_type: formData.cost_type }); setOtherVendor(false); setMessage(''); setSaved(null); }}
                  className="btn-secondary px-6 py-3"
                >
                  Clear Form
                </button>
              </div>

              {message && (
                <div className={`p-4 rounded-control ${message.startsWith('Error') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                  {message}
                  {saved && (
                    <p className="mt-2 text-sm">
                      ₹{Number(saved.amount).toLocaleString('en-IN')} · {saved.vendor_name} ·{' '}
                      <Link href="/finance/bills" className="underline">see it with the other bills</Link>
                    </p>
                  )}
                </div>
              )}
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
