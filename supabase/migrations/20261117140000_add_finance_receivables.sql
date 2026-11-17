-- Money owed by customers, for the finance pages.
--
-- The Petpooja Due Payment Report lists every invoice that still has money
-- outstanding on it. That is a balance-sheet figure, not a cost and not
-- revenue, so it does not belong in the P&L — it belongs on the cashflow
-- page, where it is the money that is expected to come in.
--
-- The rows are a snapshot: each pull replaces the rows of the month it was
-- pulled in, so the page always shows the latest picture of who owes what.
--
-- The variable-pay side of the sync reads the same report for the overdue
-- check; this table is the finance reading of it and does not touch it.
CREATE TABLE IF NOT EXISTS public.finance_receivables (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    month TEXT NOT NULL,                       -- 'YYYY-MM', the month of the snapshot
    invoice_no TEXT NOT NULL DEFAULT '',
    customer_name TEXT NOT NULL DEFAULT '',
    invoice_date DATE,
    remaining_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    age_days INTEGER NOT NULL DEFAULT 0,
    is_overdue BOOLEAN NOT NULL DEFAULT false,
    source TEXT NOT NULL DEFAULT 'petpooja:due_payment_report',
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT finance_receivables_unique UNIQUE (month, invoice_no, customer_name)
);

CREATE INDEX IF NOT EXISTS finance_receivables_month_idx
    ON public.finance_receivables (month);
CREATE INDEX IF NOT EXISTS finance_receivables_customer_idx
    ON public.finance_receivables (customer_name);

-- The dashboards read this table through a server route with the service
-- role, so the client policies are not needed for reading. No policy is
-- created: the table is not reachable from the browser.
ALTER TABLE public.finance_receivables ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.finance_receivables IS
  'Open customer invoices (money owed) from the Petpooja Due Payment Report. A snapshot per calendar month; service-role only.';

COMMENT ON COLUMN public.finance_receivables.month IS
  'The calendar month of the snapshot. Each pull replaces the rows of that month.';
