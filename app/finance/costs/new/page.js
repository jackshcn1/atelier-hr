import { redirect } from 'next/navigation';

// The expense form moved to its own area: /finance/invoice-entry/expense.
//
// This page is here so that a link from an old bookmark still lands
// somewhere useful. It goes straight on.
export default function OldNewExpensePage() {
  redirect('/finance/invoice-entry/expense');
}
