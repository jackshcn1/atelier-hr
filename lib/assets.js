// lib/assets.js — the asset register's rules.
//
// The register is one list of things the restaurant owns: a chiller, a
// freezer, a table, a staff uniform. Each one is filed under a **category**
// (Kitchen Equipment, Furniture, Uniform, Electronics), is a **type** within
// that category (Chiller, Freezer, Table, Staff Uniform), and sits in a
// **location** (Kitchen, Restaurant, Office, Sales Counter, Storage).
//
// Two things are said here and nowhere else, so the list, the form and the
// detail page cannot disagree:
//
//   an asset's number   how the next one is numbered
//   an asset's state    what "condition" means and what "status" means
//
// The number is the category's prefix and the type's prefix, then five
// digits — KICH00001 is Kitchen Equipment (KI) + Chiller (CH), number one.

/** The condition of a thing: how good it is. */
export const CONDITIONS = ['Brand New', 'Good', 'Requires Maintenance', 'Bad'];

/**
 * The status of a thing: where it is in its life.
 *
 * A thing can be perfectly good and still be in Maintenance — the condition
 * is about the thing, the status is about what is happening to it. That is
 * why they are two fields and not one.
 */
export const STATUSES = ['Available', 'In-use', 'Maintenance', 'Returned', 'Discarded'];

/** The states a status may be in when it is not simply "as it is". */
export const STATUS_TONE = {
  Available: 'good',
  'In-use': 'quiet',
  Maintenance: 'bad',
  Returned: 'warn',
  Discarded: 'quiet',
};

export const CONDITION_TONE = {
  'Brand New': 'good',
  Good: 'good',
  'Requires Maintenance': 'warn',
  Bad: 'bad',
};

/**
 * The next asset number for a category and a type.
 *
 * The number is the two prefixes and five digits: KICH00001. It has to be
 * the next free number for that pair — not the next number overall — because
 * a chiller and a freezer in the same category both start at 00001.
 *
 * @param {string} categoryPrefix
 * @param {string} typePrefix
 * @param {string[]} existingNumbers every asset number already on the books
 * @returns {string}
 */
export function nextAssetNumber(categoryPrefix, typePrefix, existingNumbers = []) {
  const prefix = `${categoryPrefix || 'XX'}${typePrefix || 'YY'}`.toUpperCase();
  let highest = 0;
  for (const number of existingNumbers || []) {
    if (typeof number !== 'string' || !number.startsWith(prefix)) continue;
    const tail = number.slice(prefix.length);
    if (!/^\d{5}$/.test(tail)) continue;
    const value = Number(tail);
    if (value > highest) highest = value;
  }
  return `${prefix}${String(highest + 1).padStart(5, '0')}`;
}

/**
 * A whole run of numbers at once — for entering a stack of chairs in one go.
 *
 * @param {string} categoryPrefix
 * @param {string} typePrefix
 * @param {number} quantity how many are being entered
 * @param {string[]} existingNumbers
 * @returns {string[]}
 */
export function assetNumbers(categoryPrefix, typePrefix, quantity, existingNumbers = []) {
  const count = Math.max(0, Number(quantity) || 0);
  const numbers = [];
  let working = existingNumbers || [];
  for (let i = 0; i < count; i += 1) {
    const number = nextAssetNumber(categoryPrefix, typePrefix, working);
    numbers.push(number);
    working = working.concat(number);
  }
  return numbers;
}

/**
 * When a warranty runs out.
 *
 * It is worked out from when the thing was bought and how long the warranty
 * is — so the two can never disagree. A year from the 31st is the 30th or
 * the 31st of the next month, never the 3rd of the one after.
 *
 * @param {string} purchaseDate
 * @param {number} months
 * @returns {string|null} an ISO date
 */
export function warrantyTill(purchaseDate, months) {
  if (!purchaseDate || !months) return null;
  const d = new Date(purchaseDate);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + Number(months));
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}

/**
 * The assets grouped by category, the way the register reads.
 *
 * Every category is shown, even one with nothing in it — a category with no
 * assets is worth seeing, because it is where the next one goes.
 *
 * @param {object[]} assets
 * @param {object[]} categories
 * @returns {object[]} one entry per category, with its assets inside
 */
export function groupByCategory(assets, categories) {
  const groups = new Map();
  for (const category of categories || []) {
    groups.set(category.id, {
      id: category.id,
      name: category.name,
      prefix: category.prefix,
      assets: [],
      openJobs: 0,
    });
  }
  for (const asset of assets || []) {
    const key = asset.category_id || 'none';
    if (!groups.has(key)) {
      groups.set(key, {
        id: asset.category_id || 'none',
        name: asset.category_name || 'Uncategorised',
        prefix: '',
        assets: [],
        openJobs: 0,
      });
    }
    const group = groups.get(key);
    group.assets.push(asset);
    group.openJobs += (asset.open_maintenance_jobs || []).length;
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The three figures at the top of the register.
 *
 * @param {object[]} assets
 * @returns {{total: number, inMaintenance: number, inUse: number, withHolder: number}}
 */
export function assetFigures(assets) {
  const list = assets || [];
  return {
    total: list.length,
    inMaintenance: list.filter(a => (a.open_maintenance_jobs || []).length > 0 || a.status === 'Maintenance').length,
    inUse: list.filter(a => a.status === 'In-use').length,
    withHolder: list.filter(a => !!a.assigned_employee_id).length,
  };
}
