-- Petpooja's order numbers are not unique for the whole of time.
--
-- ## What was measured
--
-- Petpooja restarts its order numbering. Two consecutive months were pulled
-- and compared:
--
--   March 2026  →  2,688 orders, numbers 4 … 2,691
--   April 2026  →  3,169 orders, numbers 1 … 3,169
--
-- **Every one of March's order numbers also exists in April.** The two
-- months overlap completely. The book of orders therefore has to be keyed on
-- the order number *and the day it was placed* — the number alone is not an
-- identity.
--
-- ## What that broke
--
-- `customer_orders.order_no` was UNIQUE on its own, and the sync upserted on
-- it. So April overwrote March, row for row: the 2,688 March orders were
-- replaced by April's orders carrying the same numbers. The March orders
-- were not missing from Petpooja — they were missing from the books because
-- the key they were written under had already been taken.
--
-- The same happened a second time inside one run: the sync's own
-- de-duplication map was keyed on the order number alone, so when the
-- history pull put March and April in the same batch, March's orders were
-- dropped from the map before they ever reached the database.
--
-- ## The fix
--
-- The order's identity is the pair (order number, day). The unique
-- constraint becomes that pair, and the sync upserts on it.
--
-- This is the same shape as the other tables in this section: `customer_reviews`
-- is unique on (platform, client order id, review date) and
-- `customer_feedback` on (bill number, response date) — a number on its own
-- is never an identity, because a counter that restarts will hand the same
-- number out twice.
--
-- The existing rows are checked before the constraint is added: every row
-- already in the table must be distinct on the pair, or the migration
-- refuses rather than silently losing an order.
--
-- `customer_orders_client_idx` and the other indexes are untouched — the
-- orders are still found by phone, by date, by platform order id and by
-- whether they are linked.

-- ---------------------------------------------------------------------------
-- The check first: nothing may be lost by the new key
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    clashes BIGINT;
BEGIN
    SELECT count(*) INTO clashes
    FROM (
        SELECT order_no, order_date
        FROM public.customer_orders
        GROUP BY order_no, order_date
        HAVING count(*) > 1
    ) AS duplicates;

    IF clashes > 0 THEN
        RAISE EXCEPTION
            'customer_orders holds % row(s) that repeat on (order_no, order_date). The new key would lose them. Fix those rows first.',
            clashes;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- The old key: the order number on its own
-- ---------------------------------------------------------------------------
ALTER TABLE public.customer_orders
    DROP CONSTRAINT IF EXISTS customer_orders_order_no_key;

-- ---------------------------------------------------------------------------
-- The new key: the order number and the day it was placed
-- ---------------------------------------------------------------------------
ALTER TABLE public.customer_orders
    DROP CONSTRAINT IF EXISTS customer_orders_identity_unique;

ALTER TABLE public.customer_orders
    ADD CONSTRAINT customer_orders_identity_unique UNIQUE (order_no, order_date);

-- The order number is still looked up on its own — the review and feedback
-- joins match a bill number against it, and the customer page shows it.
CREATE INDEX IF NOT EXISTS customer_orders_order_no_idx
    ON public.customer_orders (order_no);

COMMENT ON CONSTRAINT customer_orders_identity_unique ON public.customer_orders IS
  'An order is one order number on one day. Petpooja restarts its numbering, so the number alone is not an identity — measured: March 2026 used 4-2691 and April 2026 used 1-3169, the same numbers.';
