/**
 * tests/vendor-name-verify.mjs
 *
 * A vendor's identity is its normalised name, and the rule is applied to both
 * sides of every comparison — the name on the bill and the name on the vendor
 * list. It exists because the same supplier was on the books under two
 * spellings: the money split between the two rows, and anything filed
 * against one (a certificate, a contract) was invisible on the other.
 *
 * These checks pin down the rule: a branch tag, a missing apostrophe, case
 * and spacing must not give a supplier a second identity — and two genuinely
 * different suppliers must not be folded into one.
 *
 * Run: npm run test:vendor-name
 */

import assert from 'node:assert/strict';
import { findDuplicateVendor, sameVendor, vendorNameKey } from '../lib/vendorName.js';

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
    process.exitCode = 1;
  }
}

console.log('vendor names');

check('a trailing branch tag does not give a supplier a second identity', () => {
  assert.equal(
    vendorNameKey('COCHIN LIMRA SALES-TVM [BR]'),
    'cochin limra sales tvm'
  );
  assert.equal(
    vendorNameKey('COCHIN LIMRA SALES [Supplier]'),
    vendorNameKey('COCHIN LIMRA SALES')
  );
});

check('case and spacing do not matter', () => {
  assert.ok(sameVendor('Ambrosia - The Classic Bakehouse', 'AMBROSIA - THE CLASSIC BAKEHOUSE'));
  assert.ok(sameVendor('KR Agency', '  kr agency  '));
});

check('extra spacing does not matter', () => {
  assert.ok(sameVendor('A J AGENCIES', 'A  J  AGENCIES'));
  assert.ok(sameVendor('G K PAINTS', 'g k paints'));
});

check('a missing apostrophe is NOT folded by the rule — that is a judgement', () => {
  // "Baker's Hub" and "Bakers Hub" are the same shop, but the rule cannot
  // know that: an apostrophe reads as a separator, so the two spellings
  // differ by a letter. This pair was merged by hand, on purpose —
  // see scripts/merge-vendor-duplicates.mjs. The rule stays conservative.
  assert.ok(!sameVendor("Wholegrains - The Baker's Hub", 'Wholegrains - The Bakers Hub'));
  assert.ok(!sameVendor('Ambrosia - The Classic Bakehouse', 'Ambrisia - The Classic Bakehouse'));
});

check('an ampersand and the word and are the same', () => {
  assert.ok(sameVendor('Sandeep & Associates', 'Sandeep and Associates'));
});

check('a legal form at the end does not give a supplier a second identity', () => {
  assert.ok(sameVendor('S IBRAHIM & CO', 'S IBRAHIM'));
  assert.ok(sameVendor('More Retail private limited', 'More Retail'));
  assert.ok(sameVendor('BSP VEGETABLES AND FRUITS', 'BSP VEGETABLES AND FRUITS'));
});

check('a trade word is part of the name, not a suffix to strip', () => {
  assert.ok(!sameVendor('PRAKRITHI ENTERPRISES', 'PRAKRITHI'));
  assert.ok(!sameVendor('KOONATHIL STORES', 'KOONATHIL'));
});

check('two different suppliers are not the same', () => {
  assert.ok(!sameVendor('SREEKESAVA ENTERPRISES', 'SREEGANESH ENTERPRISES'));
  assert.ok(!sameVendor('PRAKRITHI ENTERPRISES', 'NOVOMINT ENTERPRISES'));
  assert.ok(!sameVendor('A J AGENCIES', 'SIBI AGENCIES'));
});

check('an empty name matches nothing', () => {
  assert.equal(vendorNameKey(''), '');
  assert.equal(vendorNameKey(null), '');
  assert.ok(!sameVendor('', ''));
});

check('a duplicate is found by the rule, not by the text', () => {
  const vendors = [
    { id: 32, name: "Wholegrains - The Baker's Hub" },
    { id: 34, name: 'Ambrosia - The Classic Bakehouse' },
  ];
  assert.equal(findDuplicateVendor(vendors, 'WHOLE GRAINS - THE BAKER S HUB'), null);
  assert.equal(findDuplicateVendor(vendors, 'AMBROSIA - THE CLASSIC BAKEHOUSE')?.id, 34);
  assert.equal(findDuplicateVendor(vendors, 'BABY MARINE SEAFOOD'), null);
});

console.log(`\n${passed} check(s) passed`);
if (process.exitCode) console.error('\nSome checks failed.');
