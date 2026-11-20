'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import SupplierPicker from '../../components/SupplierPicker';

// Enter a bill — the one page a biller needs.
//
// Every bill the restaurant is given goes in here: electricity, gas, rent,
// marketing, a supplier's invoice, a bill paid in cash. It is written into the
// accountant's sheet, and the sheet is what the books follow — so there is one
// place an amount is written down and one way into the books.
//
// The invoice itself can be attached. The file goes into the restaurant's own
// Drive folder, and the bill keeps the link to it.
//
// The only other way of entering something the restaurant spends is **petty
// cash** — money out of the float in the drawer. That has a balance of its
// own, so it is entered on its own page.

// The variable costs — the ones that move with the business. What the sheet
// already uses is added to these.
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

const BLANK = {
  type: 'variable',
  costType: '',
  vendor: '',
  amount: '',
  invoiceDate: '',
  invoiceNo: '',
  paidOn: '',
  description: '',
};

const inputClass =
  'w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus:border-[#8b6f4e]';

export default function InvoiceEntryPage() {
  const [form, setForm] = useState(BLANK);
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);

  // The cost types the sheet already uses, so the form offers what is already
  // in use. If the sheet cannot be read, the cost type can still be typed.
  const [usedVariable, setUsedVariable] = useState([]);
  // The standing costs — the ones the restaurant expects to pay every month.
  // A fixed bill is one of them, and picking one ticks it off for the month.
  const [standingCosts, setStandingCosts] = useState([]);

  // The invoice itself.
  const [file, setFile] = useState(null);
  const [attachment, setAttachment] = useState(null);
  const [uploading, setUploading] = useState(false);
  // Set when the upload failed because the Google account is not connected.
  const [connectUrl, setConnectUrl] = useState(null);

  useEffect(() => {
    fetch('/api/finance/expenses/sheet')
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data?.costTypes) setUsedVariable(d.data.costTypes.variable || []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/finance/fixed-costs')
      .then((r) => r.json())
      .then((d) => {
        if (!d.success || !Array.isArray(d.data)) return;
        const names = d.data.map((row) => row.category || row.name).filter(Boolean);
        if (names.length > 0) setStandingCosts(names);
      })
      .catch(() => {});
  }, []);

  const set = (name, value) => setForm((prev) => ({ ...prev, [name]: value }));

  const isFixed = form.type === 'fixed';

  // Switching the kind of cost changes what it can be for, so a choice that
  // belongs to the other kind is cleared.
  const setType = (value) => {
    setForm((prev) => ({
      ...prev,
      type: value,
      costType: value === 'fixed' ? (standingCosts.includes(prev.costType) ? prev.costType : '') : '',
    }));
  };

  const variableOptions = [...new Set([...usedVariable, ...VARIABLE_CATEGORIES])];

  // ---- saving ------------------------------------------------------------
  const handleSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
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
          setMessage(result.error || 'The invoice could not be attached.');
          setConnectUrl(result.connectUrl || null);
          setBusy(false);
          return;
        }
        link = result.data.link;
        setAttachment(result.data);
        setConnectUrl(null);
      }

      const response = await fetch('/api/finance/expenses/sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, attachment: link }),
      });
      const result = await response.json();

      if (result.success) {
        setSaved(result.data);
        setMessage('Bill saved — it is in the sheet and in the books.');
        setForm({ ...BLANK, type: form.type });
        setFile(null);
        setAttachment(null);
      } else {
        setMessage(result.error || 'The bill could not be saved.');
      }
    } catch (error) {
      setMessage('Network error occurred.');
    } finally {
      setUploading(false);
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/finance" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
            ← Back to Finance
          </Link>
          <span className="text-[#8b6f4e] text-sm">Finance / Invoice Entry</span>
        </div>

        <div className="page-head mb-8">
          <h1 className="page-title font-serif text-4xl lg:text-5xl">Enter a Bill</h1>
          <p className="page-purpose text-[#6b635c] text-base lg:text-lg mt-3">
            Every bill the restaurant is given — electricity, gas, rent, marketing,
            a supplier&apos;s invoice. It goes into the accountant&apos;s sheet, and the
            sheet is what the books follow.
          </p>
          <p className="text-sm text-[#6b635c] mt-3">
            Money paid out of the cash in the drawer is{' '}
            <Link href="/finance/invoice-entry/petty" className="underline">
              petty cash
            </Link>{' '}
            — it has a balance of its own, so it is entered on its own page.
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
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setType(option.value)}
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
                  {isFixed
                    ? 'Fixed costs are the same every month — rent, broadband, pest control, marketing. Picking one ticks it off for the month.'
                    : 'Variable costs go with the cost of making a sale — electricity, gas, waste, maintenance.'}
                </p>
              </div>

              {/* ---- what it was for ---------------------------------------- */}
              <div className="field">
                <label className="field-label block text-sm font-medium mb-2">What it was for</label>
                {isFixed ? (
                  <select
                    name="costType"
                    value={form.costType}
                    onChange={(e) => set('costType', e.target.value)}
                    required
                    className={inputClass}
                  >
                    <option value="">Choose the standing cost</option>
                    {standingCosts.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                ) : (
                  <>
                    <input
                      type="text"
                      name="costType"
                      list="variable-cost-types"
                      value={form.costType}
                      onChange={(e) => set('costType', e.target.value)}
                      placeholder="Gas"
                      required
                      className={inputClass}
                    />
                    <datalist id="variable-cost-types">
                      {variableOptions.map((option) => (
                        <option key={option} value={option} />
                      ))}
                    </datalist>
                  </>
                )}
                <p className="text-xs text-[#6b635c] mt-1.5">
                  {isFixed
                    ? 'The standing costs — the bills the restaurant expects to pay every month.'
                    : 'What the sheet already uses — pick one, or type your own.'}
                </p>
              </div>

              {/* ---- the supplier ------------------------------------------- */}
              <SupplierPicker
                value={form.vendor}
                onChange={(value) => set('vendor', value)}
                label="Supplier"
                id="vendor"
              />

              {/* ---- amount and date ---------------------------------------- */}
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
                  <label className="field-label block text-sm font-medium mb-2">Date of the invoice</label>
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
                  <label className="field-label block text-sm font-medium mb-2">Invoice number</label>
                  <input
                    type="text"
                    name="invoiceNo"
                    value={form.invoiceNo}
                    onChange={(e) => set('invoiceNo', e.target.value)}
                    placeholder="If there is one"
                    className={inputClass}
                  />
                  <p className="text-xs text-[#6b635c] mt-1.5">
                    The invoice number is how a bill is found again — it is what stops the
                    same bill being entered twice.
                  </p>
                </div>

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
              </div>

              {/* ---- the invoice itself -------------------------------------- */}
              <div className="field">
                <label className="field-label block text-sm font-medium mb-2">The invoice itself</label>
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
                    : 'A PDF or a photograph of the invoice. It goes into the restaurant’s Drive folder, and the bill keeps the link to it.'}
                </p>
                {connectUrl && (
                  <p className="text-xs text-[#8b6f4e] mt-2">
                    <a
                      href={`${connectUrl}?next=${encodeURIComponent('/finance/invoice-entry')}`}
                      className="underline"
                    >
                      Connect Google Drive
                    </a>{' '}
                    — the restaurant’s Google account has to be connected once before an
                    invoice can be uploaded.
                  </p>
                )}
              </div>

              {/* ---- description --------------------------------------------- */}
              <div className="field">
                <label className="field-label block text-sm font-medium mb-2">Description</label>
                <input
                  type="text"
                  name="description"
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  placeholder="What this bill was for"
                  className={inputClass}
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button type="submit" disabled={busy || uploading} className="btn-primary text-sm px-5 py-2.5 disabled:opacity-50">
                  {uploading ? 'Attaching the invoice…' : busy ? 'Saving…' : 'Save the bill'}
                </button>
                <Link href="/finance" className="btn-secondary text-sm px-4 py-2">
                  Cancel
                </Link>
              </div>

              {message && (
                <p className={`text-sm ${saved ? 'text-[#3f6b4f]' : 'text-[#8b3a2e]'}`}>
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
