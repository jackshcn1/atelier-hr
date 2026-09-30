// Google Sheets access for the customer feedback feed.
// Uses a service account key file — no interactive OAuth, so this runs unattended.

import { google } from 'googleapis';
import { existsSync } from 'node:fs';

export async function fetchGoogleSheetsData({ spreadsheetId, sheetName, range }) {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const keyPath = process.env.GOOGLE_PRIVATE_KEY_PATH;

  if (!spreadsheetId) throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID is not set.');
  if (!email || !keyPath) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY_PATH must both be set.');
  }
  if (!existsSync(keyPath)) {
    throw new Error(`Service account key file not found at: ${keyPath}`);
  }

  const auth = new google.auth.JWT({
    email,
    keyFile: keyPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName || 'Sheet1'}!${range || 'A:K'}`
  });

  return res.data.values || [];
}
