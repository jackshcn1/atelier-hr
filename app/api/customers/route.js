/**
 * app/api/customers/route.js — the Customer section's three reads.
 *
 * The section is one idea seen three ways:
 *
 *   overview  the whole picture in a page: what the business is worth, how
 *             much of it belongs to a person, what people say, and what they
 *             want improved.
 *   list      every customer, searchable and sortable.
 *   detail    one customer: their orders, their reviews, their feedback.
 *
 * ## The one rule that shapes every number here
 *
 * **A customer is a person whose order recorded a real contact number.** The
 * phone is the unique code. An order with no real phone is not thrown away —
 * it is kept and counted as the gap, so the page can say how much of the
 * business is not yet attributable to a person.
 *
 * ## Where the totals are worked out
 *
 * The orders table runs to tens of thousands of rows, and the database
 * refuses to aggregate through the normal API (`sum()` is not allowed). So
 * the order-level totals are worked out by Postgres itself, through the
 * `exec_sql_select` RPC, and the small tables — customers, reviews, feedback —
 * are read whole and worked out in JavaScript.
 *
 * Every query here is a constant string. Nothing a visitor sends is ever put
 * into SQL text; a visitor's own words go through the query builder.
 */

import { NextResponse } from 'next/server';
import { getSupabase, readAllRows, selectRows } from '../../../lib/supabaseServer.js';
import { maskPhone, FEEDBACK_QUESTIONS, LISTINGS, listingBucket } from '../../../lib/customerParsers.js';
import { monthKeyOf, todayInIST } from '../../../lib/financePeriod.js';
import { listingLabel } from '../../../lib/customerFormat.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The three ways an order reaches the table. */
const CHANNELS = [
  { key: 'dine_in', label: 'Dine In' },
  { key: 'pick_up', label: 'Pick Up' },
  { key: 'delivery', label: 'Delivery' },
];

/**
 * Where a listing sits in the app's own order — Zomato, then Swiggy Atelier,
 * then Swiggy Ambrosia — so a list of listings always reads the same way.
 */
function listingOrder(key) {
  const index = LISTINGS.findIndex((listing) => listing.key === key);
  return index === -1 ? LISTINGS.length : index;
}

/** A customer who used to come often and has stopped is worth a call back. */
const AT_RISK_MIN_ORDERS = 3;
const AT_RISK_DAYS = 45;

export async function GET(request) {
  try {
    const supabase = getSupabase();
    const params = new URL(request.url).searchParams;
    const view = params.get('view') || 'overview';

    if (view === 'detail') return await detail(supabase, params.get('phone'));
    if (view === 'list') return await list(supabase, params);
    if (view === 'reviews') return await reviewsView(supabase, params);
    if (view === 'feedback') return await feedbackView(supabase);
    return await overview(supabase);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message || 'The Customer section could not be read.' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Two pictures, worked out once and used in more than one place
// ---------------------------------------------------------------------------

/**
 * What the reviews say, in numbers.
 *
 * Shared by the overview and the Reviews page, so both say the same thing.
 *
 * **Reviews are counted per LISTING, not per marketplace.** Swiggy carries
 * two of our outlets — "Atelier by Ambrosia" and "Ambrosia" — and they are
 * two different pages with two different ratings. Averaging them together
 * is what made the number on the site disagree with the number on the
 * platform.
 *
 * @param {Array<object>} reviews
 * @param {object} official the rating each listing publishes, by listing key
 * @returns {{avgRating: number|null, listings: Array<object>, ratingTrend: Array<object>}}
 */
function buildReviewPicture(reviews, official = {}) {
  const rows = reviews || [];
  const byListing = {};

  // Every listing gets a line, even one with no reviews behind it yet — a
  // listing that has no reviews on the books is still a page people can
  // review us on, and the page should say so rather than leave it out.
  for (const key of Object.keys(official)) {
    byListing[key] = newLine(key);
  }

  for (const review of rows) {
    // A review that could not be matched to an order does not say which page
    // it came from, and a Swiggy order with no brand on it names only the
    // marketplace. Both go into **one** bucket — the one that is not a page
    // of ours — rather than a bucket each.
    const key = listingBucket(review.listing);
    if (!byListing[key]) byListing[key] = newLine(key);

    const line = byListing[key];
    line.count += 1;
    line.total += Number(review.rating || 0);
    if (review.is_linked) line.linked += 1;
    if (!line.latest || (review.review_date && review.review_date > line.latest)) {
      line.latest = review.review_date;
    }
    if (review.comment) {
      line.comments.push({
        date: review.review_date,
        rating: Number(review.rating || 0),
        comment: review.comment,
      });
    }
    // The rating month by month, for this listing alone.
    if (review.review_date) {
      const month = review.review_date.slice(0, 7);
      if (!line.byMonth[month]) line.byMonth[month] = { month, total: 0, count: 0 };
      line.byMonth[month].total += Number(review.rating || 0);
      line.byMonth[month].count += 1;
    }
  }

  const listings = Object.values(byListing)
    .map((line) => ({
      listing: line.listing,
      label: listingLabel(line.listing),
      count: line.count,
      avgRating: line.count ? Math.round((line.total / line.count) * 100) / 100 : null,
      linked: line.linked,
      unlinked: line.count - line.linked,
      latest: line.latest,
      comments: line.comments.slice(-8).reverse(),
      // The rating the platform itself publishes, where it has been read.
      official: official[line.listing] || null,
      // Each listing's own month-by-month rating, so the three can be read
      // against each other and not only against the whole.
      trend: Object.values(line.byMonth)
        .map((bucket) => ({
          month: bucket.month,
          count: bucket.count,
          avgRating: Math.round((bucket.total / bucket.count) * 100) / 100,
        }))
        .sort((a, b) => a.month.localeCompare(b.month)),
    }))
    // The listings in the order they are listed in the app, so the page
    // does not reshuffle itself as the number of reviews changes.
    .sort((a, b) => listingOrder(a.listing) - listingOrder(b.listing) || b.count - a.count);

  const scored = rows.map((r) => Number(r.rating)).filter((n) => Number.isFinite(n) && n > 0);
  const avgRating = scored.length
    ? Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 100) / 100
    : null;

  // The rating each month, so a fall is visible as a fall.
  const ratingByMonth = {};
  for (const review of rows) {
    if (!review.review_date) continue;
    const key = review.review_date.slice(0, 7);
    if (!ratingByMonth[key]) ratingByMonth[key] = { month: key, total: 0, count: 0 };
    ratingByMonth[key].total += Number(review.rating || 0);
    ratingByMonth[key].count += 1;
  }
  const ratingTrend = Object.values(ratingByMonth)
    .map((line) => ({
      month: line.month,
      count: line.count,
      avgRating: Math.round((line.total / line.count) * 100) / 100,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return { avgRating, listings, ratingTrend };
}

/** A blank line for one listing. */
function newLine(listing) {
  return { listing, count: 0, total: 0, linked: 0, latest: null, comments: [], byMonth: {} };
}

/**
 * What the feedback form says, in numbers.
 *
 * Shared by the overview and the Feedback page, so both say the same thing.
 *
 * @param {Array<object>} feedback
 * @returns {{questionAverages: Array<object>, topTags: Array<object>, wouldVisit: Array<object>,
 *            waiters: Array<object>, linked: number, recent: Array<object>}}
 */
function buildFeedbackPicture(feedback) {
  const rows = feedback || [];

  const questionAverages = FEEDBACK_QUESTIONS.map((question) => {
    const values = rows
      .map((row) => Number(row[question.field]))
      .filter((n) => Number.isFinite(n) && n > 0);
    const average = values.length
      ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100
      : null;
    return { field: question.field, heading: question.heading, count: values.length, average };
  });

  const tagCount = new Map();
  for (const row of rows) {
    for (const tag of row.improvement_tags || []) {
      const key = String(tag).trim();
      if (!key) continue;
      tagCount.set(key, (tagCount.get(key) || 0) + 1);
    }
  }
  const topTags = [...tagCount.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 12);

  // The form's "Would you visit Atelier again?" is answered on the same scale
  // as the rating questions — "Very Good", not "Yes" — so the answers are
  // counted as they were written rather than forced into a yes and a no.
  const wouldVisit = {};
  for (const row of rows) {
    const answer = String(row.would_visit_again || '').trim();
    const key = answer || '(not answered)';
    wouldVisit[key] = (wouldVisit[key] || 0) + 1;
  }
  const wouldVisitList = Object.entries(wouldVisit)
    .map(([answer, count]) => ({ answer, count }))
    .sort((a, b) => b.count - a.count || a.answer.localeCompare(b.answer));

  const waiterRows = new Map();
  for (const row of rows) {
    const waiter = String(row.waiter || '').trim();
    if (!waiter) continue;
    if (!waiterRows.has(waiter)) waiterRows.set(waiter, { waiter, total: 0, count: 0, responses: 0 });
    const line = waiterRows.get(waiter);
    const overall = Number(row.overall);
    if (Number.isFinite(overall) && overall > 0) {
      line.total += overall;
      line.count += 1;
    }
    line.responses += 1;
  }
  const waiters = [...waiterRows.values()]
    .map((line) => ({
      waiter: line.waiter,
      responses: line.responses,
      rated: line.count,
      avgOverall: line.count ? Math.round((line.total / line.count) * 100) / 100 : null,
    }))
    .sort((a, b) => (b.avgOverall || 0) - (a.avgOverall || 0) || b.responses - a.responses);

  const linked = rows.filter((row) => row.is_linked).length;

  const recent = [...rows]
    .sort((a, b) => String(b.response_date || '').localeCompare(String(a.response_date || '')))
    .slice(0, 12)
    .map((row) => ({
      bill_number: row.bill_number,
      response_date: row.response_date,
      waiter: row.waiter,
      overall: row.overall,
      comment: row.comment,
      improvement_tags: row.improvement_tags || [],
      would_visit_again: row.would_visit_again,
      is_linked: row.is_linked,
      // Who wrote it down, and where it came from. The waiter is who served
      // the table; this is who held the pen.
      entered_by: row.entered_by || '',
      source: row.source || '',
    }));

  return { questionAverages, topTags, wouldVisit: wouldVisitList, waiters, linked, recent };
}

/**
 * The rating each listing publishes on its own platform.
 *
 * This is the number the platform shows, read from the platform's own page.
 * It is **not** the same number as the average the site works out: the site
 * averages the reviews Petpooja holds, and Petpooja holds them only from
 * March 2026, while the platforms have been rated for years.
 *
 * @param {object} supabase
 * @returns {Promise<object>} by listing key
 */
async function readOfficialRatings(supabase) {
  const rows = await selectRows(supabase, `
    select listing, name, platform, rating, rating_count, rating_count_text, source_url, source, fetched_at
    from public.platform_listings`);

  const byListing = {};
  for (const row of rows) {
    byListing[row.listing] = {
      listing: row.listing,
      name: row.name,
      platform: row.platform,
      rating: row.rating === null ? null : Number(row.rating),
      count: row.rating_count === null ? null : Number(row.rating_count),
      countText: row.rating_count_text || '',
      url: row.source_url || '',
      source: row.source || '',
      fetchedAt: row.fetched_at,
    };
  }
  return byListing;
}

// ---------------------------------------------------------------------------
// The whole picture
// ---------------------------------------------------------------------------

async function overview(supabase) {
  const [customers, reviews, feedback, totals, monthly, gap] = await Promise.all([
    readAllRows((from, to) => supabase.from('customers').select('*').order('id').range(from, to)),
    readAllRows((from, to) => supabase.from('customer_reviews').select('*').order('id').range(from, to)),
    readAllRows((from, to) => supabase.from('customer_feedback').select('*').order('id').range(from, to)),
    selectRows(supabase, `
      select count(*)::int as orders,
             coalesce(sum(amount),0)::numeric as amount,
             min(order_date)::text as first_date,
             max(order_date)::text as last_date,
             count(*) filter (where is_linked)::int as linked_orders,
             coalesce(sum(amount) filter (where is_linked),0)::numeric as linked_amount
      from public.customer_orders`),
    selectRows(supabase, `
      select to_char(order_date,'YYYY-MM') as month,
             count(*)::int as orders,
             coalesce(sum(amount),0)::numeric as amount,
             count(*) filter (where is_linked)::int as customer_orders,
             coalesce(sum(amount) filter (where is_linked),0)::numeric as customer_amount
      from public.customer_orders
      where order_date is not null
      group by 1 order by 1`),
    selectRows(supabase, `
      select count(*)::int as orders,
             coalesce(sum(amount),0)::numeric as amount,
             count(*) filter (where channel='dine_in')::int as dine_in_orders,
             coalesce(sum(amount) filter (where channel='dine_in'),0)::numeric as dine_in_amount,
             count(*) filter (where channel='pick_up')::int as pick_up_orders,
             coalesce(sum(amount) filter (where channel='pick_up'),0)::numeric as pick_up_amount,
             count(*) filter (where channel='delivery')::int as delivery_orders,
             coalesce(sum(amount) filter (where channel='delivery'),0)::numeric as delivery_amount
      from public.customer_orders where not is_linked`),
  ]);

  const orderTotals = totals[0] || {};
  const gapRow = gap[0] || {};
  const thisMonth = monthKeyOf();

  // ---- The customers themselves -----------------------------------------
  const totalSpend = customers.reduce((sum, c) => sum + Number(c.total_spend || 0), 0);
  const totalOrders = customers.reduce((sum, c) => sum + Number(c.order_count || 0), 0);
  const repeatCustomers = customers.filter((c) => Number(c.order_count || 0) > 1);
  const newThisMonth = customers.filter(
    (c) => c.first_order_at && monthKeyOf(new Date(`${c.first_order_at}T00:00:00Z`)) === thisMonth,
  );

  // A customer who came often and has not come back is worth a call.
  const lastOrder = orderTotals.last_date ? new Date(`${orderTotals.last_date}T00:00:00Z`) : null;
  const atRisk = customers
    .filter((c) => Number(c.order_count || 0) >= AT_RISK_MIN_ORDERS && c.last_order_at)
    .map((c) => {
      const days = lastOrder
        ? Math.floor((lastOrder - new Date(`${c.last_order_at}T00:00:00Z`)) / 86400000)
        : 0;
      return { customer: c, daysSince: days };
    })
    .filter((entry) => entry.daysSince >= AT_RISK_DAYS)
    .sort((a, b) => Number(b.customer.total_spend || 0) - Number(a.customer.total_spend || 0));

  // Which listing these customers order on. Swiggy carries two of ours, so
  // the marketplace alone would merge them.
  const byListing = {};
  for (const c of customers) {
    const counts = c.listings && typeof c.listings === 'object' ? c.listings : {};
    const keys = Object.keys(counts).filter((key) => Number(counts[key]) > 0);
    if (keys.length === 0) {
      byListing.counter = (byListing.counter || 0) + 1;
      continue;
    }
    const best = keys.sort((a, b) => Number(counts[b]) - Number(counts[a]))[0];
    byListing[best] = (byListing[best] || 0) + 1;
  }

  // ---- The month-by-month trend ----------------------------------------
  const newByMonth = {};
  for (const c of customers) {
    if (!c.first_order_at) continue;
    const key = monthKeyOf(new Date(`${c.first_order_at}T00:00:00Z`));
    newByMonth[key] = (newByMonth[key] || 0) + 1;
  }
  const trend = monthly.map((row) => ({
    month: row.month,
    orders: Number(row.orders || 0),
    amount: Number(row.amount || 0),
    customerOrders: Number(row.customer_orders || 0),
    customerAmount: Number(row.customer_amount || 0),
    newCustomers: newByMonth[row.month] || 0,
  }));

  // ---- The reviews -------------------------------------------------------
  const reviewPicture = buildReviewPicture(reviews, await readOfficialRatings(supabase));

  // ---- The feedback form -------------------------------------------------
  const feedbackPicture = buildFeedbackPicture(feedback);

  // ---- The channels ------------------------------------------------------
  const channelTotals = await selectRows(supabase, `
    select coalesce(channel,'') as channel,
           count(*)::int as orders,
           coalesce(sum(amount),0)::numeric as amount
    from public.customer_orders
    where is_linked
    group by 1 order by 2 desc`);
  const gapChannelTotals = await selectRows(supabase, `
    select coalesce(channel,'') as channel,
           count(*)::int as orders,
           coalesce(sum(amount),0)::numeric as amount
    from public.customer_orders
    where not is_linked
    group by 1`);

  const gapByChannel = {};
  for (const row of gapChannelTotals) gapByChannel[row.channel || ''] = row;

  const channels = CHANNELS.map((channel) => {
    const linked = channelTotals.find((row) => (row.channel || '') === channel.key);
    const unlinked = gapByChannel[channel.key];
    return {
      key: channel.key,
      label: channel.label,
      orders: Number(linked?.orders || 0),
      amount: Number(linked?.amount || 0),
      gapOrders: Number(unlinked?.orders || 0),
      gapAmount: Number(unlinked?.amount || 0),
    };
  });

  const totalAmount = Number(orderTotals.amount || 0);
  const linkedAmount = Number(orderTotals.linked_amount || 0);
  const gapAmount = Number(gapRow.amount || 0);

  return NextResponse.json({
    success: true,
    data: {
      window: {
        firstOrder: orderTotals.first_date || null,
        lastOrder: orderTotals.last_date || null,
        syncedAt: customers[0]?.synced_at || reviews[0]?.synced_at || null,
      },
      customers: {
        count: customers.length,
        totalSpend: Math.round(totalSpend * 100) / 100,
        orders: totalOrders,
        avgOrderValue: totalOrders ? Math.round((totalSpend / totalOrders) * 100) / 100 : 0,
        repeatCount: repeatCustomers.length,
        repeatRate: customers.length
          ? Math.round((repeatCustomers.length / customers.length) * 1000) / 10
          : 0,
        newThisMonth: newThisMonth.length,
        byListing,
      },
      orders: {
        count: Number(orderTotals.orders || 0),
        amount: Math.round(totalAmount * 100) / 100,
      },
      gap: {
        orders: Number(gapRow.orders || 0),
        amount: Math.round(gapAmount * 100) / 100,
        share: totalAmount ? Math.round((gapAmount / totalAmount) * 1000) / 10 : 0,
        dineIn: { orders: Number(gapRow.dine_in_orders || 0), amount: Number(gapRow.dine_in_amount || 0) },
        pickUp: { orders: Number(gapRow.pick_up_orders || 0), amount: Number(gapRow.pick_up_amount || 0) },
        delivery: { orders: Number(gapRow.delivery_orders || 0), amount: Number(gapRow.delivery_amount || 0) },
      },
      coverage: totalAmount ? Math.round((linkedAmount / totalAmount) * 1000) / 10 : 0,
      channels,
      trend,
      reviews: {
        count: reviews.length,
        avgRating: reviewPicture.avgRating,
        listings: reviewPicture.listings,
        ratingTrend: reviewPicture.ratingTrend,
        linked: reviews.filter((r) => r.is_linked).length,
        unlinked: reviews.filter((r) => !r.is_linked).length,
        // A review that reached a *person*. A platform order usually carries no
        // contact number — the platform holds the customer's number, not
        // Petpooja — so most reviews are counted, averaged and shown, but
        // cannot be attached to a customer. The page says so.
        reachedCustomer: reviews.filter((r) => r.phone).length,
      },
      feedback: {
        responses: feedback.length,
        linked: feedbackPicture.linked,
        unlinked: feedback.length - feedbackPicture.linked,
        questionAverages: feedbackPicture.questionAverages,
        wouldVisit: feedbackPicture.wouldVisit,
        topTags: feedbackPicture.topTags,
        waiters: feedbackPicture.waiters,
        recent: feedbackPicture.recent,
      },
      topCustomers: [...customers]
        .sort((a, b) => Number(b.total_spend || 0) - Number(a.total_spend || 0))
        .slice(0, 8)
        .map((c) => ({
          phone: c.phone,
          maskedPhone: maskPhone(c.phone),
          name: c.name,
          order_count: c.order_count,
          total_spend: Number(c.total_spend || 0),
          last_order_at: c.last_order_at,
          platform: c.platform,
          avg_rating: c.avg_rating,
        })),
      atRisk: atRisk.slice(0, 8).map((entry) => ({
        phone: entry.customer.phone,
        maskedPhone: maskPhone(entry.customer.phone),
        name: entry.customer.name,
        order_count: entry.customer.order_count,
        total_spend: Number(entry.customer.total_spend || 0),
        last_order_at: entry.customer.last_order_at,
        daysSince: entry.daysSince,
      })),
      atRiskCount: atRisk.length,
      google: {
        // The rating is read from the Places API and needs no approval. The
        // **reviews** are the thing still waiting on Google.
        reviewsConnected: false,
        note:
          'Google reviews are not in Petpooja. They come from the Google Business Profile API, which needs access granted by Google (7–14 working days). A manager of the listing can then read every review and reply to it.',
      },
      generatedAt: todayInIST(),
    },
  });
}

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

async function list(supabase, params) {
  const search = (params.get('search') || '').trim().toLowerCase();
  const sort = params.get('sort') || 'spend';
  const listing = params.get('listing') || '';
  const minOrders = Number(params.get('minOrders') || 0);
  const limit = Math.min(Number(params.get('limit') || 200), 500);

  const all = await readAllRows((from, to) =>
    supabase.from('customers').select('*').order('id').range(from, to),
  );

  let rows = all.filter((customer) => {
    // The listing filter looks at every listing the customer has ordered on,
    // not only the one they order on most — a person who came once on Zomato
    // and twice on Swiggy is a Zomato customer as well as a Swiggy one.
    if (listing) {
      const counts = customer.listings && typeof customer.listings === 'object' ? customer.listings : {};
      const has = Number(counts[listing] || 0) > 0 || customer.listing === listing;
      if (!has) return false;
    }
    if (minOrders && Number(customer.order_count || 0) < minOrders) return false;
    if (!search) return true;
    const haystack = `${customer.name || ''} ${customer.phone || ''} ${customer.address || ''}`.toLowerCase();
    return haystack.includes(search);
  });

  const bySpend = (a, b) => Number(b.total_spend || 0) - Number(a.total_spend || 0);
  const byLastOrder = (a, b) => String(b.last_order_at || '').localeCompare(String(a.last_order_at || ''));
  const byOrders = (a, b) => Number(b.order_count || 0) - Number(a.order_count || 0);
  const byRating = (a, b) => Number(b.avg_rating || 0) - Number(a.avg_rating || 0);

  const sorters = { spend: bySpend, last_order: byLastOrder, orders: byOrders, rating: byRating };
  rows.sort(sorters[sort] || bySpend);

  return NextResponse.json({
    success: true,
    data: rows.slice(0, limit).map((customer) => ({
      phone: customer.phone,
      maskedPhone: maskPhone(customer.phone),
      name: customer.name,
      address: customer.address,
      order_count: customer.order_count,
      total_spend: Number(customer.total_spend || 0),
      avg_order_value: Number(customer.avg_order_value || 0),
      first_order_at: customer.first_order_at,
      last_order_at: customer.last_order_at,
      platform: customer.platform || 'counter',
      listing: customer.listing || '',
      listings: customer.listings || {},
      channel_mix: customer.channel_mix || {},
      review_count: customer.review_count || 0,
      avg_rating: customer.avg_rating,
      feedback_count: customer.feedback_count || 0,
    })),
    total: rows.length,
  });
}

// ---------------------------------------------------------------------------
// The reviews, one by one
// ---------------------------------------------------------------------------

/**
 * Every review, newest first, with the order it was left on.
 *
 * The platform filter is applied here rather than in the browser so the count
 * on each listing chip always shows what is really there.
 *
 * **The order is joined on the pair (order number, day)**, which is the
 * order's own key — an order number on its own is not an identity, because
 * Petpooja restarts its numbering. That is what lets the page show what the
 * customer actually ate against the review they left about it.
 */
async function reviewsView(supabase, params) {
  const listing = params.get('listing') || '';

  const rows = await selectRows(supabase, `
    select r.id, r.listing, r.platform, r.rating, r.comment, r.review_date,
           r.order_no, r.order_date, r.phone, r.is_linked,
           o.items as order_items, o.amount as order_amount, o.channel as order_channel
    from public.customer_reviews r
    left join public.customer_orders o
      on o.order_no = r.order_no and o.order_date = r.order_date
    order by r.review_date desc, r.id desc`);

  const filtered = rows.filter((review) => !listing || listingBucket(review.listing) === listing);

  const picture = buildReviewPicture(rows, await readOfficialRatings(supabase));

  return NextResponse.json({
    success: true,
    data: {
      count: rows.length,
      avgRating: picture.avgRating,
      listings: picture.listings,
      ratingTrend: picture.ratingTrend,
      linked: rows.filter((r) => r.is_linked).length,
      reachedCustomer: rows.filter((r) => r.phone).length,
      withComment: rows.filter((r) => r.comment).length,
      filter: listing,
      rows: filtered.map((review) => ({
        id: review.id,
        // The bucket the review is counted under — its own page, or the one
        // bucket for reviews that are not on a page of ours.
        listing: listingBucket(review.listing),
        platform: review.platform,
        rating: Number(review.rating || 0),
        comment: review.comment,
        review_date: review.review_date,
        order_no: review.order_no,
        is_linked: !!review.is_linked,
        phone: review.phone || null,
        maskedPhone: review.phone ? maskPhone(review.phone) : null,
        // The order the review was left on — what was ordered, what it came
        // to, and how it was placed.
        order: review.order_items
          ? {
              order_no: review.order_no,
              order_date: review.order_date,
              items: review.order_items,
              amount: Number(review.order_amount || 0),
              channel: review.order_channel || '',
            }
          : null,
      })),
    },
  });
}

// ---------------------------------------------------------------------------
// The feedback form, response by response
// ---------------------------------------------------------------------------

/** Every response from the feedback form, newest first. */
async function feedbackView(supabase) {
  const feedback = await readAllRows((from, to) =>
    supabase.from('customer_feedback').select('*').order('id').range(from, to),
  );

  const picture = buildFeedbackPicture(feedback);

  const rows = [...feedback]
    .sort((a, b) => String(b.response_date || '').localeCompare(String(a.response_date || '')))
    .map((row) => ({
      bill_number: row.bill_number,
      response_date: row.response_date,
      waiter: row.waiter,
      overall: row.overall,
      food_quality: row.food_quality,
      taste: row.taste,
      service: row.service,
      hospitality: row.hospitality,
      waiting_time: row.waiting_time,
      would_visit_again: row.would_visit_again,
      improvement_tags: row.improvement_tags || [],
      comment: row.comment,
      is_linked: !!row.is_linked,
      phone: row.phone || null,
      maskedPhone: row.phone ? maskPhone(row.phone) : null,
    }));

  return NextResponse.json({
    success: true,
    data: {
      responses: feedback.length,
      linked: picture.linked,
      unlinked: feedback.length - picture.linked,
      questionAverages: picture.questionAverages,
      topTags: picture.topTags,
      wouldVisit: picture.wouldVisit,
      waiters: picture.waiters,
      rows,
    },
  });
}

// ---------------------------------------------------------------------------
// One customer
// ---------------------------------------------------------------------------

async function detail(supabase, phone) {
  const digits = String(phone || '').replace(/\D/g, '').slice(-10);
  if (digits.length !== 10) {
    return NextResponse.json(
      { success: false, error: 'A customer is looked up by their contact number.' },
      { status: 400 },
    );
  }

  const { data: customer, error } = await supabase
    .from('customers')
    .select('*')
    .eq('phone', digits)
    .maybeSingle();
  if (error) throw new Error(error.message);

  if (!customer) {
    return NextResponse.json(
      { success: false, error: 'No customer with that number is on the books.' },
      { status: 404 },
    );
  }

  const [orders, feedback] = await Promise.all([
    supabase
      .from('customer_orders')
      .select('*')
      .eq('phone', digits)
      .order('order_date', { ascending: false })
      .order('id', { ascending: false }),
    supabase
      .from('customer_feedback')
      .select('*')
      .eq('phone', digits)
      .order('response_date', { ascending: false }),
  ]);

  // The reviews this customer left, each with the order it was left on.
  // The join is on the pair (order number, day) — an order number on its own
  // is not an identity, because Petpooja restarts its numbering.
  const reviewRows = (
    await selectRows(supabase, `
      select r.id, r.listing, r.platform, r.rating, r.comment, r.review_date,
             r.order_no, r.order_date, r.phone, r.is_linked,
             o.items as order_items, o.amount as order_amount, o.channel as order_channel
      from public.customer_reviews r
      left join public.customer_orders o
        on o.order_no = r.order_no and o.order_date = r.order_date
      order by r.review_date desc, r.id desc`)
  ).filter((review) => review.phone === digits);

  const orderRows = orders.data || [];
  const feedbackRows = feedback.data || [];

  const spent = orderRows.reduce((sum, order) => sum + Number(order.amount || 0), 0);
  const scored = reviewRows.map((r) => Number(r.rating)).filter((n) => Number.isFinite(n) && n > 0);

  return NextResponse.json({
    success: true,
    data: {
      customer: {
        phone: customer.phone,
        maskedPhone: maskPhone(customer.phone),
        name: customer.name,
        address: customer.address,
        order_count: customer.order_count,
        total_spend: Number(customer.total_spend || 0),
        avg_order_value: Number(customer.avg_order_value || 0),
        first_order_at: customer.first_order_at,
        last_order_at: customer.last_order_at,
        platform: customer.platform || 'counter',
        listing: customer.listing || '',
        listings: customer.listings || {},
        channel_mix: customer.channel_mix || {},
        review_count: reviewRows.length,
        avg_rating: scored.length
          ? Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 100) / 100
          : null,
        feedback_count: feedbackRows.length,
      },
      orders: orderRows.map((order) => ({
        order_no: order.order_no,
        order_date: order.order_date,
        amount: Number(order.amount || 0),
        channel: order.channel,
        order_type: order.order_type,
        payment_type: order.payment_type,
        status: order.status,
        items: order.items,
        client_order_id: order.client_order_id,
      })),
      reviews: reviewRows.map((review) => ({
        listing: review.listing || '',
        platform: review.platform,
        rating: Number(review.rating || 0),
        comment: review.comment,
        review_date: review.review_date,
        order_no: review.order_no,
        order_date: review.order_date,
        is_linked: !!review.is_linked,
        // What the customer ordered on the order the review was left on.
        order: review.order_items
          ? {
              order_no: review.order_no,
              order_date: review.order_date,
              items: review.order_items,
              amount: Number(review.order_amount || 0),
              channel: review.order_channel || '',
            }
          : null,
      })),
      feedback: feedbackRows.map((row) => ({
        bill_number: row.bill_number,
        response_date: row.response_date,
        waiter: row.waiter,
        overall: row.overall,
        food_quality: row.food_quality,
        taste: row.taste,
        service: row.service,
        hospitality: row.hospitality,
        waiting_time: row.waiting_time,
        would_visit_again: row.would_visit_again,
        improvement_tags: row.improvement_tags || [],
        comment: row.comment,
      })),
      totals: {
        orders: orderRows.length,
        spent: Math.round(spent * 100) / 100,
        reviews: reviewRows.length,
        feedback: feedbackRows.length,
      },
    },
  });
}
