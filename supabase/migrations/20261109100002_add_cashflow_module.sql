-- Cashflow transactions table
CREATE TABLE IF NOT EXISTS cashflow_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('inflow', 'outflow')),
  description TEXT NOT NULL,
  category TEXT,
  amount NUMERIC(12, 2) NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  mode TEXT CHECK (mode IN ('UPI', 'NEFT', 'RTGS', 'Cash', 'Credit Card')),
  reference TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE cashflow_transactions ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can read cashflow transactions"
  ON cashflow_transactions FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert cashflow transactions"
  ON cashflow_transactions FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update cashflow transactions"
  ON cashflow_transactions FOR UPDATE
  TO authenticated USING (true);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_cashflow_transactions_updated_at
  BEFORE UPDATE ON cashflow_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();