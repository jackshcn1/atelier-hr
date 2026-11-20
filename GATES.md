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
EXPECT: "27 checks passed." — the phone rule, the export's one-row-per-item
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

## Gate 5: The page reads
CHECK: open /customers as a signed-in user
EXPECT: four figures (customers, order value with a customer, order value with
no number, average rating), the gap panel split by channel, the month by month
table, the reviews panel, the feedback panel, the top customers and the
call-back list.

## Gate 6: The list and the detail
CHECK: /customers/list, then open a customer
EXPECT: the list searches by name or number and sorts; the detail page shows
that person's orders, reviews and feedback responses, and the full number.

## Gate 7: The Google gap is honest
CHECK: the reviews panel on /customers
EXPECT: Zomato and Swiggy show real numbers; Google says "Not connected yet"
and explains why. It must not show a zero as if it were a rating.
