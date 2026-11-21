/**
 * tests/customer-parsers-verify.mjs
 *
 * The Customer section rests on one rule — **a customer is a person whose
 * order recorded a real contact number** — and on two joins: a review to its
 * order, and a feedback response to its order.
 *
 * These checks pin all three down, because each of them decides what the
 * page shows, and a wrong answer there is a wrong rupee.
 *
 * Run: npm run test:customers
 */

import assert from 'node:assert/strict';
import {
  realPhone,
  isKeypadRun,
  maskPhone,
  parseOrdersExport,
  buildCustomers,
  parseRatingsExport,
  linkReviewsToOrders,
  listingBucket,
  UNLISTED_KEY,
  parseFeedbackSheet,
  linkFeedbackToOrders,
  ratingScore,
  splitTags,
  parseDate,
  toNumber,
  listingOf,
  listingByKey,
  LISTINGS,
} from '../lib/customerParsers.js';
import {
  monthChunks,
  splitRange,
  customerWindowFor,
  orderKey,
  dayChunks,
  ratingChunks,
  ratingsHistoryWindow,
  isWholeCalendarMonth,
  reviewLinkStatement,
} from '../lib/customerSync.js';

let passed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// The shape of Petpooja's All Orders export.
// ---------------------------------------------------------------------------
const ORDERS_HEADER = [
  'Name:', 'Order Report', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
];
const ORDERS_COLUMNS = [
  'Order No.', 'Client OrderID', 'Order Type', 'Sub Order Type', 'Customer Name',
  'Customer Phone', 'GSTIN', 'Customer Address', 'Delivery Boy', 'Delivery Boy Number',
  'Items', 'My Amount (₹)', 'Total Discount (₹)', 'Delivery Charge (₹)',
  'Container Charge (₹)', 'Total Tax (₹)', 'Round Off (₹)', 'Grand Total (₹)',
  'Payment Type', 'Payment Description', 'Status', 'Created', 'Sequence Name',
];

const orderRow = ({
  no = '25001',
  clientId = '',
  type = 'Dine In (5)',
  subType = '',
  name = '',
  phone = '',
  address = '',
  items = 'Cake',
  amount = '500.00',
  payment = 'UPI',
  description = '',
  status = 'Success',
  created = '19 Nov 2026 22:39:02',
} = {}) => [
  no, clientId, type, subType, name, phone, '', address, '', '', items,
  amount, '0.00', '0.00', '0.00', '0.00', '0.00', amount,
  payment, description, status, created, '',
];

/**
 * A payment line.
 *
 * The export is not one row per order. An order that was paid in more than
 * one way — or left partly unpaid — has the item row and then one row for
 * each payment, and the item row says zero in `Grand Total`.
 */
const paymentRow = ({
  no = '25001',
  amount = '850',
  payment = 'UPI',
} = {}) => [
  no, '', '', '', '', '', '', '', '', '', '',
  '', '0.00', '0.00', '0.00', '0.00', '0.00', amount,
  payment, '', '', '', '',
];

console.log('customer parsers');

// ---------------------------------------------------------------------------
// The phone rule.
// ---------------------------------------------------------------------------

await check('a real mobile number is kept, as its last ten digits', () => {
  assert.equal(realPhone('8590418886'), '8590418886');
  assert.equal(realPhone('9744511153'), '9744511153');
  assert.equal(realPhone('9446179664'), '9446179664');
  // A number written with a country code keeps the dialled part.
  assert.equal(realPhone('+91 8590418886'), '8590418886');
  // A landline written with a leading zero keeps its last ten digits.
  assert.equal(realPhone('08045954249'), '8045954249');
});

await check('a number that does not start 6-9 is not a mobile', () => {
  assert.equal(realPhone('1234567890'), '');
  assert.equal(realPhone('02248931125'), '');
  assert.equal(realPhone('1457689061'), '');
});

await check('one digit repeated is not a number', () => {
  assert.equal(realPhone('9999999999'), '');
  assert.equal(realPhone('1111111111'), '');
  assert.equal(realPhone('1111111112'), '');
});

await check('a keypad run is someone counting, not dialling', () => {
  assert.equal(isKeypadRun('1234567890'), true);
  assert.equal(isKeypadRun('0987654321'), true);
  assert.equal(isKeypadRun('9744511153'), false);
  assert.equal(realPhone('1234567890'), '');
  assert.equal(realPhone('1234567891'), '');
  assert.equal(realPhone('1234657890'), '');
  assert.equal(realPhone('1234576890'), '');
  assert.equal(realPhone('1236547890'), '');
  assert.equal(realPhone('1234568790'), '');
  assert.equal(realPhone('1236547895'), '');
  assert.equal(realPhone('1234658790'), '');
});

await check('an empty or short number is not a number', () => {
  assert.equal(realPhone(''), '');
  assert.equal(realPhone(null), '');
  assert.equal(realPhone(undefined), '');
  assert.equal(realPhone('859041'), '');
});

await check('a phone is shown masked, with the last two digits kept', () => {
  assert.equal(maskPhone('8590418886'), '85•••••86');
  assert.equal(maskPhone(''), '');
});

// ---------------------------------------------------------------------------
// The orders export.
// ---------------------------------------------------------------------------

await check('the orders export is read by heading, not by position', () => {
  const rows = [
    ORDERS_HEADER,
    ['Restaurant Name:', 'Atelier'],
    ORDERS_COLUMNS,
    orderRow({ no: '25001', phone: '8590418886', amount: '500.00' }),
    orderRow({ no: '25002', phone: '1234567890', amount: '300.00' }),
    orderRow({ no: '25003', phone: '', amount: '200.00' }),
  ];
  const result = parseOrdersExport(rows);
  assert.equal(result.ok, true);
  assert.equal(result.orders.length, 3);
  assert.equal(result.orders[0].phone, '8590418886');
  assert.equal(result.orders[0].is_linked, true);
  assert.equal(result.orders[0].amount, 500);
  assert.equal(result.orders[0].order_date, '2026-11-19');
  assert.equal(result.orders[0].channel, 'dine_in');
  // A test number is not a customer, but the order is still an order.
  assert.equal(result.orders[1].phone, '');
  assert.equal(result.orders[1].is_linked, false);
  assert.equal(result.orders[1].raw_phone, '1234567890');
  assert.equal(result.orders[2].is_linked, false);
});

await check('a report with no order rows is refused, not guessed at', () => {
  const result = parseOrdersExport([['Nothing', 'here']]);
  assert.equal(result.ok, false);
  assert.ok(result.error);
});

await check('a channel is read from the sub order type', () => {
  const rows = [
    ORDERS_COLUMNS,
    orderRow({ no: '1', type: 'Delivery', subType: 'Zomato' }),
    orderRow({ no: '2', type: 'Pick Up', subType: 'Pick Up' }),
    orderRow({ no: '3', type: 'Dine In (12)', subType: 'Dine In' }),
    orderRow({ no: '4', type: 'Delivery', subType: 'Ambrosia - Swiggy' }),
  ];
  const result = parseOrdersExport(rows);
  assert.equal(result.orders[0].channel, 'delivery');
  assert.equal(result.orders[1].channel, 'pick_up');
  assert.equal(result.orders[2].channel, 'dine_in');
  assert.equal(result.orders[3].channel, 'delivery');
});

await check('rows that share an order number are one order', () => {
  // The export holds one row per item and one row per payment, so an order
  // number appears more than once. It is still one order.
  const result = parseOrdersExport([
    ORDERS_COLUMNS,
    orderRow({ no: '25001', phone: '8590418886', amount: '0.00', description: 'Total : 850.00' }),
    paymentRow({ no: '25001', amount: '850', payment: 'UPI' }),
  ]);
  assert.equal(result.orders.length, 1);
  assert.equal(result.orders[0].order_no, '25001');
  assert.equal(result.orders[0].phone, '8590418886');
});

await check('a split order is worth what was paid, not what the item row says', () => {
  // The item row of a split order says zero in Grand Total. Reading that
  // alone would value every counter order at nothing — and those are the
  // orders that carry a contact number.
  const result = parseOrdersExport([
    ORDERS_COLUMNS,
    orderRow({ no: '25001', phone: '8590418886', amount: '0.00', payment: 'Part Payment', description: 'Total : 850.00' }),
    paymentRow({ no: '25001', amount: '850', payment: 'UPI' }),
    paymentRow({ no: '25001', amount: '0', payment: 'Due Payment' }),
  ]);
  assert.equal(result.orders.length, 1);
  assert.equal(result.orders[0].amount, 850);
  assert.equal(result.orders[0].payment_type, 'UPI · part unpaid');
});

await check('an order paid in two parts is worth both parts', () => {
  const result = parseOrdersExport([
    ORDERS_COLUMNS,
    orderRow({ no: '25002', phone: '8590418886', amount: '0.00', payment: 'Part Payment', description: 'Total : 60.00' }),
    paymentRow({ no: '25002', amount: '20', payment: 'UPI' }),
    paymentRow({ no: '25002', amount: '40', payment: 'Cash' }),
  ]);
  assert.equal(result.orders[0].amount, 60);
  assert.equal(result.orders[0].payment_type, 'UPI + Cash');
});

await check('an order with one payment row still reads its total', () => {
  const result = parseOrdersExport([
    ORDERS_COLUMNS,
    orderRow({ no: '25003', amount: '0.00', payment: 'Part Payment', description: 'Total : 750.00' }),
    paymentRow({ no: '25003', amount: '750', payment: 'Cash' }),
  ]);
  assert.equal(result.orders[0].amount, 750);
});

// ---------------------------------------------------------------------------
// Rolling up into customers.
// ---------------------------------------------------------------------------

await check('one customer, several orders, one row', () => {
  const result = parseOrdersExport([
    ORDERS_COLUMNS,
    orderRow({ no: '1', phone: '8590418886', amount: '500.00', name: 'Smitha', created: '10 Nov 2026 10:00:00' }),
    orderRow({ no: '2', phone: '8590418886', amount: '700.00', name: 'Smitha', created: '19 Nov 2026 10:00:00' }),
  ]);
  const { customers, gap } = buildCustomers(result.orders);
  assert.equal(customers.length, 1);
  assert.equal(customers[0].order_count, 2);
  assert.equal(customers[0].total_spend, 1200);
  assert.equal(customers[0].avg_order_value, 600);
  assert.equal(customers[0].first_order_at, '2026-11-10');
  assert.equal(customers[0].last_order_at, '2026-11-19');
  assert.equal(customers[0].name, 'Smitha');
  assert.equal(gap.orders, 0);
});

await check('an order with no real phone is counted in the gap, not as a customer', () => {
  const result = parseOrdersExport([
    ORDERS_COLUMNS,
    orderRow({ no: '1', phone: '8590418886', amount: '500.00' }),
    orderRow({ no: '2', phone: '', amount: '300.00', type: 'Delivery (Zomato)' }),
    orderRow({ no: '3', phone: '1234567890', amount: '200.00' }),
  ]);
  const { customers, gap } = buildCustomers(result.orders);
  assert.equal(customers.length, 1);
  assert.equal(gap.orders, 2);
  assert.equal(gap.amount, 500);
  assert.equal(gap.byChannel.delivery, 1);
});

await check('the busiest customer comes first', () => {
  const result = parseOrdersExport([
    ORDERS_COLUMNS,
    orderRow({ no: '1', phone: '8590418886', amount: '100.00' }),
    orderRow({ no: '2', phone: '9744511153', amount: '900.00' }),
  ]);
  const { customers } = buildCustomers(result.orders);
  assert.equal(customers[0].phone, '9744511153');
});

await check('a placeholder name does not become the customer name', () => {
  const result = parseOrdersExport([
    ORDERS_COLUMNS,
    orderRow({ no: '1', phone: '8590418886', name: 'nah' }),
    orderRow({ no: '2', phone: '8590418886', name: 'Smitha' }),
  ]);
  const { customers } = buildCustomers(result.orders);
  assert.equal(customers[0].name, 'Smitha');
});

await check('the platform a customer came through is read from the sub order type', () => {
  // Petpooja says which platform the order came through, so it is read and
  // never guessed from the length of the platform order id.
  const zomato = parseOrdersExport([
    ORDERS_COLUMNS,
    orderRow({ no: '1', phone: '8590418886', type: 'Delivery', subType: 'Zomato', clientId: '8866657208' }),
  ]);
  const swiggy = parseOrdersExport([
    ORDERS_COLUMNS,
    orderRow({ no: '1', phone: '8590418886', type: 'Delivery', subType: 'Ambrosia - Swiggy', clientId: '254077709116249' }),
  ]);
  const counter = parseOrdersExport([
    ORDERS_COLUMNS,
    orderRow({ no: '1', phone: '8590418886', type: 'Dine In (5)', subType: 'Dine In' }),
  ]);
  assert.equal(zomato.orders[0].platform, 'zomato');
  assert.equal(zomato.orders[0].channel, 'delivery');
  assert.equal(swiggy.orders[0].platform, 'swiggy');
  assert.equal(counter.orders[0].platform, '');
  assert.equal(buildCustomers(zomato.orders).customers[0].platform, 'zomato');
  assert.equal(buildCustomers(swiggy.orders).customers[0].platform, 'swiggy');
  assert.equal(buildCustomers(counter.orders).customers[0].platform, '');
});

// ---------------------------------------------------------------------------
// A marketplace is not a listing.
// ---------------------------------------------------------------------------

await check('the listing is read from the sub order type', () => {
  // We are on three pages: Zomato, Swiggy — Atelier and Swiggy — Ambrosia.
  // Swiggy carries two of them, so the marketplace alone cannot say which
  // page an order was placed on. Petpooja names the outlet on the order, so
  // the listing is read and never guessed.
  assert.equal(listingOf('Zomato'), 'zomato_atelier');
  assert.equal(listingOf('Atelier - Swiggy'), 'swiggy_atelier');
  assert.equal(listingOf('Ambrosia - Swiggy'), 'swiggy_ambrosia');
  // Petpooja wrote plain `Swiggy` on 98 orders in March and April 2026. That
  // names the marketplace but not the outlet, and says so.
  assert.equal(listingOf('Swiggy'), 'swiggy');
  assert.equal(listingOf('Dine In'), '');
  assert.equal(listingOf(''), '');
  assert.equal(listingOf(null), '');

  // The three listings are the ones we are actually on.
  assert.deepEqual(
    LISTINGS.map((listing) => listing.key),
    ['zomato_atelier', 'swiggy_atelier', 'swiggy_ambrosia'],
  );
  // Zomato and Swiggy share a marketplace; the listing is what tells them
  // apart, and it never does.
  assert.equal(listingByKey('swiggy_atelier').platform, 'swiggy');
  assert.equal(listingByKey('swiggy_ambrosia').platform, 'swiggy');
  assert.equal(listingByKey('zomato_atelier').platform, 'zomato');
  assert.equal(listingByKey('nope'), null);
});

await check('an order carries its listing, and a customer counts them', () => {
  const zomato = parseOrdersExport([
    ORDERS_COLUMNS,
    orderRow({ no: '1', phone: '8590418886', type: 'Delivery', subType: 'Zomato' }),
    orderRow({ no: '2', phone: '8590418886', type: 'Delivery', subType: 'Atelier - Swiggy' }),
    orderRow({ no: '3', phone: '8590418886', type: 'Delivery', subType: 'Ambrosia - Swiggy' }),
  ]).orders;

  assert.equal(zomato[0].listing, 'zomato_atelier');
  assert.equal(zomato[1].listing, 'swiggy_atelier');
  assert.equal(zomato[2].listing, 'swiggy_ambrosia');

  const { customers } = buildCustomers(zomato);
  assert.deepEqual(customers[0].listings, {
    zomato_atelier: 1,
    swiggy_atelier: 1,
    swiggy_ambrosia: 1,
  });
  // The listing a customer orders on most.
  assert.equal(customers[0].listing, 'zomato_atelier');
});

await check('a review takes the listing of the order it was left on', () => {
  // The review itself never names the outlet — only the order it was matched
  // to does. This is why the listing on a review is never guessed.
  const orders = parseOrdersExport([
    ORDERS_COLUMNS,
    orderRow({ no: '25001', clientId: '8866657208', type: 'Delivery', subType: 'Atelier - Swiggy' }),
    orderRow({ no: '25002', clientId: '1112223334', type: 'Delivery', subType: 'Ambrosia - Swiggy' }),
  ]).orders;

  const reviews = parseRatingsExport([
    ['Provider', 'Client Order Id', 'Client Restaurant Id', 'Rating', 'Created Date', 'Identifier', 'Feedback'],
    ['swiggy', '8866657208', 'abc', '3', '11/20/26', 'Atelier', 'Good'],
    ['swiggy', '1112223334', 'abc', '5', '11/19/26', 'Ambrosia', 'Great'],
  ]).reviews;

  const result = linkReviewsToOrders(reviews, orders);
  assert.equal(result.reviews[0].listing, 'swiggy_atelier');
  assert.equal(result.reviews[1].listing, 'swiggy_ambrosia');
  // The order's day travels with the review, because an order number on its
  // own is not an identity.
  assert.equal(result.reviews[0].order_date, '2026-11-19');
  assert.equal(result.reviews[1].order_date, '2026-11-19');
});

await check('a review that matched no order carries no listing', () => {
  const reviews = parseRatingsExport([
    ['Provider', 'Client Order Id', 'Client Restaurant Id', 'Rating', 'Created Date', 'Identifier', 'Feedback'],
    ['zomato', '9999999999', 'abc', '1', '11/20/26', 'Atelier', 'Bad'],
  ]).reviews;

  const result = linkReviewsToOrders(reviews, []);
  assert.equal(result.reviews[0].is_linked, false);
  assert.equal(result.reviews[0].listing || '', '');
  assert.equal(result.reviews[0].order_date, null);
});

// ---------------------------------------------------------------------------
// The reviews.
// ---------------------------------------------------------------------------

await check('the ratings export is read and its provider kept', () => {
  const rows = [
    ['Restaurant : Atelier', '', '', '', '', '', ''],
    ['Provider', 'Client Order Id', 'Client Restaurant Id', 'Rating', 'Created Date', 'Identifier', 'Feedback'],
    ['zomato', '8866657208', 'vd9tjrzo1c', '3', '11/20/26', 'Atelier', 'Good but slow'],
    ['swiggy', '254077709116249', 'abc123', '5', '11/19/26', 'Atelier', ''],
  ];
  const result = parseRatingsExport(rows);
  assert.equal(result.ok, true);
  assert.equal(result.reviews.length, 2);
  assert.equal(result.reviews[0].platform, 'zomato');
  assert.equal(result.reviews[0].rating, 3);
  assert.equal(result.reviews[0].comment, 'Good but slow');
  assert.equal(result.reviews[0].review_date, '2026-11-20');
  assert.equal(result.reviews[1].platform, 'swiggy');
});

await check('reviews read straight from the endpoint are not thrown away', () => {
  // The sync builds these rows itself, and it once put the headings and the
  // values in the same row — which reads the word "Rating" where the score
  // should be, and throws every review away for having no rating.
  const fetched = [
    { platform: 'zomato', client_order_id: '8518706378', rating: 4, comment: '', review_date: '2026-08-29' },
    { platform: 'swiggy', client_order_id: '246285240192181', rating: 5, comment: 'Lovely', review_date: '2026-08-28' },
  ];
  const parsed = parseRatingsExport([
    ['Provider', 'Client Order Id', 'Client Restaurant Id', 'Rating', 'Created Date', 'Identifier', 'Feedback'],
    ...fetched.map((review) => [
      review.platform, review.client_order_id, '', review.rating,
      review.review_date, 'Atelier', review.comment,
    ]),
  ]);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.reviews.length, fetched.length);
  assert.equal(parsed.reviews[0].rating, 4);
  assert.equal(parsed.reviews[0].platform, 'zomato');
  assert.equal(parsed.reviews[1].rating, 5);
  assert.equal(parsed.reviews[1].comment, 'Lovely');
});

await check('a review is attached to its order by the platform order id', () => {
  const orders = parseOrdersExport([
    ORDERS_COLUMNS,
    orderRow({ no: '25001', clientId: '8866657208', phone: '8590418886' }),
  ]).orders;
  const reviews = parseRatingsExport([
    ['Provider', 'Client Order Id', 'Client Restaurant Id', 'Rating', 'Created Date', 'Identifier', 'Feedback'],
    ['zomato', '8866657208', 'vd9tjrzo1c', '3', '11/20/26', 'Atelier', 'Good'],
  ]).reviews;

  const result = linkReviewsToOrders(reviews, orders);
  assert.equal(result.linked, 1);
  assert.equal(result.unlinked, 0);
  assert.equal(result.reviews[0].order_no, '25001');
  assert.equal(result.reviews[0].phone, '8590418886');
  assert.equal(result.reviews[0].is_linked, true);
});

await check('a review with no matching order is kept, and reported as unlinked', () => {
  const orders = parseOrdersExport([
    ORDERS_COLUMNS,
    orderRow({ no: '25001', clientId: '1111111111' }),
  ]).orders;
  const reviews = parseRatingsExport([
    ['Provider', 'Client Order Id', 'Client Restaurant Id', 'Rating', 'Created Date', 'Identifier', 'Feedback'],
    ['zomato', '9999999999', 'vd9tjrzo1c', '1', '11/20/26', 'Atelier', 'Bad'],
  ]).reviews;

  const result = linkReviewsToOrders(reviews, orders);
  assert.equal(result.linked, 0);
  assert.equal(result.unlinked, 1);
  assert.equal(result.reviews.length, 1);
  assert.equal(result.reviews[0].is_linked, false);
});

// ---------------------------------------------------------------------------
// Petpooja restarts its order numbering.
// ---------------------------------------------------------------------------

const FEEDBACK_HEADER = [
  'Date', 'Feedback Sl No.', 'Bill Number', 'Waiter', 'Overall Experience',
  'Food Quality', 'Taste of the food', 'Service', 'Staff Hospitality',
  'Waiting Time', 'Would you visit Atelier again?', 'What can we improve', 'Comment',
];

await check('two months can hold the same order number', () => {
  // Measured against Petpooja: March 2026 used the numbers 4 to 2,691 and
  // April 2026 used 1 to 3,169 — the same numbers in two months. So an order
  // number is not an identity, and the key the books are written under has to
  // carry the day as well.
  //
  // The two orders are built by hand here rather than parsed: the export is
  // pulled a month at a time, so the parser never sees both at once. It is
  // the sync that has to hold them both, and the sync's key is what is
  // checked.
  const march = { order_no: '100', order_date: '2026-03-15', phone: '8590418886' };
  const april = { order_no: '100', order_date: '2026-04-15', phone: '9447001122' };

  assert.notEqual(orderKey(march), orderKey(april));
  assert.equal(orderKey(march), '100|2026-03-15');
  assert.equal(orderKey(april), '100|2026-04-15');
});

await check('the same order pulled twice keeps one row', () => {
  const order = { order_no: '100', order_date: '2026-03-15' };
  assert.equal(orderKey(order), orderKey({ ...order }));
});

await check('a review joins the order whose day is nearest its own', () => {
  // The platform order id is the join when it is there. When it is not, the
  // order number can name an order in more than one month, and the day the
  // review was left on says which one it was about.
  const orders = [
    { order_no: '100', order_date: '2026-03-15', phone: '8590418886', client_order_id: '' },
    { order_no: '100', order_date: '2026-04-15', phone: '9447001122', client_order_id: '' },
  ];
  const reviews = parseRatingsExport([
    ['Provider', 'Client Order Id', 'Client Restaurant Id', 'Rating', 'Created Date', 'Identifier', 'Feedback'],
    ['zomato', '100', 'vd9tjrzo1c', '4', '18/04/26', 'Atelier', 'April one'],
  ]).reviews;

  const result = linkReviewsToOrders(reviews, orders);
  assert.equal(result.linked, 1);
  assert.equal(result.reviews[0].phone, '9447001122');
});

await check('a feedback response joins the order whose day is nearest its own', () => {
  // The bill number is the join, by the owner's decision. A bill number that
  // was issued in two months is told apart by the day the form was filled in.
  const orders = [
    { order_no: '100', order_date: '2026-03-15', phone: '8590418886', client_order_id: '' },
    { order_no: '100', order_date: '2026-04-15', phone: '9447001122', client_order_id: '' },
  ];
  const responses = parseFeedbackSheet([
    FEEDBACK_HEADER,
    ['April 16, 2026', '1', '100', 'Chingkab', 'Excellent', 'Very Good', 'Good', 'Excellent', 'Good', 'Average', 'Very Good', 'Portion Size', ''],
  ]).responses;

  const result = linkFeedbackToOrders(responses, orders);
  assert.equal(result.linked, 1);
  assert.equal(result.responses[0].phone, '9447001122');
  assert.equal(result.responses[0].is_linked, true);
});

// ---------------------------------------------------------------------------
// The feedback form.
// ---------------------------------------------------------------------------

await check('the feedback sheet is read by heading', () => {
  const rows = [
    FEEDBACK_HEADER,
    ['September 29, 2026', '1', '25001', 'Chingkab', 'Excellent', 'Very Good', 'Good', 'Excellent', 'Good', 'Average', 'Very Good', 'Portion Size, Cleanliness', 'Nice'],
    ['October 2, 2026', '2', '25002', 'Along', 'Good', 'Good', 'Very Good', 'Good', 'Very Good', 'Good', 'Very Good', 'Waiting Time', ''],
  ];
  const result = parseFeedbackSheet(rows);
  assert.equal(result.ok, true);
  assert.equal(result.responses.length, 2);
  assert.equal(result.responses[0].bill_number, '25001');
  assert.equal(result.responses[0].overall, 5);
  assert.equal(result.responses[0].food_quality, 4);
  assert.equal(result.responses[0].taste, 3);
  assert.equal(result.responses[0].service, 5);
  assert.equal(result.responses[0].hospitality, 3);
  assert.equal(result.responses[0].waiting_time, 2);
  assert.equal(result.responses[0].waiter, 'Chingkab');
  assert.equal(result.responses[0].response_date, '2026-09-29');
  assert.deepEqual(result.responses[0].improvement_tags, ['Portion Size', 'Cleanliness']);
  assert.equal(result.responses[0].comment, 'Nice');
});

await check('a feedback response is attached to its order by the bill number', () => {
  const orders = parseOrdersExport([
    ORDERS_COLUMNS,
    orderRow({ no: '25001', phone: '8590418886' }),
  ]).orders;
  const responses = parseFeedbackSheet([
    FEEDBACK_HEADER,
    ['September 29, 2026', '1', '25001', 'Chingkab', 'Excellent', 'Very Good', 'Good', 'Excellent', 'Good', 'Average', 'Very Good', 'Portion Size', ''],
    ['October 2, 2026', '2', '112233', 'Along', 'Good', 'Good', 'Very Good', 'Good', 'Very Good', 'Good', 'Very Good', 'Waiting Time', ''],
  ]).responses;

  const result = linkFeedbackToOrders(responses, orders);
  assert.equal(result.linked, 1);
  assert.equal(result.unlinked, 1);
  assert.equal(result.responses[0].order_no, '25001');
  assert.equal(result.responses[0].phone, '8590418886');
  // A bill number that matches nothing is kept and reported, not dropped.
  assert.equal(result.responses[1].is_linked, false);
  assert.equal(result.responses[1].bill_number, '112233');
});

await check('a rating word becomes a score, and a blank stays blank', () => {
  assert.equal(ratingScore('Excellent'), 5);
  assert.equal(ratingScore('Very Good'), 4);
  assert.equal(ratingScore('Good'), 3);
  assert.equal(ratingScore('Average'), 2);
  assert.equal(ratingScore('Poor'), 1);
  assert.equal(ratingScore('4'), 4);
  assert.equal(ratingScore(''), null);
  assert.equal(ratingScore(null), null);
});

await check('improvement tags are split on commas', () => {
  assert.deepEqual(splitTags('Portion Size, Cleanliness, Waiting Time'), ['Portion Size', 'Cleanliness', 'Waiting Time']);
  assert.deepEqual(splitTags(''), []);
  assert.deepEqual(splitTags('Only One'), ['Only One']);
});

// ---------------------------------------------------------------------------
// The small helpers.
// ---------------------------------------------------------------------------

await check('a date is read in each of the shapes Petpooja and the sheet use', () => {
  assert.equal(parseDate('19 Nov 2026 22:39:02'), '2026-11-19');
  assert.equal(parseDate('September 29, 2026'), '2026-09-29');
  assert.equal(parseDate('2026-11-19'), '2026-11-19');
  assert.equal(parseDate('19/11/2026'), '2026-11-19');
  assert.equal(parseDate(''), null);
});

await check('a number is read out of a cell that carries rupees and commas', () => {
  assert.equal(toNumber('₹1,23,456.78'), 123456.78);
  assert.equal(toNumber('500.00'), 500);
  assert.equal(toNumber(''), null);
});

// ---------------------------------------------------------------------------
// The windows the orders are pulled in.
// ---------------------------------------------------------------------------

await check('a window is taken a calendar month at a time', () => {
  const chunks = monthChunks('2026-08-22', '2026-11-20');
  assert.equal(chunks.length, 4);
  assert.deepEqual(chunks[0], { from: '2026-08-22', to: '2026-08-31' });
  assert.deepEqual(chunks[1], { from: '2026-09-01', to: '2026-09-30' });
  assert.deepEqual(chunks[2], { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(chunks[3], { from: '2026-11-01', to: '2026-11-20' });
});

await check('a window is split in two when it is too big for one export', () => {
  const halves = splitRange('2026-09-01', '2026-09-30');
  assert.equal(halves.length, 2);
  assert.equal(halves[0].from, '2026-09-01');
  assert.equal(halves[0].to, '2026-09-15');
  assert.equal(halves[1].from, '2026-09-16');
  assert.equal(halves[1].to, '2026-09-30');
  // A single day is the smallest piece there is.
  assert.equal(splitRange('2026-09-01', '2026-09-01'), null);
});

await check('the reviews are pulled a day at a time', () => {
  // The reviews endpoint hands its rows out in an order that shifts between
  // calls, so a long walk repeats some reviews and misses others. Measured:
  // two identical walks over the same 90 days gave 175 and 212 distinct
  // reviews, and the sets differed. A day holds a handful of reviews, so the
  // order cannot bite.
  const days = dayChunks('2026-08-22', '2026-08-25');
  assert.equal(days.length, 4);
  assert.equal(days[0], '2026-08-22');
  assert.equal(days[3], '2026-08-25');
  // One day is one day.
  assert.deepEqual(dayChunks('2026-08-22', '2026-08-22'), ['2026-08-22']);
  // The days are consecutive, with no day missing between them.
  assert.equal(dayChunks('2026-08-30', '2026-09-02').join(','), '2026-08-30,2026-08-31,2026-09-01,2026-09-02');
});

await check('the two order reports cover the year between them', () => {
  const recent = customerWindowFor('customer_orders', '2026-11-20');
  assert.equal(recent.to, '2026-11-20');
  assert.equal(recent.from, '2026-08-22');
  const history = customerWindowFor('customer_orders_history', '2026-11-20');
  assert.equal(history.to, '2026-08-21');
  assert.equal(history.from, '2025-11-09');
  // The older window ends the day before the newer one begins, so no order
  // is pulled twice and none is missed between them.
  assert.equal(history.to < recent.from, true);
  assert.equal(history.to !== recent.from, true);
});

await check('the older reviews reach back to the first day Petpooja holds one', () => {
  const recent = customerWindowFor('customer_orders', '2026-11-20');
  const history = ratingsHistoryWindow('2026-11-20');
  // March 2026 is where the reviews start: the count endpoint answers zero
  // for every day before it.
  assert.equal(history.from, '2026-03-01');
  // It ends the day before the recent window begins, so no review is pulled
  // twice and none is missed between the two.
  assert.equal(history.to, '2026-08-21');
  assert.equal(history.to < recent.from, true);
  assert.equal(history.to !== recent.from, true);
});

await check('a review walk never crosses a calendar month', () => {
  // The endpoint's page order shifts between calls, so a window that crosses
  // a month boundary comes back short — and it comes back short silently.
  // Measured: a window counting 61 reviews returned 50, 41 and 51 of them.
  const chunks = ratingChunks('2026-08-23', '2026-11-21', '2026-11-21');
  assert.equal(chunks.length, 4);
  for (const chunk of chunks) {
    const from = chunk.from.slice(0, 7);
    const to = chunk.to.slice(0, 7);
    assert.equal(from, to);
  }
});

await check('a whole month that is over is walked in one go', () => {
  const chunks = ratingChunks('2026-03-01', '2026-11-21', '2026-11-21');
  // March to October are whole months that are over.
  const whole = chunks.filter((chunk) => chunk.mode === 'month');
  assert.equal(whole.length, 8);
  assert.deepEqual(whole[0], { from: '2026-03-01', to: '2026-03-31', mode: 'month' });
  assert.deepEqual(whole[7], { from: '2026-10-01', to: '2026-10-31', mode: 'month' });
  // November is the month being written now, so it is walked a day at a time.
  assert.deepEqual(chunks[8], { from: '2026-11-01', to: '2026-11-21', mode: 'days' });
});

await check('a part of a month is walked a day at a time', () => {
  // The first and the last month of a window are cut short, and a cut-short
  // month is not walked in one go — the day-at-a-time walk is the one
  // measured complete everywhere.
  const chunks = ratingChunks('2026-08-23', '2026-11-21', '2026-11-21');
  assert.deepEqual(chunks[0], { from: '2026-08-23', to: '2026-08-31', mode: 'days' });
  assert.deepEqual(chunks[3], { from: '2026-11-01', to: '2026-11-21', mode: 'days' });
});

await check('a month is only whole when it runs from its first day to its last', () => {
  assert.equal(isWholeCalendarMonth('2026-03-01', '2026-03-31'), true);
  assert.equal(isWholeCalendarMonth('2026-03-01', '2026-03-30'), false);
  assert.equal(isWholeCalendarMonth('2026-03-02', '2026-03-31'), false);
  // February in a leap year, and in a common one.
  assert.equal(isWholeCalendarMonth('2028-02-01', '2028-02-29'), true);
  assert.equal(isWholeCalendarMonth('2026-02-01', '2026-02-28'), true);
});

await check('the link is written as a list of tuples', () => {
  // A row of a `values` list is a tuple — it needs its brackets. Without
  // them the parser stops at the first number and says "syntax error at or
  // near 774", which names nothing useful.
  const sql = reviewLinkStatement([
    { id: 774, order_no: '659', order_date: '2026-03-12', phone: '', is_linked: true, listing: 'zomato_atelier' },
  ]);
  assert.equal(sql.includes("(774,'659','2026-03-12'::date,'',true,'zomato_atelier')"), true);
  assert.equal(sql.includes('values (774'), true);
});

await check('a quote in a value cannot break the statement', () => {
  const sql = reviewLinkStatement([
    { id: 1, order_no: "66'5", order_date: null, phone: '', is_linked: false, listing: '' },
  ]);
  // The quote is doubled, so the value stays inside its own quotes.
  assert.equal(sql.includes("'66''5'"), true);
});

await check('each of our three pages is counted on its own', () => {
  assert.equal(listingBucket('zomato_atelier'), 'zomato_atelier');
  assert.equal(listingBucket('swiggy_atelier'), 'swiggy_atelier');
  assert.equal(listingBucket('swiggy_ambrosia'), 'swiggy_ambrosia');
});

await check('a review that is not on a page of ours shares one bucket', () => {
  // A review with no order names no page, and a Swiggy order with no brand
  // names only the marketplace. Both go into the same bucket — one bucket,
  // not one per reason.
  assert.equal(listingBucket(''), UNLISTED_KEY);
  assert.equal(listingBucket('swiggy'), UNLISTED_KEY);
  assert.equal(listingBucket(null), UNLISTED_KEY);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error('Some checks failed.');