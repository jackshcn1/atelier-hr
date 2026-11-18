-- The invoice itself, for a bill typed in by hand.
--
-- A bill can have the invoice attached to it — a PDF or a photograph of it.
-- The file lives in the restaurant's own Drive folder, and the bill keeps the
-- link to it, so the bill and its invoice are found together.
--
-- The sheet's own entries keep their invoice link in `bank_reference`, which
-- is where the importer puts the attachment column. This column is the same
-- idea for a bill typed in by hand, with its own name.
--
-- The link is only ever a link — the file itself is on Drive, not here.

alter table public.expenses
  add column if not exists invoice_attachment text;

comment on column public.expenses.invoice_attachment is
  'The link to the invoice itself — a PDF or a photograph, on Drive';
