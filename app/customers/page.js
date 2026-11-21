'use client';

import Link from 'next/link';

/**
 * app/customers/page.js — the Customer module's front door.
 *
 * The Customer section is a module like Finance or Operations, so it opens the
 * same way they do: a page of cards, each one a job that can be done.
 *
 *   Overview        the whole picture in one screen — value, people, the gap.
 *   All Customers   everyone on the books, searchable and sortable.
 *   Reviews         what people said on Zomato, Swiggy and Google.
 *   Feedback        what people wrote on the feedback form, and what they want improved.
 */

const MODULES = [
  {
    title: 'Overview',
    subtitle: 'The Whole Picture',
    description:
      'How much of the business belongs to a person, how many come back, and how much is still unattributed.',
    href: '/customers/overview',
  },
  {
    title: 'All Customers',
    subtitle: 'Who They Are',
    description:
      'Every customer on the books, keyed on their contact number — what they have spent and when they last came.',
    href: '/customers/list',
  },
  {
    title: 'Reviews',
    subtitle: 'What People Say',
    description:
      'The rating and comments on each of our three listings — Zomato, Swiggy Atelier and Swiggy Ambrosia — month by month, with the order behind each review.',
    href: '/customers/reviews',
  },
  {
    title: 'Feedback',
    subtitle: 'What They Want Improved',
    description:
      'The feedback form answered — question by question, the tags people used, and the waiter they were about.',
    href: '/customers/feedback',
  },
];

export default function CustomersModulePage() {
  return (
    <main className="min-h-screen bg-page text-ink">
      <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
            ← Home
          </Link>
          <span className="text-ink-muted text-sm">Module / Customers</span>
        </div>

        <div className="page-head mb-12">
          <h1 className="page-title font-serif text-4xl lg:text-5xl">Customers</h1>
          <p className="page-purpose text-ink-muted text-base lg:text-lg mt-3">
            Everyone who has ordered from us, keyed on their contact number — what they are worth,
            what they say about us, and what they want improved.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
          {MODULES.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className="panel bg-white border border-rule-soft rounded-card shadow-sm hover:shadow-md transition-all duration-300 block hover:-translate-y-0.5"
            >
              <div className="panel-body p-8 lg:p-10 flex flex-col h-full">
                <h2 className="font-serif text-2xl text-ink mb-2">{item.title}</h2>
                <p className="text-accent text-sm font-medium mb-3 tracking-wide uppercase">
                  {item.subtitle}
                </p>
                <p className="text-ink-muted text-sm leading-relaxed mb-6">
                  {item.description}
                </p>
                <span className="mt-auto text-sm font-medium text-accent inline-flex items-center gap-1">
                  Open Sub-module →
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
