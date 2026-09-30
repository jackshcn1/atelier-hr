// Variable Pay — Data Source Parsers
// Each parser takes raw sheet rows (arrays of cells) and returns the values
// that feed one or more metrics. Parsers are pure: they never touch the database.

// Shared: strip the Petpooja "Name:/Date:/Restaurant Name:" preamble rows that
// sit above the real header row in most Petpooja exports.
function findHeaderRow(rows, mustInclude) {
  const needles = mustInclude.map(n => n.toLowerCase());
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const line = rows[i].map(c => String(c ?? '').trim().toLowerCase());
    if (needles.every(n => line.some(c => c.includes(n)))) return i;
  }
  return -1;
}

function dataRowsAfter(rows, headerIndex) {
  return rows.slice(headerIndex + 1).filter(r => r.some(c => String(c ?? '').trim() !== ''));
}

// Petpooja exports trailing "Total" / "Sub Total" summary rows. They must never
// be counted as real data or every figure doubles.
const SUMMARY_LABELS = ['total', 'sub total', 'subtotal', 'grand total', 'min.', 'max.'];

function isSummaryRow(row, labelColumnIndex) {
  const label = String(row[labelColumnIndex] ?? '').trim().toLowerCase();
  return SUMMARY_LABELS.includes(label);
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/[₹,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

// Excel serial / "9/28/26" / "3 Jul 2026" / ISO — all appear across these exports.
export function parseReportDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const [, mm, dd, yy] = m;
    const year = yy.length === 2 ? `20${yy}` : yy;
    return `${year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  m = raw.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (m) {
    const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
    const mm = months[m[2].slice(0, 3).toLowerCase()];
    if (mm) return `${m[3]}-${mm}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

// A period filter only keeps rows whose date lands inside [start, end].
// Reports with no usable date column return every row plus a flag so the UI
// can warn that nothing could be filtered.
function filterByDate(rows, dateColumnIndex, start, end) {
  if (dateColumnIndex === undefined || dateColumnIndex < 0) {
    return { rows, undated: true };
  }
  const kept = [];
  let undated = 0;
  for (const r of rows) {
    const d = parseReportDate(r[dateColumnIndex]);
    if (!d) { undated++; continue; }
    if (d >= start && d <= end) kept.push(r);
  }
  return { rows: kept, undated };
}

// ---------------------------------------------------------------- Captains
// Captain Performance Report: one row per captain with their order value.
// Column A = Captain Name, Column D = Total (₹)
export function parseCaptainPerformance(rows, { start, end }) {
  const headerIndex = findHeaderRow(rows, ['Captain Name', 'Total']);
  if (headerIndex === -1) {
    return { ok: false, error: 'Could not find the "Captain Name / Total (₹)" header row.' };
  }
  const body = dataRowsAfter(rows, headerIndex);
  const dateIdx = rows[headerIndex].findIndex(c => String(c).trim().toLowerCase().startsWith('date'));

  const { rows: inRange, undated } = filterByDate(body, dateIdx, start, end);
  // No per-row date column exists in this report — every captain row is a
  // month-to-date total, so the whole file is taken as-is.
  const effective = dateIdx >= 0 && !undated ? inRange : body;

  const captains = [];
  for (const r of effective) {
    if (isSummaryRow(r, 0)) continue;
    const name = String(r[0] ?? '').trim();
    const total = toNumber(r[3]);
    if (!name || total === null) continue;
    captains.push({ name, total });
  }

  const teamTotal = captains.reduce((s, c) => s + c.total, 0);
  return {
    ok: true,
    captains,
    teamTotal,
    preAggregated: dateIdx === -1,
    rowCount: effective.length
  };
}

// Parse captain-level pax average from the pax report
export function parseCaptainPaxAvg(rows, { start, end }) {
  // Re-use the pax parser but only keep rows that look like captain names
  const paxResult = parsePaxSales(rows, { start, end });
  if (!paxResult.ok) return paxResult;
  // The pax parser already strips "(Captain)" and excludes "biller"
  // We just return the captain subset
  return {
    ok: true,
    captains: paxResult.people,
    preAggregated: paxResult.preAggregated,
    rowCount: paxResult.rowCount
  };
}

// ------------------------------------------------------------------ Counter Sales
// Item Report with Customer Order Details: sum "Final Total" (col M, index 12)
// for items in allowed categories (col S, index 18) excluding excluded areas (col F, index 5).
const COUNTER_CATEGORIES = [
  'Birthday Cakes', 'Breads & Buns', 'Cookies', 'Dessert & Pastries',
  'Dryfruits & Nuts', 'Indian Sweets', 'Plain Cakes', 'Quick Bites',
  'Savouries & Rusks'
];
const EXCLUDED_AREAS = new Set([
  'swiggy_ambrosia', 'swiggy_atelier', 'zomato'
]);

export function parseCounterSales(rows, { start, end }) {
  const headerIndex = findHeaderRow(rows, ['Item Name', 'Final Total']);
  if (headerIndex === -1) {
    return { ok: false, error: 'Could not find the "Item Name / Final Total" header row.' };
  }
  const body = dataRowsAfter(rows, headerIndex);
  const hdr = rows[headerIndex].map(c => String(c ?? '').trim());
  const dateIdx = hdr.findIndex(h => h.toLowerCase() === 'date');
  const itemIdx = hdr.findIndex(h => h.toLowerCase().includes('item name'));
  const catIdx = hdr.findIndex(h => h.toLowerCase() === 'category');
  const areaIdx = hdr.findIndex(h => h.toLowerCase() === 'area');
  const finalTotalIdx = hdr.findIndex(h => h.toLowerCase().includes('final total'));
  const gstIdx = hdr.findIndex(h => h.toLowerCase() === 'gst' || h.toLowerCase() === 'gstin' || h.toLowerCase().includes('gst no'));

  if (dateIdx === -1 || itemIdx === -1 || catIdx === -1 || areaIdx === -1 || finalTotalIdx === -1) {
    return { ok: false, error: 'Required columns (Date, Item Name, Category, Area, Final Total) not found.' };
  }

  const { rows: inRange } = filterByDate(body, dateIdx, start, end);
  const allowedCats = new Set(COUNTER_CATEGORIES.map(c => c.toLowerCase()));

  let total = 0;
  let counted = 0;
  let excludedArea = 0;
  let excludedCategory = 0;
  let excludedGst = 0;
  const byCategory = {};

  for (const r of inRange) {
    if (isSummaryRow(r, itemIdx)) continue;
    const area = areaIdx >= 0 ? String(r[areaIdx] ?? '').trim().toLowerCase() : '';
    if (EXCLUDED_AREAS.has(area) || area.includes('swiggy') || area.includes('zomato')) { excludedArea++; continue; }

    // Exclude items with customer GST to avoid double-counting in B2B GST sales
    const gst = gstIdx >= 0 ? String(r[gstIdx] ?? '').trim() : '';
    if (gst) { excludedGst++; continue; }

    const cat = catIdx >= 0 ? String(r[catIdx] ?? '').trim() : '';
    const catNorm = cat.toLowerCase().replace(/\s*&\s*/g, ' and ').replace(/[^a-z0-9]/g, '');
    const allowed = ['birthdaycakes', 'breadsandbuns', 'cookies', 'dessertandpastries', 'dessertsandpastries', 'dryfruitsandnuts', 'indiansweets', 'plaincakes', 'quickbites', 'savouriesandrusks'];
    if (!allowed.includes(catNorm)) { excludedCategory++; continue; }

    const amt = toNumber(r[finalTotalIdx]);
    if (amt === null) continue;

    total += amt;
    byCategory[cat] = Math.round(((byCategory[cat] || 0) + amt) * 100) / 100;
  }

  return { ok: true, total: Math.round(total * 100) / 100, byCategory, entries: inRange.length, excludedArea, excludedCategory, excludedGst };
}

// ------------------------------------------------------------------- Pax
// Pax Sales Report (Biller Wise): "chingaap (Captain)" rows give per-person
// pax and sales. The "biller (Biller)" row is a terminal, not a person.
export function parsePaxSales(rows, { start, end }) {
  const headerIndex = findHeaderRow(rows, ['Name', 'Total Pax']);
  if (headerIndex === -1) {
    return { ok: false, error: 'Could not find the "Name / Total Pax / APC" header row.' };
  }
  const body = dataRowsAfter(rows, headerIndex);
  const dateIdx = rows[headerIndex].findIndex(c => String(c).trim().toLowerCase().startsWith('date'));

  const { rows: effective } = filterByDate(body, dateIdx, start, end);
  const useRows = dateIdx >= 0 ? effective : body;

  const people = [];
  // The "biller (Biller)" row is the POS terminal, not a person — it would
  // otherwise be matched to an employee called Biller and skew their average.
  const TERMINAL_NAMES = new Set(['biller', 'biller (biller)']);
  for (const r of useRows) {
    if (isSummaryRow(r, 0) || isSummaryRow(r, 1)) continue;
    const rawName = String(r[1] ?? '').trim();
    if (!rawName) continue;
    // Strip the trailing role tag: "chingaap (Captain)" -> "chingaap"
    const name = rawName.replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (TERMINAL_NAMES.has(name.toLowerCase())) continue;
    const pax = toNumber(r[2]);
    const sales = toNumber(r[3]);
    const apc = toNumber(r[4]);
    if (!name || pax === null) continue;
    people.push({ name, pax, sales, apc: apc ?? (pax > 0 ? sales / pax : 0) });
  }

  return { ok: true, people, preAggregated: dateIdx === -1, rowCount: useRows.length };
}

// ------------------------------------------------------------- Kitchen time
// KOT itemwise process time joined against a Base Menu export.
// Only items in the 14 approved kitchen categories count.
export function parseKitchenPrepTime(kotRows, menuRows, { start, end, kitchenCategories }) {
  const normalize = s => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/g, '').trim();

  // Base Menu: column B = category, column C = item name
  let menuMap = new Map();
  if (menuRows && menuRows.length) {
    const mh = findHeaderRow(menuRows, ['Category', 'Item Name']);
    const body = mh >= 0 ? dataRowsAfter(menuRows, mh) : menuRows;
    for (const r of body) {
      const category = String(r[1] ?? '').trim();
      const itemName = String(r[2] ?? '').trim();
      if (!category || !itemName) continue;
      if (category.toLowerCase() === 'archived') continue;
      menuMap.set(normalize(itemName), category);
    }
  }

  const headerIndex = findHeaderRow(kotRows, ['KOT ID', 'Item Name']);
  if (headerIndex === -1) {
    return { ok: false, error: 'Could not find the "KOT ID / Item Name" header row.' };
  }
  const body = dataRowsAfter(kotRows, headerIndex);
  const hdr = kotRows[headerIndex].map(c => String(c ?? '').trim());
  const itemIdx = hdr.findIndex(h => h.toLowerCase().includes('item name'));
  const prepIdx = hdr.findIndex(h => h.toLowerCase().includes('preparation time'));
  const punchIdx = hdr.findIndex(h => h.toLowerCase().includes('punch time'));

  const { rows: inRange } = filterByDate(body, punchIdx, start, end);

  let counted = 0;
  let skippedBlankTime = 0;
  let skippedNotOnMenu = 0;
  let skippedNonKitchen = 0;
  let totalMinutes = 0;
  const byCategory = {};

  for (const r of inRange) {
    const itemName = String(r[itemIdx] ?? '').trim();
    const category = menuMap.get(normalize(itemName));
    if (category === undefined) { skippedNotOnMenu++; continue; }
    if (!kitchenCategories.includes(category)) { skippedNonKitchen++; continue; }

    // Blank prep time means the dish was still open or never prepared.
    const minutes = toNumber(r[prepIdx]);
    if (minutes === null) { skippedBlankTime++; continue; }

    counted++;
    totalMinutes += minutes;
    byCategory[category] = (byCategory[category] || 0) + 1;
  }

  return {
    ok: true,
    averageMinutes: counted > 0 ? Math.round((totalMinutes / counted) * 100) / 100 : null,
    itemsCounted: counted,
    skipped: { blankTime: skippedBlankTime, notOnMenu: skippedNotOnMenu, nonKitchen: skippedNonKitchen },
    byCategory,
    menuItemsLoaded: menuMap.size
  };
}

// ------------------------------------------------------------------ Wastage
// Wastage Report: "Amount (₹)" column summed over the date range.
export function parseWastage(rows, { start, end }) {
  const headerIndex = findHeaderRow(rows, ['Date', 'Amount']);
  if (headerIndex === -1) {
    return { ok: false, error: 'Could not find the "Date / Amount (₹)" header row.' };
  }
  const body = dataRowsAfter(rows, headerIndex);
  const hdr = rows[headerIndex].map(c => String(c ?? '').trim());
  const dateIdx = hdr.findIndex(h => h.toLowerCase() === 'date');
  const amtIdx = hdr.findIndex(h => h.toLowerCase().includes('amount'));

  const { rows: inRange } = filterByDate(body, dateIdx, start, end);
  let total = 0;
  let counted = 0;
  for (const r of inRange) {
    const amt = toNumber(r[amtIdx]);
    if (amt === null) continue;
    total += amt;
    counted++;
  }
  return { ok: true, total: Math.round(total * 100) / 100, entries: counted, preAggregated: dateIdx === -1 };
}

// ------------------------------------------------------------- B2B revenue
// GSTN order summary. Two outputs: total B2B value, and GST numbers that are
// genuinely new within the pay period (absent from every earlier row).
export function parseB2bGstOrders(rows, { start, end }) {
  const headerIndex = findHeaderRow(rows, ['GSTIN', 'Customer Name']);
  if (headerIndex === -1) {
    return { ok: false, error: 'Could not find the "GSTIN / Customer Name" header row.' };
  }
  const body = dataRowsAfter(rows, headerIndex);
  const hdr = rows[headerIndex].map(c => String(c ?? '').trim());
  const dateIdx = hdr.findIndex(h => h.toLowerCase() === 'created date');
  const gstIdx = hdr.findIndex(h => h.toLowerCase() === 'gstin');
  const nameIdx = hdr.findIndex(h => h.toLowerCase() === 'customer name');
  const totalIdx = hdr.findIndex(h => h.toLowerCase().includes('grand total'));

  const seenBefore = new Set();
  const inPeriod = [];
  for (const r of body) {
    const gstin = String(r[gstIdx] ?? '').trim();
    if (!gstin) continue;
    const d = parseReportDate(r[dateIdx]);
    const total = toNumber(r[totalIdx]) ?? 0;

    if (d && d < start) {
      // Seen before this pay period — therefore not a new customer.
      seenBefore.add(gstin);
    } else if (d && d >= start && d <= end) {
      inPeriod.push({ gstin, customer: String(r[nameIdx] ?? '').trim(), total, date: d });
    }
  }

  const inPeriodGstins = new Set(inPeriod.map(o => o.gstin));
  // "New customer" means a GSTIN with no order at all before this pay period.
  // A client placing three orders this month is still one new customer, so the
  // count is over distinct GSTINs rather than order rows.
  const newGstins = [...inPeriodGstins].filter(g => !seenBefore.has(g));
  const newCustomers = inPeriod.filter(o => newGstins.includes(o.gstin));
  const totalRevenue = inPeriod.reduce((s, o) => s + o.total, 0);

  return {
    ok: true,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    newCustomerCount: newGstins.length,
    newCustomers,
    ordersInPeriod: inPeriod.length,
    uniqueGstinsInPeriod: inPeriodGstins.size,
    historicalGstins: seenBefore.size
  };
}

// ----------------------------------------------------------- Credit recovery
// Due Payment Report. Any invoice with Remaining Amount > 0 aged more than
// `maxAgeDays` at the computation date fails the check.
export function parseCreditRecovery(rows, { end, maxAgeDays = 30 }) {
  const headerIndex = findHeaderRow(rows, ['Invoice No.', 'Remaining Amount']);
  if (headerIndex === -1) {
    return { ok: false, error: 'Could not find the "Invoice No. / Remaining Amount" header row.' };
  }
  const body = dataRowsAfter(rows, headerIndex);
  const hdr = rows[headerIndex].map(c => String(c ?? '').trim());
  const dateIdx = hdr.findIndex(h => h.toLowerCase() === 'date');
  const remainingIdx = hdr.findIndex(h => h.toLowerCase().includes('remaining'));
  const custIdx = hdr.findIndex(h => h.toLowerCase() === 'customer name');
  const invIdx = hdr.findIndex(h => h.toLowerCase().includes('invoice'));

  const compute = new Date(`${end}T00:00:00Z`);
  const overdue = [];
  let outstanding = 0;
  let openCount = 0;

  for (const r of body) {
    if (isSummaryRow(r, 0) || isSummaryRow(r, 2)) continue;
    const remaining = toNumber(r[remainingIdx]);
    if (remaining === null || remaining <= 0) continue;
    openCount++;
    outstanding += remaining;

    const d = parseReportDate(r[dateIdx]);
    if (!d) continue;
    const ageDays = Math.floor((compute - new Date(`${d}T00:00:00Z`)) / 86400000);
    if (ageDays > maxAgeDays) {
      overdue.push({
        invoice: String(r[invIdx] ?? '').trim(),
        customer: String(r[custIdx] ?? '').trim(),
        remaining,
        ageDays
      });
    }
  }

  return {
    ok: true,
    pass: overdue.length === 0,
    openInvoiceCount: openCount,
    outstandingAmount: Math.round(outstanding * 100) / 100,
    overdueCount: overdue.length,
    oldestOverdueDays: overdue.reduce((m, o) => Math.max(m, o.ageDays), 0),
    overdue: overdue.slice(0, 25)
  };
}

// ------------------------------------------------------------ Purchase return
// Purchase Return report: every "Total (₹)" debit note summed over the range.
export function parsePurchaseReturns(rows, { start, end }) {
  const headerIndex = findHeaderRow(rows, ['Debit Note No.', 'Total']);
  if (headerIndex === -1) {
    return { ok: false, error: 'Could not find the "Debit Note No. / Total (₹)" header row.' };
  }
  const body = dataRowsAfter(rows, headerIndex);
  const hdr = rows[headerIndex].map(c => String(c ?? '').trim());
  const dateIdx = hdr.findIndex(h => h.toLowerCase().includes('debit note date'));
  const totalIdx = hdr.findIndex(h => h.toLowerCase().startsWith('total'));

  const { rows: inRange } = filterByDate(body, dateIdx, start, end);
  let total = 0;
  for (const r of inRange) {
    const t = toNumber(r[totalIdx]);
    if (t !== null) total += t;
  }
  return { ok: true, total: Math.round(total * 100) / 100, entries: inRange.length };
}

// ------------------------------------------------------------ Delivery sales
// Supports both Item Report (with Area and Final Total) and Orders Master Report.
export function parseDeliverySales(rows, { start, end, channels }) {
  const isItemReport = findHeaderRow(rows, ['Item Name', 'Final Total']) !== -1;

  if (isItemReport) {
    const headerIndex = findHeaderRow(rows, ['Item Name', 'Final Total']);
    const body = dataRowsAfter(rows, headerIndex);
    const hdr = rows[headerIndex].map(c => String(c ?? '').trim());
    const dateIdx = hdr.findIndex(h => h.toLowerCase() === 'date');
    const areaIdx = hdr.findIndex(h => h.toLowerCase() === 'area');
    const finalTotalIdx = hdr.findIndex(h => h.toLowerCase().includes('final total'));

    const { rows: inRange } = filterByDate(body, dateIdx, start, end);
    const useRows = dateIdx >= 0 && inRange.length > 0 ? inRange : body;

    const byChannel = {};
    let total = 0;
    for (const r of useRows) {
      if (isSummaryRow(r, 0) || isSummaryRow(r, 6)) continue;
      const area = String(r[areaIdx] ?? '').trim();
      const areaLower = area.toLowerCase();
      if (!areaLower.includes('swiggy') && !areaLower.includes('zomato')) continue;
      const amt = toNumber(r[finalTotalIdx]);
      if (amt === null || amt <= 0) continue;
      total += amt;
      byChannel[area] = Math.round(((byChannel[area] || 0) + amt) * 100) / 100;
    }
    return { ok: true, total: Math.round(total * 100) / 100, byChannel, orders: useRows.length };
  }

  const headerIndex = findHeaderRow(rows, ['Invoice No.', 'Area']);
  if (headerIndex === -1) {
    return { ok: false, error: 'Could not find the header row.' };
  }
  const body = dataRowsAfter(rows, headerIndex);
  const hdr = rows[headerIndex].map(c => String(c ?? '').trim());
  const dateIdx = hdr.findIndex(h => h.toLowerCase() === 'date');
  const areaIdx = hdr.findIndex(h => h.toLowerCase() === 'area');

  let netIdx = hdr.findIndex(h => h.toLowerCase().includes('net sales'));
  if (netIdx === -1) {
    netIdx = hdr.findIndex(h => h.toLowerCase().includes('final total') || h.toLowerCase().includes('total'));
  }

  const { rows: inRange } = filterByDate(body, dateIdx, start, end);
  const useRows = dateIdx >= 0 && inRange.length > 0 ? inRange : body;

  const wanted = channels ? new Set(channels.map(c => c.toLowerCase())) : null;
  const byChannel = {};
  let total = 0;
  for (const r of useRows) {
    if (isSummaryRow(r, 0)) continue;
    const area = String(r[areaIdx] ?? '').trim();
    const areaLower = area.toLowerCase();
    const isDelivery = wanted ? (wanted.has(areaLower) || areaLower.includes('swiggy') || areaLower.includes('zomato')) : (areaLower.includes('swiggy') || areaLower.includes('zomato'));
    if (!isDelivery) continue;
    const net = toNumber(r[netIdx]);
    if (net === null || net <= 0) continue;
    total += net;
    byChannel[area] = Math.round(((byChannel[area] || 0) + net) * 100) / 100;
  }
  return { ok: true, total: Math.round(total * 100) / 100, byChannel, orders: useRows.length };
}

// ------------------------------------------------------------ Feedback form
// Rating 1-5 -> percentage. "Would you visit again?" (column K) is a yes/no
// question, not a rating, and is deliberately excluded.
export function parseFeedbackForm(rows, { start, end }) {
  const headerIndex = findHeaderRow(rows, ['Food Quality', 'Service']);
  if (headerIndex === -1) {
    return { ok: false, error: 'Could not find the "Food Quality / Service" header row.' };
  }
  const body = dataRowsAfter(rows, headerIndex);
  if (body.length === 0) {
    return { ok: false, error: 'The feedback sheet has headers but no response rows.', empty: true };
  }
  const hdr = rows[headerIndex].map(c => String(c ?? '').trim());
  const idx = n => hdr.findIndex(h => h.toLowerCase() === n.toLowerCase());
  const dateIdx = idx('Date');
  const waiterIdx = idx('Waiter');

  const { rows: inRange } = filterByDate(body, dateIdx, start, end);
  const useRows = dateIdx >= 0 ? inRange : body;

  const RATING_FIELDS = ['Overall Experience', 'Food Quality', 'Taste of the food', 'Service', 'Staff Hospitality', 'Waiting Time'];
  const fieldIdxs = RATING_FIELDS.map(f => ({ field: f, i: idx(f) }));

  const sums = {}; const counts = {};
  const perWaiter = {};
  for (const r of useRows) {
    const waiter = String(r[waiterIdx] ?? '').trim();
    for (const { field, i } of fieldIdxs) {
      if (i < 0) continue;
      const v = toNumber(r[i]);
      if (v === null) continue;
      sums[field] = (sums[field] || 0) + v;
      counts[field] = (counts[field] || 0) + 1;
      if (waiter) {
        perWaiter[waiter] = perWaiter[waiter] || { sums: {}, counts: {} };
        perWaiter[waiter].sums[field] = (perWaiter[waiter].sums[field] || 0) + v;
        perWaiter[waiter].counts[field] = (perWaiter[waiter].counts[field] || 0) + 1;
      }
    }
  }

  const toPct = (field) => (counts[field] ? Math.round(((sums[field] / counts[field]) / 5) * 1000) / 10 : null);

  // Kitchen = food quality + taste. Service = service + staff hospitality.
  const kitchenAvg = (() => {
    const parts = ['Food Quality', 'Taste of the food'].filter(f => counts[f]);
    if (!parts.length) return null;
    const total = parts.reduce((s, f) => s + sums[f] / counts[f], 0);
    return Math.round((total / parts.length) / 5 * 1000) / 10;
  })();
  const serviceAvg = (() => {
    const parts = ['Service', 'Staff Hospitality'].filter(f => counts[f]);
    if (!parts.length) return null;
    const total = parts.reduce((s, f) => s + sums[f] / counts[f], 0);
    return Math.round((total / parts.length) / 5 * 1000) / 10;
  })();

  return {
    ok: true,
    responses: useRows.length,
    fieldPercentages: Object.fromEntries(RATING_FIELDS.map(f => [f, toPct(f)])),
    kitchenFoodPercent: kitchenAvg,
    servicePercent: serviceAvg,
    perWaiter: Object.fromEntries(Object.entries(perWaiter).map(([w, d]) => [w, {
      service: d.counts['Service'] ? Math.round(((d.sums['Service'] / d.counts['Service']) / 5) * 1000) / 10 : null
    }]))
  };
}

// Convert 1-5 rating text ("Excellent", "Very good", ...) to a number.
export function ratingTextToValue(text) {
  const map = {
    'excellent': 5, 'very good': 4, 'good': 3, 'average': 2, 'poor': 1
  };
  return map[String(text ?? '').trim().toLowerCase()] ?? null;
}
