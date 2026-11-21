-- The Customer section: the day a review was left on the order it names.
--
-- ## Why a review needs more than its order number
--
-- A review was attached to its order by the **platform order id**, and the
-- order's number was written down with it. But an order number is not an
-- identity — **Petpooja restarts its numbering**, so the same number names
-- an order in more than one month. Measured: March 2026 used numbers 4 –
-- 2,691 and April 2026 used 1 – 3,169, so every March number also exists
-- in April.
--
-- A review that carried only its order's number could therefore not be
-- joined back to the exact order it was left on. That made the link
-- **not reproducible**: the same review could be read against a different
-- order on a different run.
--
-- The order's **day** is written next to it, and (order number, day) is the
-- order's own key — so the join is exact, and the review always points at
-- the same order it did the first time.
--
-- This is what makes the Reviews page able to show *what the customer
-- ordered* against the review they left about it.

ALTER TABLE public.customer_reviews
    ADD COLUMN IF NOT EXISTS order_date DATE;

COMMENT ON COLUMN public.customer_reviews.order_date IS
  'The day of the order this review was left on. With the order number it is the order''s own key — an order number on its own is not an identity, because Petpooja restarts its numbering.';

-- Fill it in on the reviews already there: first by the platform order id,
-- and then by the bill number for the few whose order carried no platform
-- id at all — nearest in date, because a bill is written on the day of the
-- meal it is for.
UPDATE public.customer_reviews r SET order_date = o.order_date
FROM public.customer_orders o
WHERE r.order_date IS NULL
  AND o.client_order_id = r.client_order_id
  AND r.client_order_id <> ''
  AND o.order_date = (
    SELECT o2.order_date FROM public.customer_orders o2
    WHERE o2.client_order_id = r.client_order_id
    ORDER BY o2.order_date LIMIT 1
  );

UPDATE public.customer_reviews r SET order_date = o.order_date
FROM public.customer_orders o
WHERE r.order_date IS NULL
  AND o.order_no = r.order_no
  AND r.order_no <> ''
  AND o.order_date = (
    SELECT o2.order_date FROM public.customer_orders o2
    WHERE o2.order_no = r.order_no
    ORDER BY ABS(EXTRACT(EPOCH FROM (o2.order_date::timestamptz - r.review_date::timestamptz)))
    LIMIT 1
  );

CREATE INDEX IF NOT EXISTS customer_reviews_order_date_idx
    ON public.customer_reviews (order_date);
