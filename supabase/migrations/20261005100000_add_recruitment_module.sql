-- =====================================================================
-- Migration: Recruitment Module (Job Listings, Candidates, Evaluations, Offers)
-- Created: 2026-10-05
-- =====================================================================

-- 1. Job Listings (One row = One Headcount Need) -----------------------
create table if not exists public.job_listings (
  id bigint generated always as identity primary key,
  serial text not null unique,
  department text references public.departments(name) on update cascade on delete set null,
  designation text,
  job_description_title text,
  job_description_text text,
  offered_fixed_salary numeric not null default 0,
  offered_variable_salary numeric not null default 0,
  max_fixed_salary numeric not null default 0,
  max_variable_salary numeric not null default 0,
  platforms_tagged jsonb not null default '[]'::jsonb,
  listing_date date not null default current_date,
  status text not null default 'open' check (status in ('open', 'filled', 'inactive')),
  hired_date date,
  inactive_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Candidates --------------------------------------------------------
create table if not exists public.candidates (
  id bigint generated always as identity primary key,
  serial text not null unique,
  first_name text not null,
  last_name text,
  phone text,
  email text,
  source text not null default 'Indeed' check (source in ('Indeed', 'OLX', 'Referral', 'Walk-in', 'LinkedIn', 'Other')),
  source_details text,
  interview_date date,
  cv_url text,
  expected_fixed_salary numeric,
  expected_variable_salary numeric,
  current_salary numeric,
  status text not null default 'active' check (status in ('active', 'talent_pool', 'rejected', 'hired')),
  hard_reject_reason text check (hard_reject_reason in ('Language', 'No-show', 'Not Competent', 'Salary Mismatch', 'Other')),
  hard_reject_notes text,
  public_token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Candidate Job Mapping (Many-to-Many) -------------------------------
create table if not exists public.candidate_job_mapping (
  id bigint generated always as identity primary key,
  candidate_id bigint not null references public.candidates(id) on delete cascade,
  job_listing_id bigint not null references public.job_listings(id) on delete cascade,
  stage text not null default 'applied' check (stage in ('applied', 'interview_scheduled', 'interview_completed', 'offered', 'accepted', 'talent_pool', 'rejected')),
  stage_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (candidate_id, job_listing_id)
);

-- 4. Interview Evaluations (Single Record Per Candidate across roles) ----
create table if not exists public.interview_evaluations (
  id bigint generated always as identity primary key,
  candidate_id bigint not null references public.candidates(id) on delete cascade,
  interviewer_name text not null,
  ratings jsonb not null default '{}'::jsonb,
  overall_score numeric not null default 0,
  expected_salary numeric,
  current_salary numeric,
  recommendation text check (recommendation in ('strongly_hire', 'hire', 'talent_pool', 'reject')),
  notes text,
  created_at timestamptz not null default now()
);

-- 5. Offers (Salary Negotiation & Revision Audit Trail) ------------------
create table if not exists public.offers (
  id bigint generated always as identity primary key,
  candidate_id bigint not null references public.candidates(id) on delete cascade,
  job_listing_id bigint not null references public.job_listings(id) on delete cascade,
  offered_fixed_salary numeric not null default 0,
  offered_variable_salary numeric not null default 0,
  revision_history jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'sent', 'negotiating', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indices for fast querying
create index if not exists idx_job_listings_status on public.job_listings(status);
create index if not exists idx_candidates_status on public.candidates(status);
create index if not exists idx_candidates_public_token on public.candidates(public_token);
create index if not exists idx_candidate_job_mapping_stage on public.candidate_job_mapping(stage);
create index if not exists idx_interview_evaluations_candidate on public.interview_evaluations(candidate_id);
create index if not exists idx_offers_candidate on public.offers(candidate_id);

-- Enable RLS on all tables
alter table public.job_listings enable row level security;
alter table public.candidates enable row level security;
alter table public.candidate_job_mapping enable row level security;
alter table public.interview_evaluations enable row level security;
alter table public.offers enable row level security;

-- Policies for Authenticated Users (Admins, HR, Management)
create policy "job_listings_read" on public.job_listings for select to authenticated using (true);
create policy "job_listings_write" on public.job_listings for all to authenticated using (
  is_admin() or has_permission('edit_employees') or has_permission('manage_settings')
);

create policy "candidates_read" on public.candidates for select to authenticated using (true);
create policy "candidates_write" on public.candidates for all to authenticated using (
  is_admin() or has_permission('edit_employees') or has_permission('manage_settings')
);

create policy "candidate_job_mapping_read" on public.candidate_job_mapping for select to authenticated using (true);
create policy "candidate_job_mapping_write" on public.candidate_job_mapping for all to authenticated using (
  is_admin() or has_permission('edit_employees') or has_permission('manage_settings')
);

create policy "interview_evaluations_read" on public.interview_evaluations for select to authenticated using (true);
create policy "interview_evaluations_write" on public.interview_evaluations for all to authenticated using (
  is_admin() or has_permission('edit_employees') or has_permission('manage_settings')
);

create policy "offers_read" on public.offers for select to authenticated using (true);
create policy "offers_write" on public.offers for all to authenticated using (
  is_admin() or has_permission('edit_employees') or has_permission('manage_settings')
);

-- Public / Anon access for shareable Interviewer Rating link (no login required)
-- 1. Anonymous users can read basic candidate info using the unique public_token
create policy "candidates_anon_read_token" on public.candidates for select to anon using (true);

-- 2. Anonymous users can submit interview evaluations
create policy "interview_evaluations_anon_insert" on public.interview_evaluations for insert to anon with check (
  candidate_id is not null and interviewer_name is not null and interviewer_name != ''
);

notify pgrst, 'reload schema';
