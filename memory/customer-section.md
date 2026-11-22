---
name: customer-section
description: "The Customer section — who a customer is (a real contact number), the pages the module is made of, where the order value, reviews and feedback come from, and the two Petpooja export traps that break it."
metadata:
  node_type: memory
  type: project
  modified: 2026-11-21T06:30:00.000Z
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

**The landing page holds no data of its own** — it is four links. Everything
is read through `/api/customers`, which dispatches on `view`: `overview`,
`list`, `detail`, `reviews`, `feedback`.

The reviews and the feedback are worked out once, in `buildReviewPicture()` and
`buildFeedbackPicture()`, and used by both the overview and their own pages —
so the two can never disagree with each other.

**The nav has four entries**, and `isLinkActive()` needs two special cases:
`/customers` lights only on the landing page (it is a module landing, not an
overview), and `/customers/list` also lights on a customer's own page
(`/customers/7034308981`).

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
| Feedback | The **Customer Feedback Form** sheet, read through the service account | the **bill number** only — the form has no phone column |
| Google reviews | **Not in Petpooja.** They need the Google Business Profile API | — |
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
| Google | **4.0** from 3,628 ratings | none held yet — see "The Google gap" |

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

### But the rating does not have to wait — 22 Nov 2026

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
| Feedback | 1 response so far — the form's bill number does not match an order yet |

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

### 2. The Business Profile API application (the 12-day one)

This is the one that gives the **reviews** — every review the listing has
ever received, dated, with the right to reply to them.

Google asks for four things, and the restaurant already has all four:

| Google asks for | We have |
|---|---|
| a verified, active Business Profile, 60+ days old | the restaurant's own Google Maps listing, rated for years |
| a business website | theambrosia.com (it is on the listing) |
| a Google Cloud project | `atelier-hr-drive` |
| an email that is an owner/manager of the listing | the owner's own Gmail, **as long as it is the one that manages the listing** |

The steps:

1. Open the project in the Cloud Console and read the **Project number**
   off the **Project info** card on the Dashboard. The application form asks
   for it.
2. Open <https://support.google.com/business/contact/api_default>, choose
   **"Application for Basic API Access"**, and fill the form in with the
   project number, the business name, the website, the APIs wanted
   (Business Profile API and My Business Account Management API), and the
   reason: *"Read the customer reviews of our own restaurant and reply to
   them, from our in-house management system."* Use an email address that is
   an owner or manager of the listing — Google checks this.
3. Wait. Google reviews the application within **14 days**.
4. **To check whether it was approved**: Cloud Console → **APIs & Services →
   Quotas** → the Business Profile APIs. **0 QPM means not approved yet;
   300 QPM means approved.**
5. Once approved, the work left is: enable the Business Profile APIs,
   create an OAuth client (Web application, scope
   `https://www.googleapis.com/auth/business.manage`), and build the sync
   and the reply button. The `customer_reviews` table already accepts
   `platform = 'google'`, and `google_atelier` is already a listing, so the
   connector drops in without a schema change.

**Use a separate OAuth client** for this, not the Drive one in
`scripts/google-oauth-client.json`. Different scopes, and the Drive token
must never be granted `business.manage`.

