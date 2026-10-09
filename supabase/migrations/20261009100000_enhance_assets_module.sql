-- 1. Asset Categories
create table asset_categories (
  id bigint generated always as identity primary key,
  name text not null unique,
  prefix text not null unique,
  created_at timestamptz default now()
);

-- 2. Asset Types
create table asset_types (
  id bigint generated always as identity primary key,
  name text not null unique,
  prefix text not null unique,
  category text references asset_categories(name) on update cascade on delete cascade,
  created_at timestamptz default now()
);

-- 3. Asset Locations
create table asset_locations (
  id bigint generated always as identity primary key,
  name text not null unique,
  created_at timestamptz default now()
);

-- 4. Vendors
create table vendors (
  id bigint generated always as identity primary key,
  name text not null unique,
  description text,
  categories_provided jsonb default '[]'::jsonb,
  contact_person text,
  email text,
  phone text,
  website text,
  rating numeric default 0,
  defect_rate numeric default 0,
  on_time_delivery_rate numeric default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 5. Update Assets table with more fields
alter table assets add column if not exists brand text;
alter table assets add column if not exists model_name text;
alter table assets add column if not exists serial_number text unique;
alter table assets add column if not exists vendor_id bigint references vendors(id);
alter table assets add column if not exists purchase_price numeric;
alter table assets add column if not exists warranty_months integer default 0;
alter table assets add column if not exists warranty_till date;
alter table assets add column if not exists extended_warranty boolean default false;
alter table assets add column if not exists extended_warranty_months integer default 0;
alter table assets add column if not exists warranty_contact text;
alter table assets add column if not exists invoice_url text;
alter table assets add column if not exists is_new boolean default true;
alter table assets add column if not exists location text references asset_locations(name);
alter table assets add column if not exists notes text;
alter table assets add column if not exists depreciation_method text default 'straight_line';
alter table assets add column if not exists useful_life_years integer;
alter table assets add column if not exists qr_code_url text;

-- 6. Asset Audit Log
create table asset_audit_log (
  id bigint generated always as identity primary key,
  asset_id bigint references assets(asset_id) on delete cascade,
  action text not null, -- 'assigned', 'status_change', 'maintenance', etc.
  performed_by text,
  previous_value text,
  new_value text,
  notes text,
  created_at timestamptz default now()
);

-- 7. Asset Maintenance Records (enhanced)
alter table maintenance_work_orders add column if not exists labor_cost numeric default 0;
alter table maintenance_work_orders add column if not exists parts_cost numeric default 0;
alter table maintenance_work_orders add column if not exists service_report_url text;

-- Seed initial data
insert into asset_categories (name, prefix) values
('Kitchen Equipment', 'KE'),
('Furniture', 'FU'),
('Uniform', 'UN'),
('Electronics', 'EL');

insert into asset_types (name, prefix, category) values
('Chiller', 'CH', 'Kitchen Equipment'),
('Freezer', 'FR', 'Kitchen Equipment'),
('Table', 'TA', 'Furniture'),
('Chair', 'CH', 'Furniture'),
('Staff Uniform', 'SU', 'Uniform');

insert into asset_locations (name) values
('Kitchen'),
('Restaurant'),
('Office'),
('Sales Counter'),
('Storage');
