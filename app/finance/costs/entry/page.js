import { redirect } from 'next/navigation';

// The bill form moved to its own area: /finance/invoice-entry/bill.
//
// This page is here so that a link from an old bookmark still lands
// somewhere useful. It goes straight on.
export default function OldBillEntryPage() {
  redirect('/finance/invoice-entry/bill');
}
