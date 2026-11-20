/**
 * scripts/import-invoice-sheet.mjs — pull the accountant's invoice sheet into
 * the books, from this machine.
 *
 * The nightly run does the same thing on the server. This script is for the
 * times it is wanted right now — the first import, a check, or a repair —
 * without waiting for the schedule.
 *
 * Run: node scripts/import-invoice-sheet.mjs
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

import { fetchGoogleSheetsData } from '../lib/googleSheetsService.js';
import { parseInvoiceSheet, writeInvoiceSheet } from '../lib/invoiceSheet.js';

// The handlers read the database address and the service key from the
// environment, so they are loaded the way the server loads them.
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && process.env[match[1]] === undefined) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
}

const spreadsheetId =
  process.env.INVOICE_SHEET_SPREADSHEET_ID || '1_25bZSbaJHkKosX7RZ4_LPgQp_NwSvpTXJUFwBLSeig';
const sheetName = process.env.INVOICE_SHEET_NAME || 'Form Responses 1';
const range = 'A:AZ';

async function main() {
  console.log(`Reading ${spreadsheetId} / ${sheetName} (${range})...`);
  const rows = await fetchGoogleSheetsData({ spreadsheetId, sheetName, range });

  const parsed = parseInvoiceSheet(rows);
  if (!parsed.ok) {
    console.error(`The sheet could not be read: ${parsed.error}`);
    process.exit(1);
  }

  console.log(`${parsed.entries.length} entry(s) on the sheet, ${parsed.skipped.length} row(s) skipped.`);
  for (const row of parsed.skipped) {
    console.log(`  line ${row.line}: ${row.reason}`);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const written = await writeInvoiceSheet(supabase, parsed.entries);
  console.log(
    `\n${written.expensesWritten} bill(s) and ${written.pettyWritten} petty entry(ies) written, ` +
      `${written.expensesUpdated + written.pettyUpdated} updated, ` +
      `${written.unchanged} unchanged, ${written.skippedExisting} already on record.`,
  );

  // What is now in the books, so the run can be checked at a glance.
  const { data, error } = await supabase
    .from('expenses')
    .select('vendor_name, category, amount, invoice_date, payment_status, source')
    .eq('source', 'sheet')
    .order('invoice_date', { ascending: true });
  if (error) throw error;

  console.log(`\nThe sheet's own bills in the books (${data.length}):`);
  for (const row of data) {
    console.log(
      `  ${row.invoice_date}  ${String(row.vendor_name).padEnd(28)} ${String(row.category).padEnd(28)} ` +
        `${Number(row.amount).toLocaleString('en-IN').padStart(12)}  ${row.payment_status}`,
    );
  }
}

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exit(1);
});
