'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  count, rating, ratingPill, formatDate, formatMonth, platformLabel,
} from '../../../lib/customerFormat';

/**
 * app/customers/reviews/page.js — what people said about us.
 *
 * The reviews come from the platforms the food is ordered from: Zomato and
 * Swiggy, both read out of Petpooja. Google is shown as a gap on purpose —
 * "we have no Google reviews" and "we have not connected Google" are
 * different things, and only one of them is true.
 *
 * **The honest limit, stated on the page.** A platform order usually carries
 * no contact number — the platform holds the customer's number, not
 * Petpooja — so most reviews cannot be attached to a customer. They are still
 * counted, rated, averaged and shown. They just cannot be given to a person.
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

export default function CustomerReviewsPage() {
  const [data, setData] = useState(null);
  const [platform, setPlatform] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams({ view: 'reviews' });
    if (platform) params.set('platform', platform);

    fetch(`/api/customers?${params.toString()}`)
      .then((res) => res.json())
      .then((json) => {
        if (!alive) return;
        if (json.success) setData(json.data);
        else setError(json.error || 'The reviews could not be loaded.');
      })
      .catch(() => {
        if (alive) setError('The reviews could not be loaded.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => { alive = false; };
  }, [platform]);

  const bestMonth = useMemo(() => {
    if (!data) return 0;
    return data.ratingTrend.reduce((max, row) => Math.max(max, Number(row.avgRating || 0)), 0);
  }, [data]);

  if (loading) {
    return (
      <main className="min-h-screen bg-page text-ink">
        <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
          <p className="text-ink-muted">Loading the reviews…</p>
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

  const r = data;

  return (
    <main className="min-h-screen bg-page text-ink">
      <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/customers" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
            ← Back to Customers
          </Link>
          <span className="text-ink-muted text-sm">Customers / Reviews</span>
        </div>

        <div className="page-head mb-12 flex justify-between items-center gap-6">
          <div>
            <h1 className="page-title">Reviews</h1>
            <p className="page-purpose">
              What people said after eating with us, on the platforms they order from — and the
              Google listing waiting to be connected.
            </p>
          </div>
          <Link href="/customers/overview" className="btn-secondary">Overview</Link>
        </div>

        {/* ---- The four figures ------------------------------------------ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Stat
            label="Reviews on the books"
            value={count(r.count)}
            sub={`${count(r.withComment)} with a written comment`}
          />
          <Stat
            label="Average rating"
            value={rating(r.avgRating)}
            sub="Out of five, across every platform"
            accent
          />
          <Stat
            label="Platforms"
            value={count(r.platforms.length)}
            sub={r.platforms.map((p) => platformLabel(p.platform)).join(' · ') || 'None yet'}
          />
          <Stat
            label="Reached a customer"
            value={count(r.reachedCustomer)}
            sub="Could be given to a person by their number"
          />
        </div>

        {/* ---- The platforms ---------------------------------------------- */}
        <section className="panel mb-8">
          <div className="panel-body">
            <SectionHead
              title="By platform"
              note="The rating people gave, and what they wrote about us."
            />
            {r.platforms.length === 0 ? (
              <p className="note">No reviews have been pulled in yet. The nightly sync brings them in.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {r.platforms.map((platform) => (
                  <div key={platform.platform} className="border border-rule-soft rounded-card p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-serif text-lg text-ink">{platformLabel(platform.platform)}</h3>
                      <span className={`pill ${ratingPill(platform.avgRating)}`}>
                        {rating(platform.avgRating)} out of 5
                      </span>
                    </div>
                    <p className="text-sm text-ink-muted mt-1">
                      {count(platform.count)} reviews · {count(platform.linked)} matched to an order
                    </p>
                    <div className="mt-3">
                      <Bar
                        share={platform.avgRating ? (platform.avgRating / 5) * 100 : 0}
                        tone={platform.avgRating >= 4 ? 'good' : platform.avgRating >= 3 ? 'warn' : 'accent'}
                      />
                    </div>
                    {platform.comments.length > 0 ? (
                      <div className="hairline-list mt-3">
                        {platform.comments.slice(0, 4).map((comment, index) => (
                          <div key={`${comment.date}-${index}`} className="py-2">
                            <p className="text-sm text-ink">“{comment.comment}”</p>
                            <p className="text-xs text-ink-muted mt-1">
                              {rating(comment.rating)} ★ · {formatDate(comment.date)}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-ink-muted mt-3">No written comment on this platform.</p>
                    )}
                  </div>
                ))}

                {/* The Google gap, said plainly. */}
                <div className="border border-rule-soft rounded-card p-4 bg-page">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-serif text-lg text-ink">Google</h3>
                    <span className="pill pill-quiet">Not connected yet</span>
                  </div>
                  <p className="text-sm text-ink-muted mt-2">
                    Google reviews are not in Petpooja. They come from the Google Business Profile
                    API, which needs access granted by Google (7–14 working days). The column is
                    ready and waiting.
                  </p>
                  <p className="text-sm text-ink-muted mt-2">
                    A manager of the listing can read and reply to reviews — the only thing missing
                    is Google's approval for this app to read them.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ---- The rating month by month --------------------------------- */}
        <section className="panel mb-8">
          <div className="panel-body">
            <SectionHead
              title="The rating, month by month"
              note="A fall in the rating is a fall in the business. This is where it would show first."
            />
            {r.ratingTrend.length === 0 ? (
              <p className="note">No dated reviews yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[30rem]">
                  <thead>
                    <tr>
                      <th className="table-head">Month</th>
                      <th className="table-head">Reviews</th>
                      <th className="table-head">Average rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.ratingTrend.map((row) => (
                      <tr key={row.month}>
                        <td className="table-cell whitespace-nowrap">{formatMonth(row.month)}</td>
                        <td className="table-cell tnum">{count(row.count)}</td>
                        <td className="table-cell">
                          <div className="flex items-center gap-3">
                            <span className="tnum whitespace-nowrap">{rating(row.avgRating)} ★</span>
                            <span className="w-24 shrink-0">
                              <Bar
                                share={bestMonth ? (row.avgRating / bestMonth) * 100 : 0}
                                tone={row.avgRating >= 4 ? 'good' : row.avgRating >= 3 ? 'warn' : 'accent'}
                              />
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* ---- Every review ---------------------------------------------- */}
        <section className="panel">
          <div className="panel-body">
            <SectionHead
              title="Every review"
              note="Newest first. Click a platform to narrow the list."
            />

            <div className="flex flex-wrap gap-1.5 mb-6">
              <button
                type="button"
                onClick={() => setPlatform('')}
                className={platform === '' ? 'btn-primary text-xs px-3 py-1.5' : 'btn-secondary text-xs px-3 py-1.5'}
              >
                All · {count(r.count)}
              </button>
              {r.platforms.map((p) => (
                <button
                  key={p.platform}
                  type="button"
                  onClick={() => setPlatform(p.platform)}
                  className={
                    platform === p.platform
                      ? 'btn-primary text-xs px-3 py-1.5'
                      : 'btn-secondary text-xs px-3 py-1.5'
                  }
                >
                  {platformLabel(p.platform)} · {count(p.count)}
                </button>
              ))}
            </div>

            {r.rows.length === 0 ? (
              <p className="note">No reviews on this platform yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[44rem]">
                  <thead>
                    <tr>
                      <th className="table-head">Date</th>
                      <th className="table-head">Platform</th>
                      <th className="table-head">Rating</th>
                      <th className="table-head">What they said</th>
                      <th className="table-head">Reached</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.rows.map((row, index) => (
                      <tr key={`${row.platform}-${row.review_date}-${index}`}>
                        <td className="table-cell whitespace-nowrap">{formatDate(row.review_date)}</td>
                        <td className="table-cell whitespace-nowrap">{platformLabel(row.platform)}</td>
                        <td className="table-cell">
                          <span className={`pill whitespace-nowrap ${ratingPill(row.rating)}`}>
                            {rating(row.rating)} ★
                          </span>
                        </td>
                        <td className="table-cell">
                          {row.comment ? (
                            <span className="text-ink">“{row.comment}”</span>
                          ) : (
                            <span className="text-ink-muted">No comment</span>
                          )}
                        </td>
                        <td className="table-cell whitespace-nowrap">
                          {row.maskedPhone ? (
                            <Link href={`/customers/${row.phone}`} className="text-ink hover:text-accent">
                              {row.maskedPhone}
                            </Link>
                          ) : row.is_linked ? (
                            <span className="text-ink-muted">Order only</span>
                          ) : (
                            <span className="text-ink-muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="note mt-6">
              {count(r.reachedCustomer)} of {count(r.count)} reviews could be given to a customer by
              their contact number. The rest are still counted and rated — a platform order usually
              carries no number on it, because the platform holds the customer's number and not
              Petpooja. Closing that gap is a job for the counter, not for the app.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
