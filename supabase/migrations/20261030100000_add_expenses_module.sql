CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL, -- e.g. 'Rent', 'Electricity', 'Vendor', 'Maintenance'
    cost_type TEXT NOT NULL, -- 'fixed' or 'variable'
    entry_type TEXT NOT NULL DEFAULT 'actual', -- 'forecast' or 'actual'
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending' (needs review), 'approved', 'rejected'
    amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    debit_note NUMERIC(12,2) DEFAULT 0.00,
    vendor_name TEXT,
    invoice_number TEXT,
    invoice_date DATE,
    description TEXT,
    payment_status TEXT DEFAULT 'due', -- 'due', 'paid'
    payment_date DATE,
    payment_mode TEXT, -- 'UPI', 'NEFT', 'RTGS', 'Cash'
    bank_reference TEXT, -- UTR / Ref #
    created_by UUID REFERENCES auth.users(id),
    approved_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read expenses"
    ON public.expenses FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated users to insert expenses"
    ON public.expenses FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Allow admins to update expenses"
    ON public.expenses FOR UPDATE
    TO authenticated
    USING (true);
