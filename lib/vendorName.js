// lib/vendorName.js — one way to name a vendor.
//
// A bill carries its supplier's name as text, and the same supplier can be
// spelled more than one way: a branch tag in brackets ("COCHIN LIMRA SALES
// [BR]"), a missing apostrophe, a different space. Two spellings of one
// supplier are two vendors on the books — and the money splits between them,
// so each row shows less than it should and a certificate filed against one
// is invisible on the other.
//
// So a vendor's identity is its NORMALISED name, and the rule is applied to
// BOTH sides of every comparison: the name on the bill and the name on the
// vendor list. That is the same rule the purchase refresh already uses to
// stop a third party's tag giving a bill a second identity.
//
// The rule is deliberately conservative. It strips a trailing bracketed tag
// (the house rule, from `cleanVendorName`) and ignores case and punctuation.
// It does NOT guess that two different-looking names are the same company —
// that is a judgement the owner makes, and `scripts/merge-vendor-duplicates.mjs`
// is where it is recorded.
//
// A trailing legal form is stripped too ("& CO", "private limited"), because
// that is the same trick the bracketed tag is: a suffix added by whoever
// wrote the bill, which must not give a supplier a second identity. The
// common Indian trade words ("ENTERPRISES", "STORES", "TRADERS") are NOT
// stripped — they are part of the name, and two suppliers can carry them.

import { cleanVendorName } from './expenseHelpers.js';

// A legal form at the end of a name: "& CO", "AND COMPANY", "PRIVATE LIMITED",
// "PVT LTD", "LLP", "INC". Read after "&" has already become "and".
const LEGAL_SUFFIX =
  /\s+(and co|and company|co|private limited|pvt ltd|private ltd|ltd|limited|llp|inc)$/;

/**
 * The key two vendor names are compared by.
 *
 * "COCHIN LIMRA SALES-TVM [BR]" → "cochin limra sales tvm"
 * "Wholegrains - The Baker's Hub" → "wholegrains the baker s hub"
 * "S IBRAHIM & CO" → "s ibrahim"
 *
 * @param {string} name
 * @returns {string}
 */
export function vendorNameKey(name) {
  const cleaned = cleanVendorName(name)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // A name that IS the suffix ("CO", "AND CO") keeps its own letters.
  const withoutSuffix = cleaned.replace(LEGAL_SUFFIX, '').trim();
  return withoutSuffix || cleaned;
}

/**
 * Whether two names are the same vendor under the rule above.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function sameVendor(a, b) {
  const keyA = vendorNameKey(a);
  return keyA.length > 0 && keyA === vendorNameKey(b);
}

/**
 * Find the vendor a new name would duplicate.
 *
 * @param {Array<{id: number|string, name: string}>} vendors
 * @param {string} name the name being added
 * @returns {object|null} the vendor already on the list, or null
 */
export function findDuplicateVendor(vendors, name) {
  const key = vendorNameKey(name);
  if (!key) return null;
  return (vendors || []).find(v => vendorNameKey(v.name) === key) || null;
}
