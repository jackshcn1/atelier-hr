'use client';

import Link from 'next/link';

/**
 * app/operations/page.js — the Operations module's front door.
 *
 * The Operations section is a module like Finance or Customers, so it opens
 * the same way they do: a page of cards, each one a job that can be done.
 *
 *   Assets            what we own — every piece of equipment, with its number,
 *                     condition and who holds it.
 *   Maintenance       the work orders — what is broken, who is on it, where it stands.
 *   Maintenance POCs  the people we call — their speciality, contact and past work.
 *   Compliance        licences, certifications and inspections, and what expires next.
 */

const MODULES = [
  {
    title: 'Assets',
    subtitle: 'What We Own',
    description:
      'Every piece of equipment, furniture and uniform — its asset number, its condition, where it is, and which employee holds it.',
    href: '/operations/assets',
  },
  {
    title: 'Maintenance',
    subtitle: 'Keeping Things Running',
    description:
      'The work orders — what has broken, who reported it, which technician is on the job, and where every job stands.',
    href: '/operations/maintenance',
  },
  {
    title: 'Maintenance POCs',
    subtitle: 'Who We Call',
    description:
      'The people we call when something breaks — their speciality, how to reach them, and what they did for us last time.',
    href: '/operations/maintenance-pocs',
  },
  {
    title: 'Compliance',
    subtitle: 'Staying Legal',
    description:
      'Licences, certifications and inspection records, with the ones that expire soon flagged before they lapse.',
    href: '/operations/compliance',
  },
];

export default function OperationsModulePage() {
  return (
    <main className="min-h-screen bg-page text-ink">
      <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
            ← Home
          </Link>
          <span className="text-ink-muted text-sm">Module / Operations</span>
        </div>

        <div className="page-head mb-12">
          <h1 className="page-title font-serif text-4xl lg:text-5xl">Operations</h1>
          <p className="page-purpose text-ink-muted text-base lg:text-lg mt-3">
            What we own, what has broken, who we call to fix it, and what has to stay legal.
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
