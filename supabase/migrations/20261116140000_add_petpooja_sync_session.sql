-- The live Petpooja session, kept between report groups.
--
-- The nightly run is split into ten serverless calls. Petpooja keeps the
-- login in cookies and the session stays alive on its side long after the
-- browser is gone, and it turns away a login that comes from an address it
-- does not recognise as the one holding that session. Serverless invocations
-- do not share an egress address, so without a session to hand over, every
-- group after the first is refused.
--
-- The session is therefore stored here, so any group can pick it up - and so
-- a run that is killed half way does not leave the account holding a session
-- that turns away tomorrow's run.
--
-- One row only. The cookies are a live credential: this table is read and
-- written by the sync engine alone, through the service role, and is never
-- exposed to the browser.
CREATE TABLE IF NOT EXISTS public.petpooja_sync_session (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    cookies JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT petpooja_sync_session_single_row CHECK (id = 1)
);

ALTER TABLE public.petpooja_sync_session ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.petpooja_sync_session IS
  'The live Petpooja session cookies, handed from one report group to the next. Service-role only.';
