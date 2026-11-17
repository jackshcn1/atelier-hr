-- A purchase return must reduce the cost of purchases.
--
-- The purchase returns were stored as `amount = X, debit_note = X`. That
-- reads as "an expense of X, of which X is a debit note" — and every
-- figure was then read as `amount - debit_note`, which came out at zero.
-- So a return had no effect at all: the goods that went back to the
-- supplier were still counted as a cost.
--
-- For November 2026 that was ₹16,388 of purchases counted twice over, and
-- ₹29,443 across the whole book.
--
-- The convention from here on is:
--
--   amount      what the document is worth
--   debit_note  a credit against it — a return, a discount, a note
--
-- A purchase invoice is `amount = X, debit_note = 0`, so it costs X.
-- A purchase return is `amount = 0, debit_note = X`, so it costs -X and
-- reduces what is owed to that supplier by X.
--
-- Nothing is deleted. The invoice number, the date and the vendor stay as
-- they are, so the return still shows in the ledger as a credit note.

update public.expenses
set amount = 0
where debit_note is not null
  and debit_note > 0
  and amount <> 0;
