import Link from 'next/link';

// The privacy policy.
//
// It has to be a public page: Google's OAuth consent screen asks for a
// privacy policy URL, and a policy nobody can read is not a policy. So this
// one is outside the login gate — it says what the system holds and who it
// is for, and nothing about any individual's record.

export const metadata = {
  title: 'Privacy Policy — Atelier HR',
  description: 'How Atelier HR handles the restaurant’s staff, payroll and expense records.',
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-3xl mx-auto px-6 py-16 lg:py-24">
        <div className="mb-8">
          <Link href="/login" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
            ← Back to sign in
          </Link>
        </div>

        <header className="page-head mb-8">
          <h1 className="page-title font-serif text-4xl lg:text-5xl">Privacy Policy</h1>
          <p className="page-purpose text-[#6b635c] text-base lg:text-lg mt-3">
            Atelier HR — the restaurant’s staff, payroll and expense system.
            Last updated 18 November 2026.
          </p>
        </header>

        <div className="panel panel-body space-y-6 text-sm text-[#3a332c] leading-relaxed">
          <section>
            <h2 className="panel-title mb-2">Who this is for</h2>
            <p>
              Atelier HR is an internal system used by the staff of Atelier Next Plate. Only
              people with an account on the system can sign in and see anything in it.
            </p>
          </section>

          <section>
            <h2 className="panel-title mb-2">What the system holds</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Staff records — name, role, department, contact details, joining and leaving dates.</li>
              <li>Attendance, leave and payroll — hours worked, salary, advances and payslips.</li>
              <li>Documents — identity papers, compliance records, training material and signed agreements.</li>
              <li>Expenses — bills, their amounts, the supplier paid, and the invoice attached to them.</li>
            </ul>
          </section>

          <section>
            <h2 className="panel-title mb-2">Where it is kept</h2>
            <p>
              The records are held in a private Supabase database, and the invoices attached to
              bills are held in the restaurant’s own Google Drive folder. Neither is open to the
              public. Access is by account, and what each person can see is decided by their role.
            </p>
          </section>

          <section>
            <h2 className="panel-title mb-2">Who it is shared with</h2>
            <p>
              Only the restaurant’s own staff, and only for the work the system is used for. The
              records are not sold, and they are not shared with anyone outside the restaurant.
            </p>
          </section>

          <section>
            <h2 className="panel-title mb-2">How long it is kept</h2>
            <p>
              Staff records and their payslips are kept for the period the restaurant is required
              to keep them. A leaver’s record is kept for the same reason, and the exit record
              stays with it.
            </p>
          </section>

          <section>
            <h2 className="panel-title mb-2">Questions, or a request about your record</h2>
            <p>
              Write to <a href="mailto:ateliernextplate@gmail.com" className="underline">ateliernextplate@gmail.com</a>,
              and the restaurant will answer, or tell you what it holds about you and correct
              anything that is wrong.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
