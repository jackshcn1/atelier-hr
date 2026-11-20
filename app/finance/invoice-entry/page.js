'use client';

import Link from 'next/link';

// Invoice Entry — the one page a biller needs.
//
// Everything the restaurant buys goes in here, and nothing else in Finance is
// shown on it. A biller or the accountant opens this page, enters what they
// have in front of them, and does not need to see the costs, the forecast or
// the profit.
//
// Three ways in, and they are genuinely different:
//
//   Log a Bill by Hand  a supplier bill, entered straight into the books,
//                       with the invoice itself attached to it.
//
//   New Expense         electricity, gas, water, marketing, rent — anything
//                       the nightly Petpooja pull does not know about. It is
//                       written into the accountant's sheet, and the sheet is
//                       what the books follow.
//
//   Petty Cash          money out of the float in the drawer, or a top-up
//                       into it.

const ENTRIES = [
  {
    href: '/finance/invoice-entry/bill',
    title: 'Log a Bill by Hand',
    subtitle: 'A supplier bill',
    description:
      'A bill from a supplier, entered straight into the books. The invoice itself can be attached — a PDF or a photograph — so the bill keeps a copy.',
    note: 'Use this for a bill you have in front of you.',
    primary: true,
  },
  {
    href: '/finance/invoice-entry/expense',
    title: 'New Expense',
    subtitle: 'Electricity, gas, marketing, rent',
    description:
      "Anything the nightly Petpooja pull does not know about. It is written into the accountant's sheet, and the sheet is what the books follow.",
    note: 'Use this for a cost that is not a supplier bill.',
    primary: false,
  },
  {
    href: '/finance/invoice-entry/petty',
    title: 'Petty Cash',
    subtitle: 'The float in the drawer',
    description:
      'Money spent out of the float — groceries, cleaning, ice — or a top-up put into it. The balance shown is the money actually in the drawer.',
    note: 'Use this for small cash payments.',
    primary: false,
  },
];

export default function InvoiceEntryPage() {
  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/finance" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
            ← Back to Finance
          </Link>
          <span className="text-[#8b6f4e] text-sm">Finance / Invoice Entry</span>
        </div>

        <div className="page-head mb-10">
          <h1 className="page-title font-serif text-4xl lg:text-5xl">Invoice Entry</h1>
          <p className="page-purpose text-[#6b635c] text-base lg:text-lg mt-3">
            Enter a bill or an expense. This page is all that is needed — the costs,
            the forecast and the profit are not shown here.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {ENTRIES.map((entry) => (
            <div
              key={entry.href}
              className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm flex flex-col"
            >
              <div className="panel-body p-8 flex flex-col h-full">
                <h2 className="font-serif text-2xl text-[#1e1812] mb-2">{entry.title}</h2>
                <p className="text-[#8b6f4e] text-sm font-medium mb-4 tracking-wide uppercase">
                  {entry.subtitle}
                </p>
                <p className="text-[#6b635c] text-sm leading-relaxed mb-6">{entry.description}</p>
                <p className="text-xs text-[#8b6f4e] mt-auto mb-5">{entry.note}</p>
                <Link
                  href={entry.href}
                  className={`${entry.primary ? 'btn-primary' : 'btn-secondary'} text-sm px-4 py-2 self-start inline-flex items-center gap-1`}
                >
                  {entry.title} →
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* Which one do I use?
            The two ways of entering a bill look alike and are not the same
            thing, so the difference is written down here rather than left to
            be worked out. */}
        <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm mt-8">
          <div className="panel-body p-8">
            <h3 className="font-serif text-xl text-[#1e1812] mb-4">Which one do I use?</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <p className="text-sm font-medium text-[#1e1812] mb-2">Log a Bill by Hand</p>
                <p className="text-sm text-[#6b635c] leading-relaxed">
                  Goes into the books straight away, and the invoice can be attached to
                  it. A fixed bill also ticks off that month&apos;s standing cost.
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-[#1e1812] mb-2">New Expense</p>
                <p className="text-sm text-[#6b635c] leading-relaxed">
                  Goes into the accountant&apos;s sheet first, and the sheet is pulled
                  into the books from there — one place an amount is written, and one
                  way into the books. It cannot carry an invoice attachment.
                </p>
              </div>
            </div>
            <p className="text-sm text-[#6b635c] leading-relaxed mt-6 pt-6 border-t border-[#f2efec]">
              If you are not sure: a bill from a supplier is a <strong>bill</strong> — use
              Log a Bill by Hand. Anything the restaurant spends on its own, such as
              electricity or marketing, is an <strong>expense</strong> — use New Expense.
              Cash spent out of the drawer is petty cash.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
