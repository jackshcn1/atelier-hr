-- Calendar-month revenue, for the finance dashboards.
--
-- The 20th-19th pay cycle stays the basis for salary processing and variable
-- pay. The finance dashboards answer a different question - "how is this
-- calendar month going?" - so they need revenue for a plain calendar month.
--
-- The Petpooja Executive Sales Summary is the only report that splits revenue
-- into Dine In / Pick Up / Delivery, and it can be pulled for any date range.
-- The nightly sync pulls it once per calendar month and writes the split
-- here. The window ends on the day the pull was made, so a month that is
-- still running shows the month so far, and a month that is over shows the
-- whole thing.
CREATE TABLE IF NOT EXISTS public.finance_monthly_revenue (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    month TEXT NOT NULL UNIQUE,            -- 'YYYY-MM'
    dine_in NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    pick_up NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    delivery NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    total NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    window_start DATE NOT NULL,           -- first day of the month
    window_end DATE NOT NULL,             -- last day the pull actually covered
    is_complete BOOLEAN NOT NULL DEFAULT false,
    source TEXT NOT NULL DEFAULT 'petpooja:executive_sales_summary',
    synced_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- The dashboards read this table through a server route with the service role,
-- so the client policies are not needed for reading. No policy is created:
-- the table is not reachable from the browser.
ALTER TABLE public.finance_monthly_revenue ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.finance_monthly_revenue IS
  'Calendar-month revenue split from the Petpooja Executive Sales Summary. Used by the finance dashboards; the 20-19 pay cycle in variable_metric_inputs is unaffected.';

-- Keep the "one row per month" promise even if the sync ever runs the same
-- month twice at the same moment.
CREATE UNIQUE INDEX IF NOT EXISTS finance_monthly_revenue_month_key
  ON public.finance_monthly_revenue (month);
