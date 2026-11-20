import { redirect } from 'next/navigation';

// The bill form is now one page: /finance/invoice-entry.
//
// This page is here so that a link from an old bookmark still lands
// somewhere useful. It goes straight on.
export default function OldNewExpensePage() {
  redirect('/finance/invoice-entry');
}
