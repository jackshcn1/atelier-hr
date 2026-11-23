// Google Sheets access for the customer feedback feed and for the
// accountant's invoice sheet.
//
// Uses a service account — no interactive OAuth, so this runs unattended.
// The credentials themselves live in `lib/googleAuth.js`, which the Drive
// helper uses too.

import { google } from 'googleapis';
import { googleAuthClient, googleConfigured } from './googleAuth.js';

// Read and write. The reading side is the nightly pull; the writing side is
// the site's expense form, which puts a row into the sheet so the sheet stays
// the place an amount is written.
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

export async function fetchGoogleSheetsData({ spreadsheetId, sheetName, range }) {
  if (!spreadsheetId) throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID is not set.');

  const auth = googleAuthClient(SCOPES);

  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    // The whole tab, not a slice of it. The sheet's columns are found **by
    // heading**, so a range that stopped one column short would lose that
    // column quietly — and a column that is lost is a bill that is lost.
    // The API answers with the cells that are actually filled in.
    range: `${sheetName || 'Sheet1'}!${range || 'A:AZ'}`
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

  const auth = googleAuthClient(SCOPES);

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

  const auth = googleAuthClient(SCOPES);
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
 * A column's letter: 1 is A, 26 is Z, 27 is AA.
 *
 * @param {number} index the column, counting from 1
 */
export function columnLetter(index) {
  let letters = '';
  let n = index;
  while (n > 0) {
    const rest = (n - 1) % 26;
    letters = String.fromCharCode(65 + rest) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/**
 * Write single cells into a sheet, without touching anything else.
 *
 * A row is written one cell at a time rather than as a whole row, so a change
 * cannot lose whatever else is in that row — the accountant may have corrected
 * a cell between the row being read and the change being written.
 *
 * @param {{spreadsheetId: string, sheetName?: string,
 *   cells: {line: number, column: number, value: string}[]}} input
 *   `line` and `column` count from 1 — the sheet's own numbering, so A is 1.
 * @returns {Promise<{updated: number}>}
 */
export async function writeSheetCells({ spreadsheetId, sheetName, cells }) {
  if (!spreadsheetId) throw new Error('A spreadsheet id is needed.');
  if (!cells || cells.length === 0) return { updated: 0 };

  const auth = googleAuthClient(SCOPES);
  const sheets = google.sheets({ version: 'v4', auth });
  const tab = sheetName || 'Sheet1';

  const res = await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data: cells.map((cell) => ({
        range: `'${tab}'!${columnLetter(cell.column)}${cell.line}`,
        values: [[String(cell.value ?? '')]],
      })),
    },
  });

  return { updated: res.data?.totalUpdatedCells ?? cells.length };
}

/**
 * An authenticated Sheets client.
 *
 * The functions above cover reading and writing. This is for anything else
 * that needs the sheet — removing a row that was written by mistake, for
 * instance.
 */
export function googleSheetsClient() {
  return google.sheets({ version: 'v4', auth: googleAuthClient(SCOPES) });
}

/**
 * Is the Google service account set up?
 *
 * The nightly run calls this before it tries to read anything, so a missing
 * key is a clear "not configured" line rather than a failed run.
 */
export { googleConfigured as googleSheetsConfigured };
