'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  money, count, percent, rating, ratingPill, formatDate, formatMonth,
  channelLabel, platformLabel, customerName,
} from '../../lib/customerFormat';

/**
 * app/customers/page.js — the Customer section, in one page.
 *
 * Three things sit side by side here, because they are three answers to one
 * question: **how are we doing with our customers?**
 *
 *   1. **How much of the business belongs to a person** — the order value, the
 *      number of people, how many of them come back, and how much of the value
 *      has no contact number attached to it (the gap).
 *   2. **What people say** — the reviews left on Zomato and Swiggy, and the
 *      ratings they gave.
 *   3. **What people want improved** — the feedback form, question by
 *      question, with the tags people used and the waiter they were about.
 *
 * Google reviews are shown as a gap on purpose. They are not in Petpooja, and
 * they need Google's Business Profile API, which is granted by Google itself
 * after an application — not something this app can switch on.
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

export default function CustomersPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch('/api/customers')
      .then((res) => res.json())
      .then((json) => {
        if (!alive) return;
        if (json.success) setData(json.data);
        else setError(json.error || 'The Customer section could not be loaded.');
      })
      .catch(() => {
        if (alive) setError('The Customer section could not be loaded.');
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
          <p className="text-ink-muted">Loading the customer records…</p>
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

  const c = data.customers;
  const g = data.gap;
  const r = data.reviews;
  const f = data.feedback;
  const bestMonth = data.trend.reduce(
    (max, row) => Math.max(max, Number(row.customerAmount || 0)),
    0,
  );

  return (
    <main className="min-h-screen bg-page text-ink">
      <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
            ← Home
          </Link>
          <span className="text-ink-muted text-sm">Module / Customers</span>
        </div>

        <div className="page-head">
          <div>
            <h1 className="page-title">Customers</h1>
            <p className="page-purpose">
              Everyone who has ordered from us, keyed on their contact number — what they are
              worth, what they say about us, and what they want improved.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/customers" className="btn-secondary">Overview</Link>
            <Link href="/customers/list" className="btn-secondary">All customers</Link>
          </div>
        </div>

        {/* ---- The four figures ------------------------------------------ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Stat
            label="Customers on the books"
            value={count(c.count)}
            sub={`${count(c.orders)} orders worth ${money(c.totalSpend)}`}
          />
          <Stat
            label="Order value with a customer"
            value={money(data.orders.amount - g.amount)}
            sub={`${percent(data.coverage)} of all order value`}
            accent
          />
          <Stat
            label="Order value with no number"
            value={money(g.amount)}
            sub={`${count(g.orders)} orders — the gap`}
          />
          <Stat
            label="Average rating"
            value={rating(r.avgRating)}
            sub={`${count(r.count)} reviews on the delivery platforms`}
          />
        </div>

        {/* ---- The gap --------------------------------------------------- */}
        <section className="panel mb-8">
          <div className="panel-body">
            <SectionHead
              title="The gap — order value with no contact number"
              note="An order with no number on it still happened, and its money was still earned. It just cannot be counted as a customer's. This is the number worth closing at the counter."
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {data.channels.map((channel) => (
                <div key={channel.key} className="border border-rule-soft rounded-card p-4">
                  <p className="text-2xs uppercase tracking-wide text-ink-muted">{channel.label}</p>
                  <p className="font-serif text-2xl text-ink mt-1 tnum">{money(channel.gapAmount)}</p>
                  <p className="text-sm text-ink-muted mt-1">
                    {count(channel.gapOrders)} orders with no number
                  </p>
                  <p className="text-sm text-ink-muted mt-3">
                    {money(channel.amount)} belongs to a customer
                  </p>
                </div>
              ))}
            </div>
            <p className="note mt-4">
              <strong className="text-ink">{percent(g.share)}</strong> of the order value in the
              books has no contact number attached to it. A number asked for at the till closes
              this gap, and every rupee here becomes a customer the restaurant can find again.
            </p>
          </div>
        </section>

        {/* ---- Customers and the month by month -------------------------- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <section className="panel lg:col-span-2">
            <div className="panel-body">
              <SectionHead
                title="Month by month"
                note="Order value that belongs to a customer, and how many new customers each month brought in."
              />
              {data.trend.length === 0 ? (
                <p className="note">No orders have been pulled into the books yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[34rem]">
                    <thead>
                      <tr>
                        <th className="table-head">Month</th>
                        <th className="table-head">Orders</th>
                        <th className="table-head">Value with a customer</th>
                        <th className="table-head">New customers</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.trend.map((row) => (
                        <tr key={row.month}>
                          <td className="table-cell whitespace-nowrap">{formatMonth(row.month)}</td>
                          <td className="table-cell tnum">{count(row.orders)}</td>
                          <td className="table-cell">
                            <div className="flex items-center gap-3">
                              <span className="tnum whitespace-nowrap">{money(row.customerAmount)}</span>
                              <span className="w-24 shrink-0">
                                <Bar share={bestMonth ? (row.customerAmount / bestMonth) * 100 : 0} />
                              </span>
                            </div>
                          </td>
                          <td className="table-cell tnum">{count(row.newCustomers)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-body">
              <SectionHead title="The customers" note="Who they are, in one line each." />
              <div className="hairline-list">
                <div className="py-3">
                  <p className="text-2xs uppercase tracking-wide text-ink-muted">Customers on the books</p>
                  <p className="font-serif text-2xl text-ink tnum mt-1">{count(c.count)}</p>
                </div>
                <div className="py-3">
                  <p className="text-2xs uppercase tracking-wide text-ink-muted">Come back more than once</p>
                  <p className="font-serif text-2xl text-ink tnum mt-1">{percent(c.repeatRate)}</p>
                  <p className="text-sm text-ink-muted mt-1">{count(c.repeatCount)} of them</p>
                </div>
                <div className="py-3">
                  <p className="text-2xs uppercase tracking-wide text-ink-muted">New this month</p>
                  <p className="font-serif text-2xl text-ink tnum mt-1">{count(c.newThisMonth)}</p>
                </div>
                <div className="py-3">
                  <p className="text-2xs uppercase tracking-wide text-ink-muted">Average order value</p>
                  <p className="font-serif text-2xl text-ink tnum mt-1">{money(c.avgOrderValue)}</p>
                </div>
                <div className="py-3">
                  <p className="text-2xs uppercase tracking-wide text-ink-muted">Orders came from</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {Object.entries(c.byPlatform).map(([platform, n]) => (
                      <span key={platform} className="pill pill-quiet">
                        {platformLabel(platform)} · {count(n)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* ---- Reviews --------------------------------------------------- */}
        <section className="panel mb-8">
          <div className="panel-body">
            <SectionHead
              title="Reviews"
              note="What people said after eating with us, on the platforms they order from."
            />
            {r.count > 0 ? (
              <p className="note mb-6">
                {count(r.count)} reviews on the delivery platforms.{' '}
                {count(r.reachedCustomer)} of them reached a customer by name — a platform order usually
                carries no contact number, because the platform holds the customer's number and not
                Petpooja. The rest are still counted, rated and shown here.
              </p>
            ) : null}
            {r.platforms.length === 0 ? (
              <p className="note mb-6">
                No reviews have been pulled in yet. The nightly sync brings them in.
              </p>
            ) : null}
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

              {/* The Google gap, said plainly. It is shown whether or not the
                  other platforms have anything, because "we have no Google
                  reviews" and "we have not connected Google" are different
                  things and only one of them is true. */}
              <div className="border border-rule-soft rounded-card p-4 bg-page">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-serif text-lg text-ink">Google</h3>
                  <span className="pill pill-quiet">Not connected yet</span>
                </div>
                <p className="text-sm text-ink-muted mt-2">{data.google.note}</p>
                <p className="text-sm text-ink-muted mt-2">
                  A manager of the listing can read and reply to reviews — the only thing missing
                  is Google's approval for this app to read them.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ---- The feedback form ------------------------------------------ */}
        <section className="panel mb-8">
          <div className="panel-body">
            <SectionHead
              title="The customer feedback form"
              note="What people wrote when the floor asked them how they were doing."
            />
            {f.responses === 0 ? (
              <p className="note">No feedback form responses have been pulled in yet.</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <p className="text-2xs uppercase tracking-wide text-ink-muted mb-3">
                    How each part of the experience was rated
                  </p>
                  <div className="hairline-list">
                    {f.questionAverages.map((question) => (
                      <div key={question.field} className="py-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm text-ink">{question.heading}</span>
                          <span className="text-sm text-ink-muted tnum">
                            {question.count ? `${rating(question.average)} ★` : '—'}
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

                <div className="space-y-6">
                  <div className="border border-rule-soft rounded-card p-4">
                    <p className="text-2xs uppercase tracking-wide text-ink-muted">
                      Would they visit again?
                    </p>
                    <p className="font-serif text-2xl text-ink mt-1 tnum">
                      {count(f.responses)} response{count(f.responses) === 1 ? '' : 's'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {f.wouldVisit.map((answer) => (
                        <span key={answer.answer} className="pill pill-quiet">
                          {answer.answer} · {count(answer.count)}
                        </span>
                      ))}
                    </div>
                  </div>

                  {f.topTags.length > 0 && (
                    <div className="border border-rule-soft rounded-card p-4">
                      <p className="text-2xs uppercase tracking-wide text-ink-muted">
                        What they want improved
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {f.topTags.map((tag) => (
                          <span key={tag.tag} className="pill pill-quiet">
                            {tag.tag} · {tag.count}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {f.waiters.length > 0 && (
                    <div className="border border-rule-soft rounded-card p-4">
                      <p className="text-2xs uppercase tracking-wide text-ink-muted mb-2">
                        The waiter they were about
                      </p>
                      <div className="hairline-list">
                        {f.waiters.map((waiter) => (
                          <div key={waiter.waiter} className="py-2 flex items-center justify-between gap-3">
                            <span className="text-sm text-ink">{waiter.waiter}</span>
                            <span className={`pill ${ratingPill(waiter.avgOverall)}`}>
                              {rating(waiter.avgOverall)} ★ · {count(waiter.responses)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ---- The people ------------------------------------------------ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="panel">
            <div className="panel-body">
              <SectionHead title="The most valuable customers" note="By what they have spent with us." />
              {data.topCustomers.length === 0 ? (
                <p className="note">No customers on the books yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="table-head">Customer</th>
                        <th className="table-head">Orders</th>
                        <th className="table-head">Spent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topCustomers.map((customer) => (
                        <tr key={customer.phone}>
                          <td className="table-cell">
                            <Link href={`/customers/${customer.phone}`} className="text-ink hover:text-accent">
                              {customerName(customer.name)}
                            </Link>
                            <p className="text-xs text-ink-muted">{customer.maskedPhone}</p>
                          </td>
                          <td className="table-cell tnum">{count(customer.order_count)}</td>
                          <td className="table-cell tnum">{money(customer.total_spend)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-body">
              <SectionHead
                title="Customers worth calling back"
                note="Came at least 3 times, and have not been back for 45 days or more."
              />
              {data.atRisk.length === 0 ? (
                <p className="note">Nobody has drifted away. Good.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="table-head">Customer</th>
                        <th className="table-head">Last came</th>
                        <th className="table-head">Days since</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.atRisk.map((customer) => (
                        <tr key={customer.phone}>
                          <td className="table-cell">
                            <Link href={`/customers/${customer.phone}`} className="text-ink hover:text-accent">
                              {customerName(customer.name)}
                            </Link>
                            <p className="text-xs text-ink-muted">
                              {customer.maskedPhone} · {money(customer.total_spend)}
                            </p>
                          </td>
                          <td className="table-cell whitespace-nowrap">{formatDate(customer.last_order_at)}</td>
                          <td className="table-cell tnum">{count(customer.daysSince)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>

        <p className="note mt-8">
          The books cover orders from {formatDate(data.window.firstOrder)} to{' '}
          {formatDate(data.window.lastOrder)}. Everything here is worked out from those orders — a
          customer is a person whose order carried a real contact number, so no one is counted twice.
        </p>
      </div>
    </main>
  );
}
