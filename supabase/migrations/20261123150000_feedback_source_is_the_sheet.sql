-- The feedback sheet is the record, again.
--
-- On 23 Nov 2026 the feedback form was moved into the app, and it was first
-- written to write **straight into this table**. The owner asked for the
-- arrangement the accountant's invoice sheet already uses:
--
--   the form writes a row into the sheet → the sheet is pulled into the books
--
-- So the sheet is the record once more, and a row in this table comes from
-- the sheet. `source` says so again.
--
-- The row the app wrote in the meantime — there is none, it was only a
-- verification run and it was removed — is not a case that needs handling.
--
-- What tells a response that came through the app's form from one typed into
-- the sheet by hand is `entered_by`: the sheet's **Recorded By** column. A
-- row typed by hand has none.

ALTER TABLE public.customer_feedback
    ALTER COLUMN source SET DEFAULT 'google_sheet:customer_feedback_form';

COMMENT ON COLUMN public.customer_feedback.source IS
  'Where the response came from: google_sheet:customer_feedback_form — the sheet, which is the record. Whether it was written through the app''s form or typed in by hand is told by entered_by.';

notify pgrst, 'reload schema';
