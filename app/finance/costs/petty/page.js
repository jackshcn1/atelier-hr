import { redirect } from 'next/navigation';

// The petty cash form moved to its own area: /finance/invoice-entry/petty.
//
// This page is here so that a link from an old bookmark still lands
// somewhere useful. It goes straight on.
export default function OldPettyCashPage() {
  redirect('/finance/invoice-entry/petty');
}
