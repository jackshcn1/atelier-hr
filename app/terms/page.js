import Link from 'next/link';

// The terms of service.
//
// Google's consent screen asks for one alongside the privacy policy, and it
// has to be a public page — the same reason the privacy policy is.

export const metadata = {
  title: 'Terms of Service — Atelier HR',
  description: 'The terms for using Atelier HR, the restaurant’s staff, payroll and expense system.',
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-3xl mx-auto px-6 py-16 lg:py-24">
        <div className="mb-8">
          <Link href="/login" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
            ← Back to sign in
          </Link>
        </div>

        <header className="page-head mb-8">
          <h1 className="page-title font-serif text-4xl lg:text-5xl">Terms of Service</h1>
          <p className="page-purpose text-[#6b635c] text-base lg:text-lg mt-3">
            Atelier HR — the restaurant’s staff, payroll and expense system.
            Last updated 18 November 2026.
          </p>
        </header>

        <div className="panel panel-body space-y-6 text-sm text-[#3a332c] leading-relaxed">
          <section>
            <h2 className="panel-title mb-2">Who these terms are for</h2>
            <p>
              These terms apply to anyone with an account on Atelier HR — the restaurant’s own
              staff. By using the system, you agree to them.
            </p>
          </section>

          <section>
            <h2 className="panel-title mb-2">How the system is to be used</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Use it only for the restaurant’s work.</li>
              <li>Keep your sign-in to yourself, and sign out on a shared device.</li>
              <li>Do not copy records, photographs or invoices out of the system, except for the restaurant’s own business.</li>
              <li>Enter things accurately. The restaurant is answerable for what its records say.</li>
            </ul>
          </section>

          <section>
            <h2 className="panel-title mb-2">Access</h2>
            <p>
              The restaurant’s administrators decide who has an account and what each person can
              see. An account can be suspended or closed at any time, and doing so does not
              affect the person’s records or their pay.
            </p>
          </section>

          <section>
            <h2 className="panel-title mb-2">Availability</h2>
            <p>
              The system is provided as it stands, for the restaurant’s internal use. Access may
              be interrupted for maintenance or for reasons outside the restaurant’s control.
            </p>
          </section>

          <section>
            <h2 className="panel-title mb-2">Your records</h2>
            <p>
              What the system holds about you, and what is done with it, is set out in the{' '}
              <Link href="/privacy" className="underline">
                privacy policy
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="panel-title mb-2">Questions</h2>
            <p>
              Write to{' '}
              <a href="mailto:ateliernextplate@gmail.com" className="underline">
                ateliernextplate@gmail.com
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
