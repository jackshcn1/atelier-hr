---
name: customer-section
description: "The Customer section — who a customer is (a real contact number), where the order value, reviews and feedback come from, and the two Petpooja export traps that break it."
metadata:
  node_type: memory
  type: project
  modified: 2026-11-20T14:20:00.000Z
---

# The Customer section

**A customer is a person whose order recorded a real contact number. The
phone is the unique code** — there are no name-based customers and no
address-based ones, so one person is never counted twice.

That one rule decides every number on the page.

## The rule, and why it is a rule

Measured on Petpooja's orders for 22 Aug – 20 Nov 2026: **9,267 orders worth
₹56,67,035**, of which **218 orders worth ₹3,52,537 (6.2%)** carried a real
contact number, from **145 distinct people**. The other 9,049 orders — 93.8%
of the value — carried no usable number.

A number is real when, after the non-digits are stripped, its **last ten
digits**:

1. start with 6, 7, 8 or 9 — the first digit of every Indian mobile;
2. are not all one digit — `1111111111` and `9999999999` are not numbers;
3. are not a keypad run — seven or more steps of +1 or −1 is someone counting.

The staff test numbers the floor types to save time (`1234567890`,
`9999999999`, `1111111111` and their near-misses) all fail this test.

**A number that fails is not thrown away.** The order is kept and its value is
counted in *the gap* — the panel that shows how much of the business is not
yet attributable to a person. That gap is the number worth closing at the
counter, and it is the point of the whole page.

## The Petpooja traps

### 1. The export is capped at 10,000 rows, silently

A window of 365 days holds **27,684** orders. The export that comes back
holds **10,393 rows** — the title rows, the heading, and exactly 10,000
orders. The rest are dropped without a word, and the file looks complete.

So the pull is **a calendar month at a time** (`monthChunks`), and a month
that somehow exceeds the cap is split in half and taken again
(`splitRange`). A chunk is only trusted when Petpooja's own record count
(`#total_records`) is at or under the cap.

A month is comfortably under it: the busiest month on record is 3,343
orders (July 2026).

### 2. The export is not one row per order

It is **one row per order ITEM**, and an order paid in more than one way — or
left partly unpaid — has **one row per PAYMENT** as well. 9,639 export rows
hold 9,267 orders.

The customer, the type and the date are on the item row. **The money is not
always there:**

- an order paid in one go has its total in `Grand Total` on the item row;
- an order that was split has **zero** in `Grand Total` on the item row, the
  total in `Payment Description` ("Total : 850.00"), and one row per payment
  with that method's share.

Reading the item row's `Grand Total` alone values every split order at
nothing — and the split orders are the counter orders, **the ones that carry
a contact number**. Before this was fixed the page showed 3.5% of value
attributable; the true figure is **6.2%**.

The order's total is therefore: the payment rows' total if there are payment
rows, otherwise the item row's `Grand Total`, otherwise the `Payment
Description`.

### 5. The order number is NOT an identity — Petpooja restarts its numbering

This is the trap that cost a whole month of orders.

Two consecutive months were pulled from Petpooja and compared:

| Month | Orders | Order numbers |
|---|---|---|
| March 2026 | 2,688 | **4 … 2,691** |
| April 2026 | 3,169 | **1 … 3,169** |

**Every one of March's order numbers also exists in April.** The two months
overlap completely, and each month starts its numbering again near 1. The
numbering is not a running counter across time.

So an order's identity is the **pair** (order number, day):

- the database's unique constraint is `UNIQUE (order_no, order_date)`;
- the sync's de-duplication map and its upsert both key on that pair
  (`orderKey()` in `lib/customerSync.js`).

Keyed on the number alone, this is what happened: April overwrote March row for
row, and the whole of March's 2,688 orders — worth a month of trade — was
**absent from the books** while looking perfectly healthy. The count was right
for the rows that survived, and nothing said a month was missing. The same
happened a second time inside one run: the de-duplication map was keyed on the
number alone, so March's orders were dropped before they ever reached the
database.

**The same shape holds for the other two tables** — a review is unique on
(platform, client order id, review date) and a feedback response on (bill
number, response date). A number on its own is never an identity, because a
counter that restarts will hand the same number out twice.

Because a bill number or an order number can now name more than one order, the
joins pick **the candidate nearest in date** (`nearestByDate()`): a bill is
written on the day of the meal it is for.

### 6. The end of the window must be the END of the day

Petpooja's date filter is a real timestamp comparison, so a window that ends
at `01:00:00` on its last day throws away everything from one in the morning
onwards. Measured on September 2026:

| The window ends at | Orders |
|---|---|
| 30 Sep 01:00:00 | 2,884 |
| 30 Sep 23:59:59 | **2,993** |

109 orders a month, about **1,300 a year** — 4% of the year's orders, gone
without a word. So the **start** of a window is the first moment of its first
day and the **end** is the last moment of its last day, which also leaves one
window's end touching the next one's start with no gap between them.

### 3. The export asks before it exports

Petpooja shows a `confirm()` dialog — *"You can't export records more than
10000"* — and Playwright **dismisses** a dialog nobody handles, so the export
never starts and the download never arrives. That is why the first attempt at
this timed out after four minutes. The dialog is answered with yes for the
duration of the click (`lib/customerSync.js`, `fetchOrdersExport`).

### 4. The count has to be checked

The number of orders parsed out of the file must equal the number of records
Petpooja said its search found (`#total_records`). That is the only thing
that says whether a pull was complete, and a pull that is quietly a hundred
orders short looks exactly like a window with fewer orders in it. A chunk
that does not match is **failed**, not written.

## The reviews endpoint has no stable order

The Ratings & Reviews endpoint (`online_review_data/428501`) answers **ten rows
at a time**, and its **page order shifts between calls**. Two identical walks
over the same 90 days returned **207 and 195 distinct reviews** — and the two
sets were not the same set. The sort parameters the endpoint takes
(`sort_by`, `sort_order`) are **ignored**: an ascending walk is not in date
order.

So a long walk **repeats some reviews and misses others**, and nothing in the
answer says so. A pull of 420 rows produced only 311 distinct reviews.

**The window has to be small, and the pull has to be checked.** The page's own
count endpoint — `online_review_rating_count/428501` — says how many reviews a
window holds (`total_reviews`, plus a breakdown of one to five stars). That is
the only thing that says whether a pull was complete, exactly as
`#total_records` is for the orders.

Reviews are therefore pulled **a day at a time**, and the day's rows are
checked against the count endpoint before they are written. A day holds a
handful of reviews — one page — so the shifting page order cannot bite.

**What this bought:** the 90-day window holds **420 reviews** — 280 Zomato and
140 Swiggy — and all 420 are now on the books. Before, the same window
produced 301.

### Most reviews cannot be attached to a customer — and that is the data

A review is joined to its order through the **platform order id**, and every
one of the 420 finds its order. But a **platform order usually carries no
contact number**: of the 11,877 Zomato and Swiggy orders on record, only **330
have a real phone number** — the platform holds the customer's number, not
Petpooja. So only **4 of the 420 reviews** reach a customer.

The reviews are still worth having: the **platform dashboard** counts them,
averages them, trends them month by month and shows what people wrote. That is
the "reviews tracking" the section is for. What a review *cannot* do is attach
to a person, and the page says so rather than pretending.

**The row's `cus_name` is empty on every one of the 420** — the endpoint does
not name the customer either.

## Where each piece of data comes from

| What | From | Joined by |
|---|---|---|
| Order value | Petpooja's **All Orders export**, a month at a time | — |
| Reviews | The **Ratings & Reviews** endpoint (`online_review_data/428501`), 5409 = Zomato, 6736 = Swiggy | the **platform order id** (`Client OrderID`) |
| Feedback | The **Customer Feedback Form** sheet, read through the service account | the **bill number** only — the form has no phone column |
| Google reviews | **Not in Petpooja.** They need the Google Business Profile API | — |

### The platform is read, never guessed

Petpooja's **Sub Order Type** says where the order came from: `Dine In`,
`Pick Up`, `Delivery`, `Zomato`, `Atelier - Swiggy`, `Ambrosia - Swiggy`,
`IGST Area`. The platform comes from that — never from the length of the
platform order id.

### Reviews and feedback are joined on different keys

A review finds its order through the **platform order id** — the orders
export carries it in `Client OrderID` and the ratings export carries the same
number in `Client Order Id`. Verified: the Zomato review `8866657208` is a
`Client OrderID` in the orders export.

A feedback response finds its order through the **bill number only** — the
owner's decision on 20 Nov 2026, because the form has no phone column. A
response that does not match is **kept**, still counts in the ratings, and is
reported as unlinked.

## The Google gap

Google reviews are not in Petpooja — Petpooja's "Google Business" is only a
marketing channel tile. They come from the **Google Business Profile API**,
which needs access granted by Google after an application at
<https://support.google.com/business/contact/api_default> (**7–14 working
days**; the project shows 0 QPM until it is approved). A **manager** of the
listing can read and reply to reviews — the only thing missing is Google's
approval for this app.

`customer_reviews.platform` already accepts `google`, so the connector slots
in when the access arrives. The page shows the gap as a gap, rather than
hiding it.

## The sync groups

| Group | What | Window |
|---|---|---|
| 11 `customer_orders` | the orders | the last **90 days**, a month at a time |
| 12 `customer_ratings` | the platform reviews | the last 90 days |
| 13 `customer_orders_history` | the orders | the **285 days before** that |

11 and 12 run every night; 13 runs once a week, because the older history
does not change with the day. Together they cover about a year.

**The writes are upserts**, never replacements: an order keeps its order
number, a review keeps its platform + order id + date, a feedback response
keeps its bill number + date. So the history only ever has to be pulled
once, and a re-pull updates the same rows.

**The roll-up is worked out from the whole orders table**, not from the
window that was just pulled — so a customer's total spend is their spend over
all the time the books cover.

## The tables

`customers`, `customer_orders`, `customer_reviews`, `customer_feedback` —
**service-role only**: RLS on, no client policies, exactly like
`finance_receivables`. A customer's total spend is a roll-up of the order
rows, and the order rows are the evidence behind it.

## Where the numbers are worked out

The database **refuses to aggregate through the normal API** — `sum()` comes
back "Use of aggregate functions is not allowed". So the order-level totals
are worked out by Postgres itself through the `exec_sql_select` RPC
(`lib/supabaseServer.js`, `selectRows`), and the small tables — customers,
reviews, feedback — are read whole and worked out in JavaScript.

Every query is a constant string. Nothing a visitor sends is ever put into
SQL text.
