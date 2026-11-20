'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import SupplierPicker from '../../../components/SupplierPicker';

// Log a Bill — a bill the Petpooja pull does not know about.
//
// The category follows the kind of cost: a fixed bill is one of the standing
// costs, and a variable bill is one of the costs that move with the business.
// The supplier is a type-ahead over the supplier list, and the invoice itself
// can be attached — the file goes into the restaurant's own Drive folder.

const PAYMENT_MODES = ['UPI', 'NEFT', 'RTGS', 'Cash', 'Credit Card'];

// The variable costs — the ones that move with the business.
const VARIABLE_CATEGORIES = [
  'Outlet Electricity',
  'Gas',
  'Waste Collection',
  'Maintenance',
  'Fire Extinguisher Service',
  'Water',
  'Office Supplies',
  'Other',
];

// The fixed costs — the standing costs, if the list cannot be fetched.
const FIXED_FALLBACK = [
  'Outlet Rent',
  'Airtel Broadband',
  'Digital Marketing Retainer',
  'Sequire Pest Control',
  'Internal Signage Rental',
  'Staff Accommodation Rent',
  'Petpooja Annual Bill',
];

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
  invoice_attachment: '',
};

export default function ExpenseEntryForm() {
  const [formData, setFormData] = useState(BLANK);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState(null);

  // The categories for each kind of cost.
  const [fixedCategories, setFixedCategories] = useState(FIXED_FALLBACK);
  const [variableCategories, setVariableCategories] = useState(VARIABLE_CATEGORIES);

  // The invoice itself.
  const [file, setFile] = useState(null);
  const [attachment, setAttachment] = useState(null);
  const [uploading, setUploading] = useState(false);
  // Set when the upload failed because the Google account is not connected.
  const [connectUrl, setConnectUrl] = useState(null);

  // The fixed costs are the standing costs — the ones the restaurant expects
  // to pay every month. That list is closed: a fixed bill is one of them, and
  // it is what ticks the standing cost off for the month.
  useEffect(() => {
    fetch('/api/finance/fixed-costs')
      .then((r) => r.json())
      .then((d) => {
        if (!d.success || !Array.isArray(d.data)) return;
        const names = d.data.map((row) => row.category || row.name).filter(Boolean);
        if (names.length > 0) setFixedCategories(names);
      })
      .catch(() => {});
  }, []);

  // The variable costs the sheet already uses, so the list keeps up with what
  // is actually being entered.
  useEffect(() => {
    fetch('/api/finance/expenses/sheet')
      .then((r) => r.json())
      .then((d) => {
        const used = d?.data?.costTypes?.variable || [];
        if (used.length === 0) return;
        setVariableCategories([
          ...used,
          ...VARIABLE_CATEGORIES.filter((name) => !used.includes(name)),
        ]);
      })
      .catch(() => {});
  }, []);

  const categories = formData.cost_type === 'fixed' ? fixedCategories : variableCategories;

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Switching the kind of cost changes the categories — so a category that
  // does not belong to the new kind is cleared.
  const handleCostType = (value) => {
    const options = value === 'fixed' ? fixedCategories : variableCategories;
    setFormData((prev) => ({
      ...prev,
      cost_type: value,
      category: options.includes(prev.category) ? prev.category : '',
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage('');
    setSaved(null);

    try {
      // The invoice goes up first, so the bill is saved with its link.
      let link = attachment?.link || '';
      if (file && !link) {
        setUploading(true);
        const body = new FormData();
        body.append('file', file);
        body.append('name', file.name);
        const uploaded = await fetch('/api/finance/expenses/attachment', {
          method: 'POST',
          body,
        });
        const result = await uploaded.json();
        setUploading(false);

        if (!result.success) {
          setMessage(`Error: ${result.error}`);
          setConnectUrl(result.connectUrl || null);
          return;
        }
        link = result.data.link;
        setAttachment(result.data);
        setConnectUrl(null);
      }

      const response = await fetch('/api/finance/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, invoice_attachment: link }),
      });

      const result = await response.json();

      if (result.success) {
        setSaved(result.data);
        setMessage('Bill saved.');
        setFormData({ ...BLANK, cost_type: formData.cost_type });
        setFile(null);
        setAttachment(null);
      } else {
        setMessage(`Error: ${result.error}`);
      }
    } catch (error) {
      setMessage('Network error occurred');
    } finally {
      setUploading(false);
      setIsSubmitting(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus:border-[#8b6f4e]';

  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/finance/invoice-entry" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
            ← Back to Invoice Entry
          </Link>
          <span className="text-[#8b6f4e] text-sm">Finance / Invoice Entry / Log a Bill</span>
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
                        onClick={() => handleCostType(option.value)}
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
                    {formData.cost_type === 'variable'
                      ? 'Variable costs go with the cost of making a sale. Fixed costs are the same every month.'
                      : 'Fixed costs are the standing costs — the ones the restaurant expects to pay every month.'}
                  </p>
                </div>

                <div className="field">
                  <label className="field-label block text-sm font-medium mb-2">Category</label>
                  <select
                    name="category"
                    value={formData.category}
                    onChange={handleInputChange}
                    required
                    className={inputClass}
                  >
                    <option value="">Select Category</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  <p className="text-xs text-[#6b635c] mt-1.5">
                    {formData.cost_type === 'fixed'
                      ? 'The standing costs. Picking one here ticks it off for the month.'
                      : 'The costs that move with the business.'}
                  </p>
                </div>

                <SupplierPicker
                  value={formData.vendor_name}
                  onChange={(value) => setFormData((prev) => ({ ...prev, vendor_name: value }))}
                  id="vendor"
                />

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
                    className={inputClass}
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
                    className={inputClass}
                  />
                </div>

                <div className="field">
                  <label className="field-label block text-sm font-medium mb-2">Invoice Date</label>
                  <input
                    type="date"
                    name="invoice_date"
                    value={formData.invoice_date}
                    onChange={handleInputChange}
                    className={inputClass}
                  />
                </div>

                <div className="field md:col-span-2">
                  <label className="field-label block text-sm font-medium mb-2">
                    The invoice itself
                  </label>
                  <input
                    type="file"
                    name="invoice_file"
                    accept="application/pdf,image/jpeg,image/png"
                    onChange={(e) => {
                      setFile(e.target.files?.[0] || null);
                      setAttachment(null);
                    }}
                    className="w-full text-sm text-[#6b635c] file:mr-3 file:px-4 file:py-2 file:rounded-control file:border file:border-[#ebe8e4] file:bg-white file:text-sm file:text-[#1e1812]"
                  />
                  <p className="text-xs text-[#6b635c] mt-1.5">
                    {attachment
                      ? `Attached — ${attachment.name}`
                      : 'A PDF or a photograph of the invoice. It goes into the restaurant\u2019s Drive folder, and the bill keeps the link to it.'}
                  </p>
                  {connectUrl && (
                    <p className="text-xs text-[#8b6f4e] mt-2">
                      <a
                        href={`${connectUrl}?next=${encodeURIComponent('/finance/invoice-entry/bill')}`}
                        className="underline"
                      >
                        Connect Google Drive
                      </a>{' '}
                      — the restaurant’s Google account has to be connected once before an
                      invoice can be uploaded.
                    </p>
                  )}
                </div>

                <div className="field md:col-span-2">
                  <label className="field-label block text-sm font-medium mb-2">Description</label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder="What this bill was for..."
                    rows="2"
                    className={inputClass}
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
                    className={inputClass}
                  />
                </div>

                <div className="field">
                  <label className="field-label block text-sm font-medium mb-2">Payment Mode</label>
                  <select
                    name="payment_mode"
                    value={formData.payment_mode}
                    onChange={handleInputChange}
                    className={inputClass}
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
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button type="submit" disabled={isSubmitting || uploading} className="btn-primary px-6 py-3 disabled:opacity-50">
                  {uploading ? 'Uploading the invoice…' : isSubmitting ? 'Saving...' : 'Save Bill'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setFormData({ ...BLANK, cost_type: formData.cost_type });
                    setFile(null);
                    setAttachment(null);
                    setMessage('');
                    setSaved(null);
                  }}
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
