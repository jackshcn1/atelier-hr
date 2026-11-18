// Google Sheets access for the customer feedback feed and for the
// accountant's invoice sheet.
//
// Uses a service account — no interactive OAuth, so this runs unattended.
//
// The key can be given three ways:
//
//   GOOGLE_PRIVATE_KEY       the PEM **content** (preferred on Vercel, which
//                            has no file to point at)
//   GOOGLE_PRIVATE_KEY_PATH  the path to a key file (used on a local machine)
//   scripts/google-service-account.json — the JSON key Google Cloud downloads,
//                            found on its own on a machine that has it
//
// A PEM that was pasted into an environment variable arrives with its
// newlines written as the two characters `\n`, so it is put back before use.

import { google } from 'googleapis';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// The key file Google Cloud downloads, on a machine that has it.
const LOCAL_KEY_PATH = join(here, '..', 'scripts', 'google-service-account.json');

// Read and write. The reading side is the nightly pull; the writing side is
// the site's expense form, which puts a row into the sheet so the sheet stays
// the place an amount is written.
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

/**
 * The service account's credentials, from whichever of the settings is in use.
 *
 * A key file is two different things:
 *
 *   - the **JSON** key Google Cloud downloads — it holds `client_email` and
 *     `private_key` inside it, and the private key's newlines are written as
 *     the two characters `\n`;
 *   - a **PEM** file — the bare private key.
 *
 * The JSON one is read out of the file, because it is not a PEM and cannot be
 * handed to the auth library as one.
 *
 * @returns {{email: string, key: string} | {email: string, keyFile: string}}
 */
function serviceAccountCredentials() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const inlineKey = process.env.GOOGLE_PRIVATE_KEY;
  const keyPath = process.env.GOOGLE_PRIVATE_KEY_PATH || (existsSync(LOCAL_KEY_PATH) ? LOCAL_KEY_PATH : null);

  if (inlineKey) {
    if (!email) throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL is not set.');
    // The newlines of a PEM that was pasted into an environment variable
    // arrive as the two characters \ and n.
    const key = inlineKey.replace(/\\n/g, '\n');
    if (!key.includes('BEGIN PRIVATE KEY')) {
      throw new Error('GOOGLE_PRIVATE_KEY does not look like a PEM private key.');
    }
    return { email, key };
  }

  if (!keyPath) {
    throw new Error('GOOGLE_PRIVATE_KEY or GOOGLE_PRIVATE_KEY_PATH must be set.');
  }
  if (!existsSync(keyPath)) {
    throw new Error(`Service account key file not found at: ${keyPath}`);
  }

  // The JSON key, if that is what it is.
  const raw = readFileSync(keyPath, 'utf8');
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  if (parsed && parsed.private_key) {
    return {
      email: parsed.client_email || email,
      key: String(parsed.private_key).replace(/\\n/g, '\n'),
    };
  }

  // A bare PEM file.
  if (!email) throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL is not set.');
  return { email, keyFile: keyPath };
}

export async function fetchGoogleSheetsData({ spreadsheetId, sheetName, range }) {
  if (!spreadsheetId) throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID is not set.');

  const credentials = serviceAccountCredentials();

  const auth = new google.auth.JWT({
    ...credentials,
    scopes: [SCOPES]
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName || 'Sheet1'}!${range || 'A:K'}`
  });

  return res.data.values || [];
}

/**
 * Append one row to a sheet.
 *
 * The sheet stays the place an amount is written — the site's expense form
 * puts a row here, and the nightly pull reads it back into the books. So the
 * writing side needs more than the reading side, which is why the scope is
 * read-and-write.
 *
 * @param {{spreadsheetId: string, sheetName?: string, range?: string, row: (string|number)[]}} input
 * @returns {Promise<{updatedRange: string, updatedRows: number}>}
 */
export async function appendGoogleSheetRow({ spreadsheetId, sheetName, range, row }) {
  if (!spreadsheetId) throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID is not set.');
  if (!Array.isArray(row) || row.length === 0) {
    throw new Error('A row is needed — an array of cell values.');
  }

  const credentials = serviceAccountCredentials();

  const auth = new google.auth.JWT({
    ...credentials,
    scopes: [SCOPES]
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName || 'Sheet1'}!${range || 'A:K'}`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] }
  });

  return {
    updatedRange: res.data.updates?.updatedRange || '',
    updatedRows: res.data.updates?.updatedRows ?? 1,
  };
}

/**
 * Append one row to a sheet, with the cells placed by **heading**.
 *
 * The sheet is a Form's response sheet, and a Form may add a question — which
 * moves the columns. So the row is built from the headings that are actually
 * there, not from fixed positions: the heading is looked up, and the value is
 * put in that column.
 *
 * @param {{
 *   spreadsheetId: string,
 *   sheetName?: string,
 *   fields: Record<string, string|number>,
 *   required?: string[],
 * }} input
 * @returns {Promise<{updatedRange: string, updatedRows: number, unmatched: string[]}>}
 */
export async function appendGoogleSheetRowByHeading({ spreadsheetId, sheetName, fields, required = [] }) {
  if (!spreadsheetId) throw new Error('A spreadsheet id is needed.');
  if (!fields || Object.keys(fields).length === 0) {
    throw new Error('There is nothing to write.');
  }

  const credentials = serviceAccountCredentials();
  const auth = new google.auth.JWT({ ...credentials, scopes: [SCOPES] });
  const sheets = google.sheets({ version: 'v4', auth });
  const tab = sheetName || 'Sheet1';

  // The headings, and how wide the sheet is.
  const head = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties',
  });
  const properties = (head.data.sheets || []).map((s) => s.properties);
  const target = properties.find((p) => p.title === tab) || properties[0];
  if (!target) throw new Error(`The sheet has no tab called "${tab}".`);

  const headingRange = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${target.title}!A1:AZ1`,
  });
  const headings = (headingRange.data.values?.[0] || []).map((cell) =>
    String(cell ?? '').trim().toLowerCase(),
  );

  // The row, with each value in the column its heading names.
  const width = Math.max(target.gridProperties?.columnCount || 0, headings.length, 26);
  const row = new Array(width).fill('');
  const unmatched = [];

  for (const [heading, value] of Object.entries(fields)) {
    if (value === null || value === undefined || value === '') continue;
    const at = headings.indexOf(heading.trim().toLowerCase());
    if (at === -1) {
      unmatched.push(heading);
      continue;
    }
    row[at] = value;
  }

  const missing = required.filter(
    (heading) => !headings.includes(heading.trim().toLowerCase()),
  );
  if (missing.length > 0) {
    throw new Error(`The sheet has no column for: ${missing.join(', ')}.`);
  }

  const res = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${target.title}!A1:AZ1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });

  return {
    updatedRange: res.data.updates?.updatedRange || '',
    updatedRows: res.data.updates?.updatedRows ?? 1,
    unmatched,
  };
}

/**
 * An authenticated Sheets client.
 *
 * The functions above cover reading and writing. This is for anything else
 * that needs the sheet — removing a row that was written by mistake, for
 * instance.
 */
export function googleSheetsClient() {
  const credentials = serviceAccountCredentials();
  return google.sheets({
    version: 'v4',
    auth: new google.auth.JWT({ ...credentials, scopes: [SCOPES] }),
  });
}

/**
 * Is the Google service account set up?
 *
 * The nightly run calls this before it tries to read anything, so a missing
 * key is a clear "not configured" line rather than a failed run.
 */
export function googleSheetsConfigured() {
  return Boolean(process.env.GOOGLE_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY_PATH || existsSync(LOCAL_KEY_PATH));
}
