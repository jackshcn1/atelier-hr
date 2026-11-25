/**
 * lib/googleReviews.js — the Google reviews, into the books.
 *
 * The listing's reviews are read from the Google Business Profile API and
 * written into `customer_reviews`, the same table the Zomato and Swiggy
 * reviews are in, so the Reviews page counts all four listings the same way.
 *
 * ## How a Google review is identified
 *
 * A Google review has **no order id** — nobody orders on Google — so the
 * marketplace's key, (platform, platform order id, day), has nothing to put
 * in the middle. Google's own id for the review goes there instead:
 *
 * | Column           | What it holds for a Google review        |
 * |------------------|------------------------------------------|
 * | `platform`       | `google`                                 |
 * | `client_order_id`| Google's review id                        |
 * | `review_date`    | the day the review was written            |
 *
 * That is what keeps two reviews written on the same day apart. Without it
 * they would be the same row, and one of them would be lost.
 *
 * ## The two numbers are kept apart
 *
 * | Number | Where it comes from | What it is |
 * |--------|--------------------|------------|
 * | the rating Google publishes | the API's own `averageRating` | every rating the listing has ever had |
 * | the average of the reviews we hold | the rows in `customer_reviews` | only what we have read |
 *
 * The first is Google's own and is written to `platform_listings`. The second
 * is worked out on the page. They are different questions and they are never
 * shown as the same one.
 *
 * ## Nothing is deleted
 *
 * A guest who deletes their review on Google leaves a row behind here. That
 * is a small inaccuracy, and it is on purpose: this pull adds and updates,
 * and it never removes a row on the strength of its own inference. A row
 * that is wrong in this way says so on the page — it is a review we hold —
 * whereas a row deleted by mistake is simply gone.
 */

import { GOOGLE_LISTING_KEY, GOOGLE_PLACE_ID, LISTINGS } from './customerParsers.js';
import { listAccounts, listLocations, listReviews, parseBusinessReview } from './googleBusinessProfile.js';

/** Where a Google review came from. */
export const GOOGLE_REVIEW_SOURCE = 'google:business_profile';

/** Where the listing's own rating came from. */
export const GOOGLE_RATING_SOURCE = 'business_profile';

const BATCH = 200;

/**
 * Find our listing among the locations an account holds.
 *
 * It is found by its **place id** — the one Google gave us for our listing —
 * and never by its name. An account can hold many listings, and a name is
 * not an identity.
 *
 * @param {Array<object>} locations
 * @param {string} placeId
 * @returns {object|null}
 */
export function findOurLocation(locations, placeId = GOOGLE_PLACE_ID) {
  const wanted = String(placeId || '').trim();
  if (!wanted) return null;
  return (locations || []).find((location) => location.placeId === wanted) || null;
}

/**
 * The rows a set of Google reviews becomes.
 *
 * A review that cannot be identified is **refused and reported**, not
 * written: a row with no id or no day would be written again on every pull,
 * for ever, and nothing would say so.
 *
 * @param {Array<object>} reviews the API's own review objects
 * @returns {{rows: Array<object>, refused: Array<{reason: string}>}}
 */
export function googleReviewRows(reviews) {
  const rows = [];
  const refused = [];
  const seen = new Set();

  for (const review of reviews || []) {
    const parsed = parseBusinessReview(review);
    if (!parsed.ok) {
      refused.push({ reason: parsed.reason });
      continue;
    }

    // The same review can turn up twice in one batch, and an upsert cannot
    // carry the same key twice in one request ("ON CONFLICT DO UPDATE command
    // cannot affect row a second time").
    const key = `${GOOGLE_LISTING_KEY}|${parsed.reviewId}|${parsed.reviewDate}`;
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      platform: 'google',
      // Google's own id for the review — see the note at the top of this file.
      client_order_id: parsed.reviewId,
      order_no: '',
      phone: '',
      // A Google review cannot be matched to an order: nobody orders on
      // Google, so there is no order for it to sit on.
      is_linked: false,
      rating: parsed.rating,
      comment: parsed.comment,
      review_date: parsed.reviewDate,
      source: GOOGLE_REVIEW_SOURCE,
      listing: GOOGLE_LISTING_KEY,
      order_date: null,
    });
  }

  return { rows, refused };
}

/**
 * Read the listing's reviews and write them into the books.
 *
 * @param {object} supabase a service-role client
 * @param {{placeId?: string}} [options]
 * @returns {Promise<{reviews: number, refused: Array<object>, averageRating: number|null,
 *                    totalReviewCount: number|null, listing: string, account: string}>}
 */
export async function pullGoogleReviews(supabase, { placeId = GOOGLE_PLACE_ID } = {}) {
  const accounts = await listAccounts();
  if (accounts.length === 0) {
    const error = new Error(
      'The Google account is connected, but it manages no Business Profile account. ' +
        'It has to be added as a manager of the listing on Google.',
    );
    error.code = 'NO_ACCOUNTS';
    throw error;
  }

  // Every account is looked through, because the listing may sit under the
  // person's own account or under an organisation one.
  let found = null;
  for (const account of accounts) {
    const locations = await listLocations(account.name);
    const location = findOurLocation(locations, placeId);
    if (location) {
      found = { account, location };
      break;
    }
  }

  if (!found) {
    const error = new Error(
      'Our listing was not found among the locations this Google account can reach. ' +
        'It has to be a manager of the listing.',
    );
    error.code = 'LOCATION_NOT_FOUND';
    throw error;
  }

  const { reviews, averageRating, totalReviewCount } = await listReviews(
    found.account.name,
    found.location.name,
  );

  const { rows, refused } = googleReviewRows(reviews);
  const now = new Date().toISOString();

  for (let i = 0; i < rows.length; i += BATCH) {
    const payload = rows.slice(i, i + BATCH).map((row) => ({
      ...row,
      synced_at: now,
      updated_at: now,
    }));
    const { error } = await supabase
      .from('customer_reviews')
      .upsert(payload, { onConflict: 'platform,client_order_id,review_date' });
    if (error) throw new Error(error.message);
  }

  // Google's own rating, and its own count of ratings.
  //
  // These are written only when Google actually answered with them. A pull
  // that could not read them must not put a blank over a number that was
  // there.
  if (averageRating !== null || totalReviewCount !== null) {
    const listing = LISTINGS.find((entry) => entry.key === GOOGLE_LISTING_KEY);
    const { error } = await supabase.from('platform_listings').upsert(
      {
        listing: GOOGLE_LISTING_KEY,
        name: listing?.fullName || 'Atelier by Ambrosia on Google',
        platform: 'google',
        rating: averageRating,
        rating_count: totalReviewCount,
        rating_count_text: totalReviewCount === null ? '' : String(totalReviewCount),
        source_url: found.location.mapsUri || `https://www.google.com/maps/place/?q=place_id:${placeId}`,
        source: GOOGLE_RATING_SOURCE,
        fetched_at: now,
        updated_at: now,
      },
      { onConflict: 'listing' },
    );
    if (error) throw new Error(error.message);
  }

  return {
    reviews: rows.length,
    refused,
    averageRating,
    totalReviewCount,
    listing: found.location.title || GOOGLE_LISTING_KEY,
    account: found.account.accountName || found.account.name,
  };
}
