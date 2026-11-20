-- The Customer section: customers, their orders, their reviews and their
-- feedback-form responses.
--
-- Four tables, all read by a server route with the service role, so they are
-- service-role only: RLS on, no client policies. That is the same shape as
-- finance_receivables.
--
-- ## The rule that decides who is a customer
--
-- A customer is a person whose order recorded a REAL contact number. On
-- 9,635 orders (22 Aug - 20 Nov 2026) 266 distinct phone numbers appeared,
-- and 121 of them were staff test numbers - 1234567890, 9999999999,
-- 1111111111 and their near-misses. Those are not customers, and the orders
-- they are on are not lost: they are counted in the gap the page shows, so
-- the owner can see how much of the business is not yet attributable to a
-- person.
--
-- The phone is therefore the unique code. There is no name-based customer
-- and no address-based one, so one person is never counted twice.
--
-- ## The join key
--
-- Petpooja's orders export carries the platform order id (the Zomato or
-- Swiggy order id) in Client OrderID, and the Ratings & Reviews export
-- carries the same number in "Client Order Id". That is how a review finds
-- its order, and through the order, its customer. Verified: the one Zomato
-- review on record is 8866657208, and 8866657208 is a Client OrderID in the
-- orders export.
--
-- ## Why the orders are kept as their own rows
--
-- The customer row is the roll-up; the order row is the evidence behind it.
-- Without the orders, a customer's total spend cannot be shown as the list
-- of visits that made it, and a review cannot be traced to the order it was
-- left on.

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    phone TEXT NOT NULL UNIQUE,             -- the unique code: last 10 digits
    name TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    first_order_at DATE,
    last_order_at DATE,
    order_count INTEGER NOT NULL DEFAULT 0,
    total_spend NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    avg_order_value NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    channel_mix JSONB NOT NULL DEFAULT '{"dine_in":0,"pick_up":0,"delivery":0}'::jsonb,
    platform TEXT NOT NULL DEFAULT '',      -- zomato / swiggy / '' for a POS order
    client_order_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    review_count INTEGER NOT NULL DEFAULT 0,
    avg_rating NUMERIC(3,2),
    feedback_count INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'petpooja:orders',
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customers_spend_idx
    ON public.customers (total_spend DESC);
CREATE INDEX IF NOT EXISTS customers_last_order_idx
    ON public.customers (last_order_at DESC);
CREATE INDEX IF NOT EXISTS customers_platform_idx
    ON public.customers (platform);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.customers IS
  'A customer is a person whose order recorded a real contact number. The phone is the unique code; there are no name-based or address-based customers.';
COMMENT ON COLUMN public.customers.phone IS
  'The contact number, digits only, last ten. The unique code for a customer.';
COMMENT ON COLUMN public.customers.client_order_ids IS
  'The platform order ids (Zomato / Swiggy). A review is matched to a customer through one of these.';

-- ---------------------------------------------------------------------------
-- customer_orders
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_orders (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_no TEXT NOT NULL UNIQUE,          -- Petpooja's order number
    client_order_id TEXT NOT NULL DEFAULT '', -- the platform order id
    phone TEXT NOT NULL DEFAULT '',         -- the customer it belongs to, if any
    is_linked BOOLEAN NOT NULL DEFAULT false,
    raw_phone TEXT NOT NULL DEFAULT '',     -- the number as it was written
    customer_name TEXT NOT NULL DEFAULT '',
    customer_address TEXT NOT NULL DEFAULT '',
    order_type TEXT NOT NULL DEFAULT '',
    channel TEXT NOT NULL DEFAULT '',       -- dine_in / pick_up / delivery
    amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    payment_type TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT '',
    items TEXT NOT NULL DEFAULT '',
    order_date DATE,
    source TEXT NOT NULL DEFAULT 'petpooja:all_orders',
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_orders_phone_idx
    ON public.customer_orders (phone);
CREATE INDEX IF NOT EXISTS customer_orders_date_idx
    ON public.customer_orders (order_date DESC);
CREATE INDEX IF NOT EXISTS customer_orders_client_idx
    ON public.customer_orders (client_order_id);
CREATE INDEX IF NOT EXISTS customer_orders_linked_idx
    ON public.customer_orders (is_linked);

ALTER TABLE public.customer_orders ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.customer_orders IS
  'One row per Petpooja order. An order with no real phone is kept and marked unlinked, because its value is part of the gap the Customer page shows.';

-- ---------------------------------------------------------------------------
-- customer_reviews
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_reviews (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    platform TEXT NOT NULL,                 -- zomato / swiggy / google
    client_order_id TEXT NOT NULL DEFAULT '',
    order_no TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    is_linked BOOLEAN NOT NULL DEFAULT false,
    rating NUMERIC(3,2),
    comment TEXT NOT NULL DEFAULT '',
    review_date DATE,
    source TEXT NOT NULL DEFAULT 'petpooja:ratings_and_reviews',
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- A platform's review of one order is one review: re-pulling must not
    -- create a second copy of it.
    CONSTRAINT customer_reviews_unique UNIQUE (platform, client_order_id, review_date)
);

CREATE INDEX IF NOT EXISTS customer_reviews_platform_idx
    ON public.customer_reviews (platform);
CREATE INDEX IF NOT EXISTS customer_reviews_order_idx
    ON public.customer_reviews (order_no);
CREATE INDEX IF NOT EXISTS customer_reviews_phone_idx
    ON public.customer_reviews (phone);
CREATE INDEX IF NOT EXISTS customer_reviews_date_idx
    ON public.customer_reviews (review_date DESC);

ALTER TABLE public.customer_reviews ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.customer_reviews IS
  'Reviews left on a delivery platform. Google reviews are not in Petpooja; they need the Business Profile API and will arrive with the same shape.';
COMMENT ON COLUMN public.customer_reviews.client_order_id IS
  'The platform order id. This is what matches a review to the order it was left on.';

-- ---------------------------------------------------------------------------
-- customer_feedback
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_feedback (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    bill_number TEXT NOT NULL DEFAULT '',
    order_no TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    is_linked BOOLEAN NOT NULL DEFAULT false,
    response_date DATE,
    waiter TEXT NOT NULL DEFAULT '',
    overall NUMERIC(3,2),
    food_quality NUMERIC(3,2),
    taste NUMERIC(3,2),
    service NUMERIC(3,2),
    hospitality NUMERIC(3,2),
    waiting_time NUMERIC(3,2),
    would_visit_again TEXT NOT NULL DEFAULT '',
    improvement_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    comment TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'google_sheet:customer_feedback_form',
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- A form response is one response: the sheet's own serial number with
    -- its date identifies it, so a re-pull updates it rather than adding to it.
    CONSTRAINT customer_feedback_unique UNIQUE (bill_number, response_date)
);

CREATE INDEX IF NOT EXISTS customer_feedback_order_idx
    ON public.customer_feedback (order_no);
CREATE INDEX IF NOT EXISTS customer_feedback_phone_idx
    ON public.customer_feedback (phone);
CREATE INDEX IF NOT EXISTS customer_feedback_date_idx
    ON public.customer_feedback (response_date DESC);
CREATE INDEX IF NOT EXISTS customer_feedback_waiter_idx
    ON public.customer_feedback (waiter);

ALTER TABLE public.customer_feedback ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.customer_feedback IS
  'Responses from the Customer Feedback Form sheet. A response is joined to an order by its Bill Number only - the form has no phone column.';
