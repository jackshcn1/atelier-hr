-- The restaurant's own Google account, connected to the site.
--
-- A service account cannot store files in Drive — Google gives a service
-- account no storage of its own — so the upload is made as the restaurant's
-- own Google account instead. That account connects once, through Google's
-- own sign-in, and what is kept here is the refresh token that lets the site
-- act as it afterwards.
--
-- The refresh token is a secret. The table has row level security on and no
-- policies, so only the server's service key can read or write it — the
-- browser never sees it, and it is never written to a log.

create table if not exists public.google_drive_tokens (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'google',
  account_email text,
  refresh_token text not null,
  connected_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider)
);

comment on table public.google_drive_tokens is
  'The restaurant''s Google account, connected for invoice uploads — the refresh token only';

alter table public.google_drive_tokens enable row level security;
