/**
 * scripts/setup-invoice-sheet.mjs — prepare the accountant's invoice sheet.
 *
 * The sheet is a Google Form's response sheet, and its questions do not hold
 * everything the books need. Three columns are added to the tab:
 *
 *   Supplier        who the bill was paid to. The Form has no supplier
 *                   question for the variable and fixed blocks, so the
 *                   accountant fills this in on the sheet — including for the
 *                   entries that are already there.
 *   Entry ID        the row's own identity. The site's entry form writes it,
 *                   and it is what lets a corrected entry be found again.
 *   Invoice Number  the invoice number, when there is one.
 *
 * The columns are added at the end of the tab, so they do not move the
 * Form's own columns. The importer finds every column by its heading, so
 * where they sit does not matter — only that the heading is there.
 *
 * Run: node scripts/setup-invoice-sheet.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';

import { SHEET_EXTRA_COLUMNS } from '../lib/invoiceSheet.js';

const here = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(here, 'petpooja-config.json');
const LOCAL_KEY_PATH = join(here, 'google-service-account.json');

const SPREADSHEET_ID =
  process.env.INVOICE_SHEET_SPREADSHEET_ID || '1_25bZSbaJHkKosX7RZ4_LPgQp_NwSvpTXJUFwBLSeig';
const SHEET_NAME = process.env.INVOICE_SHEET_NAME || 'Form Responses 1';

/** The service account's credentials, from wherever they are. */
function loadCredentials() {
  const config = existsSync(CONFIG_PATH) ? readFileSync(CONFIG_PATH, 'utf8') : '';
  let file = {};
  try {
    file = config ? JSON.parse(config) : {};
  } catch {
    file = {};
  }

  const inline = process.env.GOOGLE_PRIVATE_KEY;
  if (inline) {
    return { email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || file.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: inline.replace(/\\n/g, '\n') };
  }

  if (existsSync(LOCAL_KEY_PATH)) {
    const parsed = JSON.parse(readFileSync(LOCAL_KEY_PATH, 'utf8'));
    return {
      email: parsed.client_email,
      key: String(parsed.private_key || '').replace(/\\n/g, '\n'),
    };
  }

  const configured = process.env.GOOGLE_PRIVATE_KEY_PATH || file.GOOGLE_PRIVATE_KEY_PATH;
  if (configured) {
    return { email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || file.GOOGLE_SERVICE_ACCOUNT_EMAIL, keyFile: configured };
  }

  throw new Error(
    `No Google service account credentials found.\n` +
      `   Expected the PEM in GOOGLE_PRIVATE_KEY, a key file at\n` +
      `   ${LOCAL_KEY_PATH}, or GOOGLE_PRIVATE_KEY_PATH in ${CONFIG_PATH}`,
  );
}

function columnLetter(index) {
  let s = '';
  let x = index;
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

async function main() {
  const credentials = loadCredentials();
  if (!credentials.email) throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL is not set.');

  const options = { email: credentials.email, scopes: ['https://www.googleapis.com/auth/spreadsheets'] };
  if (credentials.key) options.key = credentials.key;
  if (credentials.keyFile) options.keyFile = credentials.keyFile;
  const sheets = google.sheets({ version: 'v4', auth: new google.auth.JWT(options) });

  console.log(`Spreadsheet: ${SPREADSHEET_ID}`);
  console.log(`Tab:         ${SHEET_NAME}\n`);

  // The headings, and how many columns are in use.
  const head = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A1:AZ1`,
  });
  const headings = (head.data.values?.[0] || []).map((cell) => String(cell ?? '').trim());

  let lastUsed = 0;
  headings.forEach((text, i) => {
    if (text) lastUsed = i + 1;
  });
  console.log(`Headings (${lastUsed} in use):`);
  headings.forEach((text, i) => {
    if (text) console.log(`  ${columnLetter(i + 1)}  ${text}`);
  });
  console.log('');

  // Which of our columns are already there?
  const wanted = SHEET_EXTRA_COLUMNS.filter((name) => !headings.includes(name));
  if (wanted.length === 0) {
    console.log('The sheet already has every column this system needs.');
  } else {
    const start = lastUsed;

    // One row of columns, not a column of rows.
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!${columnLetter(start + 1)}:${columnLetter(start + wanted.length)}`,
      valueInputOption: 'RAW',
      requestBody: { values: [wanted] },
    });

    console.log('Added:');
    wanted.forEach((name, i) => console.log(`  ${columnLetter(start + i + 1)}  ${name}`));
  }

  // A stray copy of a heading sitting under the heading is left over from a
  // write that went down the column instead of across the row. It would be
  // read as a supplier, so it is cleared — but only when it is one of our
  // own column names, so real data is never touched.
  const stray = [];
  for (let i = 0; i < SHEET_EXTRA_COLUMNS.length; i += 1) {
    const name = SHEET_EXTRA_COLUMNS[i];
    const at = headings.indexOf(name);
    if (at === -1) continue;
    const column = columnLetter(at + 1);
    const under = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!${column}2:${column}50`,
    });
    const hits = (under.data.values || [])
      .map((row, i) => [String((row || [])[0] ?? '').trim(), i + 2])
      .filter(([text]) => SHEET_EXTRA_COLUMNS.includes(text));
    for (const [, line] of hits) {
      stray.push(`${column}${line}`);
    }
  }

  if (stray.length > 0) {
    await sheets.spreadsheets.values.batchClear({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { ranges: stray.map((cell) => `${SHEET_NAME}!${cell}`) },
    });
    console.log(`\nCleared a stray heading: ${stray.join(', ')}`);
  }

  // The importer needs a range wide enough for every column.
  const end = columnLetter(Math.max(lastUsed, 22));
  console.log(`\nSet these on the server:`);
  console.log(`  INVOICE_SHEET_SPREADSHEET_ID=${SPREADSHEET_ID}`);
  console.log(`  INVOICE_SHEET_NAME="${SHEET_NAME}"`);
  console.log(`  INVOICE_SHEET_RANGE=A:${end}`);
}

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exit(1);
});
