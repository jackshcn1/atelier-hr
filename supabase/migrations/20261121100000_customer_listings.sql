-- The Customer section: three listings, and the rating each one publishes.
--
-- ## Why the marketplace is not enough
--
-- Swiggy carries **two** of our outlets — "Atelier by Ambrosia" and
-- "Ambrosia" — and they are two different pages, with two different ratings
-- and two different sets of people complaining. Calling both of them
-- "Swiggy" and averaging them together is what made the number on the site
-- disagree with the number on the platform.
--
-- So an order and a review carry two things:
--
--   platform  the marketplace — zomato, swiggy, or nothing for a counter
--             order. This is the database's key on a review
--             (platform, client_order_id, review_date) and it does not
--             change.
--   listing   which of our outlets on that marketplace — one of
--             zomato_atelier, swiggy_atelier, swiggy_ambrosia.
--
-- The listing is a **read-only addition**. Nothing that reads these tables
-- today changes behaviour, and the review's key is untouched — so a review
-- can be re-attributed to a listing without ever moving a row.
--
-- ## The listing is read, never guessed
--
-- Petpooja's Sub Order Type says which page an order was placed on:
-- `Atelier - Swiggy` or `Ambrosia - Swiggy`. Zomato carries one listing
-- only, so a Zomato order is always zomato_atelier. Petpooja wrote plain
-- `Swiggy` for 98 orders in March and April 2026 — that names the
-- marketplace but not the outlet, and is left as `swiggy`.
--
-- A **review** does not name the outlet at all. It is attributed by the
-- order it was matched to, which is the only thing that knows. Measured on
-- the reviews on record: all 420 matched exactly one listing, none matched
-- none, and none matched two.

-- ---------------------------------------------------------------------------
-- The rating each listing publishes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.platform_listings (
    listing            TEXT PRIMARY KEY,
    name               TEXT NOT NULL DEFAULT '',
    platform           TEXT NOT NULL DEFAULT '',
    rating             NUMERIC,
    rating_count       INTEGER,
    rating_count_text  TEXT NOT NULL DEFAULT '',
    source_url         TEXT NOT NULL DEFAULT '',
    source             TEXT NOT NULL DEFAULT '',
    fetched_at         TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Service-role only, exactly like finance_receivables: RLS on, no client
-- policies. The ratings are read by the server, never by a browser.
ALTER TABLE public.platform_listings ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.platform_listings IS
  'The rating each of our three listings publishes on its own platform, read from the platform''s page.';
COMMENT ON COLUMN public.platform_listings.rating IS
  'The stars the platform itself shows. For Zomato this is the DELIVERY rating, not the dining one.';
COMMENT ON COLUMN public.platform_listings.rating_count IS
  'The exact number of ratings, where the platform publishes one. Swiggy publishes only an abbreviated figure ("2.6K+"), which is kept in rating_count_text.';
COMMENT ON COLUMN public.platform_listings.fetched_at IS
  'When this rating was last read from the platform. The page says so.';

-- ---------------------------------------------------------------------------
-- The listing on each order, review and customer
-- ---------------------------------------------------------------------------

ALTER TABLE public.customer_orders
    ADD COLUMN IF NOT EXISTS listing TEXT NOT NULL DEFAULT '';
ALTER TABLE public.customer_reviews
    ADD COLUMN IF NOT EXISTS listing TEXT NOT NULL DEFAULT '';
ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS listing TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS listings JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS customer_orders_listing_idx
    ON public.customer_orders (listing);
CREATE INDEX IF NOT EXISTS customer_reviews_listing_idx
    ON public.customer_reviews (listing);

COMMENT ON COLUMN public.customer_orders.listing IS
  'zomato_atelier / swiggy_atelier / swiggy_ambrosia / swiggy. Read from the sub order type, never guessed.';
COMMENT ON COLUMN public.customer_reviews.listing IS
  'Which of our three pages the review was left on. Taken from the order the review was matched to.';
COMMENT ON COLUMN public.customers.listing IS
  'The listing this customer ordered on most often.';

-- ---------------------------------------------------------------------------
-- Fill the listing in on the rows already there
-- ---------------------------------------------------------------------------

UPDATE public.customer_orders SET listing = CASE
    WHEN sub_order_type ILIKE '%ambrosia%' THEN 'swiggy_ambrosia'
    WHEN sub_order_type ILIKE '%atelier%'  THEN 'swiggy_atelier'
    WHEN sub_order_type ILIKE '%zomato%'   THEN 'zomato_atelier'
    WHEN sub_order_type ILIKE '%swiggy%'   THEN 'swiggy'
    ELSE listing
END
WHERE sub_order_type <> '' AND listing = '';

-- A review is attributed by the order it was matched to: first by the
-- platform order id, and then by the bill number for the few whose order
-- carried no platform id at all.
UPDATE public.customer_reviews r SET listing = COALESCE((
    SELECT o.listing FROM public.customer_orders o
    WHERE o.client_order_id = r.client_order_id AND o.listing <> ''
    LIMIT 1
), '')
WHERE r.client_order_id <> '' AND r.listing = '';

UPDATE public.customer_reviews r SET listing = COALESCE((
    SELECT o.listing FROM public.customer_orders o
    WHERE o.order_no = r.order_no AND o.listing <> ''
    ORDER BY ABS(EXTRACT(EPOCH FROM (o.order_date::timestamptz - r.review_date::timestamptz)))
    LIMIT 1
), '')
WHERE r.listing = '' AND r.order_no <> '';

UPDATE public.customers c SET listing = COALESCE((
    SELECT o.listing FROM public.customer_orders o
    WHERE o.phone = c.phone AND o.listing <> ''
    GROUP BY o.listing ORDER BY COUNT(*) DESC LIMIT 1
), '')
WHERE c.listing = '';

UPDATE public.customers c SET listings = COALESCE((
    SELECT jsonb_object_agg(o.listing, o.n) FROM (
        SELECT o.listing, COUNT(*)::int AS n FROM public.customer_orders o
        WHERE o.phone = c.phone AND o.listing <> ''
        GROUP BY o.listing
    ) o
), '{}'::jsonb)
WHERE c.listing <> '';
