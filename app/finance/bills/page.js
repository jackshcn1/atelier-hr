'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { normalizePaymentStatus } from '../../../lib/expenseHelpers.js';
import { monthLabel, todayInIST } from '../../../lib/financePeriod.js';
import { billsInPeriod, periodNote } from '../../../lib/financeBills.js';

// The link to the invoice itself. Only a Drive link is followed — anything
// else is not a link we put there.
const isDriveLink = (value) => String(value || '').startsWith('https://drive.google.com/');

const FILTERS = [
  { value: 'unpaid', label: 'Not paid yet' },
  { value: 'paid', label: 'Paid' },
  { value: 'credit', label: 'Credit notes' },
  { value: 'all', label: 'All bills' },
];

// Which way the suppliers are ordered.
//
// Who we owe the most to is the default — that is the list you act on. The
// alphabetical order is there for finding one supplier in a long list.
const SORTS = [
  { value: 'owed', label: 'Owed most' },
  { value: 'name', label: 'A–Z' },
];

// How a bill can be paid. Typing is allowed as well — the list is what is
// used most, not a closed set.
const PAYMENT_MODES = ['UPI', 'NEFT', 'RTGS', 'Cash', 'Credit Card', 'Cheque'];

/**
 * Can this bill be marked paid from here?
 *
 * Only a bill on the accountant's sheet can. Its payment is written into the
 * sheet, and the sheet is what the books follow — so the record and the books
 * never disagree.
 *
 * A bill that came from Petpooja cannot: Petpooja says whether it is paid,
 * and the books read that from the purchase report.
 */
const canMarkPaid = (bill) => bill?.source === 'sheet' && Number(bill.debit_note || 0) <= 0;

/** Can this bill be picked for a payment? Only the ones still to be paid. */
const canSelect = (bill) =>
  canMarkPaid(bill) && normalizePaymentStatus(bill.payment_status) !== 'paid';

export default function BillsPage() {
  const [bills, setBills] = useState([]);
  const [totals, setTotals] = useState(null);
  const [filter, setFilter] = useState('unpaid');
  const [sort, setSort] = useState('owed');
  const [month, setMonth] = useState('all');
  // A custom period: the bills dated from one day to another.
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [openVendor, setOpenVendor] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');

  // The bills picked for a payment, and the payment being described.
  const [selected, setSelected] = useState([]);
  const [paymentBills, setPaymentBills] = useState(null);
  const [payment, setPayment] = useState({ date: todayInIST(), mode: '', reference: '' });
  const [paymentError, setPaymentError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/finance/expenses');
      const json = await res.json();
      if (json.success) {
        setBills(json.data || []);
      } else {
        setMessage(json.error || 'Could not load the bills.');
      }
    } catch (error) {
      setMessage('Could not load the bills.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Mark a bill paid (or unpaid again).
  //
  // The payment is written into the **accountant's sheet**, not into the
  // database: the sheet is the record, and the books follow it. A bill marked
  // paid only in the database would be marked unpaid again by the next pull.
  const setPaid = async (bill, paid) => {
    const res = await fetch('/api/finance/expenses/sheet/payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: [bill.id],
        action: paid ? 'paid' : 'unpaid',
        ...(paid
          ? {
              paymentDate: payment.date,
              paymentMode: payment.mode,
              bankReference: payment.reference,
            }
          : {}),
      }),
    });
    const json = await res.json();
    if (json.success) {
      setMessage(paid ? 'Bill marked paid.' : 'Bill marked unpaid.');
      load();
    } else {
      setMessage(`Could not update the bill: ${json.error}`);
    }
  };

  // Pick a bill, or put it back.
  const toggleSelected = (bill) => {
    setSelected((prev) =>
      prev.includes(bill.id) ? prev.filter((id) => id !== bill.id) : [...prev, bill.id]
    );
  };

  // Open the payment form for one bill or for several.
  const openPayment = (bills) => {
    setPaymentBills(bills);
    setPaymentError('');
    setPayment({ date: todayInIST(), mode: '', reference: '' });
  };

  // Write the payment into the sheet, and let the sheet bring it into the books.
  const savePayment = async (action) => {
    if (!paymentBills || paymentBills.length === 0) return;
    setSaving(true);
    setPaymentError('');

    try {
      const res = await fetch('/api/finance/expenses/sheet/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: paymentBills.map((bill) => bill.id),
          action,
          ...(action === 'paid'
            ? {
                paymentDate: payment.date,
                paymentMode: payment.mode,
                bankReference: payment.reference,
              }
            : {}),
        }),
      });
      const json = await res.json();

      if (json.success) {
        const count = paymentBills.length;
        setMessage(
          action === 'paid'
            ? `${count === 1 ? 'Bill' : `${count} bills`} marked paid — the payment is on the sheet.`
            : `${count === 1 ? 'Bill' : `${count} bills`} marked unpaid.`
        );
        setPaymentBills(null);
        setSelected([]);
        load();
      } else {
        setPaymentError(json.error || 'The payment could not be saved.');
      }
    } catch (error) {
      setPaymentError('The payment could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  // The months that have bills on record, newest first.
  const months = useMemo(() => {
    const keys = new Set();
    for (const bill of bills) {
      const key = String(bill.invoice_date || '').slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(key)) keys.add(key);
    }
    return [...keys].sort().reverse();
  }, [bills]);

  // The bills in the chosen period.
  //
  // A month is the window Petpooja reports on. A custom period is any span
  // of days — for a quarter, for a financial year, for one supplier's
  // statement. A bill with no date belongs to no period, so it shows in
  // "All months" only.
  const scoped = useMemo(
    () => billsInPeriod(bills, { month, from, to }),
    [bills, month, from, to]
  );

  // What the period filter is saying, in words.
  const periodNoteText = useMemo(() => periodNote({ month, from, to }), [month, from, to]);

  // The bills, grouped by supplier.
  //
  // A credit note — goods sent back to a supplier — is not something you
  // owe. It is money coming back, so it is kept apart from the payable
  // instead of quietly netting it away.
  const grouped = new Map();
  for (const bill of scoped) {
    const name = (bill.vendor_name || '').trim() || 'Unknown vendor';
    const amount = Number(bill.amount || 0);
    const credit = Number(bill.debit_note || 0);
    const isPaid = normalizePaymentStatus(bill.payment_status) === 'paid';

    const line = grouped.get(name) || {
      vendor: name,
      unpaid: 0,
      paid: 0,
      credit: 0,
      billCount: 0,
      unpaidCount: 0,
      oldestDate: null,
      rows: [],
    };

    if (credit > 0) {
      line.credit += credit;
      line.rows.push(bill);
      grouped.set(name, line);
      continue;
    }

    line.billCount += 1;
    line.rows.push(bill);
    if (isPaid) {
      line.paid += amount;
    } else {
      line.unpaid += amount;
      line.unpaidCount += 1;
      if (bill.invoice_date && (!line.oldestDate || bill.invoice_date < line.oldestDate)) {
        line.oldestDate = bill.invoice_date;
      }
    }
    grouped.set(name, line);
  }

  const vendors = [...grouped.values()].sort(
    sort === 'name'
      ? (a, b) => a.vendor.localeCompare(b.vendor)
      : (a, b) => b.unpaid - a.unpaid
  );

  const visible = vendors.filter((line) => {
    if (filter === 'unpaid') return line.unpaidCount > 0 || line.credit > 0;
    if (filter === 'paid') return line.paid > 0;
    if (filter === 'credit') return line.credit > 0;
    return true;
  });

  const grandUnpaid = vendors.reduce((sum, line) => sum + line.unpaid, 0);
  const grandPaid = vendors.reduce((sum, line) => sum + line.paid, 0);
  const grandCredit = vendors.reduce((sum, line) => sum + line.credit, 0);
  const unpaidCount = vendors.reduce((sum, line) => sum + line.unpaidCount, 0);

  // The bills that are picked for a payment.
  const selectedBills = useMemo(
    () => bills.filter((bill) => selected.includes(bill.id)),
    [bills, selected]
  );
  const selectedTotal = selectedBills.reduce((sum, bill) => sum + Number(bill.amount || 0), 0);

  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/finance" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
            ← Back to Finance
          </Link>
          <span className="text-[#8b6f4e] text-sm">Finance / Bills</span>
        </div>

        <div className="page-head mb-10">
          <h1 className="page-title font-serif text-4xl lg:text-5xl">Bills</h1>
          <p className="page-purpose text-[#6b635c] text-base lg:text-lg mt-3">
            What the restaurant owes its suppliers. The bills come from the nightly Petpooja pull;
            a bill typed by hand sits in the same list.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6">
            <p className="text-[#8b6f4e] text-sm font-medium mb-2 uppercase tracking-wide">Still owed</p>
            <p className="text-[#1e1812] text-3xl font-medium">₹{grandUnpaid.toLocaleString('en-IN')}</p>
            <p className="text-xs text-[#6b635c] mt-1">{unpaidCount} unpaid bill(s)</p>
          </div>
          <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6">
            <p className="text-[#8b6f4e] text-sm font-medium mb-2 uppercase tracking-wide">Already paid</p>
            <p className="text-[#1e1812] text-3xl font-medium">₹{grandPaid.toLocaleString('en-IN')}</p>
            <p className="text-xs text-[#6b635c] mt-1">Marked settled</p>
          </div>
          <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6">
            <p className="text-[#8b6f4e] text-sm font-medium mb-2 uppercase tracking-wide">Credit notes</p>
            <p className="text-[#1e1812] text-3xl font-medium">₹{grandCredit.toLocaleString('en-IN')}</p>
            <p className="text-xs text-[#6b635c] mt-1">Goods returned — a credit to claim</p>
          </div>
          <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6">
            <p className="text-[#8b6f4e] text-sm font-medium mb-2 uppercase tracking-wide">Suppliers owed</p>
            <p className="text-[#1e1812] text-3xl font-medium">
              {vendors.filter((v) => v.unpaidCount > 0).length}
            </p>
            <p className="text-xs text-[#6b635c] mt-1">With an open bill</p>
          </div>
        </div>

        {/* The totals are of the bills in the period — so when a period is
            chosen, it says so rather than letting the figures be read as
            what the restaurant owes in total. */}
        {month !== 'all' && (
          <p className="text-xs text-[#6b635c] -mt-6 mb-8">
            These totals are of the bills in the period chosen below.
          </p>
        )}

        <div className="flex items-center gap-3 mb-6 flex-wrap">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              onClick={() => setFilter(option.value)}
              className={`px-4 py-2 rounded-control text-sm border ${
                filter === option.value
                  ? 'bg-[#1e1812] text-white border-[#1e1812]'
                  : 'bg-white border-[#ebe8e4] text-[#6b635c]'
              }`}
            >
              {option.label}
            </button>
          ))}
          {/*
              Which way the suppliers are ordered. Who we owe the most to is
              the default; the alphabetical order is for finding one supplier
              in a long list.
          */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#6b635c]">Order</span>
            <div className="flex gap-2">
              {SORTS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSort(option.value)}
                  className={`px-3 py-2 rounded-control text-xs border ${
                    sort === option.value
                      ? 'bg-[#1e1812] text-white border-[#1e1812]'
                      : 'bg-white border-[#ebe8e4] text-[#6b635c]'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          {/*
              Entering a bill has its own page, so a biller never has to open
              this one. The link points there rather than at a form.
          */}
          <Link href="/finance/invoice-entry" className="text-xs text-[#8b6f4e] hover:underline ml-auto">
            To enter a new bill → Invoice Entry
          </Link>
        </div>

        {/* Where a bill's paid state comes from. A bill from Petpooja is
            marked paid in Petpooja; a bill on the accountant's sheet is
            marked paid here, and the payment is written into the sheet so
            the record and the books never disagree. */}
        <p className="text-xs text-[#6b635c] mb-6 max-w-3xl">
          A bill that came from <strong>Petpooja</strong> is marked paid in Petpooja — the books
          read that from the purchase report, twice a week. A bill entered on the Invoice Entry
          page or in the accountant&apos;s sheet is marked paid here, and the payment is written
          into the sheet, which is what the books follow.
        </p>

        {/* The bills that are picked, and what can be done with them. */}
        {selectedBills.length > 0 && (
          <div className="sticky top-4 z-10 mb-4 panel bg-white border border-[#ebe8e4] rounded-card shadow-sm px-5 py-4 flex items-center gap-4 flex-wrap">
            <p className="text-sm">
              <strong>{selectedBills.length}</strong> bill(s) picked ·{' '}
              ₹{selectedTotal.toLocaleString('en-IN')}
            </p>
            <button onClick={() => openPayment(selectedBills)} className="btn-primary text-sm px-4 py-2">
              Mark them paid
            </button>
            <button onClick={() => setSelected([])} className="btn-secondary text-sm px-3 py-2">
              Clear
            </button>
            <p className="text-xs text-[#6b635c]">
              They were paid under one transfer, so one payment is asked for.
            </p>
          </div>
        )}

        <div className="flex items-center gap-3 mb-8 flex-wrap">
          <label htmlFor="bills-month" className="text-sm text-[#6b635c]">
            Period
          </label>
          <select
            id="bills-month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="field w-auto min-w-[11rem] text-sm py-1.5 px-2.5"
          >
            <option value="all">All months</option>
            {months.map((key) => (
              <option key={key} value={key}>{monthLabel(key)}</option>
            ))}
            <option value="custom">Custom period…</option>
          </select>

          {/* A custom period — any span of days. */}
          {month === 'custom' && (
            <div className="flex items-center gap-2 flex-wrap">
              <label htmlFor="bills-from" className="text-sm text-[#6b635c]">
                From
              </label>
              <input
                id="bills-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="field w-auto text-sm py-1.5 px-2.5"
              />
              <label htmlFor="bills-to" className="text-sm text-[#6b635c]">
                To
              </label>
              <input
                id="bills-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="field w-auto text-sm py-1.5 px-2.5"
              />
              {(from || to) && (
                <button
                  onClick={() => {
                    setFrom('');
                    setTo('');
                  }}
                  className="text-xs text-[#8b6f4e] hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          <p className="text-xs text-[#6b635c]">{periodNoteText}</p>
        </div>

        {message && <p className="mb-4 text-sm text-[#6b635c]">{message}</p>}

        {isLoading ? (
          <p className="py-12 text-center text-[#6b635c]">Loading the bills…</p>
        ) : visible.length === 0 ? (
          <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-12 text-center">
            <p className="text-[#1e1812] font-medium mb-2">Nothing here</p>
            <p className="text-sm text-[#6b635c]">
              {filter === 'unpaid'
                ? 'Every bill is paid. Nothing is outstanding.'
                : 'No bills match this filter.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((line) => {
              const isOpen = openVendor === line.vendor;
              return (
                <div key={line.vendor} className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm overflow-hidden">
                  <button
                    onClick={() => setOpenVendor(isOpen ? null : line.vendor)}
                    className="w-full flex items-center justify-between gap-4 p-5 text-left hover:bg-[#faf9f7]"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-[#1e1812] truncate">{line.vendor}</p>
                      <p className="text-xs text-[#6b635c] mt-1">
                        {line.unpaidCount} unpaid of {line.billCount} bill(s)
                        {line.oldestDate && ` · oldest ${line.oldestDate}`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {line.unpaid > 0 && (
                        <p className="font-medium text-[#c44c4c]">₹{line.unpaid.toLocaleString('en-IN')}</p>
                      )}
                      {line.paid > 0 && (
                        <p className="text-xs text-[#6b635c]">₹{line.paid.toLocaleString('en-IN')} paid</p>
                      )}
                    </div>
                  </button>

                  {isOpen && (
                    <table className="w-full text-sm border-t border-[#f0ede9]">
                      <thead>
                        <tr className="table-head">
                          <th className="table-cell w-8" />
                          <th className="table-cell text-left">Bill</th>
                          <th className="table-cell text-left">Date</th>
                          <th className="table-cell text-right">Amount</th>
                          <th className="table-cell text-right">Status</th>
                          <th className="table-cell text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {line.rows
                          .filter((bill) => {
                            const isCredit = Number(bill.debit_note || 0) > 0;
                            const isPaid = normalizePaymentStatus(bill.payment_status) === 'paid';
                            if (filter === 'unpaid') return isCredit || !isPaid;
                            if (filter === 'paid') return !isCredit && isPaid;
                            if (filter === 'credit') return isCredit;
                            return true;
                          })
                          .map((bill) => {
                            const isCredit = Number(bill.debit_note || 0) > 0;
                            const isPaid = normalizePaymentStatus(bill.payment_status) === 'paid';
                            const amount = isCredit
                              ? -Number(bill.debit_note || 0)
                              : Number(bill.amount || 0);
                            return (
                              <tr key={bill.id} className="border-t border-[#f0ede9]">
                                <td className="table-cell w-8 align-top">
                                  {canSelect(bill) && (
                                    <input
                                      type="checkbox"
                                      checked={selected.includes(bill.id)}
                                      onChange={() => toggleSelected(bill)}
                                      aria-label={`Pick ${bill.vendor_name}`}
                                      className="mt-1.5 accent-[#1e1812]"
                                    />
                                  )}
                                </td>
                                <td className="table-cell">
                                  {bill.invoice_number || '—'}
                                  {bill.description && (
                                    <span className="block text-xs text-[#6b635c]">{bill.description}</span>
                                  )}
                                  {/* How it was paid, and the bank's reference for it —
                                      the two facts that tell a payment apart from
                                      another payment of the same amount.

                                      Only for a bill that **is** paid. The bank
                                      reference falls back to the invoice number
                                      when there is no UTR, so it is on every sheet
                                      bill — a bill still to be paid must not be
                                      described as paid. */}
                                  {isPaid && (bill.payment_mode || bill.bank_reference) && (
                                    <span className="block text-xs text-[#6b635c]">
                                      {bill.payment_mode ? `Paid by ${bill.payment_mode}` : 'Paid'}
                                      {bill.bank_reference && bill.bank_reference !== bill.invoice_number
                                        ? ` · ${bill.bank_reference}`
                                        : ''}
                                    </span>
                                  )}
                                  {bill.invoice_attachment && isDriveLink(bill.invoice_attachment) && (
                                    <>
                                      {/* The site serves the file, so it opens for
                                          anyone signed in — a colleague without a
                                          Google account, or with a different one,
                                          would be turned away by Drive. */}
                                      <a
                                        href={`/api/finance/expenses/invoice/${bill.id}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="block text-xs text-[#8b6f4e] underline mt-0.5"
                                      >
                                        See the invoice
                                      </a>
                                      <a
                                        href={bill.invoice_attachment}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="block text-xs text-[#8b6f4e] underline mt-0.5"
                                      >
                                        Open in Drive
                                      </a>
                                    </>
                                  )}
                                </td>
                                <td className="table-cell text-[#6b635c]">{bill.invoice_date || '—'}</td>
                                <td className={`table-cell text-right font-medium ${isCredit ? 'text-emerald-700' : ''}`}>
                                  {isCredit ? '−' : ''}₹{Math.abs(amount).toLocaleString('en-IN')}
                                </td>
                                <td className="table-cell text-right">
                                  {isCredit ? (
                                    <span className="pill pill-good">Credit note</span>
                                  ) : (
                                    <span className={`pill ${isPaid ? 'pill-good' : 'pill-warn'}`}>
                                      {isPaid ? 'Paid' : 'Not paid'}
                                    </span>
                                  )}
                                  {bill.payment_date && (
                                    <span className="block text-xs text-[#6b635c] mt-1">{bill.payment_date}</span>
                                  )}
                                </td>
                                <td className="table-cell text-right">
                                  {!isCredit && canMarkPaid(bill) && (
                                    isPaid ? (
                                      <button
                                        onClick={() => {
                                          if (!window.confirm('Mark this bill unpaid? The payment details are cleared from the sheet.')) return;
                                          setPaid(bill, false);
                                        }}
                                        className="text-[#8b6f4e] hover:underline text-xs"
                                      >
                                        Mark unpaid
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => openPayment([bill])}
                                        className="text-[#8b6f4e] hover:underline text-xs"
                                      >
                                        Mark paid
                                      </button>
                                    )
                                  )}
                                  {!isCredit && !canMarkPaid(bill) && (
                                    <span className="text-xs text-[#6b635c]">From Petpooja</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* The payment.
          The date it was paid, how it was paid and the bank's reference for
          it — written into the sheet, which is the record the books follow. */}
      {paymentBills && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 sm:p-6 overflow-y-auto">
          <div className="panel bg-white rounded-card shadow-lg w-full max-w-xl mt-10 sm:mt-20">
            <div className="panel-body p-8">
              <h2 className="font-serif text-2xl text-[#1e1812] mb-2">
                {paymentBills.length === 1
                  ? 'Mark this bill paid'
                  : `Mark ${paymentBills.length} bills paid`}
              </h2>
              <p className="text-sm text-[#6b635c] mb-6">
                The payment is written into the accountant&apos;s sheet, and the sheet is what the
                books follow.
              </p>

              <ul className="text-sm mb-6">
                {paymentBills.map((bill) => (
                  <li
                    key={bill.id}
                    className="flex justify-between gap-4 border-b border-[#f2efec] py-2"
                  >
                    <span className="truncate">
                      {bill.vendor_name}
                      {bill.invoice_number ? ` · ${bill.invoice_number}` : ''}
                    </span>
                    <span className="text-[#6b635c] shrink-0">
                      ₹{Number(bill.amount || 0).toLocaleString('en-IN')}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="space-y-5">
                <div className="field">
                  <label htmlFor="payment-date" className="field-label block text-sm font-medium mb-2">
                    Date of payment
                  </label>
                  <input
                    id="payment-date"
                    type="date"
                    value={payment.date}
                    onChange={(e) => setPayment((prev) => ({ ...prev, date: e.target.value }))}
                    required
                    className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus:border-[#8b6f4e]"
                  />
                </div>

                <div className="field">
                  <label htmlFor="payment-mode" className="field-label block text-sm font-medium mb-2">
                    Form of payment
                  </label>
                  <input
                    id="payment-mode"
                    type="text"
                    list="payment-modes"
                    value={payment.mode}
                    onChange={(e) => setPayment((prev) => ({ ...prev, mode: e.target.value }))}
                    placeholder="UPI"
                    required
                    className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus:border-[#8b6f4e]"
                  />
                  <datalist id="payment-modes">
                    {PAYMENT_MODES.map((mode) => (
                      <option key={mode} value={mode} />
                    ))}
                  </datalist>
                  <p className="text-xs text-[#6b635c] mt-1.5">
                    UPI, cash, a bank transfer — pick one of the usual ones or type your own.
                  </p>
                </div>

                <div className="field">
                  <label htmlFor="payment-reference" className="field-label block text-sm font-medium mb-2">
                    Bank reference (UTR)
                  </label>
                  <input
                    id="payment-reference"
                    type="text"
                    value={payment.reference}
                    onChange={(e) => setPayment((prev) => ({ ...prev, reference: e.target.value }))}
                    placeholder="UTR / reference number"
                    className="w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus:border-[#8b6f4e]"
                  />
                  <p className="text-xs text-[#6b635c] mt-1.5">
                    The number the bank gave the payment. Leave it empty if it was paid in cash.
                  </p>
                </div>

                {paymentBills.length > 1 && (
                  <p className="text-xs text-[#6b635c]">
                    The same payment is written to every bill picked — they were all closed under
                    one transfer.
                  </p>
                )}

                {paymentError && <p className="text-sm text-[#8b3a2e]">{paymentError}</p>}

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={() => savePayment('paid')}
                    disabled={saving}
                    className="btn-primary text-sm px-5 py-2.5 disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Mark as paid'}
                  </button>
                  <button
                    onClick={() => setPaymentBills(null)}
                    className="btn-secondary text-sm px-4 py-2"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
