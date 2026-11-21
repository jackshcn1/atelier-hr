'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  count, rating, ratingPill, formatDate, customerName,
} from '../../../lib/customerFormat';

/**
 * app/customers/feedback/page.js — the customer feedback form, answered.
 *
 * The feedback form is filled in on the floor and lands in a Google Sheet. The
 * nightly pull brings it into the books, and this page reads it back as a
 * dashboard of what people want improved.
 *
 * **The honest limit, stated on the page.** The form has no phone column, so
 * a response reaches a customer only when its bill number is an order number
 * (the owner's decision, 20 Nov 2026). A response that does not match is kept
 * and still counts in the ratings — it is simply reported as unlinked.
 */

/** One figure, with the line that explains it. */
function Stat({ label, value, sub, accent }) {
  return (
    <div className="panel">
      <div className="panel-body">
        <p className="text-2xs uppercase tracking-wide text-ink-muted">{label}</p>
        <p className={`font-serif text-[2rem] leading-tight mt-2 tnum ${accent ? 'text-accent' : 'text-ink'}`}>
          {value}
        </p>
        <p className="text-sm text-ink-muted mt-2">{sub}</p>
      </div>
    </div>
  );
}

/** A section heading with its own explanation. */
function SectionHead({ title, note }) {
  return (
    <div className="mb-4">
      <h2 className="panel-title">{title}</h2>
      {note ? <p className="text-sm text-ink-muted mt-1">{note}</p> : null}
    </div>
  );
}

/** A bar that fills to a share of the largest value in its group. */
function Bar({ share, tone = 'accent' }) {
  const width = Math.max(0, Math.min(100, Number(share) || 0));
  const colour = tone === 'good' ? 'bg-good' : tone === 'warn' ? 'bg-warn' : 'bg-accent';
  return (
    <div className="meter">
      <div className={`meter-fill ${colour}`} style={{ width: `${width}%` }} />
    </div>
  );
}

export default function CustomerFeedbackPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch('/api/customers?view=feedback')
      .then((res) => res.json())
      .then((json) => {
        if (!alive) return;
        if (json.success) setData(json.data);
        else setError(json.error || 'The feedback could not be loaded.');
      })
      .catch(() => {
        if (alive) setError('The feedback could not be loaded.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-page text-ink">
        <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
          <p className="text-ink-muted">Loading the feedback…</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-page text-ink">
        <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
          <div className="note">{error}</div>
        </div>
      </main>
    );
  }

  const f = data;
  const overall = f.questionAverages.find((q) => q.field === 'overall');

  return (
    <main className="min-h-screen bg-page text-ink">
      <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/customers" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
            ← Back to Customers
          </Link>
          <span className="text-ink-muted text-sm">Customers / Feedback</span>
        </div>

        <div className="page-head mb-12 flex justify-between items-center gap-6">
          <div>
            <h1 className="page-title">Feedback</h1>
            <p className="page-purpose">
              What people wrote when the floor asked them how they were doing — question by
              question, the tags they used, and the waiter they were about.
            </p>
          </div>
          <Link href="/customers/overview" className="btn-secondary">Overview</Link>
        </div>

        {/* ---- The four figures ------------------------------------------ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Stat
            label="Responses"
            value={count(f.responses)}
            sub="Filled in on the floor"
          />
          <Stat
            label="Overall experience"
            value={overall && overall.count ? rating(overall.average) : '—'}
            sub="Out of five, as people rated it"
            accent
          />
          <Stat
            label="Matched to an order"
            value={count(f.linked)}
            sub={`${count(f.unlinked)} could not be matched`}
          />
          <Stat
            label="Waiters rated"
            value={count(f.waiters.length)}
            sub="The people the responses were about"
          />
        </div>

        {f.responses === 0 ? (
          <section className="panel mb-8">
            <div className="panel-body">
              <p className="note">
                No feedback form responses have been pulled in yet. The nightly sync brings them in
                as soon as the floor fills the form in.
              </p>
            </div>
          </section>
        ) : (
          <>
            {/* ---- How each part was rated -------------------------------- */}
            <section className="panel mb-8">
              <div className="panel-body">
                <SectionHead
                  title="How each part of the experience was rated"
                  note="Six questions on the form, each answered out of five. The lowest bar is the one worth fixing."
                />
                <div className="hairline-list">
                  {f.questionAverages.map((question) => (
                    <div key={question.field} className="py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-ink">{question.heading}</span>
                        <span className="text-sm text-ink-muted tnum">
                          {question.count ? `${rating(question.average)} ★` : '—'}
                          {question.count ? ` · ${count(question.count)} answered` : ' · not answered yet'}
                        </span>
                      </div>
                      <div className="mt-2">
                        <Bar
                          share={question.average ? (question.average / 5) * 100 : 0}
                          tone={question.average >= 4 ? 'good' : question.average >= 3 ? 'warn' : 'accent'}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              {/* ---- Would they come again -------------------------------- */}
              <section className="panel">
                <div className="panel-body">
                  <SectionHead
                    title="Would they visit again?"
                    note="Answered on the same scale as the rating questions, so the answers are counted as they were written."
                  />
                  {f.wouldVisit.length === 0 ? (
                    <p className="note">No answers yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {f.wouldVisit.map((answer) => (
                        <span key={answer.answer} className="pill pill-quiet">
                          {answer.answer} · {count(answer.count)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              {/* ---- What they want improved ------------------------------ */}
              <section className="panel">
                <div className="panel-body">
                  <SectionHead
                    title="What they want improved"
                    note="The tags people picked, most chosen first."
                  />
                  {f.topTags.length === 0 ? (
                    <p className="note">Nobody has named anything to improve yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {f.topTags.map((tag) => (
                        <span key={tag.tag} className="pill pill-quiet">
                          {tag.tag} · {count(tag.count)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              {/* ---- The waiter they were about --------------------------- */}
              <section className="panel">
                <div className="panel-body">
                  <SectionHead
                    title="The waiter they were about"
                    note="Overall rating given, per waiter."
                  />
                  {f.waiters.length === 0 ? (
                    <p className="note">No waiter was named.</p>
                  ) : (
                    <div className="hairline-list">
                      {f.waiters.map((waiter) => (
                        <div key={waiter.waiter} className="py-2 flex items-center justify-between gap-3">
                          <span className="text-sm text-ink">{customerName(waiter.waiter)}</span>
                          <span className={`pill ${ratingPill(waiter.avgOverall)}`}>
                            {rating(waiter.avgOverall)} ★ · {count(waiter.responses)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </>
        )}

        {/* ---- Every response -------------------------------------------- */}
        <section className="panel">
          <div className="panel-body">
            <SectionHead
              title="Every response"
              note="Newest first, exactly as it was written on the form."
            />
            {f.rows.length === 0 ? (
              <p className="note">No responses to show.</p>
            ) : (
              <div className="space-y-4">
                {f.rows.map((row, index) => (
                  <div key={`${row.bill_number}-${row.response_date}-${index}`} className="border border-rule-soft rounded-card p-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`pill ${ratingPill(row.overall)}`}>
                          {rating(row.overall)} ★ overall
                        </span>
                        <span className="text-sm text-ink">
                          {customerName(row.waiter)}
                        </span>
                        {row.would_visit_again ? (
                          <span className="pill pill-quiet">{row.would_visit_again}</span>
                        ) : null}
                      </div>
                      <span className="text-sm text-ink-muted whitespace-nowrap">
                        {formatDate(row.response_date)} · bill {row.bill_number || '—'}
                      </span>
                    </div>

                    {row.comment ? (
                      <p className="text-sm text-ink mt-3">“{row.comment}”</p>
                    ) : null}

                    {row.improvement_tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {row.improvement_tags.map((tag) => (
                          <span key={tag} className="pill pill-quiet">{tag}</span>
                        ))}
                      </div>
                    ) : null}

                    <div className="flex flex-wrap gap-4 mt-3 text-xs text-ink-muted">
                      {[
                        ['Food', row.food_quality],
                        ['Taste', row.taste],
                        ['Service', row.service],
                        ['Hospitality', row.hospitality],
                        ['Waiting', row.waiting_time],
                      ]
                        .filter(([, value]) => Number(value) > 0)
                        .map(([label, value]) => (
                          <span key={label}>
                            {label} {rating(value)} ★
                          </span>
                        ))}
                      <span>
                        {row.is_linked ? 'Matched to an order' : 'Not matched to an order'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="note mt-6">
              {count(f.linked)} of {count(f.responses)} responses were matched to an order by their
              bill number. The rest are kept and still counted — the form carries no phone number,
              so a response can only be given to a customer when the bill it names is an order we
              have.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
