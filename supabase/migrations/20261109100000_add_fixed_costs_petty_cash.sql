CREATE TABLE IF NOT EXISTS public.fixed_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    billing_cycle TEXT NOT NULL DEFAULT 'monthly', -- 'monthly', 'annual'
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.fixed_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users fixed_costs" ON public.fixed_costs FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.petty_cash_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL, -- 'deposit', 'expense'
    amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    vendor_name TEXT,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT,
    payment_method TEXT, -- 'Cash', 'UPI', 'Check'
    receipt_url TEXT,
    chellan_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.petty_cash_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users petty_cash_ledger" ON public.petty_cash_ledger FOR ALL TO authenticated USING (true) WITH CHECK (true);
