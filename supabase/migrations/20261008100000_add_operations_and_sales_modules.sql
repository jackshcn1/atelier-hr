-- Operations: Assets
create table assets (
  asset_id bigint generated always as identity primary key,
  name text not null,
  asset_number text not null unique,
  assigned_employee_id text references employees(employee_id) on update cascade on delete set null,
  status text check (status in ('available', 'assigned', 'maintenance', 'retired')) default 'available',
  condition text,
  purchase_date date,
  depreciation_rate numeric default 0,
  last_maintenance_date date,
  created_at timestamptz default now()
);

-- Operations: Maintenance Work Orders
create table maintenance_work_orders (
  work_order_id bigint generated always as identity primary key,
  asset_id bigint references assets(asset_id) on delete cascade,
  title text not null,
  description text,
  status text check (status in ('pending', 'in_progress', 'completed', 'cancelled')) default 'pending',
  priority text check (priority in ('low', 'normal', 'high', 'urgent')) default 'normal',
  scheduled_date date,
  completed_date date,
  technician_name text,
  created_at timestamptz default now()
);

-- Operations: Compliance Licenses
create table compliance_licenses (
  license_id bigint generated always as identity primary key,
  name text not null,
  license_number text,
  expiry_date date,
  status text check (status in ('active', 'expired', 'pending')) default 'active',
  documents_url text,
  created_at timestamptz default now()
);

-- Sales: Daily Data
create table sales_data (
  sale_id bigint generated always as identity primary key,
  date date not null default current_date,
  amount numeric not null default 0,
  source text,
  product_id text,
  employee_id text references employees(employee_id) on update cascade on delete set null,
  created_at timestamptz default now()
);

-- Sales: KPIs
create table sales_kpis (
  kpi_id bigint generated always as identity primary key,
  metric_name text not null,
  value numeric not null default 0,
  date_range daterange,
  created_at timestamptz default now()
);
