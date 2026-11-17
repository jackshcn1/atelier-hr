// Google Sheets access for the customer feedback feed and for the
// accountant's invoice sheet.
//
// Uses a service account — no interactive OAuth, so this runs unattended.
//
// The key can be given two ways:
//
//   GOOGLE_PRIVATE_KEY       the PEM **content** (preferred on Vercel, which
//                            has no file to point at)
//   GOOGLE_PRIVATE_KEY_PATH  the path to a key file (used on a local machine)
//
// A PEM that was pasted into an environment variable arrives with its
// newlines written as the two characters `\n`, so it is put back before use.

import { google } from 'googleapis';
import { existsSync } from 'node:fs';

/**
 * The service account's credentials, from whichever of the two settings is
 * in use.
 *
 * @returns {{email: string, key: string} | {keyFile: string}}
 */
function serviceAccountCredentials() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const inlineKey = process.env.GOOGLE_PRIVATE_KEY;
  const keyPath = process.env.GOOGLE_PRIVATE_KEY_PATH;

  if (!email) throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL is not set.');
  if (!inlineKey && !keyPath) {
    throw new Error('GOOGLE_PRIVATE_KEY or GOOGLE_PRIVATE_KEY_PATH must be set.');
  }

  if (inlineKey) {
    // The newlines of a PEM that was pasted into an environment variable
    // arrive as the two characters \ and n.
    const key = inlineKey.replace(/\\n/g, '\n');
    if (!key.includes('BEGIN PRIVATE KEY')) {
      throw new Error('GOOGLE_PRIVATE_KEY does not look like a PEM private key.');
    }
    return { email, key };
  }

  if (!existsSync(keyPath)) {
    throw new Error(`Service account key file not found at: ${keyPath}`);
  }
  return { email, keyFile: keyPath };
}

export async function fetchGoogleSheetsData({ spreadsheetId, sheetName, range }) {
  if (!spreadsheetId) throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID is not set.');

  const credentials = serviceAccountCredentials();

  const auth = new google.auth.JWT({
    ...credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName || 'Sheet1'}!${range || 'A:K'}`
  });

  return res.data.values || [];
}

/**
 * Is the Google service account set up?
 *
 * The nightly run calls this before it tries to read anything, so a missing
 * key is a clear "not configured" line rather than a failed run.
 */
export function googleSheetsConfigured() {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) &&
    Boolean(process.env.GOOGLE_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY_PATH);
}
