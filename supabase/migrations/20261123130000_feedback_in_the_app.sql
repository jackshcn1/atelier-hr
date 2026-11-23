-- =====================================================================
-- The customer feedback form moves into the app.
-- =====================================================================
--
-- ## What changed
--
-- The feedback form used to be a **Google Sheet**. A response was typed
-- into it on the floor, and a nightly pull read the sheet into this table.
--
-- The form is now filled in inside the app, and a response is written
-- straight into `customer_feedback` when it is submitted. There is no sheet
-- and no pull.
--
-- ## What this migration adds
--
-- `entered_by` — **who filled the form in.**
--
-- The sheet had one column for a name and it was the *waiter*: the person
-- who served the table. It had no way to say who wrote the row down, and it
-- could not say it at all. So a response typed up from the paper register
-- by the manager, and a response typed by the captain who served the table,
-- were the same row. The waiter is still the waiter; `entered_by` is the
-- pair of hands on the keyboard.
--
-- It is what makes the form *trackable*: a strange entry can be traced
-- back to the person who entered it, and the two are never confused.
--
-- ## The default source changes
--
-- `source` said `google_sheet:customer_feedback_form`, because that is
-- where every row came from. A response entered in the app says
-- `platform`. The rows that came from the sheet keep the sheet's own
-- source, because that is where they really came from — the column records
-- where a number was measured, and a row's history is not rewritten.
--
-- ## Nothing else changes
--
-- No table is dropped and no row is touched. The unique constraint on
-- (bill number, response date) is left exactly as it is: a bill number on
-- its own is not an identity, because Petpooja restarts its numbering.
--
-- The RLS policies are not touched either. The form writes through the
-- service role from the server, and the page reads through it too, so the
-- policies are unchanged by this.
--
-- =====================================================================

-- Who filled the form in.
ALTER TABLE public.customer_feedback
    ADD COLUMN IF NOT EXISTS entered_by TEXT NOT NULL DEFAULT '';

-- A response entered in the app is not from the sheet.
ALTER TABLE public.customer_feedback
    ALTER COLUMN source SET DEFAULT 'platform';

COMMENT ON COLUMN public.customer_feedback.entered_by IS
  'Who filled the form in — the signed-in staff member. The waiter is the person who served the table, which is a different thing: a captain may serve a table and the manager may write the response down.';

COMMENT ON COLUMN public.customer_feedback.source IS
  'Where the response came from: platform (entered in the app) or google_sheet:customer_feedback_form (the sheet, retired on 23 Nov 2026).';

notify pgrst, 'reload schema';
