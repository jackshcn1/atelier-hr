/**
 * lib/googleBusinessProfile.js — our Google Business Profile listing, read.
 *
 * This is the listing guests review us on, and it is **not** a marketplace:
 * nobody orders there, so a Google review cannot be matched to an order and
 * cannot be given to a customer. What it can do is tell us what people said.
 *
 * ## The API is split across three hosts
 *
 * Google moved this API around, and the pieces that were needed live in
 * different places:
 *
 * | What             | Where                                                    |
 * |------------------|----------------------------------------------------------|
 * | the accounts     | `mybusinessaccountmanagement.googleapis.com/v1`          |
 * | the locations    | `mybusinessbusinessinformation.googleapis.com/v1`        |
 * | **the reviews**  | `mybusiness.googleapis.com/v4`                           |
 *
 * The v4 **accounts** and **locations** methods have been retired — they
 * answer 404 — so the accounts and the locations come from v1 and only the
 * reviews come from v4. The ids are the same ids in both: an account's name
 * is `accounts/{id}` and a location's is `locations/{id}`, and the v4 review
 * path is built from those two names.
 *
 * ## It is a person, not the service account
 *
 * The service account cannot use this API at all — it answers
 * `ACCESS_TOKEN_SCOPE_INSUFFICIENT` — because a listing has to be read **as
 * somebody who manages it**. So the token comes from the site's own Google
 * connection (`lib/googleConnections.js`), and the account that signs in has
 * to be a manager of the listing.
 *
 * ## Read only
 *
 * The site reads this listing and never writes to it. Replies to reviews are
 * left to the people who answer them from Google's own My Business screen —
 * so no write call is made from here at all.
 */

import { accessTokenFor, userinfoEmail } from './googleUserDrive.js';
import { BUSINESS_SCOPE, connectionStatus, oauthConfigured } from './googleConnections.js';

/** The connection that carries the Business Profile permission. */
export const BUSINESS_PROVIDER = 'google_business';

const ACCOUNT_API = 'https://mybusinessaccountmanagement.googleapis.com/v1';
const INFORMATION_API = 'https://mybusinessbusinessinformation.googleapis.com/v1';
const REVIEWS_API = 'https://mybusiness.googleapis.com/v4';

/** Is the Google sign-in set up on the server at all? */
export function businessConfigured() {
  return oauthConfigured();
}

/**
 * Is the Business Profile connected?
 *
 * @returns {Promise<{connected: boolean, email: string|null, reason?: string}>}
 */
export async function businessConnection() {
  return connectionStatus(BUSINESS_PROVIDER);
}

/**
 * An access token that carries the Business Profile permission.
 *
 * The permission Google actually granted is checked here, because a person
 * can agree to the sign-in and leave it unticked — and the API then answers
 * "insufficient authentication scopes", which says nothing to the person
 * reading it.
 *
 * @returns {Promise<string>}
 */
export async function businessToken() {
  const { accessToken, scope } = await accessTokenFor(BUSINESS_PROVIDER);
  if (!scope.includes(BUSINESS_SCOPE)) {
    const error = new Error(
      'The Google account is connected, but Google has not given this site permission to read the ' +
        'Business Profile. Connect the account again and agree to that permission.',
    );
    error.code = 'NO_BUSINESS_SCOPE';
    throw error;
  }
  return accessToken;
}

/**
 * One call to a Business Profile API.
 *
 * The failures are turned into sentences that can be shown to the person who
 * asked for the pull, because Google's own messages are written for
 * developers.
 */
async function call(url, { method = 'GET', body } = {}) {
  const accessToken = await businessToken();

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const reason =
      json?.error?.details?.[0]?.reason || json?.error?.status || `HTTP ${res.status}`;
    const error = new Error(
      json?.error?.message || `The Business Profile API answered ${res.status}.`,
    );
    error.code = reason;
    error.status = res.status;
    throw error;
  }

  return json || {};
}

/**
 * The accounts this account can reach.
 *
 * The first one is always the person's own account, and an account they
 * administer comes after it.
 *
 * @returns {Promise<Array<{name: string, accountName: string, type: string, role: string}>>}
 */
export async function listAccounts() {
  const json = await call(`${ACCOUNT_API}/accounts`);
  return (json.accounts || []).map((account) => ({
    name: account.name || '',
    accountName: account.accountName || '',
    type: account.type || '',
    role: account.role || '',
  }));
}

/**
 * The locations under one account.
 *
 * The location is found by its **place id** — the one Google already gave us
 * for our listing — and never by its name. An account can hold many
 * listings, and a name is not an identity: a place id is.
 *
 * @param {string} accountName `accounts/{id}`
 * @returns {Promise<Array<{name: string, title: string, placeId: string, mapsUri: string}>>}
 */
export async function listLocations(accountName) {
  const readMask = 'name,title,placeId,mapsUri';
  const locations = [];
  let pageToken = '';

  for (let page = 0; page < 50; page += 1) {
    const url = new URL(`${INFORMATION_API}/${accountName}/locations`);
    url.searchParams.set('readMask', readMask);
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const json = await call(url.toString());
    for (const location of json.locations || []) {
      locations.push({
        name: location.name || '',
        title: location.title || '',
        placeId: location.placeId || '',
        mapsUri: location.mapsUri || '',
      });
    }

    pageToken = json.nextPageToken || '';
    if (!pageToken) break;
  }

  return locations;
}

/**
 * Every review on one location.
 *
 * The endpoint answers **fifty** at a time and hands back the next page's
 * token, so the pages are walked until the token runs out. It also answers
 * with the listing's own rating and its own count of ratings — the numbers
 * Google publishes — which is a different question from the average of the
 * reviews we hold, and is kept apart from it.
 *
 * A location with no reviews answers `{}` — an empty object, not an empty
 * list — so the array is read defensively.
 *
 * @param {string} accountName `accounts/{id}`
 * @param {string} locationName `locations/{id}`
 * @returns {Promise<{reviews: Array<object>, averageRating: number|null, totalReviewCount: number|null}>}
 */
export async function listReviews(accountName, locationName) {
  const all = [];
  let pageToken = '';
  let averageRating = null;
  let totalReviewCount = null;

  const parent = `${accountName}/${locationName}`;

  for (let page = 0; page < 200; page += 1) {
    const url = new URL(`${REVIEWS_API}/${parent}/reviews`);
    url.searchParams.set('pageSize', '50');
    url.searchParams.set('orderBy', 'updateTime desc');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const json = await call(url.toString());

    for (const review of json.reviews || []) all.push(review);

    if (averageRating === null && json.averageRating !== undefined && json.averageRating !== null) {
      averageRating = Number(json.averageRating);
    }
    if (
      totalReviewCount === null &&
      json.totalReviewCount !== undefined &&
      json.totalReviewCount !== null
    ) {
      totalReviewCount = Number(json.totalReviewCount);
    }

    pageToken = json.nextPageToken || '';
    if (!pageToken) break;
  }

  return { reviews: all, averageRating, totalReviewCount };
}

/**
 * The stars, as a number.
 *
 * The API answers the rating as a word — `FIVE`, `FOUR`, and so on — and
 * sometimes as an object around that word. Both are read, because a number
 * that comes back as zero would quietly mean "no rating" for a guest who
 * gave five.
 */
export function starRating(value) {
  if (value === null || value === undefined) return 0;

  if (typeof value === 'object') {
    if (Number.isFinite(Number(value.value))) return Number(value.value);
    return starRating(value.rating);
  }

  const word = String(value).trim().toUpperCase();
  if (word.startsWith('FIVE')) return 5;
  if (word.startsWith('FOUR')) return 4;
  if (word.startsWith('THREE')) return 3;
  if (word.startsWith('TWO')) return 2;
  if (word.startsWith('ONE')) return 1;

  const number = Number(word);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

/**
 * One review, in the shape the books use.
 *
 * **A review with no id or no day is refused, not written.** The id is what
 * tells one Google review from another, and the day is half of the row's
 * key — a row that cannot be identified would be written again on every
 * pull, for ever, and nothing would say so.
 *
 * @param {object} review one review as the API answers it
 * @returns {{reviewId: string, rating: number, comment: string, reviewDate: string|null,
 *            reviewer: string, ok: boolean, reason?: string}}
 */
export function parseBusinessReview(review) {
  const reviewId = String(review?.reviewId || '').trim();
  const rating = starRating(review?.starRating);
  const createTime = String(review?.createTime || '');
  const reviewDate = createTime ? createTime.slice(0, 10) : '';

  if (!reviewId) {
    return { ok: false, reason: 'it has no review id' };
  }
  if (!rating) {
    return { ok: false, reason: 'it has no rating' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewDate)) {
    return { ok: false, reason: 'it has no usable date' };
  }

  return {
    ok: true,
    reviewId,
    rating,
    comment: String(review?.comment || '').trim(),
    reviewDate,
    reviewer: String(review?.reviewer?.displayName || '').trim(),
  };
}
