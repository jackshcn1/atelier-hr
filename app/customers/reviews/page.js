'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  count, rating, ratingPill, formatDate, formatMonth, money, listingLabel,
} from '../../../lib/customerFormat';
import { UNLISTED_KEY, GOOGLE_LISTING_KEY } from '../../../lib/customerParsers';

/**
 * app/customers/reviews/page.js — what people said about us.
 *
 * ## The listings, not the platforms
 *
 * The restaurant is on **four** pages: Zomato, Swiggy — Atelier,
 * Swiggy — Ambrosia and Google. Swiggy carries two of them, and they are two
 * different pages with two different ratings and two different sets of
 * people complaining. Averaging them into one "Swiggy" is what made the
 * number on the site disagree with the number on the platform. So every
 * count and every average on this page is **per listing**.
 *
 * Google is the odd one out: it is a page people review us on, but nobody
 * orders there, so it carries no reviews of its own until the Business
 * Profile API is connected. It shows Google's own rating, which is bigger
 * than either marketplace's.
 *
 * ## Two ratings, side by side, each labelled
 *
 *   On the platform   the rating the platform publishes — Zomato 4.3 from
 *                     4,401 ratings. It is read from the platform's own
 *                     page, and it covers the whole life of the listing.
 *
 *   From our reviews  the average of the reviews Petpooja holds. Petpooja
 *                     only holds them **from March 2026**, so this number is
 *                     always the smaller history.
 *
 * They are different numbers because they are different questions, and the
 * page says which is which rather than picking one.
 *
 * ## Which order the review came from
 *
 * Every review is matched to the order it was left on, and the order is
 * shown with the review — what was ordered, what it came to. The join is on
 * the pair (order number, day), because Petpooja restarts its order
 * numbering and a number on its own is not an identity.
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

/**
 * The rating a platform publishes, in words.
 *
 * Swiggy publishes an abbreviation ("2.6K+") and no exact count, so the
 * abbreviation is what is shown — an expanded guess would be a number the
 * platform never published.
 */
function officialCount(official) {
  if (!official) return '—';
  if (official.countText) return official.countText;
  if (official.count !== null && official.count !== undefined) return count(official.count);
  return '—';
}

/**
 * Where a rating was read from, in words.
 *
 * A number that was measured one way must not be shown as though it were
 * measured another way — so the page says which way it was.
 */
function sourceLabel(source) {
  if (source === 'places_api') return 'Google’s Places API';
  if (source === 'maps_page') return 'the Google Maps listing';
  if (source === 'platform_page') return 'the platform’s own page';
  return '';
}

/** One listing: the platform's rating beside ours, and the reviews behind it. */
function ListingCard({ listing }) {
  const official = listing.official;
  // Google is the one listing that is not a marketplace. Petpooja holds no
  // Google review at all, so "the reviews we hold" is not a number for it —
  // saying "0 reviews" would read as if nobody had reviewed us on Google,
  // which is the opposite of the truth.
  const isGoogle = listing.listing === GOOGLE_LISTING_KEY;

  return (
    <div className="border border-rule-soft rounded-card p-4 flex flex-col">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-serif text-lg text-ink">{listing.label}</h3>
        {official && official.rating ? (
          <span className={`pill ${ratingPill(official.rating)}`}>
            {rating(official.rating)} ★ on the platform
          </span>
        ) : (
          <span className="pill pill-quiet">Not read yet</span>
        )}
      </div>

      {/* ---- The platform's own rating ---------------------------------- */}
      {official && official.rating ? (
        <div className="mt-3 border border-rule-soft rounded-card p-3 bg-page">
          <p className="text-2xs uppercase tracking-wide text-ink-muted">On the platform</p>
          <p className="font-serif text-[1.9rem] leading-tight mt-1 tnum text-ink">
            {rating(official.rating)} ★
            <span className="text-base text-ink-muted ml-2 font-sans">
              {officialCount(official)} ratings
            </span>
          </p>
          <p className="text-xs text-ink-muted mt-1">
            {official.name ? `${official.name} — ` : ''}
            read on {formatDate(official.fetchedAt)}
            {official.source ? `, from ${sourceLabel(official.source)}` : ''}
            {official.url ? (
              <>
                {' · '}
                <a
                  href={official.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  see the listing
                </a>
              </>
            ) : null}
          </p>
        </div>
      ) : null}

      {/* ---- Our own average over the reviews we hold -------------------- */}
      {isGoogle ? (
        <div className="mt-3">
          <p className="text-2xs uppercase tracking-wide text-ink-muted">The reviews themselves</p>
          <p className="text-sm text-ink-muted mt-2">
            Google reviews are not in Petpooja, so we do not hold any of them yet — this rating
            is Google's own and it covers every rating the listing has ever had.
          </p>
          <p className="text-sm text-ink-muted mt-2">
            They come from the Google Business Profile API, which needs access granted by Google
            (7–14 working days). A manager of the listing can then read every review and reply to
            it — the only thing missing is Google's approval for this app to read them.
          </p>
        </div>
      ) : (
        <div className="mt-3">
          <p className="text-2xs uppercase tracking-wide text-ink-muted">From the reviews we hold</p>
          <p className="font-serif text-[1.9rem] leading-tight mt-1 tnum text-ink">
            {listing.count ? rating(listing.avgRating) : '—'}
            <span className="text-base text-ink-muted ml-2 font-sans">★</span>
          </p>
          <p className="text-sm text-ink-muted mt-1">
            {count(listing.count)} review{listing.count === 1 ? '' : 's'} since March 2026 ·{' '}
            {count(listing.linked)} matched to an order
          </p>
          <div className="mt-2">
            <Bar
              share={listing.avgRating ? (listing.avgRating / 5) * 100 : 0}
              tone={listing.avgRating >= 4 ? 'good' : listing.avgRating >= 3 ? 'warn' : 'accent'}
            />
          </div>
        </div>
      )}

      {listing.comments.length > 0 ? (
        <div className="hairline-list mt-3">
          {listing.comments.slice(0, 4).map((comment, index) => (
            <div key={`${comment.date}-${index}`} className="py-2">
              <p className="text-sm text-ink">“{comment.comment}”</p>
              <p className="text-xs text-ink-muted mt-1">
                {rating(comment.rating)} ★ · {formatDate(comment.date)}
              </p>
            </div>
          ))}
        </div>
      ) : isGoogle ? null : (
        <p className="text-sm text-ink-muted mt-3">No written comment on this listing.</p>
      )}
    </div>
  );
}

export default function CustomerReviewsPage() {
  const [data, setData] = useState(null);
  const [listing, setListing] = useState('');
  const [trendListing, setTrendListing] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams({ view: 'reviews' });
    if (listing) params.set('listing', listing);

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
  }, [listing]);

  // The month-by-month rating, for the listing being read or for all of them.
  const trend = useMemo(() => {
    if (!data) return [];
    if (!trendListing) return data.ratingTrend;
    const line = (data.listings || []).find((entry) => entry.listing === trendListing);
    return line ? line.trend || [] : [];
  }, [data, trendListing]);

  const bestMonth = useMemo(() => {
    return trend.reduce((max, row) => Math.max(max, Number(row.avgRating || 0)), 0);
  }, [trend]);

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
  const listings = r.listings || [];
  // The pages we are on, and the one bucket for the reviews that are
  // not on a page of ours.
  const ourPages = listings.filter((line) => line.listing !== UNLISTED_KEY);
  const leftovers = listings.filter((line) => line.listing === UNLISTED_KEY);
  const ourListings = listings.filter((line) => line.count > 0);

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
              What people said about us on each of our listings — the rating the platform
              publishes, the reviews we hold, and the order each review was left on.
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
            label="Our average"
            value={rating(r.avgRating)}
            sub="Out of five, over the reviews we hold since March 2026"
            accent
          />
          <Stat
            label="Listings"
            value={count(ourPages.length)}
            sub={ourPages.map((line) => line.label).join(' · ') || 'None yet'}
          />
          <Stat
            label="Reached a customer"
            value={count(r.reachedCustomer)}
            sub="Could be given to a person by their number"
          />
        </div>

        {/* ---- The listings ---------------------------------------------- */}
        <section className="panel mb-8">
          <div className="panel-body">
            <SectionHead
              title="By listing"
              note="We are on four pages. Each has its own rating and its own reviews, so each is counted on its own."
            />
            {listings.length === 0 ? (
              <p className="note">No reviews have been pulled in yet. The nightly sync brings them in.</p>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {ourPages.map((line) => (
                    <ListingCard key={line.listing} listing={line} />
                  ))}
                </div>

                {/* The reviews that are not on a page of ours. */}
                {leftovers.map((line) => (
                  <div key={line.listing} className="border border-rule-soft rounded-card p-4 bg-page mt-6">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-serif text-lg text-ink">Not on a listing</h3>
                      <span className="pill pill-quiet">
                        {count(line.count)} review{line.count === 1 ? '' : 's'}
                      </span>
                    </div>
                    <p className="text-sm text-ink-muted mt-2">
                      {count(line.linked)} of these sit behind an order and {count(line.unlinked)} sit
                      behind none — Petpooja does not hold those orders, so nothing says which page
                      they were left on. They are kept and counted here rather than pushed onto a
                      page they may not belong to.
                    </p>
                  </div>
                ))}
              </>
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

            <div className="flex flex-wrap gap-1.5 mb-6">
              <button
                type="button"
                onClick={() => setTrendListing('')}
                className={trendListing === '' ? 'btn-primary text-xs px-3 py-1.5' : 'btn-secondary text-xs px-3 py-1.5'}
              >
                All listings
              </button>
              {ourListings.map((line) => (
                <button
                  key={line.listing}
                  type="button"
                  onClick={() => setTrendListing(line.listing)}
                  className={
                    trendListing === line.listing
                      ? 'btn-primary text-xs px-3 py-1.5'
                      : 'btn-secondary text-xs px-3 py-1.5'
                  }
                >
                  {line.label} · {count(line.count)}
                </button>
              ))}
            </div>

            {trend.length === 0 ? (
              <p className="note">No dated reviews for this listing yet.</p>
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
                    {trend.map((row) => (
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
              note="Newest first, with the order it was left on — so the dish behind a good or bad review can be looked at."
            />

            <div className="flex flex-wrap gap-1.5 mb-6">
              <button
                type="button"
                onClick={() => setListing('')}
                className={listing === '' ? 'btn-primary text-xs px-3 py-1.5' : 'btn-secondary text-xs px-3 py-1.5'}
              >
                All · {count(r.count)}
              </button>
              {ourListings.map((line) => (
                <button
                  key={line.listing}
                  type="button"
                  onClick={() => setListing(line.listing)}
                  className={
                    listing === line.listing
                      ? 'btn-primary text-xs px-3 py-1.5'
                      : 'btn-secondary text-xs px-3 py-1.5'
                  }
                >
                  {line.label} · {count(line.count)}
                </button>
              ))}
            </div>

            {r.rows.length === 0 ? (
              <p className="note">No reviews on this listing yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[58rem]">
                  <thead>
                    <tr>
                      <th className="table-head">Date</th>
                      <th className="table-head">Listing</th>
                      <th className="table-head">Rating</th>
                      <th className="table-head">What they said</th>
                      <th className="table-head">The order</th>
                      <th className="table-head">Reached</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.rows.map((row, index) => (
                      <tr key={`${row.listing}-${row.review_date}-${index}`}>
                        <td className="table-cell whitespace-nowrap">{formatDate(row.review_date)}</td>
                        <td className="table-cell whitespace-nowrap">{listingLabel(row.listing)}</td>
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
                        <td className="table-cell">
                          {row.order ? (
                            <div>
                              <span className="text-ink tnum whitespace-nowrap">
                                #{row.order.order_no}
                                {row.order.order_date ? ` · ${formatDate(row.order.order_date)}` : ''}
                              </span>
                              {row.order.items ? (
                                <span className="text-xs text-ink-muted block">
                                  {row.order.items}
                                </span>
                              ) : null}
                              <span className="text-xs text-ink-muted block">
                                {money(row.order.amount)}
                                {row.order.channel ? ` · ${row.order.channel.replace('_', ' ')}` : ''}
                              </span>
                            </div>
                          ) : (
                            <span className="text-ink-muted">Not matched</span>
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
