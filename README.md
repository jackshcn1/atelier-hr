# Atelier HR — Phase 1 (Employee records + org chart + login)

## What's in this phase
- Login (accounts created by you in Supabase directly, no public sign-up)
- Employee list + add employee
- Employee detail page: edit, salary history log, track record (notes/warnings/merits)
- Org chart (auto-generated from each employee's manager)
- Department-scoped access already enforced at the database level

## Deploy steps

### 1. Supabase (the database)
1. Go to supabase.com, sign up free, create a new project.
2. Open the **SQL Editor** tab → New query → paste in the entire contents of `supabase-schema.sql` from this project → Run.
3. Go to **Project Settings → API** — copy the **Project URL** and the **anon public** key. You'll need these in step 3.
4. Go to **Authentication → Users → Add user** to create your own login (and later, one per department head).
5. Go to the **Table Editor → profiles** table and add a row for yourself: `id` = your new user's ID (copy from the Users list), `role` = `admin`.
6. In **Table Editor → departments**, add your department names (e.g. Kitchen, Service, Accounts) — employees can't be assigned to a department that doesn't exist here yet.

### 2. GitHub (to hand the code to Vercel)
1. Go to github.com, sign up free, create a new repository (e.g. `atelier-hr`).
2. On the repo page, use "Add file → Upload files" and drag in every file and folder from this project, keeping the folder structure intact.
3. Commit.

### 3. Vercel (hosting)
1. Go to vercel.com, sign up free (you can sign up with your GitHub account directly).
2. New Project → import the `atelier-hr` repo.
3. Before deploying, open **Environment Variables** and add:
   - `NEXT_PUBLIC_SUPABASE_URL` = the Project URL from Supabase
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the anon key from Supabase
4. Click Deploy. You'll get a live link like `atelier-hr.vercel.app`.

### 4. Try it
- Open the live link → Log in with the account you created in step 1.4.
- Add a department head: create their login in Supabase Authentication, then add their `profiles` row with `role = department_head` and their `department` filled in. They'll only see employees in that department.

If anything errors, copy the exact message (or a screenshot) back into the chat and I'll send you an updated file to re-upload.

## Migration: exit_reason column
If your Supabase database was set up before this update, run this once in the SQL Editor to add the new column (a fresh database created from the current `supabase-schema.sql` already has it):

```sql
alter table employees add column exit_reason text
  check (exit_reason in ('resigned','absconding','terminated_disciplinary','terminated_admin'));
```

## Migration: payroll split (basic+DA / HRA / other allowances)
If your database already existed before this update, run this once:

```sql
alter table salary_history add column basic_da numeric;
alter table salary_history add column hra numeric;
alter table salary_history add column other_allowances numeric;

create table payroll_settings (
  id int primary key default 1,
  basic_da_floor numeric not null default 18000,
  hra_split_percent numeric not null default 50,
  updated_at timestamptz default now(),
  constraint single_row check (id = 1)
);
insert into payroll_settings (id) values (1);

alter table payroll_settings enable row level security;
create policy "payroll_settings_admin" on payroll_settings for all using (is_admin());
```

Then visit `/settings` in the app (admin login only) to confirm or adjust the ₹18,000 floor and the HRA split percentage — check this against the current Kerala minimum wage notification for your staff's grade periodically, since it's revised quarterly with the DA component.

## Migration: deposits + onboarding document
If your database already existed before this update, run this once:

```sql
create table company_policies (
  id int primary key default 1,
  guidelines_text text default 'Company guidelines go here — edit in Settings.',
  leave_policy_text text default 'Leave policy goes here — edit in Settings.',
  notice_period_text text default 'Notice period terms go here — edit in Settings.',
  updated_at timestamptz default now(),
  constraint single_row check (id = 1)
);
insert into company_policies (id) values (1);

create table deposit_settings (
  id int primary key default 1,
  uniform_deposit_amount numeric not null default 0,
  accommodation_deposit_amount numeric not null default 0,
  updated_at timestamptz default now(),
  constraint single_row check (id = 1)
);
insert into deposit_settings (id) values (1);

create table employee_deposits (
  id bigint generated always as identity primary key,
  employee_id text references employees(employee_id) on delete cascade,
  deposit_type text check (deposit_type in ('uniform','accommodation')),
  amount numeric not null,
  date_recorded date default current_date
);

alter table company_policies enable row level security;
alter table deposit_settings enable row level security;
alter table employee_deposits enable row level security;

create policy "company_policies_read" on company_policies for select using (true);
create policy "company_policies_write" on company_policies for all using (is_admin());
create policy "deposit_settings_admin" on deposit_settings for all using (is_admin());
create policy "employee_deposits_all" on employee_deposits for all
  using (is_admin() or exists (
    select 1 from employees e where e.employee_id = employee_deposits.employee_id
    and e.department = my_department()
  ));
```

After running this, go to `/settings` and fill in your actual company guidelines, leave policy, notice period text, and the real deposit amounts — the defaults are just placeholders.

## Migration: resignation letters, work certificate, exit clearance
If your database already existed before this update, run this once:

```sql
insert into storage.buckets (id, name, public) values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "documents_bucket_insert" on storage.objects for insert
  to authenticated with check (bucket_id = 'documents');
create policy "documents_bucket_select" on storage.objects for select
  to authenticated using (bucket_id = 'documents');
create policy "documents_bucket_update" on storage.objects for update
  to authenticated using (bucket_id = 'documents');
create policy "documents_bucket_delete" on storage.objects for delete
  to authenticated using (bucket_id = 'documents');
```

This creates a private file storage area (a "bucket" called `documents`) inside Supabase — separate from your database tables, this is where actual uploaded files (like resignation letters) live. Right now any logged-in user can upload/view files in it; a known refinement for later is scoping this by department the same way employee records are.

What's new in this update:
- Resignation letter upload, shown on the employee page once status is "On notice" or "Exited".
- An "Assets & exit clearance" section — add any asset issued to an employee, check it off when returned, track uniform return, and see an overall clearance status.
- Two new printable pages per employee: a work certificate and a full exit clearance form (assets, uniform, deposits held, clearance status, signature lines).

## No migration needed for this update
Training, document templates, general documents, and export use tables that were already in the original schema — this update is UI-only. Just update the code files on GitHub:
`app/layout.js`, `app/employees/[id]/page.js`, new `app/settings/document-templates/page.js`, new `app/export/page.js`.

What's new:
- **Document templates** (`/settings/document-templates`, admin only) — define required/optional paperwork per department. Each employee's page now shows a checklist against their department's templates and flags anything missing.
- **Documents** section on the employee page — upload any document type (CV, ID proof, signed forms), matched against the templates checklist.
- **Training** section on the employee page — add trainings and track not-started / in-progress / completed status.
- **Export** (`/export`) — CSV download of employees, salary history, track record, training, documents (metadata only, not the files), deposits, exit records, and departments. Department heads only export what they can already see.

## Migration: payroll (Petpooja import)
If your database already existed before this update, run this once:

```sql
alter table employees add column petpooja_employee_code text;
alter table employees add column standard_hours_per_day numeric not null default 10;
```

Also make sure `package.json` on GitHub is updated (it now lists the `xlsx` library used to parse the Petpooja file) — Vercel installs it automatically on the next deploy.

### Using the payroll page
1. For every employee, open their page → "Payroll info" → set their Petpooja employee code (the numeric ID Petpooja uses for them) and their standard hours/day (10 for everyone by default, except anyone like Nayana on a 9-hour day).
2. Go to `/payroll`, set the pay period (20th of the previous month to 19th of the current month), upload the Petpooja attendance export, and click Calculate.
3. Review the table — anyone who joined mid-period is flagged in yellow for manual review. You can directly override "Total paid days" for any correction; fixed pay recalculates instantly.
4. Enter variable pay per employee manually (targets-based calculation is a future refinement).
5. Click Finalize to save the run permanently. Nothing is written to the database until this step.

The calculation follows exactly the formula we confirmed: per-day salary = fixed salary ÷ total days in period; effective days = hours worked ÷ standard hours/day (rounded, capped at days present); weekly offs lost in blocks of 7 days of absence beyond the 4-day allowance, starting at 5 extra absent days.

## Migration: employee deletion (soft delete + audit + restore)
If your database already existed before this update, run this once:

```sql
alter table employees add column deleted_at timestamptz;

create or replace function guard_employee_delete_toggle() returns trigger as $$
begin
  if NEW.deleted_at is distinct from OLD.deleted_at and not is_admin() then
    raise exception 'Only admins can delete or restore an employee';
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

create trigger employees_delete_guard
before update on employees
for each row execute function guard_employee_delete_toggle();
```

What's new: a "Delete employee" section at the bottom of each employee's page (admin only — type CONFIRM to enable the button). Deleting doesn't actually erase the record — it's hidden from every list, dropdown, org chart, and export, but their salary/track-record history stays intact in the database. Every delete and restore is logged to the audit log. Recover a deleted employee from the new "Deleted" link on the Employees page.

## Migration: unify Employee ID with Petpooja code
If your database already existed before this update, run this once. It adds ON UPDATE CASCADE to every foreign key pointing at employees, so an employee's ID can safely be changed later without breaking their linked history — then drops the now-unused petpooja_employee_code column.

```sql
alter table employees drop column if exists petpooja_employee_code;

alter table employees drop constraint employees_reporting_manager_id_fkey;
alter table employees add constraint employees_reporting_manager_id_fkey
  foreign key (reporting_manager_id) references employees(employee_id) on update cascade;

alter table salary_history drop constraint salary_history_employee_id_fkey;
alter table salary_history add constraint salary_history_employee_id_fkey
  foreign key (employee_id) references employees(employee_id) on update cascade on delete cascade;

alter table track_record drop constraint track_record_employee_id_fkey;
alter table track_record add constraint track_record_employee_id_fkey
  foreign key (employee_id) references employees(employee_id) on update cascade on delete cascade;

alter table documents drop constraint documents_employee_id_fkey;
alter table documents add constraint documents_employee_id_fkey
  foreign key (employee_id) references employees(employee_id) on update cascade on delete cascade;

alter table training_records drop constraint training_records_employee_id_fkey;
alter table training_records add constraint training_records_employee_id_fkey
  foreign key (employee_id) references employees(employee_id) on update cascade on delete cascade;

alter table payroll_line_items drop constraint payroll_line_items_employee_id_fkey;
alter table payroll_line_items add constraint payroll_line_items_employee_id_fkey
  foreign key (employee_id) references employees(employee_id) on update cascade;

alter table exit_records drop constraint exit_records_employee_id_fkey;
alter table exit_records add constraint exit_records_employee_id_fkey
  foreign key (employee_id) references employees(employee_id) on update cascade on delete cascade;

alter table employee_deposits drop constraint employee_deposits_employee_id_fkey;
alter table employee_deposits add constraint employee_deposits_employee_id_fkey
  foreign key (employee_id) references employees(employee_id) on update cascade on delete cascade;
```

**If a constraint name above doesn't match your database** (Postgres sometimes auto-names them slightly differently), open Supabase → Database → Tables → the relevant table → look at its foreign keys to find the actual constraint name, and substitute it in.

### What changed
- No more separate "Petpooja employee code" field. An employee's **Employee ID** in this app IS their Petpooja code — enter it exactly as Petpooja generated it when adding someone.
- For employees already in the system with old-style IDs (like `EMP-0001`), go to their page → "Payroll info" → "Update Employee ID" and enter their real Petpooja code. This renames their ID everywhere at once (salary history, documents, everything stays linked) and is logged to the audit log.
- The payroll import now matches directly against Employee ID.
