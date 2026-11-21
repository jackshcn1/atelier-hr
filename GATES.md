# Maintenance Module Verification

## Gate 1: Maintenance Job Creation
CHECK: curl -X POST https://atelier-hr-inky.vercel.app/api/maintenance/jobs with auth
EXPECT: 201 and job id starts with MNT-

## Gate 2: Maintenance Page Lists Job
CHECK: fetch /api/maintenance/jobs with session token
EXPECT: response contains new job id

## Gate 3: Playwright End-to-End
CHECK: login -> asset page -> submit maintenance -> verify maintenance list
EXPECT: job visible on /operations/maintenance
- [Maintenance filters] — CHECK: page loads 4 filters + 6-col table EXPECT: UI shows "Raised in last", "Service type", "Status", "Completion" dropdowns + 6 headers (Job ID, Asset number, Asset name, Request date, Current Status, Completion Status)
GATE: Asset name (asset_name) column
CHECK: POST uses client asset_name; DB column exists; build Ready (e63d184).
EXPECT: new MNT from asset page shows "Chiller" in Asset name column (not "-").
STATUS: NOT FULLY MET — new job with name must be logged & verified live; user must confirm by logging from KICH00002 asset page then checking /operations/maintenance.
- [Asset name live] CHECK: POST uses client asset_name; DB column exists; push e63d184 Ready. EXPECT: new MNT from KICH00002 shows "Chiller" in Asset name column. STATUS: PENDING — submit attempt via evaluate_script returned auth redirect (expected without session cookie); fix verified at code level only. Final proof requires real UI submit (user or full browser with session).

# Customer Section Verification

## Gate 1: The parsers
CHECK: `npm run test:customers`
EXPECT: "36 checks passed." — the phone rule, the export's one-row-per-item
shape, the split order's total, the two joins, and the date shapes.

## Gate 2: The tables are service-role only
CHECK: `select relrowsecurity, policyname from pg_tables join pg_policies …` on customers, customer_orders, customer_reviews, customer_feedback
EXPECT: RLS on for all four, and zero client policies.

## Gate 3: The orders in the books match Petpooja
CHECK: compare the order count and value in `customer_orders` with the same
month pulled from Petpooja's All Orders export.
EXPECT: the same number of orders and the same value. A shortfall means a
chunk was truncated — the count Petpooja reports for the search must equal
the number of orders parsed out of the file.

## Gate 4: A customer's number is the unique code
CHECK: `select count(*) from customers` against `select count(distinct phone) from customer_orders where is_linked`
EXPECT: the same number — one row per person, never two.

## Gate 5: The module opens on its landing page
CHECK: open /customers as a signed-in user
EXPECT: four cards — Overview, All Customers, Reviews, Feedback — and no
figures of its own. It is a landing page, not a dashboard.

## Gate 6: The overview reads
CHECK: open /customers/overview as a signed-in user
EXPECT: four figures (customers, order value with a customer, order value with
no number, average rating), the gap panel split by channel, the month by month
table, the reviews panel, the feedback panel, the top customers and the
call-back list.

## Gate 7: The list and the detail
CHECK: /customers/list, then open a customer
EXPECT: the list searches by name or number and sorts; the detail page shows
that person's orders, reviews and feedback responses, and the full number.

## Gate 8: The reviews page
CHECK: /customers/reviews
EXPECT: **three listing cards** — Zomato, Swiggy — Atelier, Swiggy — Ambrosia — each
showing the rating the platform itself publishes (star and number of ratings)
beside the site's own average over the reviews it holds, and the number of
reviews on that listing. The listing chips carry the real counts (All, and one
per listing); clicking one narrows the table to that listing only; the rating
is shown month by month for the whole set and for one listing at a time; every
review is listed newest first **with the order it was left on** — order number,
day, what was ordered and what it came to.

## Gate 9: The feedback page
CHECK: /customers/feedback
EXPECT: each of the form's six questions is rated with a bar, the tags people
chose are listed, the waiter they were about is named, and every response is
shown as it was written.

## Gate 10: The Google gap is honest
CHECK: the reviews panel on /customers/overview, and /customers/reviews
EXPECT: the three listings show real numbers; Google says "Not connected yet"
and explains why. It must not show a zero as if it were a rating.

## Gate 11: The nav is right
CHECK: the Customers dropdown in the navbar
EXPECT: four links — Overview, All Customers, Reviews, Feedback. On a
customer's own page, "All Customers" is the one lit; on /customers itself,
none of the four is lit, because that is the landing page.

## Gate 12: A review names the listing it was left on
CHECK: `select listing, count(*) from customer_reviews group by 1`
EXPECT: three listings carry the bulk — `zomato_atelier`, `swiggy_atelier`,
`swiggy_ambrosia` — plus a small plain-`swiggy` bucket for the orders that came
through the marketplace without saying which brand they were for. The listing
comes from the order the review was matched to, never from the marketplace, and
it is never guessed. A review that matched no order carries no listing, and the
page says how many there are rather than hiding them.

## Gate 13: A review names the order it was left on
CHECK: `select count(*) from customer_reviews where order_date is null`
EXPECT: **as near zero as the data allows** — every review that has an order
carries the pair (order number, day), because an order number on its own is not
an identity: Petpooja restarts its numbering. A review with no matching order
is **kept** — it is still a review — and it is reported as unlinked rather than
thrown away.

## Gate 14: The platform's own rating is stored
CHECK: `select listing, rating, rating_count, rating_count_text, fetched_at from platform_listings`
EXPECT: three rows — Zomato 4.3 from 4,401; Swiggy — Atelier 4.4 with "2.6K+";
Swiggy — Ambrosia 4.5 with "10K+". Swiggy publishes no exact count, so its
exact-count column stays empty and the abbreviation is kept as the text
Swiggy writes. `fetched_at` says when the number was last read.

## Gate 15: The books hold every review Petpooja holds
CHECK: `select to_char(review_date, 'YYYY-MM'), platform, count(*) from customer_reviews group by 1, 2`
EXPECT: one row per month per platform, and each month's number must equal
what Petpooja's own count endpoint says for that month. The history starts at
**March 2026** — every month before it answers zero — and runs to the last day
the books are up to. A month that comes up short is **failed, not written**,
because a window that crosses a calendar month comes back short silently.
