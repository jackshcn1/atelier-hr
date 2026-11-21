# Customer Section — Specification

**Branch:** `feat/customer-section`
**Date:** 2026-11-20
**Status:** Approved by the owner (three scope decisions answered on 2026-11-20)

---

## 1. What this is

A **Customer section** — one place that answers, about a person who has paid
money to the restaurant:

- how much they have spent,
- what they have said about us (Google, Swiggy, Zomato),
- what they told the floor in the feedback form.

It is a **read-only** section. Nothing about a customer is entered here. The
data comes from three places that already exist.

---

## 2. The three data sources (all verified against the live Petpooja account)

| Source | Where | What it gives | How it is pulled |
|---|---|---|---|
| **Orders** | Petpooja → All Orders | One row per order: Order No., **Client OrderID**, Order Type, **Customer Name**, **Customer Phone**, GSTIN, Customer Address, Items, Grand Total, Payment Type, Status, Created | `POST /orders/report_export_csv/all` with the page's own `order_search` form, after setting the date range |
| **Ratings & Reviews** | Petpooja → Feedback → Ratings & Reviews (Zomato / Swiggy tabs) | Provider, **Client Order Id**, Rating, Created Date, Feedback | The page's Export button (Excel) on `/feedbacks/onlineorderrating/` |
| **Feedback form** | Google Sheet "Customer Feedback Form" (id `1M0jVGEh1aekFYnMtVkHSA4oobZq5Pg1i3-D6TenF9kU`) | Date, Feedback Sl No., **Bill Number**, Waiter, Overall Experience, Food Quality, Taste of the food, Service, Staff Hospitality, Waiting Time, Would you visit Atelier again?, What can we improve, Comment | The existing service-account Sheets pull (`lib/googleSheetsService.js`) |

**The join key is the Client OrderID.** Petpooja's own orders export carries the
*platform* order number (the Zomato/Swiggy order id) in `Client OrderID`, and
the Ratings & Reviews export carries the same number in `Client Order Id`.
Verified: the one Zomato review on record is `8866657208`, and `8866657208`
is a `Client OrderID` in the orders export. This is what lets a review be
attached to the order — and through the order, to the customer.

**Google reviews are not in Petpooja.** Petpooja's Ratings & Reviews screen
carries Zomato and Swiggy only. Google needs the Business Profile API — see
§6.

---

## 3. The rule that decides who is a customer

> **A customer is a person whose order recorded a real contact number.**

Measured on 5,395 orders (1 Oct – 20 Nov 2026): **1,556 orders (28.8%)** carry a
phone, and 3,839 carry none. Of the 1,556, a large share are staff test
numbers (`1234567890`, `9999999999`, `1111111111`, and near-misses of those).

**A phone counts as real** when, after stripping non-digits, its last ten
digits:

1. start with **6, 7, 8 or 9** (the first digit of every real Indian mobile), and
2. are **not all the same digit** (`1111111111`, `9999999999`), and
3. are not a **near-miss of a run** — `1234567890`, `1234567891`, `1234657890`,
   `1234576890`, `1236547890` and their neighbours are all keypad sequences
   typed to save time, not phone numbers.

**The owner's decision (2026-11-20):** the customer list holds only the
customers with a real phone, and the page **also shows how much order value
has no phone attached** — so the gap is visible and worth closing at the
counter. Delivery orders (Zomato/Swiggy — 44% of orders) carry a name and
address but no phone, so their spend shows in the gap, not in a customer row.

**No name-based customers.** One person must not be counted twice.

---

## 4. The tables

All four are read by a server route with the service role, so they are
service-role only: RLS on, no client policies, exactly like
`finance_receivables`.

### `customers` — one row per real contact number

| Column | Meaning |
|---|---|
| `phone` | The contact number, digits only, last 10. **The unique code.** |
| `name` | The best name seen for this number |
| `email`, `address` | Seen on the order, when given |
| `first_order_at`, `last_order_at` | The span of their visits |
| `order_count` | How many orders they made |
| `total_spend` | What they have spent in the window |
| `avg_order_value` | Their average basket |
| `channel_mix` | JSON: `{ dine_in, pick_up, delivery }` counts |
| `platform` | `zomato`, `swiggy`, or empty for a POS order |
| `client_order_ids` | JSON array of the platform order ids, so a review can be matched |
| `review_count`, `avg_rating` | From the platforms |
| `feedback_count` | From the feedback form |
| `source` | `petpooja:orders` |

### `customer_orders` — one row per order

| Column | Meaning |
|---|---|
| `order_no` | Petpooja's order number (unique) |
| `client_order_id` | The platform order id (Zomato/Swiggy) |
| `phone` | The customer it belongs to, or empty |
| `is_linked` | Whether a real phone was recorded |
| `order_type`, `channel` | `Dine In`, `Pick Up`, `Delivery` |
| `amount`, `payment_type`, `status` | From the order |
| `customer_name`, `customer_address` | As recorded |
| `order_date` | The date of the order |
| `source` | `petpooja:all_orders` |

### `customer_reviews` — one row per review

| Column | Meaning |
|---|---|
| `platform` | `zomato` / `swiggy` / `google` |
| `client_order_id` | The platform order id — the join key to the order |
| `rating` | 1–5 |
| `comment` | What the customer wrote (may be empty) |
| `review_date` | When they left it |
| `order_no` | The Petpooja order it belongs to, when it can be matched |
| `phone` | The customer, when the order carries one |
| `source` | `petpooja:ratings_and_reviews` |

### `customer_feedback` — one row per feedback-form response

| Column | Meaning |
|---|---|
| `bill_number` | The number the guest wrote on the form |
| `response_date` | The date of the response |
| `waiter` | Who served them |
| `overall`, `food_quality`, `taste`, `service`, `hospitality`, `waiting_time` | 1–5 scores |
| `would_visit_again` | Their answer |
| `improvement_tags` | JSON array of what they said to improve |
| `comment` | Their own words |
| `order_no`, `phone` | Filled **only** when the bill number matches an order |

---

## 5. The owner's second decision — feedback linking

> **Match on Bill Number only, and leave responses that do not match unlinked.**

The form has no phone column. A response is joined to an order **only** when its
`Bill Number` equals an order's `Order No.`. A response that does not match is
still kept and still counts in the ratings dashboard — it is simply shown as
*unlinked*. The dashboard reports how many responses were linked, so the number
is never hidden.

*(Note: the form's one existing response says Bill Number `112233`, which
matches no order. Unlinked responses are therefore expected until the floor
starts writing real bill numbers.)*

---

## 6. Google reviews — the answer to the owner's question

**Yes — manager access is enough** to read and reply to reviews through the
Business Profile API. Google's own guide says managers "have mostly the same
access to the profile as owners", and *respond to reviews* is on the manager
list. ([Manage owners & managers](https://support.google.com/business/answer/3403100))

But three things are **also** required, and they are the real work:

1. **The API must be granted to the project.** The Business Profile APIs are
   not open — you fill in a form and Google reviews it, which takes **7–14
   business days**. Until then the project shows 0 QPM quota.
   ([Prerequisites](https://developers.google.com/my-business/content/prereqs))
2. **Seven APIs must be enabled** on the Cloud project, and the project needs a
   **business website URL** and a GBP verified and active for **60+ days**.
3. **An Organization account** must exist for the Cloud project.

**How this fits the project's rules:** the credentials live in the existing
dedicated project `atelier-hr-drive` (never the sensitive company project), and
the account that connects is the restaurant's own — the same pattern as the
Drive connection that already works (`lib/googleUserDrive.js`). The sign-in
account must be listed as an owner/manager on Atelier's Google listing.

**What is built now:** the `customer_reviews` table already carries a
`platform` column with `google` in its vocabulary, and the reader accepts
`google` rows. **What is not built now:** the Google connector itself, because
it cannot work until the access is granted. The Google half is therefore a
**known, documented gap**, not a broken feature.

---

## 7. The section itself

One navigation entry: **Customers**, with three pages.

### `/customers` — the overview

- **Headline:** how many customers, how much they have spent in total, their
  average order value, how many came back more than once.
- **The gap, made visible:** the share of order value that has no phone
  attached, and the share of orders that have none. This is the number the
  owner can move by asking for a phone number at the counter.
- **Channel split** of the tracked customers' spend: dine-in, pick-up, delivery.
- **Reviews:** rating average per platform, with the count behind each, and the
  most recent reviews with what they said.
- **Feedback:** the rating averages per question, the most common "what we
  should improve" tags, and the captain breakdown — the same people the
  variable-pay engine already scores.

### `/customers/list` — the customers

A searchable table: phone (the code), name, orders, total spend, average
basket, first and last visit, channel mix, reviews, feedback. Sorted by spend
by default. A row opens the customer's own detail.

### `/customers/[phone]` — one customer

Their orders (date, type, items, amount, payment), their reviews across
platforms, their feedback-form responses, and their summary line — order count,
total spend, average basket, days since last visit.

---

## 8. How the data gets in

A **new report group** on the existing hosted sync, so the data arrives on its
own schedule without touching payroll:

| Group | Report | Writes |
|---|---|---|
| 11 | `customer_orders` — the All Orders export | `customers`, `customer_orders` |
| 12 | `customer_ratings` — the Ratings & Reviews export | `customer_reviews` |

The **feedback form** is a Google Sheet, so it needs no browser and no login —
it is pulled by the same kind of one-call step the accountant's sheet already
uses (`POST /api/sync?sheet=1`), as its own step: `POST /api/sync?sheet=feedback`.

Both new groups are **finance-only in effect**: they write to customer tables
only, and never to `variable_metric_inputs` or `variable_pay_periods`. The
variable-pay pause stays intact.

---

## 9. Rules that must not break

1. **A phone is the only key.** No name-based customer, no address-based
   customer. One person, one row.
2. **Test numbers are not customers.** `1234567890` and friends are excluded,
   and the value they carry is counted in the gap, not as a customer.
3. **The payroll is untouched.** No new group writes `variable_metric_inputs`
   or opens a pay period.
4. **The sync stays inside 300 s.** Each new report is its own group, called
   after the finance groups, never in parallel.
5. **A read that means "every row" pages.** `readAllRows()` in
   `lib/supabaseServer.js` is used wherever the customer list is read whole.
6. **Service-role only.** The four tables have RLS on and no client policies.
7. **The service-role key never leaves the environment.**

---

## 10. What "done" means

- [ ] `node tests/customer-parsers-verify.mjs` passes — the phone rule, the
      order roll-up, the review join and the feedback join are each pinned by
      a test.
- [ ] `npm run build` succeeds.
- [ ] The four tables exist on the live database with RLS on and no policies.
- [ ] A live pull fills `customer_orders` and `customers` with real rows, and
      the numbers on the page match the pull.
- [ ] The page is checked in a browser at
      `https://atelier-hr-inky.vercel.app` — not just that the build passed.
- [ ] `memory/customer-section.md` records the design and the Google gap.
