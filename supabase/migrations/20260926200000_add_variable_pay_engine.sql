-- Migration: Variable Pay Incentive Schemes, Multi-Metric Attainment & Target Configuration
-- Created: 2026-09-26

-- 1. Create variable_pay_schemes table
create table if not exists variable_pay_schemes (
  id bigint generated always as identity primary key,
  name text not null unique,
  display_name text not null,
  department text,
  metrics jsonb not null default '[]'::jsonb,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Add variable_pay_scheme column to employees table
alter table employees
  add column if not exists variable_pay_scheme text;

-- 3. Add variable_breakdown to payroll_line_items
alter table payroll_line_items
  add column if not exists variable_breakdown jsonb default '[]'::jsonb;

-- 4. Enable Row Level Security
alter table variable_pay_schemes enable row level security;

create policy "variable_pay_schemes_select" on variable_pay_schemes for select
  using (auth.role() = 'authenticated');

create policy "variable_pay_schemes_write" on variable_pay_schemes for all
  using (is_admin() or has_permission('manage_settings'));

-- 5. Insert the 6 standard schemes from Atelier specification
insert into variable_pay_schemes (name, display_name, department, metrics)
values
(
  'service_captain',
  'Service — Captain',
  'Service',
  '[
    {
      "id": "cap_sales",
      "name": "Monthly Sales Target",
      "weight": 0.40,
      "type": "proportional",
      "direction": "higher",
      "target": 260000,
      "floor": 220000,
      "ceiling": 340000,
      "unit": "₹",
      "scope": "individual",
      "comments": "Individual target - Bill total for the month under captain name"
    },
    {
      "id": "cap_reviews",
      "name": "Named Google Reviews",
      "weight": 0.20,
      "type": "binary",
      "direction": "higher",
      "target": 2,
      "floor": null,
      "ceiling": null,
      "unit": "count",
      "scope": "individual",
      "comments": "Individual target - Name must be mentioned in Google review"
    },
    {
      "id": "cap_pax_avg",
      "name": "Per Customer Average",
      "weight": 0.20,
      "type": "proportional",
      "direction": "higher",
      "target": 350,
      "floor": 350,
      "ceiling": 450,
      "unit": "₹",
      "scope": "individual",
      "comments": "Individual target - Total bill value / number of pax served"
    },
    {
      "id": "cap_grooming",
      "name": "Grooming Scorecard",
      "weight": 0.10,
      "type": "binary",
      "direction": "higher",
      "target": 0.95,
      "floor": null,
      "ceiling": null,
      "unit": "%",
      "scope": "individual",
      "comments": "Individual target - Manager inspection average >= 95%"
    },
    {
      "id": "cap_quality",
      "name": "Service Quality Feedback",
      "weight": 0.10,
      "type": "binary",
      "direction": "higher",
      "target": 0.80,
      "floor": null,
      "ceiling": null,
      "unit": "%",
      "scope": "individual",
      "comments": "Individual target - Guest feedback form service section average >= 80%"
    }
  ]'::jsonb
),
(
  'service_helpers',
  'Service — Helpers / Waiters',
  'Service',
  '[
    {
      "id": "hlp_team_sales",
      "name": "Monthly Team Sales Target",
      "weight": 0.70,
      "type": "proportional",
      "direction": "higher",
      "target": 780000,
      "floor": 700000,
      "ceiling": 860000,
      "unit": "₹",
      "scope": "team",
      "comments": "Team target - Based on total team bill value for the month"
    },
    {
      "id": "hlp_grooming",
      "name": "Grooming Scorecard",
      "weight": 0.20,
      "type": "binary",
      "direction": "higher",
      "target": 0.95,
      "floor": null,
      "ceiling": null,
      "unit": "%",
      "scope": "individual",
      "comments": "Individual target - Manager inspection average >= 95%"
    },
    {
      "id": "hlp_quality",
      "name": "Service Quality Feedback",
      "weight": 0.10,
      "type": "binary",
      "direction": "higher",
      "target": 0.80,
      "floor": null,
      "ceiling": null,
      "unit": "%",
      "scope": "team",
      "comments": "Team target - Guest feedback form service section average >= 80%"
    }
  ]'::jsonb
),
(
  'kitchen',
  'Kitchen Staff & Leads',
  'Kitchen',
  '[
    {
      "id": "kit_food_quality",
      "name": "Food Quality / Consistency",
      "weight": 0.30,
      "type": "binary",
      "direction": "higher",
      "target": 0.80,
      "floor": null,
      "ceiling": null,
      "unit": "%",
      "scope": "team",
      "comments": "Team target - Guest feedback form food quality section >= 80%"
    },
    {
      "id": "kit_prep_time",
      "name": "Preparation Time",
      "weight": 0.20,
      "type": "binary",
      "direction": "lower",
      "target": 20,
      "floor": null,
      "ceiling": null,
      "unit": "mins",
      "scope": "team",
      "comments": "Team target - Average prep time across all dishes <= 20 mins"
    },
    {
      "id": "kit_wastage",
      "name": "Wastage Control",
      "weight": 0.20,
      "type": "binary",
      "direction": "lower",
      "target": 5000,
      "floor": null,
      "ceiling": null,
      "unit": "₹",
      "scope": "team",
      "comments": "Team target - Damage/wastage in Petpooja limited to <= ₹5,000"
    },
    {
      "id": "kit_hygiene",
      "name": "Kitchen Hygiene Scorecard",
      "weight": 0.20,
      "type": "binary",
      "direction": "higher",
      "target": 0.90,
      "floor": null,
      "ceiling": null,
      "unit": "%",
      "scope": "team",
      "comments": "Team target - Manager inspection scorecard average >= 90%"
    },
    {
      "id": "kit_grooming",
      "name": "Grooming Scorecard",
      "weight": 0.10,
      "type": "binary",
      "direction": "higher",
      "target": 0.95,
      "floor": null,
      "ceiling": null,
      "unit": "%",
      "scope": "individual",
      "comments": "Individual target - Manager inspection average >= 95%"
    }
  ]'::jsonb
),
(
  'b2b_counter',
  'B2B Sales + Counter / Customer Care',
  'Customer Care',
  '[
    {
      "id": "b2b_rev",
      "name": "B2B Revenue Target",
      "weight": 0.40,
      "type": "proportional",
      "direction": "higher",
      "target": 20000,
      "floor": 20000,
      "ceiling": 30000,
      "unit": "₹",
      "scope": "individual",
      "comments": "Individual target - Total from B2B customers with GST numbers"
    },
    {
      "id": "b2b_clients",
      "name": "New B2B Clients",
      "weight": 0.20,
      "type": "binary",
      "direction": "higher",
      "target": 1,
      "floor": null,
      "ceiling": null,
      "unit": "count",
      "scope": "individual",
      "comments": "Individual target - At least 1 unique GST client with order > ₹1,000"
    },
    {
      "id": "b2b_returns",
      "name": "Item Return / Debit Notes",
      "weight": 0.20,
      "type": "binary",
      "direction": "lower",
      "target": 22000,
      "floor": null,
      "ceiling": null,
      "unit": "₹",
      "scope": "team",
      "comments": "Team target - Total Debit Note value kept below ₹22,000"
    },
    {
      "id": "b2b_credit",
      "name": "Credit Recovery",
      "weight": 0.10,
      "type": "binary",
      "direction": "higher",
      "target": 1,
      "floor": null,
      "ceiling": null,
      "unit": "status",
      "scope": "individual",
      "comments": "Individual target - No unpaid invoices open over 30 days"
    },
    {
      "id": "b2b_counter_sales",
      "name": "Counter Sales",
      "weight": 0.10,
      "type": "proportional",
      "direction": "higher",
      "target": 450000,
      "floor": 420000,
      "ceiling": 520000,
      "unit": "₹",
      "scope": "team",
      "comments": "Team target - Total counter category sales (excluding Swiggy/Zomato)"
    }
  ]'::jsonb
),
(
  'housekeeping',
  'Housekeeping',
  'Housekeeping',
  '[
    {
      "id": "hk_checklist",
      "name": "Daily Cleaning Checklist",
      "weight": 0.60,
      "type": "binary",
      "direction": "higher",
      "target": 0.80,
      "floor": null,
      "ceiling": null,
      "unit": "%",
      "scope": "individual",
      "comments": "Individual target - On-time cleaning checklist completed >= 80% of month"
    },
    {
      "id": "hk_cleanliness",
      "name": "Cleanliness Feedback",
      "weight": 0.20,
      "type": "binary",
      "direction": "higher",
      "target": 0.80,
      "floor": null,
      "ceiling": null,
      "unit": "%",
      "scope": "team",
      "comments": "Team target - Guest feedback form cleanliness section >= 80%"
    },
    {
      "id": "hk_breakage",
      "name": "Breakage Control",
      "weight": 0.20,
      "type": "binary",
      "direction": "lower",
      "target": 2000,
      "floor": null,
      "ceiling": null,
      "unit": "₹",
      "scope": "team",
      "comments": "Team target - Total crockery/glassware breakage <= ₹2,000"
    }
  ]'::jsonb
),
(
  'accounting',
  'Accounting & Cashier',
  'Admin',
  '[
    {
      "id": "acc_reconciliation",
      "name": "Cash <> Card Reconciliation",
      "weight": 0.50,
      "type": "binary",
      "direction": "higher",
      "target": 0.90,
      "floor": null,
      "ceiling": null,
      "unit": "%",
      "scope": "individual",
      "comments": "Individual target - Cash & card reconciliation variance <= 10%"
    },
    {
      "id": "acc_delivery_sales",
      "name": "Swiggy / Zomato Sales",
      "weight": 0.30,
      "type": "proportional",
      "direction": "higher",
      "target": 650000,
      "floor": 600000,
      "ceiling": 750000,
      "unit": "₹",
      "scope": "individual",
      "comments": "Individual target - Swiggy + Zomato sales total >= ₹6,50,000"
    },
    {
      "id": "acc_gst",
      "name": "GST Timely Filing",
      "weight": 0.20,
      "type": "binary",
      "direction": "higher",
      "target": 1,
      "floor": null,
      "ceiling": null,
      "unit": "status",
      "scope": "individual",
      "comments": "Individual target - GST filings done with 0 delays or late fees"
    }
  ]'::jsonb
)
on conflict (name) do nothing;

-- 6. Insert Company Target & Variable Pay Guide Document
insert into company_documents (title, category, department, doc_type, description, content_html)
select
  'Variable Pay Incentive System & Role Scorecards Guide',
  'targets',
  null,
  'article',
  'Comprehensive guide to Atelier variable pay calculation formulas, role metric weights, qualification floors, and overachievement ceilings.',
  '<h2>1. Variable Pay Policy & Philosophy</h2><p>Atelier’s variable pay incentive program rewards team members and teams who drive business performance, guest satisfaction, operational hygiene, and efficiency. Each employee has an agreed monthly target pool (e.g. ₹1,500/month), evaluated on a monthly pay period basis (20th to 19th).</p><h2>2. Calculation Methodology</h2><p><strong>Binary Criteria (Hit / Miss):</strong> Full weight (100%) awarded if the target is met or exceeded; 0% if missed.</p><p><strong>Proportional Criteria (Scaled Attainment):</strong> Payout is proportional to achievement (<code>Actual / Target</code>). If performance falls below the qualification <em>Floor</em>, 0% is awarded. Overachievement is rewarded up to the specified <em>Ceiling</em> cap.</p><h2>3. Role-Based Schemes</h2><ul><li><strong>Service — Captain:</strong> 40% Monthly Sales (₹2.6L target, ₹2.2L floor, ₹3.4L ceiling), 20% Named Google Reviews (2 count), 20% Per Customer Average (₹350 target), 10% Grooming (95%), 10% Service Quality Feedback (80%).</li><li><strong>Service — Helpers:</strong> 70% Team Monthly Sales (₹7.8L target, ₹7.0L floor, ₹8.6L ceiling), 20% Grooming (95%), 10% Service Quality Feedback (80%).</li><li><strong>Kitchen Staff:</strong> 30% Food Quality Feedback (80%), 20% Preparation Time (<=20 mins), 20% Wastage Control (<=₹5,000), 20% Kitchen Hygiene (90%), 10% Grooming (95%).</li><li><strong>B2B Sales + Counter:</strong> 40% B2B Revenue (₹20k target, ₹30k ceiling), 20% New B2B Clients (>=1), 20% Item Returns/Debits (<=₹22,000), 10% Credit Recovery, 10% Counter Sales (₹4.5L target).</li><li><strong>Housekeeping:</strong> 60% Daily Cleaning Checklist On-Time Completion (>=80%), 20% Cleanliness Feedback (>=80%), 20% Breakage Control (<=₹2,000).</li><li><strong>Accounting & Cashier:</strong> 50% Cash/Card Reconciliation (<=10% variance), 30% Swiggy/Zomato Delivery Sales (₹6.5L target), 20% GST Timely Filing (0 delays).</li></ul><h2>4. Payout and Payslip Itemization</h2><p>Variable pay is itemized by individual metric on monthly payslips with earned amounts and attainment percentages.</p>'
where not exists (select 1 from company_documents where title = 'Variable Pay Incentive System & Role Scorecards Guide');
