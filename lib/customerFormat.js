/**
 * lib/customerFormat.js — how a customer figure is shown.
 *
 * Small, shared by all three Customer pages so the same number is written the
 * same way wherever it appears: money the way India writes it, a channel in
 * words, a platform in words, a rating as stars.
 */

/** ₹1,23,456 — the way money is written here, with no decimals on a total. */
export function money(value, { decimals = 0 } = {}) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(number);
}

/** A plain number with thousands separators — for counts, not money. */
export function count(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0';
  return new Intl.NumberFormat('en-IN').format(number);
}

/** A percentage, written with one decimal only when it needs one. */
export function percent(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0%';
  return `${Number.isInteger(number) ? number : number.toFixed(1)}%`;
}

/** Where an order came from, in words. */
export function channelLabel(channel) {
  const key = String(channel || '').toLowerCase();
  if (key === 'dine_in') return 'Dine In';
  if (key === 'pick_up') return 'Pick Up';
  if (key === 'delivery') return 'Delivery';
  return 'Other';
}

/** Which platform a customer or a review came from, in words. */
export function platformLabel(platform) {
  const key = String(platform || '').toLowerCase();
  if (key === 'zomato') return 'Zomato';
  if (key === 'swiggy') return 'Swiggy';
  if (key === 'google') return 'Google';
  if (key === 'counter') return 'Counter';
  return 'Counter';
}

/**
 * Which of our three listings, in words.
 *
 * Swiggy carries two of them, so "Swiggy" on its own is not enough — the
 * listing says which page the order or the review belongs to.
 */
export function listingLabel(listing) {
  const key = String(listing || '').toLowerCase();
  if (key === 'zomato_atelier') return 'Zomato';
  if (key === 'swiggy_atelier') return 'Swiggy — Atelier';
  if (key === 'swiggy_ambrosia') return 'Swiggy — Ambrosia';
  // A Swiggy order with no brand on it says only the marketplace. It is not
  // one of our three pages, so it is not counted against one.
  if (key === 'swiggy') return 'Swiggy — brand not recorded';
  // Not one of our pages at all.
  return 'Not on a listing';
}

/** The listing a customer orders on most, in words. */
export function customerListingLabel(listing, listings) {
  const counts = listings && typeof listings === 'object' ? listings : {};
  const keys = Object.keys(counts).filter((key) => Number(counts[key]) > 0);
  if (keys.length === 0) return listingLabel(listing);
  const best = keys.sort((a, b) => Number(counts[b]) - Number(counts[a]))[0];
  return listingLabel(best);
}

/** A rating out of five, as a number with one decimal. */
export function rating(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '—';
  return number.toFixed(1);
}

/** A rating as a pill — good, warn or bad, by the score. */
export function ratingPill(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 'pill-quiet';
  if (number >= 4) return 'pill-good';
  if (number >= 3) return 'pill-warn';
  return 'pill-bad';
}

/** A date as '20 Nov 2026', or '—' when there is none. */
export function formatDate(value) {
  if (!value) return '—';
  const text = String(value).slice(0, 10);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, m, d] = text.split('-');
  if (!y || !m || !d) return text;
  return `${Number(d)} ${months[Number(m) - 1]} ${y}`;
}

/** A month key ('2026-11') as 'Nov 2026'. */
export function formatMonth(value) {
  if (!value) return '—';
  const [y, m] = String(value).split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (!y || !m) return String(value);
  return `${months[Number(m) - 1]} ${y}`;
}

/** The name of a customer, or a placeholder when the orders never carried one. */
export function customerName(name) {
  const text = String(name || '').trim();
  return text || 'No name on file';
}
