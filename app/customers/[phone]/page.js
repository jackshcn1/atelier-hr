'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  money, count, rating, ratingPill, formatDate, channelLabel, listingLabel,
  customerListingLabel, customerName,
} from '../../../lib/customerFormat';

/**
 * app/customers/[phone]/page.js — one customer.
 *
 * Everything the books know about one person, in the order a manager would
 * want it: who they are and what they are worth, then the orders that made
 * it, then what they said afterwards.
 *
 * The full contact number is on this page on purpose — this is the page you
 * open to call someone.
 */

export default function CustomerDetailPage() {
  const params = useParams();
  const phone = params?.phone;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!phone) return;
    let alive = true;
    setLoading(true);
    fetch(`/api/customers?view=detail&phone=${encodeURIComponent(phone)}`)
      .then((res) => res.json())
      .then((json) => {
        if (!alive) return;
        if (json.success) setData(json.data);
        else setError(json.error || 'That customer could not be found.');
      })
      .catch(() => {
        if (alive) setError('That customer could not be found.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [phone]);

  if (loading) {
    return (
      <main className="min-h-screen bg-page text-ink">
        <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
          <p className="text-ink-muted">Loading the customer…</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-page text-ink">
        <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
          <div className="flex items-center gap-3 mb-6">
            <Link href="/customers/list" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
              ← All customers
            </Link>
          </div>
          <div className="note">{error}</div>
        </div>
      </main>
    );
  }

  const c = data.customer;

  return (
    <main className="min-h-screen bg-page text-ink">
      <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/customers/list" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
            ← All customers
          </Link>
          <span className="text-ink-muted text-sm">Customers / All Customers</span>
        </div>

        <div className="page-head">
          <div>
            <h1 className="page-title">{customerName(c.name)}</h1>
            <p className="page-purpose">
              <span className="tnum">{c.phone}</span>
              {c.address ? ` · ${c.address}` : ''}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link href="/customers/overview" className="btn-secondary">Overview</Link>
            <Link href="/customers/list" className="btn-secondary">All customers</Link>
            <Link href="/customers/reviews" className="btn-secondary">Reviews</Link>
            <Link href="/customers/feedback" className="btn-secondary">Feedback</Link>
          </div>
        </div>

        {/* ---- The figures ---------------------------------------------- */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="panel">
            <div className="panel-body">
              <p className="text-2xs uppercase tracking-wide text-ink-muted">What they have spent</p>
              <p className="font-serif text-[1.75rem] leading-tight mt-2 tnum text-accent">
                {money(c.total_spend)}
              </p>
              <p className="text-sm text-ink-muted mt-1">over {count(c.order_count)} orders</p>
            </div>
          </div>
          <div className="panel">
            <div className="panel-body">
              <p className="text-2xs uppercase tracking-wide text-ink-muted">Average order</p>
              <p className="font-serif text-[1.75rem] leading-tight mt-2 tnum">
                {money(c.avg_order_value)}
              </p>
            </div>
          </div>
          <div className="panel">
            <div className="panel-body">
              <p className="text-2xs uppercase tracking-wide text-ink-muted">They order through</p>
              <p className="font-serif text-[1.75rem] leading-tight mt-2">
                {customerListingLabel(c.listing, c.listings)}
              </p>
              <p className="text-sm text-ink-muted mt-1">
                {Object.entries(c.channel_mix || {})
                  .filter(([, n]) => Number(n) > 0)
                  .map(([key, n]) => `${channelLabel(key)} ${count(n)}`)
                  .join(' · ') || 'No orders'}
              </p>
            </div>
          </div>
          <div className="panel">
            <div className="panel-body">
              <p className="text-2xs uppercase tracking-wide text-ink-muted">They said</p>
              <p className="font-serif text-[1.75rem] leading-tight mt-2 tnum">
                {c.avg_rating ? rating(c.avg_rating) : '—'}
              </p>
              <p className="text-sm text-ink-muted mt-1">
                {count(c.review_count)} review{c.review_count === 1 ? '' : 's'}
                {c.feedback_count ? ` · ${count(c.feedback_count)} feedback` : ''}
              </p>
            </div>
          </div>
        </div>

        {/* ---- When they came -------------------------------------------- */}
        <div className="panel mb-8">
          <div className="panel-body grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-2xs uppercase tracking-wide text-ink-muted">First time</p>
              <p className="text-sm text-ink mt-1">{formatDate(c.first_order_at)}</p>
            </div>
            <div>
              <p className="text-2xs uppercase tracking-wide text-ink-muted">Most recently</p>
              <p className="text-sm text-ink mt-1">{formatDate(c.last_order_at)}</p>
            </div>
            <div>
              <p className="text-2xs uppercase tracking-wide text-ink-muted">Number on file</p>
              <p className="text-sm text-ink mt-1 tnum">{c.phone}</p>
            </div>
          </div>
        </div>

        {/* ---- The orders ------------------------------------------------ */}
        <section className="panel mb-8">
          <div className="panel-body">
            <h2 className="panel-title mb-4">Their orders</h2>
            {data.orders.length === 0 ? (
              <p className="note">No orders on file.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[44rem]">
                  <thead>
                    <tr>
                      <th className="table-head">Order</th>
                      <th className="table-head">Date</th>
                      <th className="table-head">Where</th>
                      <th className="table-head">Items</th>
                      <th className="table-head">Paid by</th>
                      <th className="table-head">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.orders.map((order) => (
                      <tr key={`${order.order_no}-${order.order_date}`}>
                        <td className="table-cell tnum whitespace-nowrap">{order.order_no}</td>
                        <td className="table-cell whitespace-nowrap">{formatDate(order.order_date)}</td>
                        <td className="table-cell">{channelLabel(order.channel)}</td>
                        <td className="table-cell text-ink-muted max-w-[18rem] truncate" title={order.items}>
                          {order.items || '—'}
                        </td>
                        <td className="table-cell">{order.payment_type || '—'}</td>
                        <td className="table-cell tnum">{money(order.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* ---- What they said -------------------------------------------- */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="panel">
            <div className="panel-body">
              <h2 className="panel-title mb-4">Their reviews</h2>
              {data.reviews.length === 0 ? (
                <p className="note">They have not left a review on a delivery platform.</p>
              ) : (
                <div className="hairline-list">
                  {data.reviews.map((review, index) => (
                    <div key={`${review.order_no}-${index}`} className="py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-ink">
                          {listingLabel(review.listing)}
                        </span>
                        <span className={`pill ${ratingPill(review.rating)}`}>
                          {rating(review.rating)} ★
                        </span>
                      </div>
                      {review.comment ? (
                        <p className="text-sm text-ink mt-2">“{review.comment}”</p>
                      ) : (
                        <p className="text-sm text-ink-muted mt-2">No written comment.</p>
                      )}
                      <p className="text-xs text-ink-muted mt-1">{formatDate(review.review_date)}</p>
                      {review.order ? (
                        <p className="text-xs text-ink-muted mt-1">
                          On order #{review.order.order_no}
                          {review.order.order_date ? ` · ${formatDate(review.order.order_date)}` : ''}
                          {review.order.items ? ` — ${review.order.items}` : ''}
                          {review.order.amount ? ` — ${money(review.order.amount)}` : ''}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-body">
              <h2 className="panel-title mb-4">Their feedback form responses</h2>
              {data.feedback.length === 0 ? (
                <p className="note">
                  They have not filled in a feedback form. The form is joined by its bill number,
                  so a response reaches a customer only when the bill number is one of their
                  orders.
                </p>
              ) : (
                <div className="hairline-list">
                  {data.feedback.map((response, index) => (
                    <div key={`${response.bill_number}-${index}`} className="py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-ink">
                          {response.waiter ? `Waiter: ${response.waiter}` : 'Feedback form'}
                        </span>
                        <span className={`pill ${ratingPill(response.overall)}`}>
                          {rating(response.overall)} ★
                        </span>
                      </div>
                      {response.comment ? (
                        <p className="text-sm text-ink mt-2">“{response.comment}”</p>
                      ) : null}
                      {response.improvement_tags?.length ? (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {response.improvement_tags.map((tag) => (
                            <span key={tag} className="pill pill-quiet">{tag}</span>
                          ))}
                        </div>
                      ) : null}
                      <p className="text-xs text-ink-muted mt-1">
                        Bill {response.bill_number} · {formatDate(response.response_date)}
                        {response.would_visit_again ? ` · ${response.would_visit_again}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
