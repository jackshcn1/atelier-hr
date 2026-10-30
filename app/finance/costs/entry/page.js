'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ExpenseEntryForm() {
  const [formData, setFormData] = useState({
    category: '',
    cost_type: 'variable',
    entry_type: 'actual',
    status: 'pending',
    amount: '',
    debit_note: 0,
    vendor_name: '',
    invoice_number: '',
    invoice_date: '',
    description: '',
    payment_status: 'due',
    payment_date: '',
    payment_mode: '',
    bank_reference: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage('');

    try {
      const response = await fetch('/api/finance/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (result.success) {
        setMessage('Expense submitted successfully!');
        setFormData({
          category: '',
          cost_type: 'variable',
          entry_type: 'actual',
          status: 'pending',
          amount: '',
          debit_note: 0,
          vendor_name: '',
          invoice_number: '',
          invoice_date: '',
          description: '',
          payment_status: 'due',
          payment_date: '',
          payment_mode: '',
          bank_reference: '',
        });
      } else {
        setMessage(`Error: ${result.error}`);
      }
    } catch (error) {
      setMessage('Network error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const categories = [
    'Rent',
    'Electricity',
    'Water',
    'Internet',
    'Vendor',
    'Maintenance',
    'Marketing',
    'Utilities',
    'Office Supplies',
    'Other'
  ];

  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/finance/costs" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
            ← Back to Costs & Expenses
          </Link>
          <span className="text-[#8b6f4e] text-sm">Finance / Costs & Expenses / Entry</span>
        </div>

        <div className="page-head mb-8">
          <h1 className="page-title font-serif text-4xl lg:text-5xl">Log New Expense</h1>
          <p className="page-purpose text-[#6b635c] text-base lg:text-lg mt-3">
            Enter manual expenses for tracking and approval
          </p>
        </div>

        <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm max-w-2xl mx-auto">
          <div className="panel-body p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label className="field-label block text-sm font-medium mb-2">Cost Type</label>
                  <select
                    name="cost_type"
                    value={formData.cost_type}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus-border-[#8b6f4e]"
                  >
                    <option value="fixed">Fixed Cost</option>
                    <option value="variable">Variable Cost</option>
                  </select>
                </div>

                <div className="field">
                  <label className="field-label block text-sm font-medium mb-2">Amount</label>
                  <input
                    type="number"
                    name="amount"
                    value={formData.amount}
                    onChange={handleInputChange}
                    placeholder="0.00"
                    step="0.01"
                    required
                    className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus-border-[#8b6f4e]"
                  />
                </div>

                <div className="field">
                  <label className="field-label block text-sm font-medium mb-2">Debit Note Amount</label>
                  <input
                    type="number"
                    name="debit_note"
                    value={formData.debit_note}
                    onChange={handleInputChange}
                    placeholder="0.00"
                    step="0.01"
                    className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus-border-[#8b6f4e]"
                  />
                </div>

                <div className="field">
                  <label className="field-label block text-sm font-medium mb-2">Vendor Name</label>
                  <input
                    type="text"
                    name="vendor_name"
                    value={formData.vendor_name}
                    onChange={handleInputChange}
                    placeholder="Vendor or supplier name"
                    required
                    className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus-border-[#8b6f4e]"
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
                    className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus-border-[#8b6f4e]"
                  />
                </div>

                <div className="field">
                  <label className="field-label block text-sm font-medium mb-2">Invoice Date</label>
                  <input
                    type="date"
                    name="invoice_date"
                    value={formData.invoice_date}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus-border-[#8b6f4e]"
                  />
                </div>

                <div className="field">
                  <label className="field-label block text-sm font-medium mb-2">Description</label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder="Expense details..."
                    rows="3"
                    className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus-border-[#8b6f4e]"
                  />
                </div>

                <div className="field">
                  <label className="field-label block text-sm font-medium mb-2">Payment Mode</label>
                  <select
                    name="payment_mode"
                    value={formData.payment_mode}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus-border-[#8b6f4e]"
                  >
                    <option value="">Select Mode</option>
                    <option value="UPI">UPI</option>
                    <option value="NEFT">NEFT</option>
                    <option value="RTGS">RTGS</option>
                    <option value="Cash">Cash</option>
                    <option value="Credit Card">Credit Card</option>
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
                    className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus-border-[#8b6f4e]"
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary px-6 py-3 disabled:opacity-50"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Expense'}
                </button>

                <button
                  type="button"
                  onClick={() => setFormData({
                    category: '',
                    cost_type: 'variable',
                    entry_type: 'actual',
                    status: 'pending',
                    amount: '',
                    debit_note: 0,
                    vendor_name: '',
                    invoice_number: '',
                    invoice_date: '',
                    description: '',
                    payment_status: 'due',
                    payment_date: '',
                    payment_mode: '',
                    bank_reference: '',
                  })}
                  className="btn-secondary px-6 py-3"
                >
                  Clear Form
                </button>
              </div>

              {message && (
                <div className={`p-4 rounded-control ${message.startsWith('Error') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                  {message}
                </div>
              )}
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}