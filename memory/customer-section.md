---
name: customer-section
description: "The Customer section — who a customer is (a real contact number), the pages the module is made of, where the order value, reviews and feedback come from, and the two Petpooja export traps that break it."
metadata:
  node_type: memory
  type: project
  modified: 2026-11-25T09:40:00.000Z
---

# The Customer section

**A customer is a person whose order recorded a real contact number. The
phone is the unique code** — there are no name-based customers and no
address-based ones, so one person is never counted twice.

That one rule decides every number on the page.

## The module and its pages

The Customer section is a **module like Finance and Operations**, so it opens
the way they do: a landing page of cards, each one a job.

| Page | What it is |
|---|---|
| `/customers` | the **landing page** — four cards, like `/finance` and `/operations` |
| `/customers/overview` | the dashboard — value, the gap, month by month, top and at-risk customers |
| `/customers/list` | every customer, searchable and sortable (numbers shown masked) |
| `/customers/[phone]` | one customer: their orders, their reviews, their feedback |
| `/customers/reviews` | every review, by platform, with the rating month by month |
| `/customers/feedback` | every feedback form response, question by question |
| `/customers/feedback/new` | **the form itself** — filled in on the floor |

**The landing page holds no data of its own** — it is four links. Everything
is read through `/api/customers`, which dispatches on `view`: `overview`,
`list`, `detail`, `reviews`, `feedback`.

The reviews and the feedback are worked out once, in `buildReviewPicture()` and
`buildFeedbackPicture()`, and used by both the overview and their own pages —
so the two can never disagree with each other.

**The nav has five entries**, and `isLinkActive()` needs three special cases:
`/customers` lights only on the landing page (it is a module landing, not an
overview), `/customers/list` also lights on a customer's own page
(`/customers/7034308981`), and `/customers/feedback` lights **only** on itself
— "Feedback" is the answers and "Record Feedback" is the form, and the two are
never lit at the same time.

**The card grid adapts to the number of cards**, as the house already does —
Sales uses two columns for its two modules, Finance three for its six. Four
Customers modules use `md:grid-cols-2`: four across was tried and the card
subtitles wrapped at a 1280px viewport.

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

### How big a window can one walk be? Measured, 21 Nov 2026

Each window was walked **three times** and compared with the count endpoint.

**The rule is not "a month". The rule is: never cross a calendar month, and never reach today.**

| Window | Zomato count | Walks | Verdict |
|---|---|---|---|
| 1 day | 6 | 6/6/6 | complete |
| 1 week | 0 | 0/0/0 | complete |
| 1 month (March) | 46 | 46/46/46 | complete |
| 1 month (April) | 117 | 117/117/117 | complete |
| 1 month (May) | 131 | 131/131/131 | complete |
| 1 month (August) | 157 | 157/157/157 | complete |
| 1–20 November | 57 | **57 rows, 57 distinct** | complete |
| 1–21 November (today) | 58 | **58 rows, 45 distinct** | **short** — thirteen rows are the same review twice |
| 22 Aug → 4 Sep | 61 | 50/41/51 | **short** — crosses a month |
| 25 Sep → 4 Oct | 34 | 34/20/24 | **short** — crosses a month |
| 20 Oct → 2 Nov | 38 | 20/38/36 | **short** — crosses a month |
| 90 days | 281 | 203/210/189 | **short** |
| 3 months | 366 | 252/258/238 | **short** |
| 6 months | 690 | 468/529/498 | **short** |

**Crossing a month boundary is short even at 34 rows.** A window inside one
month of the same size is complete (1–14 Sep = 36/36/36, 1–21 Oct = 66/66/66).
And splitting a boundary-crossing span into two inside-month halves recovers
it **exactly**: 22 Aug → 4 Sep is 61, and 22–31 Aug (45) + 1–4 Sep (16) is 61.

**A window that reaches today is short.** 1–21 November returns 58 rows but
only 45 distinct reviews — the same review served on two pages, because the
set under the endpoint is still moving while it is being paged. 1–20 November
returns 57 rows and 57 distinct reviews. So **the pull ends yesterday**, and a
day's reviews land the next morning.

**A closed month is walked in one go.** Every month from March 2026 was walked
three times and came back complete and identical, both platforms — and the
set of rows is the same set a day-at-a-time walk returns.

So `ratingChunks()` cuts a window into calendar months and each month is
walked in one go. If a month comes up short, it is walked **a day at a time**
instead — a day is one page, so the shifting order cannot bite — and only if
that is short too is the pull failed. Every walk's rows are counted and
compared against the count endpoint before they are written.

**What this bought:** the history pull went from **nine minutes** (day at a
time, every day of every month) to **two minutes twenty** (a month at a time),
with every month's number equal to Petpooja's own count. The nightly pull is
two minutes. Both fit inside the 300 seconds a serverless function is given —
the day-at-a-time version did not.

### The reviews only go back to March 2026 — but Petpooja says so

Every month before March 2026 answers **0** on the count endpoint: February
2026, January 2026, all of 2025, all of 2024, all of 2023. Petpooja's review
history starts at **2026-03-01**.

**What this bought:** the 90-day window holds **420 reviews** — 280 Zomato and
140 Swiggy — and all 420 are now on the books. Before, the same window
produced 301.

But Petpooja holds far more than the books did: measured on the count
endpoint, **2026-03-01 → 2026-11-20 holds 926 Zomato and 422 Swiggy — 1,348
reviews**. The books held 420, because the sync only ever pulled the 90-day
window. So the pull was widened to the whole history Petpooja holds, as
**group 14** (`customer_ratings_history`).

### Most reviews cannot be attached to a customer — and that is the data

A review is joined to its order through the **platform order id**, and **1,337
of the 1,349** find their order. (The 12 that do not are orders Petpooja does
not hold at all — no order carries their platform id, its order number or even
its first digits. They are kept, and reported.)

But a **platform order usually carries no contact number**: of the 11,877 Zomato
and Swiggy orders on record, only **330 have a real phone number** — the
platform holds the customer's number, not Petpooja. So only **29 of the 1,349
reviews** reach a customer.

The reviews are still worth having: the **platform dashboard** counts them,
averages them, trends them month by month and shows what people wrote. That is
the "reviews tracking" the section is for. What a review *cannot* do is attach
to a person, and the page says so rather than pretending.

**The row's `cus_name` is empty on every one of them** — the endpoint does
not name the customer either.

## Where each piece of data comes from

| What | From | Joined by |
|---|---|---|
| Order value | Petpooja's **All Orders export**, a month at a time | — |
| Reviews | The **Ratings & Reviews** endpoint (`online_review_data/428501`), 5409 = Zomato, 6736 = Swiggy | the **platform order id** (`Client OrderID`) |
| Feedback | **The app's own form**, on the floor — written into the **Customer Feedback Form sheet**, which is then pulled into the books | the **bill number** — the phone comes from the order it names |
| Google reviews | The **Google Business Profile API**, read as a manager of the listing | — (nobody orders on Google, so a Google review cannot be given to an order) |
| Google rating | **Places API** — an API key only, no approval | the Place ID |

### The platform is read, never guessed

Petpooja's **Sub Order Type** says where the order came from: `Dine In`,
`Pick Up`, `Delivery`, `Zomato`, `Atelier - Swiggy`, `Ambrosia - Swiggy`,
`IGST Area`. The platform comes from that — never from the length of the
platform order id.

## Four pages, four ratings

**A marketplace is not a listing.** Swiggy carries two of our restaurants, and
they are two different pages with two different ratings — so the books count
**four listings**, not two marketplaces and not one Google:

| Listing | Platform | Page |
|---|---|---|
| `zomato_atelier` | Zomato | `zomato.com/it/trivandrum/atelier-by-ambrosia-…/order` |
| `swiggy_atelier` | Swiggy | `swiggy.com/city/thiruvananthapuram/atelier-by-ambrosia-…-rest272534` |
| `swiggy_ambrosia` | Swiggy | `swiggy.com/city/thiruvananthapuram/ambrosia-…-rest78577` |
| `google_atelier` | Google | our Google Maps listing (Place ID `ChIJ2dZj-yO7BTsR3dRz2zTaMjg`) |

`platform` keeps its meaning (`zomato` / `swiggy`) and stays part of the
review's database key `(platform, client_order_id, review_date)`. The
**listing** is a separate column, so setting it never moves a row. It is
**read, never guessed**: an order's listing comes from its Sub Order Type, and
a review's listing comes from the order it was matched to — a review never
says which of the two Swiggy pages it was left on.

### Two ratings, each labelled

| Listing | The platform's own rating | The site's own average |
|---|---|---|
| Zomato | **4.3** from 4,404 ratings (delivery) | 4.08 ★ over 917 reviews |
| Swiggy — Atelier | **4.4** (2.6K+) | 4.17 ★ over 192 reviews |
| Swiggy — Ambrosia | **4.5** (10K+) | 4.16 ★ over 222 reviews |
| Google | **4.0** from 3,628 ratings | read from the Business Profile API — see below |

The two numbers answer different questions and are shown side by side. The
platform's rating is **lifetime** — every review the platform has, going back
years. The site's own average is over **the reviews Petpooja holds**, which
start at March 2026. They will never agree, and the page says so.

**Zomato's delivery rating is the one that counts** — the listing page also
carries a DINING rating (3.1 from 24) and a JSON-LD aggregate that is the
dining one. The scraper reads `rating_new` → `DELIVERY` → `"rating":"4.3"`
and `"reviewCount":"4,401"`.

**Swiggy refuses a plain fetch** (a bare HTTP GET answers 202 with an empty
body — an AWS WAF) and refuses headless Playwright (403). It answers a **real,
headed Chrome** launched with `--disable-blink-features=AutomationControlled`,
a persistent profile and `locale: en-IN`. The rating is read from the page
text: `4.4 (2.6K+ ratings)`. **Swiggy publishes no exact count**, so the
exact-count column stays empty and `2.6K+` / `10K+` are kept as the text
Swiggy writes. A platform that refuses is **kept at its last known value**,
and the page says when that number was last read.

The scraper runs **locally**, like the Petpooja sync — Swiggy's own page is
not reachable from the serverless host.

### Reviews and feedback are joined on different keys

A review finds its order through the **platform order id** — the orders
export carries it in `Client OrderID` and the ratings export carries the same
number in `Client Order Id`. Verified: the Zomato review `8866657208` is a
`Client OrderID` in the orders export.

A feedback response finds its order through the **bill number only** — the
owner's decision on 20 Nov 2026, because the form has no phone column. A
response that does not match is **kept**, still counts in the ratings, and is
reported as unlinked.

## The feedback form: the sheet is the record (23 Nov 2026)

The form is filled in **in the app**, on the floor — but the response is written
into the **Customer Feedback Form** sheet first, and the sheet is then pulled into
the books. That is **exactly the arrangement the accountant's expense entry form
uses**, and for the same reason: **one place a response is written down, and one
way into the books.**

```
the form  →  the Customer Feedback Form sheet  →  the books
```

The sheet (`1M0jVGEh1aekFYnMtVkHSA4oobZq5Pg1i3-D6TenF9kU`, tab `Sheet1`, range
`A:AZ`) is **not** a Google Form's response sheet — it is a plain spreadsheet
with a dropdown, created 28 Sep 2026, which held **one row**: a test row from
29 September. The floor had been writing the feedback on **paper**.

> **This was changed twice in one day, and the second time wins.**
> PR #103 moved the form into the app and wrote a response **straight into
> `customer_feedback`**. The owner then asked for the expense-form arrangement
> instead: *form → sheet → pull into the books*, and the old routine killed. So
> the sheet came back, and `source` went back to
> `google_sheet:customer_feedback_form`.

### What the form can do that the sheet never could

- **The bill number finds the order.** Type the number printed on the guest's
  bill and the order is looked up, so it is certain which meal is being
  talked about.
- **The waiter is picked, not spelled.** The name comes from the `employees`
  table, so "Chingkab" is always written the same way and a captain's
  ratings add up. `Chingkab Yaham` on the picker is the same person as the
  `Chingkab` on the old sheet's test row.
- **It is signed.** The sheet's **Recorded By** column (added 23 Nov 2026)
  records **who wrote it down** — the signed-in member of staff — and it travels
  into `customer_feedback.entered_by`. The waiter is who *served* the table;
  this is who held the pen. The sheet could not say that at all before.
- **The guest's phone comes from the order.** The form never asks for it.

The form's own words were **recovered from the sheet** rather than invented: the
scale (Excellent / Very Good / Good / Average / Poor) and the nine improvement
tags (Food, Service, Staff Hospitality, Waiting Time, Menu Variety, Portion
Size, Price, Cleanliness, Nothing - everything was Great) came from the sheet's
dropdown rules. A guest may also name something that is not on the list, and it
is kept as a tag of its own — so a new word does not need a code change to be
counted.

Only the **overall rating** and **"would you visit again"** are required. A
guest in a hurry is not made to answer six questions, and the page reports
how many were answered, so an average is never taken over more people than
there were.

### The columns, and why they are found by heading

The sheet's columns are found **by heading**, not by position, so a question can
be added to the sheet without the others shifting into the wrong column:

| Heading | What it holds |
|---|---|
| Date | the day the response was given — the sheet's own shape, `November 23, 2026` |
| Feedback Sl No. | the sheet's own serial number; the form continues it |
| Bill Number | the bill it is about — **how it finds its order** |
| Waiter | who served the table |
| Overall Experience | the rating |
| Food Quality … Waiting Time | the five detail ratings |
| Would you visit Atelier again? | answered on the same scale |
| What can we improve | the tags, separated by commas |
| Comment | what they said, in their own words |
| **Recorded By** | **who wrote it down** — added 23 Nov 2026 |

### The same bill cannot be entered twice

A response is identified by the **bill it is about and the day it was given** —
the same pair the books are keyed on, because a bill number on its own is not an
identity (Petpooja restarts its numbering).

The sheet is read **before** the row is written, and a response already there is
refused with a message that names it: *"This bill already has feedback recorded
for September 29, 2026 — entered by somebody."* Nothing is written when it is
refused.

### The link to the customer happens at night, not at the table

**The order behind a bill filled in today is not in the books yet.** The order
book only reaches the previous day — measured: on 23 Nov 2026 the newest
order was 22 Nov. Petpooja's orders are pulled once a night.

So a response is **written the moment it is given**, and the link to its
order is made by the night's run, once the order has arrived. A response
about a bill that is already in the books is attached at once. The form says
which happened, in plain words — and it says **three** things, not two:

- attached to the order, and the order carried a phone number → *"this guest is
  now a customer of ours"*
- attached to the order, but the order carried **no** number → *"that order has
  no phone number on it, so it is not counted as a customer of ours"* — a
  customer is a person whose order carried a real contact number, so an order
  without one does not make anybody a customer
- not attached yet → *"it will be attached to the order once tonight's orders
  are in"*

The nightly step is `?sheet=feedback` on the sync endpoint, asked for once
after the Petpooja groups so the orders are already in. It is the **same pull**
the form makes when it saves — one way into the books, not two.

### The old pull was the reason the nightly run went red

The sheet pull **failed on 22 and 23 Nov 2026** — a 120-second timeout, which
failed the whole nightly run. The cause was measured, not guessed:
`syncFeedback()` recomputed `feedback_count` for **every one of the 515
customers**, with **one UPDATE per customer, one after another**. Ten
updates took 2.5 seconds → 515 takes about **126 seconds**, over the limit.
On top of that it read all **28,008** orders to link one bill number.

The replacement is `linkFeedback()`, and it is the same shape the reviews
already use:

- only the responses that are **not attached yet** are looked at;
- the orders are read **once**, with an `in` list, not a query per response;
- the writes are **one statement** each — a `values` list of tuples, like
  `reviewLinkStatement()`;
- only the rows whose link **actually changed** are written;
- the customers' counts are one statement, and only where the count differs.

Measured: **1.1 seconds** for the whole thing, against 126 before. The whole
pull — read the sheet, write the rows, attach them — measures **1.3 seconds**.

### The counts are the sheet's; the answer about one response is that one's

The counts a pull returns are **the whole sheet's**. So they cannot answer a
question about **one** response: a sheet holding one linked and one unlinked
response would say "linked" about both.

So the row that a particular response wrote is **read back**, and the answer
comes from it — `feedbackOutcome()` in `lib/feedbackSheet.js`. This is the same
lesson as the cached-fetch rule: a number about the whole thing is not a number
about one of its parts.

### The sheet pull is not allowed to read a stale copy of the orders

The sync route reads the orders through the **server's own client**
(`getSupabase()`), which asks for `cache: 'no-store'` on every request. A bare
client would let Next.js cache the GETs on disk — and that cache survives a
restart and a deployment. A pull that read a stale copy of the orders would
attach a response to the wrong order, or to none.

### What was retired

The old **`?link=feedback`** routine is gone: its branch, its
`linkFeedbackResponses()` and the workflow step that asked for it. The nightly
run now asks for `?sheet=feedback`, which is the same pull the form makes.

**The one row the sheet had is kept**, with its own source
(`google_sheet:customer_feedback_form`). A row's history is not rewritten:
the source records where a thing really came from. `entered_by` is what tells
a response written through the app's form from one typed into the sheet by
hand — a hand-typed row has none.

The **variable-pay** feedback metrics (`kit_food_quality`, `hlp_quality`,
`cap_quality`) still read the same sheet, through `lib/feedbackParsers.js`.
That path is separate and is **dormant** — variable pay is paused, and a
finance-only run never pulls it. Moving it to the app would be a change to
variable pay, and that is the owner's decision.

## The Google reviews, read from Google's own API (25 Nov 2026)

Google reviews are not in Petpooja — Petpooja's "Google Business" is only a
marketing channel tile. They come from the **Google Business Profile API**,
which Google approved for this project on **25 Nov 2026** (case
`6-7727000042503`, quota 300 QPM). The approval was for **Basic API Access**:
read the listing, and reply to reviews.

> **The reply half is deliberately not built.** The owner's digital marketing
> team answers guests from Google's own My Business screen, and the site only
> **shows** what people wrote. So the permission is asked for because Google's
> API has no read-only form of it, and **not one write call is made from this
> code**.

### The API is split across three hosts

Google moved this API around, and the pieces are in different places. Measured
on 25 Nov 2026 by calling each host with the service account's token:

| What | Where | Answered |
|---|---|---|
| the accounts | `mybusinessaccountmanagement.googleapis.com/v1/accounts` | 403 `ACCESS_TOKEN_SCOPE_INSUFFICIENT` — enabled |
| the locations | `mybusinessbusinessinformation.googleapis.com/v1/{account}/locations` | 403 — enabled |
| **the reviews** | `mybusiness.googleapis.com/v4/{account}/{location}/reviews` | 403 — enabled |
| the v4 **accounts** | `mybusiness.googleapis.com/v4/accounts` | **404 — retired** |
| the v4 **locations** | `mybusiness.googleapis.com/v4/{account}/locations` | **404 — retired** |

So: accounts and locations from **v1**, reviews from **v4**, and only the
reviews survive in v4. The ids are the same ids in both — an account's name is
`accounts/{id}`, a location's is `locations/{id}`, and the v4 review path is
built from those two names.

**`SERVICE_DISABLED` vs `ACCESS_TOKEN_SCOPE_INSUFFICIENT` is how you check
whether an API is switched on** without the Service Usage API (which answers
*permission denied* for this project's service account — it is a "consumer
container"). A 403 about **scope** means the service is on; a 404 means the
method is gone.

### It has to be a person, not the service account

The service account **cannot** use this API at all — it answers
`ACCESS_TOKEN_SCOPE_INSUFFICIENT` however the token is made — because a
listing can only be read **as somebody who manages it**. So the token comes
from the site's own Google connection, and the account that signs in has to be
a manager of the listing.

**Two connections, apart from each other** (`lib/googleConnections.js`):

| Connection | Asks for | Row |
|---|---|---|
| `google` | `…/auth/drive` | `google_drive_tokens`, `provider='google'` |
| `google_business` | `…/auth/business.manage`, `…/auth/userinfo.email` | the same table, `provider='google_business'` |

They are apart on purpose: the Business Profile permission is sensitive and a
person can agree to the sign-in and leave it unticked, and that must never
take the invoice uploads with it. The **same redirect URI** serves both
(`/api/google-drive/callback`) — which connection a sign-in belongs to is
read from the **state cookie**, not from the address.

**The scope the API's own reference pages list is `business.manage`**, and the
scope Google's own Business Profile setup guide names is the same one. The
`businessprofile` scope is the newer one for the v1 APIs; `business.manage`
covers all of them and is what this site asks for.

### How a Google review is identified — the one real trap

A Google review has **no order id** — nobody orders on Google — so the
marketplace's key, `(platform, platform order id, day)`, has nothing to put in
the middle. **Google's own review id goes there instead**:

| Column | For a Google review |
|---|---|
| `platform` | `google` |
| `client_order_id` | Google's review id |
| `review_date` | the day it was written |

Without that, **two guests reviewing us on the same day would be one row**, and
one of them would be silently lost — the unique index on
`(platform, client_order_id, review_date)` would treat them as the same
review. No migration was needed: the column is there, and the id that goes in
it is the platform's own id for the review.

**Nothing is deleted.** The pull adds and updates; it never removes a row on
the strength of its own inference. A guest who deletes their review on Google
leaves a row behind — a small inaccuracy, said out loud on the page, rather
than a row deleted by mistake and simply gone.

### The two numbers are kept apart

| Number | Where it comes from | What it is |
|---|---|---|
| the rating Google publishes | the API's own `averageRating` and `totalReviewCount` | every rating the listing has ever had — written to `platform_listings`, `source='business_profile'` |
| the average of the reviews we hold | the rows in `customer_reviews` | only what we have read |

They are different questions and the page never shows one as the other. A
pull that could not read them does **not** put a blank over a number that was
there.

### How it is pulled

`lib/googleBusinessProfile.js` reads the API; `lib/googleReviews.js` writes
the books. The listing is found by its **Place ID** — never by its name; an
account can hold many listings, and a name is not an identity.

| Path | What it does |
|---|---|
| `POST /api/sync?google=reviews` | the pull, the same one the nightly run makes |
| `POST /api/customers/google` | the same pull, asked for by hand (admin only) |
| `GET /api/google-drive/connect?provider=google_business` | starts the sign-in |

A listing that is **not connected is skipped, not a failure** — the nightly
run has to keep working whether or not the Business Profile has been set up.

The **nightly workflow** asks for it after the other pulls, and a `skipped`
answer does not fail the run.

### The rating does not have to wait — 22 Nov 2026

The 12-day wait is on the **reviews**. The **rating** is a different door:
the **Places API** answers for any place by its Place ID with nothing but an
API key — no OAuth, no approval, no waiting.

| | Business Profile API | Places API |
|---|---|---|
| Approval | Google reviews the application — 7–14 days | none |
| Gives | every review, dated, and the right to reply | the average rating and the number of ratings |
| Auth | OAuth `business.manage` | an API key |

Our listing: **Atelier by Ambrosia**, Ground Floor, Koluthara Towers,
Marappalam Road, Pattom — Place ID **`ChIJ2dZj-yO7BTsR3dRz2zTaMjg`** —
**4.0 ★ from 3,628 ratings**, measured on the Maps listing on 22 Nov 2026.

So Google became a **fourth listing** (`google_atelier`) with a card on the
Reviews page, while the other three stay as they were.

**Google is not a marketplace.** Nobody orders on it, so it is left out of
`ORDERABLE_LISTINGS` (the "where they order" filter on the customer list) —
offering it there would be a choice that matches nobody. It is a page people
**review** us on and nothing else.

**Only the rating and the count are asked for.** The field mask is
`id,displayName,rating,userRatingCount`: no review text is fetched, so none
is stored, which is what Google's terms require. It also keeps the call in
the cheaper billing tier (Place Details Enterprise, ~$17/1,000 after 10,000
free a month — one call a day never reaches that).

**The source is recorded, and the page says it.** `platform_listings.source`
holds `places_api` (read from the API), `platform_page` (Zomato and Swiggy's
own page) or `maps_page` (measured on the Maps listing). The card prints
which one it was, so a number measured one way is never shown as though it
were measured another. A run that cannot read a platform **keeps the old
value and keeps its old source** — a refused API must not relabel a value
that came from somewhere else.

The key lives in `.env.local` as `GOOGLE_PLACES_API_KEY` (gitignored). The
script reads `.env.local` itself, the way the other scripts do.

## The four ratings are pulled together, every morning (23 Nov 2026)

`scripts/sync-platform-ratings.mjs` reads all four listings — Zomato, Swiggy —
Atelier, Swiggy — Ambrosia and Google — in **one run**, and writes them into
`platform_listings`. Before this it only ran when somebody remembered to type
it, so the ratings on the page could be weeks old without anybody noticing.

It now runs **every morning at 05:00 IST**, the same hour the books are pulled
from Petpooja, so the numbers on the page and the numbers in the books are
never a day apart.

**It runs on the office Mac, not in the cloud.** The Petpooja sync went to
Vercel because Petpooja's edge turns away datacenter IP addresses. This one
cannot, for a different reason: **Swiggy refuses a plain fetch and refuses
headless Chrome.** It answers a bot with *"Access to www.swiggy.com was
denied"*, and the scraper needs a real **headed** Chrome. Vercel's Chromium is
a headless *shell* build (`@sparticuz/chromium`) that cannot run headed at
all. A GitHub runner is no better — a datacenter IP with no display.

Zomato (a plain fetch) and Google (one HTTPS call with an API key) would both
be happy in the cloud. They are read in the same run anyway, so that **the
four numbers on the page always come from one moment** and the run stays in
one place.

`scripts/setup-ratings-schedule.sh` installs a macOS **launchd** job
(`com.atelier.platform-ratings`):

```bash
bash scripts/setup-ratings-schedule.sh                       # install it
launchctl kickstart -k gui/$(id -u)/com.atelier.platform-ratings   # run it now
tail -f ~/Library/Logs/Atelier/platform-ratings.log          # watch it
launchctl bootout gui/$(id -u)/com.atelier.platform-ratings   # take it off
```

The job holds **no secret**: it runs `node scripts/sync-platform-ratings.mjs`
with the project's own folder as the working directory, and the script reads
the credentials out of the gitignored `.env.local` itself. `node` is written
into the job by absolute path, because **launchd does not read the shell's
PATH** — not even a login shell's.

**launchd runs a missed calendar job when the machine next wakes**, so a closed
laptop delays the morning rather than skipping it. The job needs the Mac to be
awake and connected at some point after 05:00.

**A value pasted with a stray space is trimmed.** A key copied out of the
Google console very often carries a trailing space, and Google answers a key
with a space on the end as *"invalid key"* — which reads like a wrong key
rather than a wrong keystroke. `parseEnvText()` trims the value, then takes off
a matching pair of quotes, then trims again.

## The sync groups

| Group | What | Window | When |
|---|---|---|---|
| 11 `customer_orders` | the orders | the last **90 days**, a month at a time | every night |
| 12 `customer_ratings` | the platform reviews | the last **90 days, ending yesterday** | every night |
| 13 `customer_orders_history` | the orders | the **285 days before** that | once a week |
| 14 `customer_ratings_history` | the platform reviews | **1 Mar 2026** → the day before the recent window | once a week |

11 and 12 run every night; 13 and 14 run once a week, because the older history
does not change with the day. Together they cover about a year of orders and
**every review Petpooja holds**.

**The reviews' window ends the day before the books are up to.** A range that
reaches today cannot be walked cleanly (see the measurement above), so a day's
reviews land the next morning — the same promise the orders make.

**The writes are upserts**, never replacements: an order keeps its order
number **and the day it was placed**, a review keeps its platform + order id +
date, a feedback response keeps its bill number + date. So the history only
ever has to be pulled once, and a re-pull updates the same rows.

**The roll-up is worked out from the whole orders table**, not from the
window that was just pulled — so a customer's total spend is their spend over
all the time the books cover.

### The link is written in one statement, not one request per review

A single-row update takes **234ms** round trip — so attaching 1,349 reviews to
their orders one at a time would cost five minutes of nothing but waiting, and
the run has three hundred seconds to do everything in. The link is therefore
**one `UPDATE … FROM (VALUES …)`** (measured: under a second), and the
customer totals are one more.

The orders a review could point at are read with **one query** (423 rows in
1.7 seconds) rather than by reading all 27,719 orders (twenty-eight paged
requests).

The database **refuses an UPDATE with no WHERE clause**, so the totals
statement carries one — and it carries the one that keeps the run from
touching every row: *only the customers whose totals changed*.

### A `values` row is a tuple, and a tuple needs its brackets

The link statement is a list of tuples. A row without its brackets is not a
tuple, and the parser says so in the least helpful way possible — **"syntax
error at or near 774"**, naming the first number it could not read. It cost a
whole history pull to find that one. `reviewLinkStatement()` is now a pure
function with a test of its own.

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

## What the books hold (21 Nov 2026)

| | |
|---|---|
| Orders | **27,719**, from 1 Mar to 20 Nov 2026, worth **₹1,63,01,815** |
| Customers | **512**, worth **₹14,15,978** between them (8.7% of the order value) |
| The gap | **26,899 orders worth ₹1,48,85,837** carry no contact number |
| Reviews | **1,349** from 9 Mar to 21 Nov 2026 — 927 Zomato, 422 Swiggy |
| Of those | **1,337 matched an order**, 12 did not — Petpooja does not hold those orders |
| By listing | Zomato 918, Swiggy — Ambrosia 222, Swiggy — Atelier 192, plain Swiggy 5 |
| Reach a customer | **29** reviews carry a phone number — **27** customers have any |
| Feedback | 1 response so far — the sheet's own test row, and its bill number does not match an order yet. The form writes into the sheet, and the sheet is pulled into the books |

The gap is the number worth closing at the counter: it is 91.3% of the order
value, and it exists because the number is not asked for at the till.

## The runbook — the two things only the owner can do

Both live in the **`atelier-hr-drive`** Google Cloud project, which holds
nothing sensitive. Sign in at <https://console.cloud.google.com/> and pick
that project from the picker at the top of the page.

### 1. The Places API key (about 10 minutes, no approval)

The rating is read from the Places API, which needs an API key and nothing
else.

1. **APIs & Services → Library** (the ☰ menu, top left). Search **"Places
   API (New)"**. Open it → **Enable**.
2. **Billing.** Places API needs a billing account on the project. If it has
   none, open **Billing** in the left menu and create one. A card is needed
   on file, but Google's free tier is 10,000 calls a month per SKU and we
   make **one call a day** — so this will not cost anything. New Cloud
   accounts also get $300 for 90 days.
3. **APIs & Services → Credentials** → **+ CREATE CREDENTIALS → API key**.
   Copy the key (it starts `AIza`).
4. Open **`.env.local`** in the project folder and paste it after
   `GOOGLE_PLACES_API_KEY=`. The line is already there, waiting.
5. Run `node scripts/sync-platform-ratings.mjs`. The card on
   `/customers/reviews` will then say *"from Google's Places API"* instead of
   *"from the Google Maps listing"*.

**Restrict the key** (worth doing): click the key → **Edit** → **API
restrictions → Restrict key → Places API (New)**. The key is only ever used
by the local sync script, so an IP restriction on the office connection can
be added too.

### 2. The Business Profile API — approved, and one thing left to do

**Status: APPROVED on 25 Nov 2026.** Google opened support case
**`6-7727000042503`**; the project's quota is **300 QPM**, which is how
approval shows. The APIs are already switched on (measured 25 Nov 2026 — see
the table above).

**What is left is the owner's own Google sign-in**, because a listing can only
be read as somebody who manages it. There are two things to do, and both are
one-time.

#### 2a. The scopes DO have to be declared — and the picker does not have them

**Measured on 25 Nov 2026 — the first sign-in was refused.** The callback
refused the token because the scope the token carried was not the one that was
asked for, and nothing was saved (the Drive connection was untouched).

**The first attempt at this was wrong, and the note said so.** A probe of
Google's **authorization endpoint** showed `business.manage` being accepted,
and the runbook was written to say the scopes did not need declaring. **That
probe only reached the authorization endpoint, which checks the scope's
syntax — not the declaration, which is enforced at the grant.** The scope has
to be **declared on the consent screen's Data Access page**, and without that
Google grants the other scopes and quietly leaves this one out.

**What Google's own help page says** ("Manage App Data Access"):

> Only scopes for **enabled** APIs are listed in the scopes table. To add a
> missing scope to the list of scopes, find and **enable the API in the Google
> API Library** or use the text box in the **"Manually add scopes"** section
> of the page to add a new unlisted scope.

So there are **two ways in**, and the second is the one to use:

1. **Manually add scopes.** Data Access → **ADD OR REMOVE SCOPES** → the
   **"Manually add scopes"** text box → paste
   `https://www.googleapis.com/auth/business.manage` → **UPDATE**.
2. **Enable the API first**, which puts its scopes in the picker. The API is
   called **"Business Profile Account Management API"** and **"Business Profile
   Business Information API"** (the v1 ones this site calls), and **"My Business
   API"** for the v4 reviews.

`userinfo.email` is worth adding too, if it is not there — it is what tells
the page **whose** account is connected.

The scope is a **sensitive** one, so it lands in the consent screen's
**"Your sensitive scopes"** section.

**`businessprofile` is not a real scope.** It was tried and Google answered
`invalid_scope` for it. All three endpoints this site needs — the v1 accounts,
the v1 locations and the v4 reviews — document `business.manage` and nothing
else.

#### 2b. The publishing status — CHECKED, and it is fine

**Read on 25 Nov 2026 in the console (Google Auth Platform → Audience for
`atelier-hr-drive`):**

| | |
|---|---|
| Publishing status | **In production** |
| User type | **External** |
| OAuth user cap | 1 user / 100 (lifetime, cannot be reset) |

**So the seven-day refresh-token expiry does not apply** — that rule is for a
consent screen left in **Testing**. The Drive connection, made on 19 Nov 2026,
is safe; it was not about to die on 26 Nov.

(The status cannot be read from here: `serviceusage`, `clientauthconfig` and
the consent screen APIs are all closed to this project's service account, so it
has to be looked at in the console by hand.)

**Expect the "unverified app" screen on the sign-in.** `business.manage` is a
sensitive scope this app has not had verified, and Google's own note on that
page says so: *"If your users are seeing the 'unverified app' screen, it is
because your OAuth request includes additional scopes that haven't been
approved."* It is expected, it is the same screen the Drive sign-in showed,
and the person presses Continue. The **user cap** is counted for it — 1 of 100
used, and the cap is for the whole life of the project, so one more is of no
consequence.

#### 2c. Sign in once, as a manager of the listing

On the live site, signed in as an administrator, open
**`/customers/reviews`** and press **"Connect the Google listing"**. Google
asks to sign in — use the account that **manages the listing**
(`apirishab@gmail.com`) — and then **Allow**.

The sign-in comes back to `/customers/reviews?business=connected`, and the
token is written into `google_drive_tokens` under
`provider='google_business'`. **The Drive connection is a separate row and is
not touched.**

The redirect URI is **unchanged** — `https://atelier-hr-inky.vercel.app/api/google-drive/callback`
— because the same OAuth client serves both connections and the **state
cookie** says which one a sign-in belongs to. Nothing has to be added to the
client's redirect URI list.

**One project, not two.** Access is granted **per Cloud project**, and the
project that gets allowlisted must be the one holding the OAuth client —
"OAuth tokens cannot cross-authenticate" across projects. `atelier-hr-drive`
is that project: it already holds the service account, the OAuth client and
the Drive folder. A second project (e.g. a freshly created "My Project
NNNNN") must not be used for this, and the Places API key goes in
`atelier-hr-drive` too, so that every Google credential stays in the one
dedicated project.

**One OAuth client, two connections.** The client in
`scripts/google-oauth-client.json` serves both, because a second client would
need a second redirect URI added in the console — and the console cannot be
reached from here. What is kept apart is the **connection**: two rows, two
permission sets. The Drive connection's token never carries
`business.manage`, and the Business Profile connection is never handed the
accountant's Drive.

