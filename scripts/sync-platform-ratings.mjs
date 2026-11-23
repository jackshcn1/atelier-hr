// scripts/sync-platform-ratings.mjs
//
// Read the rating each of our four listings publishes on its own platform.
//
// ## Why this is a separate script
//
// The number a platform shows is **not** the number the site can work out.
// The site averages the reviews Petpooja holds, and Petpooja holds them
// only from **March 2026** — measured on the count endpoint, every month
// before that answers zero. But the platforms have been live for years:
// Swiggy's Ambrosia page alone shows **10K+ ratings**, and Google shows
// 3,628. So the site's average is a rating over nine months and the
// platform's is a rating over years, and they are different numbers for the
// same restaurant.
//
// The honest answer is to show **both**, and to label which is which.
//
// ## How each platform is read
//
// **Zomato** — the listing page carries a JSON blob with a rating per
// service, and the **DELIVERY** one is the one that counts: the same page
// also shows a DINING rating (3.1 from 24 ratings when this was written),
// which says nothing about the food that arrives at the door. A plain
// fetch is enough.
//
// **Swiggy** — the page answers a plain request with an empty body and an
// AWS WAF challenge, so it needs a real browser. Chrome must be **headed**
// and must run with `--disable-blink-features=AutomationControlled`;
// without that flag Swiggy answers every request with "Access to
// www.swiggy.com was denied". The Petpooja sync already launches its
// browser that way, so the same options are used here.
//
// **Google** — read from the **Places API**, which needs only an API key:
// no OAuth, no Business Profile approval, no waiting. Only the rating and
// the count are asked for, so no review text is fetched and none is stored.
// The *reviews* behind Google's rating come from the Business Profile API,
// which Google approves one application at a time.
//
// ## When a platform refuses
//
// It happens, and it is not a failure of the run: the value already on the
// books is **kept**, and the page says when it was last read. The script
// prints what it found and what it could not reach.
//
// Usage:  node scripts/sync-platform-ratings.mjs

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { LISTINGS } from '../lib/customerParsers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

/**
 * Read the `KEY=value` lines out of a `.env.local` file.
 *
 * The trimming is the point of this function. A key pasted into a text file
 * very often carries a trailing space, and a trailing space in an API key
 * makes Google answer "invalid key" — which looks like a wrong key rather
 * than a wrong keystroke. Quotes are taken off only when they are a matching
 * pair around the whole value.
 */
export function parseEnvText(text) {
  const values = {};
  for (const line of String(text).split('\n')) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    const quoted = value.match(/^(['"])(.*)\1$/);
    if (quoted) value = quoted[2].trim();
    values[match[1]] = value;
  }
  return values;
}

function loadConfig() {
  const cfg = {};
  const cfgPath = join(__dirname, 'petpooja-config.json');
  if (existsSync(cfgPath)) {
    try {
      Object.assign(cfg, JSON.parse(readFileSync(cfgPath, 'utf8')));
    } catch (error) {
      console.error('❌ Could not parse scripts/petpooja-config.json:', error.message);
    }
  }

  // .env.local holds the secrets this machine uses. It is gitignored, so
  // nothing in it can ever be committed by accident.
  const envPath = join(__dirname, '..', '.env.local');
  if (existsSync(envPath)) {
    const fromFile = parseEnvText(readFileSync(envPath, 'utf8'));
    for (const [name, value] of Object.entries(fromFile)) {
      if (process.env[name] === undefined) process.env[name] = value;
    }
  }

  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || cfg.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || cfg.SUPABASE_SERVICE_ROLE_KEY,
    placesKey: process.env.GOOGLE_PLACES_API_KEY || '',
  };
}

// ---------------------------------------------------------------------------
// Zomato — the DELIVERY rating
// ---------------------------------------------------------------------------

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept-Language': 'en-IN,en;q=0.9',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

/**
 * Zomato's listing page carries a rating per service.
 *
 * The page holds two: `DINING` (how the place itself is rated) and
 * `DELIVERY` (how the food that arrives is rated). **Only the delivery one
 * counts** — the whole business is delivery. The JSON-LD block on the page
 * is the *dining* aggregate, which is why it is not read here.
 *
 * The page is one long line of escaped JSON, so the quotes in it are
 * backslash-escaped and the patterns below allow for that.
 *
 * @param {string} html
 * @returns {{rating: number, count: number|null}|null}
 */
export function parseZomatoDeliveryRating(html) {
  const text = String(html || '');

  // The ratings block holds one object per service.
  const block = text.search(/rating_new/);
  if (block === -1) return null;

  const delivery = text.slice(block, block + 2000).search(/DELIVERY/);
  if (delivery === -1) return null;

  const object = text.slice(block + delivery, block + delivery + 600);
  const rating = object.match(/\\?"rating\\?"\s*:\s*\\?"([\d.]+)\\?"/);
  const count = object.match(/\\?"reviewCount\\?"\s*:\s*\\?"([\d,]+)\\?"/);
  if (!rating) return null;

  return {
    rating: Number(rating[1]),
    // Swiggy publishes "2.6K+"; Zomato publishes the exact number.
    count: count ? Number(count[1].replace(/,/g, '')) : null,
  };
}

/**
 * Read Zomato's listing.
 *
 * @param {string} url
 * @returns {Promise<{rating: number, count: number|null}|null>}
 */
async function fetchZomato(url) {
  const response = await fetch(url, { headers: BROWSER_HEADERS });
  if (!response.ok) return null;
  return parseZomatoDeliveryRating(await response.text());
}

// ---------------------------------------------------------------------------
// Swiggy — the rating on the page
// ---------------------------------------------------------------------------

/**
 * Swiggy shows the restaurant's rating and how many ratings it is made of.
 *
 * The count is Swiggy's own abbreviated figure — "2.6K+", "10K+" — because
 * Swiggy publishes **no exact number** for a restaurant. So the count is
 * kept as the text Swiggy writes, and the exact-count column is left empty
 * rather than filled with an expanded guess like 26000. The menu carries
 * item ratings like "4.8 (4)", so the word "ratings" is what tells the
 * restaurant's own rating apart from those.
 *
 * @param {string} text the page's visible text
 * @returns {{rating: number, count: null, countText: string}|null}
 */
export function parseSwiggyRating(text) {
  const match = String(text || '').match(
    /([\d.]+)\s*\(([\d.,]+[KkMm]?\+?)\s*(?:ratings?|reviews?)\b/i,
  );
  if (!match) return null;

  return {
    rating: Number(match[1]),
    // Not an exact count, so it is not stored as one.
    count: null,
    countText: match[2],
  };
}

/**
 * Read a Swiggy listing in a real browser.
 *
 * @param {string} url
 * @returns {Promise<{rating: number, count: number|null, countText: string}|null>}
 */
async function fetchSwiggy(url, browser) {
  const context = await browser.newContext({ locale: 'en-IN', viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (!response || response.status() >= 400) {
      const body = await page.locator('body').innerText().catch(() => '');
      if (/denied|authorisation/i.test(body)) {
        console.log('   ↳ Swiggy refused the request (its bot check).');
      }
      return null;
    }
    await page.waitForTimeout(4000);
    const text = await page.locator('body').innerText().catch(() => '');
    return parseSwiggyRating(text);
  } catch (error) {
    console.log('   ↳ could not read the page:', error.message.split('\n')[0]);
    return null;
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// Google — the rating on our Google Maps listing
// ---------------------------------------------------------------------------

/**
 * Read Google's own rating for the restaurant.
 *
 * **No approval and no waiting.** The Places API answers for a place by its
 * Place ID with nothing but an API key — unlike the Business Profile API,
 * which Google approves one application at a time (7–14 working days) and
 * which is the only route to the *reviews* themselves.
 *
 * The field mask asks for the rating and the number of ratings and nothing
 * else. That matters twice over: it keeps the call in the cheaper billing
 * tier, and it means **no review text is fetched at all** — Google's terms
 * forbid storing that, and the site has no use for it.
 *
 * @param {object} body the JSON the API answered with
 * @returns {{rating: number, count: number|null, countText: string, name: string}|null}
 */
export function parsePlacesRating(body) {
  if (!body || typeof body !== 'object') return null;
  const rating = Number(body.rating);
  if (!Number.isFinite(rating) || rating <= 0) return null;

  const raw = Number(body.userRatingCount);
  const count = Number.isFinite(raw) && raw > 0 ? raw : null;

  return {
    rating,
    // Google publishes the exact number of ratings, so it is stored as one.
    count,
    countText: count === null ? '' : String(count),
    name: body.displayName?.text || '',
  };
}

/**
 * Ask Google's Places API for one place's rating and rating count.
 *
 * @param {object} listing the listing, carrying its Place ID
 * @param {string} apiKey the Places API key
 * @returns {Promise<{rating: number, count: number|null, countText: string, name: string}|null>}
 */
async function fetchGoogle(listing, apiKey) {
  if (!apiKey) {
    console.log('   ↳ no GOOGLE_PLACES_API_KEY in .env.local — asking Google for nothing.');
    return null;
  }

  const response = await fetch(`https://places.googleapis.com/v1/places/${listing.placeId}`, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      // The rating and the count, and nothing else.
      'X-Goog-FieldMask': 'id,displayName,rating,userRatingCount',
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const reason = body.slice(0, 200).replace(/\s+/g, ' ');
    console.log(`   ↳ Google answered ${response.status}. ${reason}`);
    return null;
  }

  return parsePlacesRating(await response.json());
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/**
 * Read all four listings and write what was found.
 *
 * @returns {Promise<void>}
 */
export async function main() {
const { url: supabaseUrl, key: supabaseKey, placesKey } = loadConfig();
if (!supabaseUrl || !supabaseKey) {
  console.error('❌ No Supabase credentials. Run: node scripts/setup-petpooja.mjs');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

const swiggyListings = LISTINGS.filter((listing) => listing.key.startsWith('swiggy_'));
let browser = null;

if (swiggyListings.length > 0) {
  try {
    const { chromium } = await import('playwright');
    // Chrome must be headed and must not advertise that it is automated.
    // Swiggy's bot check answers a request that fails either of those with
    // "Access to www.swiggy.com was denied".
    browser = await chromium.launch({
      headless: false,
      channel: 'chrome',
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    });
  } catch (error) {
    console.log('⚠️  Could not start a browser for Swiggy:', error.message.split('\n')[0]);
    console.log('   The Swiggy ratings will keep the value they already have.');
  }
}

const now = new Date().toISOString();
let read = 0;
let failed = 0;

for (const listing of LISTINGS) {
  console.log(`\n📖 ${listing.fullName} (${listing.key})`);

  let found = null;
  try {
    found = listing.source === 'google'
      ? await fetchGoogle(listing, placesKey)
      : listing.key.startsWith('swiggy_')
        ? browser
          ? await fetchSwiggy(listing.url, browser)
          : null
        : await fetchZomato(listing.url);
  } catch (error) {
    console.log('   ↳ could not read the page:', error.message.split('\n')[0]);
  }

  if (!found) {
    // The value already on the books is kept. The page shows when it was
    // last read, so a stale figure is never mistaken for a fresh one.
    failed += 1;
    const { data } = await supabase
      .from('platform_listings')
      .select('rating, rating_count_text, fetched_at, source')
      .eq('listing', listing.key)
      .maybeSingle();
    console.log(
      data?.rating
        ? `   ↳ not read this time. Keeping ${data.rating} ★ (${data.rating_count_text || 'no count'}), last read ${String(data.fetched_at).slice(0, 10)}.`
        : '   ↳ not read, and there is no earlier value to keep.',
    );
    // The row is still written, so the page can say the platform exists and
    // that its rating has not been read yet.
    //
    // The **source** is not changed when there is already one: a value that
    // was measured somewhere else must not be relabelled as if it had been
    // read from the API that just refused.
    await supabase.from('platform_listings').upsert({
      listing: listing.key,
      name: listing.fullName,
      platform: listing.platform,
      source_url: listing.url,
      source: data?.source || (listing.source === 'google' ? 'places_api' : 'platform_page'),
      updated_at: now,
    }, { onConflict: 'listing' });
    continue;
  }

  const row = {
    listing: listing.key,
    name: listing.fullName,
    platform: listing.platform,
    rating: found.rating,
    rating_count: found.count ?? null,
    rating_count_text: found.countText ?? (found.count != null ? String(found.count) : ''),
    source_url: listing.url,
    source: listing.source === 'google' ? 'places_api' : 'platform_page',
    fetched_at: now,
    updated_at: now,
  };
  const { error } = await supabase
    .from('platform_listings')
    .upsert(row, { onConflict: 'listing' });
  if (error) throw new Error(error.message);

  read += 1;
  console.log(
    `   ✓ ${found.rating} ★ from ${row.rating_count_text || row.rating_count || 'an unknown number of ratings'}`,
  );
}

if (browser) await browser.close();

console.log(
  `\n${read} listing(s) read, ${failed} not read this time. The ratings on the Reviews page are now the platforms' own.`,
);
}

// Run only when this file is run, not when it is imported for its parsers.
if (process.argv[1] && process.argv[1].endsWith('sync-platform-ratings.mjs')) {
  await main();
}
