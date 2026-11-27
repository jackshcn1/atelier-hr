/*
 * tests/assets-verify.mjs
 *
 * The asset register's rules.
 *
 * Two things are said here and nowhere else: how an asset number is made,
 * and how an asset's state is read. If these are wrong, the register writes
 * numbers that collide and shows a thing as "fine" when it is not.
 *
 * Run: npm run test:assets
 */

import assert from 'node:assert/strict';
import {
  CONDITIONS,
  STATUSES,
  nextAssetNumber,
  assetNumbers,
  warrantyTill,
  groupByCategory,
  assetFigures,
} from '../lib/assets.js';

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

console.log('assets');

check('an asset number is the two prefixes and five digits', () => {
  assert.equal(nextAssetNumber('KI', 'CH', []), 'KICH00001');
  assert.equal(nextAssetNumber('FU', 'TA', []), 'FUTA00001');
});

check('the next number is the next free one for that pair', () => {
  assert.equal(nextAssetNumber('KI', 'CH', ['KICH00001']), 'KICH00002');
  assert.equal(nextAssetNumber('KI', 'CH', ['KICH00001', 'KICH00004']), 'KICH00005');
});

check('a number in another pair does not push this one along', () => {
  assert.equal(nextAssetNumber('KI', 'CH', ['FUTA00001']), 'KICH00001');
  assert.equal(nextAssetNumber('KI', 'CH', ['KICH00009', 'FUTA00001']), 'KICH00010');
});

check('a number that is not one of ours is ignored', () => {
  assert.equal(nextAssetNumber('KI', 'CH', ['KICH1', 'KICH0000A', 'OTHER']), 'KICH00001');
});

check('a stack of assets gets a number each, and they do not collide', () => {
  const numbers = assetNumbers('FU', 'CH', 3, []);
  assert.deepEqual(numbers, ['FUCH00001', 'FUCH00002', 'FUCH00003']);
});

check('a stack continues from what is already on the books', () => {
  const numbers = assetNumbers('FU', 'CH', 2, ['FUCH00001']);
  assert.deepEqual(numbers, ['FUCH00002', 'FUCH00003']);
});

check('a warranty runs out a year after the purchase', () => {
  assert.equal(warrantyTill('2026-11-27', 12), '2027-11-27');
  assert.equal(warrantyTill('2026-11-27', 24), '2028-11-27');
});

check('a year from the 31st is the last day of the next month, not the 3rd', () => {
  assert.equal(warrantyTill('2026-11-30', 12), '2027-11-30');
  assert.equal(warrantyTill('2026-01-31', 1), '2026-02-28');
});

check('no purchase date means no warranty date', () => {
  assert.equal(warrantyTill('', 12), null);
  assert.equal(warrantyTill('2026-11-27', 0), null);
});

check('the register reads by category, and every category is shown', () => {
  const categories = [
    { id: 1, name: 'Kitchen Equipment', prefix: 'KI' },
    { id: 2, name: 'Furniture', prefix: 'FU' },
  ];
  const groups = groupByCategory([
    { asset_number: 'KICH00001', category_id: 1 },
    { asset_number: 'FUTA00001', category_id: 2 },
    { asset_number: 'FUTA00002', category_id: 2, open_maintenance_jobs: [{ id: 'MNT-1' }] },
  ], categories);

  assert.equal(groups.length, 2);
  assert.equal(groups[0].name, 'Furniture');
  assert.equal(groups[0].assets.length, 2);
  assert.equal(groups[0].openJobs, 1);
  assert.equal(groups[1].assets.length, 1);
});

check('an asset with no category is still counted, not lost', () => {
  const groups = groupByCategory([{ asset_number: 'X', category_id: null }], []);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].assets.length, 1);
});

check('the three figures say what they count', () => {
  const figures = assetFigures([
    { status: 'Available' },
    { status: 'In-use', assigned_employee_id: '10001' },
    { status: 'Available', open_maintenance_jobs: [{ id: 'MNT-1' }] },
  ]);
  assert.equal(figures.total, 3);
  assert.equal(figures.inMaintenance, 1);
  assert.equal(figures.inUse, 1);
  assert.equal(figures.withHolder, 1);
});

check('condition and status are two different things', () => {
  // A thing can be perfectly good and still be in Maintenance.
  assert.ok(CONDITIONS.includes('Good'));
  assert.ok(STATUSES.includes('Maintenance'));
  assert.ok(!CONDITIONS.includes('Maintenance'));
  assert.ok(!STATUSES.includes('Good'));
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error('\nSome checks failed.');
