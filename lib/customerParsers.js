/**
 * lib/customerParsers.js — turning Petpooja's exports into customer rows.
 *
 * Everything here is a pure function over an array of rows, so it can be
 * tested without a browser and without a database.
 *
 * ## The rule that decides who is a customer
 *
 * A customer is a person whose order recorded a **real contact number**.
 *
 * Measured on 5,395 orders (1 Oct – 20 Nov 2026), 1,556 orders carried a
 * phone and 3,839 carried none. Of the 1,556, a large share were staff test
 * numbers typed to save time: `1234567890`, `9999999999`, `1111111111`, and
 * near-misses of the keypad run (`1234567891`, `1234657890`, `1234576890`,
 * `1236547890`).
 *
 * So a phone is real when, after the non-digits are stripped, its **last ten
 * digits**:
 *
 *   1. start with 6, 7, 8 or 9 — the first digit of every Indian mobile;
 *   2. are not all one digit — `1111111111` and `9999999999` are not numbers;
 *   3. are not a keypad run — a sequence that climbs or falls by one for
 *      seven or more steps is someone counting, not a phone.
 *
 * **A number that fails is not thrown away.** It is counted as an order with
 * no customer attached, so the page can show how much of the business is not
 * yet attributable to a person. That gap is the number worth closing at the
 * counter.
 *
 * ## Why the phone and not the name
 *
 * The owner decided on 20 Nov 2026: a customer is a person with a real
 * phone number, and the page also shows the value that has no phone
 * attached. No name-based customers and no address-based ones — one person
 * must never be counted twice.
 *
 * ## The join key for reviews
 *
 * Petpooja's orders export carries the **platform order id** (the Zomato or
 * Swiggy order id) in `Client OrderID`, and the Ratings & Reviews export
 * carries the same number in `Client Order Id`. That is what lets a review
 * be attached to the order it belongs to. Verified: the one Zomato review on
 * record is `8866657208`, and `8866657208` is a `Client OrderID` in the
 * orders export.
 */

// ---------------------------------------------------------------------------
// The phone rule
// ---------------------------------------------------------------------------

/**
 * Is this string a keypad run — digits that climb or fall by one?
 *
 * `1234567890` is a run. `9744511153` is not. The test is deliberately
 * strict: seven or more consecutive steps of +1 or −1.
 *
 * @param {string} digits ten digits, digits only
 */
export function isKeypadRun(digits) {
  let ascending = 0;
  let descending = 0;
  for (let i = 1; i < digits.length; i += 1) {
    const step = digits.charCodeAt(i) - digits.charCodeAt(i - 1);
    if (step === 1) ascending += 1;
    if (step === -1) descending += 1;
  }
  return ascending >= 7 || descending >= 7;
}

/**
 * The contact number, if this order recorded a real one.
 *
 * Returns the **last ten digits** — the number a person dials — or an empty
 * string when the order did not record a usable number.
 *
 * @param {string} value the phone as Petpooja wrote it
 * @returns {string} ten digits, or ''
 */
export function realPhone(value) {
  if (value === null || value === undefined) return '';
  const digits = String(value).replace(/\D/g, '');
  if (digits.length < 10) return '';

  const last = digits.slice(-10);

  // Every real Indian mobile starts 6, 7, 8 or 9. A number that does not is
  // either a landline written oddly or a test number.
  if (!'6789'.includes(last[0])) return '';

  // One digit repeated ten times is not a number.
  if (/^(\d)\1{9}$/.test(last)) return '';

  // A keypad run is someone counting, not dialling.
  if (isKeypadRun(last)) return '';

  return last;
}

/**
 * A short, safe way to show a phone number on a page.
 *
 * The middle digits are replaced, the way a bill shows it. The last two
 * digits are kept because they are what a person recognises their own
 * number by.
 *
 * @param {string} phone ten digits
 */
export function maskPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 10) return digits;
  return `${digits.slice(0, 2)}•••••${digits.slice(-2)}`;
}

// ---------------------------------------------------------------------------
// Reading a sheet or an export
// ---------------------------------------------------------------------------

/**
 * Find the header row of an export.
 *
 * Petpooja puts the restaurant's name and the period in the first rows and
 * the column headings further down, so the headings are looked for rather
 * than assumed to be the first row.
 *
 * @param {Array<Array<any>>} rows
 * @param {string[]} mustInclude headings that must all be present
 * @returns {number} the index of the header row, or -1
 */
export function findHeaderRow(rows, mustInclude) {
  const needles = mustInclude.map((n) => n.toLowerCase());
  const limit = Math.min(rows.length, 15);
  for (let i = 0; i < limit; i += 1) {
    const line = (rows[i] || []).map((c) => String(c ?? '').trim().toLowerCase());
    if (needles.every((n) => line.some((c) => c.includes(n)))) return i;
  }
  return -1;
}

/** A number out of a cell that may carry a rupee sign, commas or brackets. */
export function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).replace(/[₹,\s]/g, '').replace(/^\((.*)\)$/, '$1');
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/**
 * A date out of a cell, as 'YYYY-MM-DD'.
 *
 * Petpooja writes `19 Nov 2026 22:39:02` and the sheets write
 * `September 29, 2026`. All three are read.
 *
 * The slash form is read **by what it can be**: `11/20/26` can only be
 * November the 20th (no month is 20), and `19/11/2026` can only be the 19th
 * of November (no month is 19). So the part that cannot be a month is the
 * day. Only a date where **both** parts could be a month is a guess, and
 * those are read day-first — the restaurant is in India.
 *
 * The Ratings & Reviews export writes `11/20/26` (month first) while the
 * orders export writes `19 Nov 2026` (words). Both are read correctly.
 *
 * @param {string} value
 */
export function parseDate(value) {
  if (!value) return null;
  const text = String(value).trim();

  // 19 Nov 2026 22:39:02
  const words = text.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/);
  if (words) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const month = months.indexOf(words[2].slice(0, 3).toLowerCase());
    if (month >= 0) {
      return `${words[3]}-${String(month + 1).padStart(2, '0')}-${words[1].padStart(2, '0')}`;
    }
  }

  // September 29, 2026
  const longMonth = text.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (longMonth) {
    const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const month = months.indexOf(longMonth[1].toLowerCase());
    if (month >= 0) {
      return `${longMonth[3]}-${String(month + 1).padStart(2, '0')}-${longMonth[2].padStart(2, '0')}`;
    }
  }

  // 2026-11-19 (with or without a time)
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // 19/11/2026 or 11/20/26 — the part that cannot be a month is the day.
  const slash = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (slash) {
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    const first = Number(slash[1]);
    const second = Number(slash[2]);

    let day = first;
    let month = second;
    if (first <= 12 && second > 12) {
      // Only the second part can be a day.
      day = second;
      month = first;
    }

    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// The orders export
// ---------------------------------------------------------------------------

/**
 * The channel an order belongs to.
 *
 * The channel comes from Petpooja's **Sub Order Type**, which says where the
 * order really came from: `Dine In`, `Pick Up`, `Delivery`, `Zomato`,
 * `Atelier - Swiggy`, `Ambrosia - Swiggy`, `IGST Area`.
 *
 * A Zomato or a Swiggy order is a delivery, so it lands in the delivery
 * channel — and keeps its platform, which is a separate thing.
 *
 * @param {string} orderType the sub order type, or the order type
 */
export function channelOf(orderType) {
  const text = String(orderType || '').toLowerCase();
  if (text.includes('dine')) return 'dine_in';
  if (text.includes('pick')) return 'pick_up';
  if (text.includes('zomato')) return 'delivery';
  if (text.includes('swiggy')) return 'delivery';
  if (text.includes('delivery')) return 'delivery';
  return '';
}

/**
 * The platform an order came through.
 *
 * `Zomato` is Zomato and anything with Swiggy in it is Swiggy. A counter
 * order — Dine In, Pick Up — has no platform.
 *
 * @param {string} subOrderType Petpooja's sub order type
 */
export function platformOfChannel(subOrderType) {
  const text = String(subOrderType || '').toLowerCase();
  if (text.includes('zomato')) return 'zomato';
  if (text.includes('swiggy')) return 'swiggy';
  return '';
}

// ---------------------------------------------------------------------------
// The listings
// ---------------------------------------------------------------------------

/**
 * The pages the restaurant is listed on.
 *
 * **A marketplace is not a listing.** Swiggy carries two of our outlets —
 * "Atelier by Ambrosia" and "Ambrosia" — and they are two different pages
 * with two different ratings and two different sets of people complaining.
 * Calling both of them "Swiggy" and averaging them together is what made
 * the number on the page disagree with the number on the platform.
 *
 * So an order and a review carry **two** things:
 *
 *   platform  the marketplace — `zomato`, `swiggy`, or nothing for a counter
 *             order. This is the database's key on a review, and it does not
 *             change.
 *   listing   which of our outlets on that marketplace — one of the keys
 *             below. This is what a rating belongs to.
 *
 * ## The fourth page: Google
 *
 * Google is a page of ours too, and its rating is **bigger** than either
 * marketplace's — 3,628 ratings against Zomato's 4,401 and Swiggy's 10K+.
 * It is not a **marketplace**, though: nobody orders on Google, so it is not
 * somewhere a customer can be said to order from, and it is left out of the
 * "where they order" filters. It is a page people **review** us on, and that
 * is all it is.
 *
 * Its rating is read from the **Places API**, which needs only an API key —
 * no approval and no waiting. The reviews behind it come from the Business
 * Profile API, which Google approves one application at a time.
 */

/**
 * The Google listing's Place ID.
 *
 * Google identifies a place by a string that never changes, and the Places
 * API answers for it by name: the rating and the number of ratings, with
 * nothing more than an API key.
 *
 * It was read from the restaurant's own Google Maps listing — Ground Floor,
 * Koluthara Towers, Marappalam Road, Pattom — which showed 4.0 from 3,628
 * ratings on 22 November 2026.
 */
export const GOOGLE_PLACE_ID = 'ChIJ2dZj-yO7BTsR3dRz2zTaMjg';

/**
 * The key of our Google listing.
 *
 * Google is the one listing that is **not** a marketplace, so it is the one
 * the pages have to treat differently: nobody orders on it, and the reviews
 * on it are not in Petpooja.
 */
export const GOOGLE_LISTING_KEY = 'google_atelier';

/**
 * The pages of ours that people can review us on.
 *
 * @type {Array<{key: string, platform: string, brand: string, label: string, fullName: string, url: string, source: string}>}
 */
export const LISTINGS = [
  {
    key: 'zomato_atelier',
    platform: 'zomato',
    brand: 'atelier',
    label: 'Zomato',
    fullName: 'Atelier by Ambrosia on Zomato',
    url: 'https://www.zomato.com/it/trivandrum/atelier-by-ambrosia-amit-puri-ambalamukku/order',
    source: 'petpooja',
  },
  {
    key: 'swiggy_atelier',
    platform: 'swiggy',
    brand: 'atelier',
    label: 'Swiggy — Atelier',
    fullName: 'Atelier by Ambrosia on Swiggy',
    url: 'https://www.swiggy.com/city/thiruvananthapuram/atelier-by-ambrosia-marappalam-road-pattom-rest272534',
    source: 'petpooja',
  },
  {
    key: 'swiggy_ambrosia',
    platform: 'swiggy',
    brand: 'ambrosia',
    label: 'Swiggy — Ambrosia',
    fullName: 'Ambrosia on Swiggy',
    url: 'https://www.swiggy.com/city/thiruvananthapuram/ambrosia-marappalam-road-pattom-rest78577',
    source: 'petpooja',
  },
  {
    key: GOOGLE_LISTING_KEY,
    platform: 'google',
    brand: 'atelier',
    label: 'Google',
    fullName: 'Atelier by Ambrosia on Google',
    url: `https://www.google.com/maps/place/?q=place_id:${GOOGLE_PLACE_ID}`,
    placeId: GOOGLE_PLACE_ID,
    source: 'google',
  },
];

/**
 * The listing a key names, or nothing when the key is not one of ours.
 */
export function listingByKey(key) {
  return LISTINGS.find((listing) => listing.key === key) || null;
}

/**
 * The listings people **order** on — the marketplaces Petpooja knows about.
 *
 * Google is a page people review us on, but nobody orders there, so it is
 * left out of the "where they order" filters.
 *
 * @type {Array<object>}
 */
export const ORDERABLE_LISTINGS = LISTINGS.filter((listing) => listing.source !== 'google');

/**
 * The bucket a review is counted under.
 *
 * The three pages we are on are counted on their own. A review that matched
 * no order does not say which page it came from, and a Swiggy order with no
 * brand on it names only the marketplace — so both are counted in **one**
 * bucket, not one bucket per reason. The bucket is not one of our pages, so
 * it carries no platform rating.
 */
export const UNLISTED_KEY = 'not_listed';

/**
 * The bucket a review belongs to: its own listing, or the one bucket for
 * everything that is not on a page of ours.
 *
 * @param {string} listing the listing read from the order
 * @returns {string}
 */
export function listingBucket(listing) {
  const key = String(listing || '').trim();
  return listingByKey(key) ? key : UNLISTED_KEY;
}

/**
 * The listing an order belongs to.
 *
 * Petpooja says which one it was on the order itself — the sub order type
 * is `Atelier - Swiggy` or `Ambrosia - Swiggy` — so this is **read**, never
 * guessed.
 *
 * Zomato carries one listing only, so a Zomato order is always
 * `zomato_atelier`. A Swiggy order with no brand on it — Petpooja wrote
 * plain `Swiggy` for 98 orders in March and April 2026 — is `swiggy`, which
 * names the marketplace but not the outlet, and says so.
 *
 * @param {string} subOrderType Petpooja's sub order type
 * @returns {string} the listing key, or '' for a counter order
 */
export function listingOf(subOrderType) {
  const text = String(subOrderType || '').trim().toLowerCase();
  if (text.includes('ambrosia')) return 'swiggy_ambrosia';
  if (text.includes('atelier')) return 'swiggy_atelier';
  if (text.includes('zomato')) return 'zomato_atelier';
  if (text.includes('swiggy')) return 'swiggy';
  return '';
}

/**
 * Read Petpooja's All Orders export.
 *
 * ## The export is not one row per order
 *
 * It is **one row per order item**, and an order that was paid in more than
 * one way — or left partly unpaid — has **one row per payment** as well.
 *
 * Measured on the export for 22 Aug – 20 Nov 2026: 9,639 rows that hold
 * **9,267 orders**. The customer, the type and the date are on the item row.
 * The money is not always there:
 *
 *   - An order paid in one go has its total in `Grand Total` on the item row.
 *   - An order that was split has **zero** in `Grand Total` on the item row,
 *     the total in `Payment Description` ("Total : 850.00"), and one row per
 *     payment with that method's share of the money.
 *
 * Reading the item row's `Grand Total` on its own therefore reads **zero**
 * for every split order — which is most of the counter orders, and the ones
 * that carry a contact number. The order's money is the payment rows' total,
 * and the item row's total only when there are no payment rows.
 *
 * The columns are found **by heading**, not by position — the export has
 * carried columns in a different order before.
 *
 * @param {Array<Array<any>>} rows the workbook's first sheet
 * @returns {{ok: boolean, orders: Array<object>, error?: string}}
 */
export function parseOrdersExport(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: 'The orders export is empty.' };
  }
  const headerIndex = findHeaderRow(rows, ['Order No.', 'Grand Total']);
  if (headerIndex === -1) {
    return { ok: false, error: 'Could not find the "Order No. / Grand Total" header row.' };
  }

  const header = (rows[headerIndex] || []).map((c) => String(c ?? '').trim());
  const idx = (name) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const any = (name) => header.findIndex((h) => h.toLowerCase().includes(name.toLowerCase()));

  const orderNo = idx('Order No.');
  const total = any('Grand Total');
  if (orderNo === -1 || total === -1) {
    return { ok: false, error: 'The orders export has no "Order No." or "Grand Total" column.' };
  }

  const clientOrderId = any('Client Order');
  const customerName = any('Customer Name');
  const customerPhone = any('Customer Phone');
  const customerAddress = any('Customer Address');
  const orderType = any('Order Type');
  const subOrderType = any('Sub Order Type');
  const paymentType = any('Payment Type');
  const paymentDescription = any('Payment Description');
  const status = any('Status');
  const created = any('Created');
  const items = any('Items');

  // The rows are gathered by order number first. An order number appears
  // once for its item and again for each payment, and only the item row
  // says who the customer was.
  const byOrder = new Map();
  for (const row of rows.slice(headerIndex + 1)) {
    const number = String(row[orderNo] ?? '').trim();
    if (!number) continue;
    if (!byOrder.has(number)) byOrder.set(number, []);
    byOrder.get(number).push(row);
  }

  const orders = [];
  for (const [number, group] of byOrder) {
    // The row that describes the order — it carries the customer, the type
    // and the date. The rest are the payments.
    const itemRows = group.filter((row) => {
      const hasItems = items >= 0 && String(row[items] ?? '').trim() !== '';
      const hasType = orderType >= 0 && String(row[orderType] ?? '').trim() !== '';
      return hasItems || hasType;
    });
    const main = itemRows[0] || group[0];
    const paymentRows = group.filter((row) => row !== main);

    const rawPhone = customerPhone >= 0 ? String(main[customerPhone] ?? '').trim() : '';
    const phone = realPhone(rawPhone);
    const type = orderType >= 0 ? String(main[orderType] ?? '').trim() : '';
    const subType = subOrderType >= 0 ? String(main[subOrderType] ?? '').trim() : '';

    // ---- The order's money ---------------------------------------------
    //
    // Split orders carry the money on the payment rows and say zero on the
    // item row. Orders paid in one go carry it on the item row and have no
    // payment rows. And any order that has neither says it in the
    // `Payment Description` — "Total : 850.00".
    const paymentTotal = paymentRows.reduce((sum, row) => sum + (toNumber(row[total]) ?? 0), 0);
    const itemTotal = itemRows.reduce(
      (max, row) => Math.max(max, toNumber(row[total]) ?? 0),
      0,
    );
    const description = paymentDescription >= 0
      ? String(main[paymentDescription] ?? '').trim()
      : '';
    const described = /Total\s*:\s*([\d,.]+)/.exec(description);
    const describedTotal = described ? (toNumber(described[1]) ?? 0) : 0;

    let amount = paymentRows.length > 0 ? paymentTotal : itemTotal;
    if (!amount && describedTotal) amount = describedTotal;

    // ---- How it was paid -----------------------------------------------
    const paidMethods = [];
    let partUnpaid = false;
    for (const row of paymentRows) {
      const method = paymentType >= 0 ? String(row[paymentType] ?? '').trim() : '';
      if (!method) continue;
      if (/due|not paid|unpaid/i.test(method)) {
        partUnpaid = true;
        continue;
      }
      if ((toNumber(row[total]) ?? 0) > 0 && !paidMethods.includes(method)) {
        paidMethods.push(method);
      }
    }
    let paidBy = paidMethods.join(' + ');
    if (!paidBy && paymentType >= 0) paidBy = String(main[paymentType] ?? '').trim();
    if (partUnpaid) paidBy = paidBy ? `${paidBy} · part unpaid` : 'Part unpaid';

    // ---- What was ordered ----------------------------------------------
    const itemNames = itemRows
      .map((row) => (items >= 0 ? String(row[items] ?? '').trim() : ''))
      .filter(Boolean);

    orders.push({
      order_no: number,
      client_order_id: clientOrderId >= 0 ? String(main[clientOrderId] ?? '').trim() : '',
      phone,
      // The number as it was written, kept so the page can say what was
      // typed without the site inventing a customer from it.
      raw_phone: rawPhone,
      is_linked: Boolean(phone),
      customer_name: customerName >= 0 ? String(main[customerName] ?? '').trim() : '',
      customer_address: customerAddress >= 0 ? String(main[customerAddress] ?? '').trim() : '',
      order_type: type,
      sub_order_type: subType,
      // The sub order type says where the order came from. When it says
      // nothing useful — `IGST Area` is the one on record — the order type
      // says so instead: `Dine In (IGST)` is a dine-in order.
      channel: channelOf(subType) || channelOf(type),
      platform: platformOfChannel(subType),
      // Which of our three listings the order belongs to. Swiggy carries two
      // of them, so the marketplace alone does not say which page the order
      // was placed on.
      listing: listingOf(subType),
      amount,
      payment_type: paidBy,
      status: status >= 0 ? String(main[status] ?? '').trim() : '',
      order_date: created >= 0 ? parseDate(main[created]) : null,
      items: itemNames.join(', '),
    });
  }

  return { ok: true, orders };
}

// ---------------------------------------------------------------------------
// Rolling the orders up into customers
// ---------------------------------------------------------------------------

/**
 * Build the customer rows from the orders.
 *
 * A customer is a real phone number. An order with no real phone is kept in
 * the orders table but belongs to no customer — and its value is counted in
 * the gap, so the page can show it.
 *
 * @param {Array<object>} orders from `parseOrdersExport`
 * @returns {{customers: Array<object>, gap: object}}
 */
export function buildCustomers(orders) {
  const byPhone = new Map();
  const gap = {
    orders: 0,
    amount: 0,
    byChannel: { dine_in: 0, pick_up: 0, delivery: 0 },
    amountByChannel: { dine_in: 0, pick_up: 0, delivery: 0 },
  };

  for (const order of orders || []) {
    if (!order.is_linked || !order.phone) {
      gap.orders += 1;
      gap.amount += Number(order.amount || 0);
      const channel = order.channel || '';
      if (channel in gap.byChannel) {
        gap.byChannel[channel] += 1;
        gap.amountByChannel[channel] += Number(order.amount || 0);
      }
      continue;
    }

    let customer = byPhone.get(order.phone);
    if (!customer) {
      customer = {
        phone: order.phone,
        name: '',
        address: '',
        first_order_at: null,
        last_order_at: null,
        order_count: 0,
        total_spend: 0,
        channel_mix: { dine_in: 0, pick_up: 0, delivery: 0 },
        platform: '',
        platforms: {},
        listing: '',
        listings: {},
        client_order_ids: [],
      };
      byPhone.set(order.phone, customer);
    }

    // The best name is the one that is actually a name — the first that
    // arrives, but a later one replaces a placeholder.
    const name = String(order.customer_name || '').trim();
    if (name && !isPlaceholderName(name)) customer.name = name;
    const address = String(order.customer_address || '').trim();
    if (address) customer.address = address;

    customer.order_count += 1;
    customer.total_spend += Number(order.amount || 0);

    const channel = order.channel || '';
    if (channel in customer.channel_mix) customer.channel_mix[channel] += 1;

    if (order.order_date) {
      if (!customer.first_order_at || order.order_date < customer.first_order_at) {
        customer.first_order_at = order.order_date;
      }
      if (!customer.last_order_at || order.order_date > customer.last_order_at) {
        customer.last_order_at = order.order_date;
      }
    }

    // The platform the order came through. Petpooja says which one it was
    // on the order itself — a Zomato order says Zomato — so this is read,
    // never guessed from the shape of the order id.
    const platform = String(order.platform || '').trim();
    if (platform) customer.platforms[platform] = (customer.platforms[platform] || 0) + 1;

    // Which of our three listings the order was placed on. Swiggy carries two
    // of them, so this is the finer answer and the one a rating belongs to.
    const listing = String(order.listing || '').trim();
    if (listing) customer.listings[listing] = (customer.listings[listing] || 0) + 1;

    // A platform order id is what a review is matched on.
    const clientId = String(order.client_order_id || '').trim();
    if (clientId && !customer.client_order_ids.includes(clientId)) {
      customer.client_order_ids.push(clientId);
    }
  }

  const customers = [...byPhone.values()].map((c) => {
    const sorted = [...c.client_order_ids].sort();
    return {
      ...c,
      client_order_ids: sorted,
      avg_order_value: c.order_count > 0
        ? Math.round((c.total_spend / c.order_count) * 100) / 100
        : 0,
      platform: dominantPlatform(c.platforms),
      listing: dominantListing(c.listings),
      source: 'petpooja:orders',
    };
  });

  // The busiest first — the page's default order.
  customers.sort((a, b) => b.total_spend - a.total_spend);

  return {
    customers,
    gap: {
      ...gap,
      amount: Math.round(gap.amount * 100) / 100,
      amountByChannel: {
        dine_in: Math.round(gap.amountByChannel.dine_in * 100) / 100,
        pick_up: Math.round(gap.amountByChannel.pick_up * 100) / 100,
        delivery: Math.round(gap.amountByChannel.delivery * 100) / 100,
      },
    },
  };
}

/** A name that is really a placeholder — `nah`, `na`, a dash. */
export function isPlaceholderName(name) {
  const text = String(name || '').trim().toLowerCase();
  if (!text) return true;
  if (['nah', 'na', 'n/a', 'none', 'unknown', '-', '--'].includes(text)) return true;
  // A name that is only digits is a phone number typed into the name box.
  if (/^\d+$/.test(text)) return true;
  return false;
}

/**
 * The platform a customer orders through most.
 *
 * A customer can come through Zomato once and the counter twice, so the
 * platform with the most orders is the one that counts. An empty string
 * means the counter — the orders carried no platform at all.
 *
 * @param {{zomato?: number, swiggy?: number}} counts
 */
function dominantPlatform(counts) {
  const zomato = Number(counts?.zomato || 0);
  const swiggy = Number(counts?.swiggy || 0);
  if (zomato === 0 && swiggy === 0) return '';
  if (zomato > swiggy) return 'zomato';
  if (swiggy > zomato) return 'swiggy';
  return '';
}

/**
 * The listing a customer orders on most.
 *
 * The same idea as the dominant platform, but the marketplace is not enough
 * here — Swiggy carries two of our listings, so the one with the most
 * orders is what names the page the customer really uses.
 *
 * A tie is settled by the order the listings are listed in the app, so the
 * same customer is always shown the same way.
 *
 * @param {{[key: string]: number}} counts
 */
function dominantListing(counts) {
  const entries = Object.entries(counts || {}).filter(([, n]) => Number(n) > 0);
  if (entries.length === 0) return '';

  entries.sort((a, b) => {
    const byCount = Number(b[1]) - Number(a[1]);
    if (byCount !== 0) return byCount;
    const aOrder = LISTINGS.findIndex((listing) => listing.key === a[0]);
    const bOrder = LISTINGS.findIndex((listing) => listing.key === b[0]);
    return (aOrder === -1 ? 99 : aOrder) - (bOrder === -1 ? 99 : bOrder);
  });

  return entries[0][0];
}

// ---------------------------------------------------------------------------
// The Ratings & Reviews export
// ---------------------------------------------------------------------------

/**
 * Read the Ratings & Reviews export.
 *
 * The columns are `Provider`, `Client Order Id`, `Client Restaurant Id`,
 * `Rating`, `Created Date`, `Identifier`, `Feedback`. The provider is what
 * says whether a review is a Zomato one or a Swiggy one.
 *
 * @param {Array<Array<any>>} rows
 * @returns {{ok: boolean, reviews: Array<object>, error?: string}}
 */
export function parseRatingsExport(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: 'The ratings export is empty.' };
  }
  const headerIndex = findHeaderRow(rows, ['Provider', 'Rating']);
  if (headerIndex === -1) {
    return { ok: false, error: 'Could not find the "Provider / Rating" header row.' };
  }

  const header = (rows[headerIndex] || []).map((c) => String(c ?? '').trim());
  const idx = (name) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const provider = idx('Provider');
  const clientOrderId = idx('Client Order Id');
  const rating = idx('Rating');
  const created = idx('Created Date');
  const feedback = idx('Feedback');

  if (provider === -1 || rating === -1) {
    return { ok: false, error: 'The ratings export has no "Provider" or "Rating" column.' };
  }

  const reviews = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const name = String(row[provider] ?? '').trim().toLowerCase();
    if (!name) continue;
    const score = toNumber(row[rating]);
    if (score === null) continue;

    reviews.push({
      platform: name,
      client_order_id: String(row[clientOrderId] ?? '').trim(),
      rating: score,
      comment: feedback >= 0 ? String(row[feedback] ?? '').trim() : '',
      review_date: parseDate(row[created]),
      source: 'petpooja:ratings_and_reviews',
    });
  }

  return { ok: true, reviews };
}

/**
 * The candidate whose day is nearest to the day asked about.
 *
 * **Petpooja's order numbers are not unique.** Measured: March 2026 used the
 * numbers 4 to 2,691 and April 2026 used 1 to 3,169 — the same numbers in two
 * months. So a bill number or an order number names an order in more than one
 * month, and the day it was written on is what tells them apart.
 *
 * The nearest day is the match, because a bill is written on the day of the
 * meal it is for. When there is no day to go by, the earliest candidate is
 * taken, and when there are no candidates at all the answer is nothing.
 *
 * @param {Array<object>} candidates orders that share the number
 * @param {string} isoDate the day being looked for, as 'YYYY-MM-DD'
 * @returns {object|null}
 */
export function nearestByDate(candidates, isoDate) {
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  if (!isoDate) return candidates[0];

  const wanted = String(isoDate).slice(0, 10);
  let best = null;
  let bestGap = null;
  for (const candidate of candidates) {
    const date = String(candidate.order_date || candidate.review_date || '').slice(0, 10);
    if (!date) continue;
    const gap = Math.abs(new Date(`${date}T00:00:00Z`) - new Date(`${wanted}T00:00:00Z`));
    if (bestGap === null || gap < bestGap) {
      best = candidate;
      bestGap = gap;
    }
  }
  return best || candidates[0];
}

/**
 * Attach each review to the order it belongs to.
 *
 * The join is the **platform order id**: the orders export carries it in
 * `Client OrderID` and the ratings export carries the same number. A review
 * with no matching order is kept — it is still a review — but it is left
 * unlinked and is reported as such.
 *
 * @param {Array<object>} reviews
 * @param {Array<object>} orders
 * @returns {{reviews: Array<object>, linked: number, unlinked: number}}
 */
export function linkReviewsToOrders(reviews, orders) {
  const byClientId = new Map();
  const byOrderNo = new Map();
  for (const order of orders || []) {
    const clientId = String(order.client_order_id || '').trim();
    if (clientId && !byClientId.has(clientId)) byClientId.set(clientId, order);
    const number = String(order.order_no || '').trim();
    if (!number) continue;
    // An order number is not an identity — Petpooja restarts its numbering —
    // so the number may name an order in more than one month. Each one is
    // kept, and the one nearest the review's own date is the match.
    if (!byOrderNo.has(number)) byOrderNo.set(number, []);
    byOrderNo.get(number).push(order);
  }

  let linked = 0;
  let unlinked = 0;
  const out = (reviews || []).map((review) => {
    const clientId = String(review.client_order_id || '').trim();
    let order = byClientId.get(clientId);
    if (!order && clientId) {
      const candidates = byOrderNo.get(clientId) || [];
      order = nearestByDate(candidates, review.review_date);
    }
    if (order) {
      linked += 1;
      return {
        ...review,
        order_no: order.order_no,
        // The order's day as well as its number. The number alone is not an
        // identity — Petpooja restarts its numbering — so the pair is what
        // says which order this review was left on.
        order_date: order.order_date || null,
        phone: order.phone || '',
        is_linked: true,
        // The listing the review belongs to. A Swiggy review is on one of
        // two pages, and only the order it was matched to says which — the
        // review itself does not name the outlet.
        listing: order.listing || review.listing || '',
      };
    }
    unlinked += 1;
    return { ...review, order_no: '', order_date: null, phone: '', is_linked: false };
  });

  return { reviews: out, linked, unlinked };
}

// ---------------------------------------------------------------------------
// The feedback form
// ---------------------------------------------------------------------------

/** The rating questions on the form, and how they are stored. */
export const FEEDBACK_QUESTIONS = [
  { field: 'overall', heading: 'Overall Experience' },
  { field: 'food_quality', heading: 'Food Quality' },
  { field: 'taste', heading: 'Taste of the food' },
  { field: 'service', heading: 'Service' },
  { field: 'hospitality', heading: 'Staff Hospitality' },
  { field: 'waiting_time', heading: 'Waiting Time' },
];

/**
 * The scale every rating on the form is answered on.
 *
 * It is the sheet's own scale, word for word, so the answers mean the same
 * thing whichever way they were written down.
 */
export const FEEDBACK_SCALE = [
  { value: 5, label: 'Excellent' },
  { value: 4, label: 'Very Good' },
  { value: 3, label: 'Good' },
  { value: 2, label: 'Average' },
  { value: 1, label: 'Poor' },
];

/**
 * What a guest is asked to name when something could be better.
 *
 * This is the restaurant's own list, read off the dropdown rules of the old
 * sheet on 23 Nov 2026 — so the form offers what the paper register already
 * offered, and nothing is renamed underneath anyone.
 *
 * A guest may also name something that is not on the list; that is kept, and
 * it shows up on the page as a tag of its own. So a new word does not need a
 * code change to be counted.
 */
export const FEEDBACK_TAGS = [
  'Food',
  'Service',
  'Staff Hospitality',
  'Waiting Time',
  'Menu Variety',
  'Portion Size',
  'Price',
  'Cleanliness',
  'Nothing - everything was Great',
];

/** How long a piece of writing may be before it is refused. */
const MAX_COMMENT = 2000;
const MAX_TAG = 60;
const MAX_TAGS = 12;
const MAX_NAME = 120;

/**
 * Check a response that came in from the form, and clean it up.
 *
 * Everything a guest's words could contain is treated as text and never as
 * anything else — there is no SQL here, and the write is an upsert, so a
 * guest's words can never become a statement.
 *
 * @param {object} input what the form sent
 * @param {string} today today's date, as YYYY-MM-DD
 * @returns {{ok: boolean, response?: object, error?: string}}
 */
export function cleanFeedbackResponse(input, { today }) {
  const body = input || {};

  // The bill number is the number printed on the guest's bill. It is how the
  // response finds its order, so it is required — but it is not required to
  // be a bill we hold: a response that names a bill we do not have is kept
  // and reported, never thrown away.
  const billNumber = String(body.bill_number ?? '').trim().replace(/\s+/g, '');
  if (!billNumber) return { ok: false, error: 'The bill number is needed.' };
  if (!/^[0-9]{1,20}$/.test(billNumber)) {
    return { ok: false, error: 'The bill number is the number printed on the guest’s bill.' };
  }

  const waiter = String(body.waiter ?? '').trim();
  if (!waiter) return { ok: false, error: 'Who served the table is needed.' };
  if (waiter.length > MAX_NAME) return { ok: false, error: 'That name is too long.' };

  const ratings = body.ratings || {};
  const score = (value) => {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
  };

  const overall = score(ratings.overall);
  if (overall === null) {
    return { ok: false, error: 'The overall experience has to be rated.' };
  }

  const again = score(body.would_visit_again);
  if (again === null) {
    return { ok: false, error: '“Would you visit again” has to be answered.' };
  }

  // The five detail questions may be left unanswered — a guest in a hurry is
  // not made to answer all of them. The page says how many were answered, so
  // an average is never taken over more people than there were.
  const detail = {};
  for (const question of FEEDBACK_QUESTIONS) {
    if (question.field === 'overall') continue;
    detail[question.field] = score(ratings[question.field]);
  }

  // The tags: the ones from the list, plus anything the guest named that was
  // not on it. The same word twice is one tag.
  const tags = [];
  for (const tag of Array.isArray(body.improvement_tags) ? body.improvement_tags : []) {
    const text = String(tag ?? '').trim().slice(0, MAX_TAG);
    if (text && !tags.includes(text)) tags.push(text);
  }
  const other = String(body.other_tag ?? '').trim().slice(0, MAX_TAG);
  if (other && !tags.includes(other)) tags.push(other);
  if (tags.length > MAX_TAGS) {
    return { ok: false, error: `At most ${MAX_TAGS} things can be named.` };
  }

  const comment = String(body.comment ?? '').trim().slice(0, MAX_COMMENT);

  // The day the form was filled in. It may be another day — a guest can be
  // asked again — but it is never a day that has not happened.
  const responseDate = String(body.response_date ?? '').trim() || today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(responseDate)) {
    return { ok: false, error: 'The date could not be read.' };
  }
  if (responseDate > today) {
    return { ok: false, error: 'The date cannot be a day that has not happened yet.' };
  }

  return {
    ok: true,
    response: {
      bill_number: billNumber,
      response_date: responseDate,
      waiter,
      overall,
      ...detail,
      would_visit_again: FEEDBACK_SCALE.find((step) => step.value === again)?.label || '',
      improvement_tags: tags,
      comment,
      entered_by: String(body.entered_by ?? '').trim().slice(0, MAX_NAME),
    },
  };
}

/** A rating word or number, as a score out of 5. */
export function ratingScore(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim().toLowerCase();
  const words = {
    excellent: 5,
    'very good': 4,
    good: 3,
    average: 2,
    poor: 1,
  };
  if (words[text] !== undefined) return words[text];
  const n = Number(text);
  if (Number.isFinite(n) && n >= 1 && n <= 5) return n;
  return null;
}

/**
 * The "what can we improve" answer, as a list of tags.
 *
 * The form takes a comma-separated answer, so it is split on commas — but
 * a tag that itself contains a comma keeps it, because "portion size, and
 * more" is one thing they said.
 */
export function splitTags(value) {
  const text = String(value || '').trim();
  if (!text) return [];
  return text
    .split(/,(?![^()]*\))/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

/**
 * Attach each feedback response to the order it belongs to.
 *
 * **The owner's decision (20 Nov 2026): match on Bill Number only.** The
 * form has no phone column, so a response reaches a customer only when its
 * bill number is an order number. A response that does not match is kept
 * and still counts in the ratings — it is simply reported as unlinked.
 *
 * @param {Array<object>} responses
 * @param {Array<object>} orders
 * @returns {{responses: Array<object>, linked: number, unlinked: number}}
 */
export function linkFeedbackToOrders(responses, orders) {
  const byOrderNo = new Map();
  for (const order of orders || []) {
    const number = String(order.order_no || '').trim();
    if (!number) continue;
    // An order number is not an identity — Petpooja restarts its numbering —
    // so the same bill number names an order in more than one month. All of
    // them are kept, and the one nearest the response's own date is the match.
    if (!byOrderNo.has(number)) byOrderNo.set(number, []);
    byOrderNo.get(number).push(order);
  }

  let linked = 0;
  let unlinked = 0;
  const out = (responses || []).map((response) => {
    const bill = String(response.bill_number || '').trim();
    const candidates = byOrderNo.get(bill) || [];
    const order = nearestByDate(candidates, response.response_date);
    if (order) {
      linked += 1;
      return {
        ...response,
        order_no: order.order_no,
        phone: order.phone || '',
        is_linked: true,
      };
    }
    unlinked += 1;
    return { ...response, order_no: '', phone: '', is_linked: false };
  });

  return { responses: out, linked, unlinked };
}
