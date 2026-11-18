// Google Drive access — the invoice uploads.
//
// A bill typed in by hand can have the invoice itself attached: a PDF or a
// photograph of it. The file goes into the restaurant's own Drive folder, and
// the bill keeps the link to it.
//
// The service account has to be given access to the folder — the same account
// the sheet is shared with. It is a file it created, so the link works for
// the people who own the folder.

import { google } from 'googleapis';
import { Readable } from 'node:stream';
import { serviceAccountCredentials, googleAuthClient } from './googleAuth.js';

const SCOPES = ['https://www.googleapis.com/auth/drive'];

// Where the invoices live.
//
// https://drive.google.com/drive/u/0/folders/1wdy9KDy9QQmJMrzMNNkUR1Aykgle-WP-RFWoLqRtLmpFRrWrUNtASFokCmNtK9sXtaUyRo3I
export const INVOICE_FOLDER_ID =
  process.env.INVOICE_FOLDER_ID ||
  '1wdy9KDy9QQmJMrzMNNkUR1Aykgle-WP-RFWoLqRtLmpFRrWrUNtASFokCmNtK9sXtaUyRo3I';

/**
 * A file's link.
 *
 * The `anyone with the link` form, so the person who owns the folder can open
 * it from the bill.
 */
export function driveFileLink(fileId) {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

/**
 * Put a file into a Drive folder.
 *
 * @param {{
 *   folderId?: string,
 *   name: string,
 *   mimeType: string,
 *   body: Buffer,
 * }} input
 * @returns {Promise<{fileId: string, link: string, name: string}>}
 */
export async function uploadToDrive({ folderId, name, mimeType, body }) {
  const target = folderId || INVOICE_FOLDER_ID;
  if (!target) throw new Error('No Drive folder for the invoices.');

  const drive = google.drive({ version: 'v3', auth: googleAuthClient(SCOPES) });

  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType,
      parents: [target],
    },
    media: {
      mimeType,
      // The upload client wants a stream, not a buffer.
      body: Readable.from(body),
    },
    fields: 'id, name, mimeType, webViewLink',
  });

  const fileId = res.data.id;
  if (!fileId) throw new Error('The file was not saved to Drive.');

  return {
    fileId,
    link: driveFileLink(fileId),
    name: res.data.name || name,
    mimeType: res.data.mimeType || mimeType,
  };
}

/**
 * Is the Drive side ready?
 *
 * Two things have to be true: the key has to be there, and the Drive API has
 * to be switched on in the Google Cloud project. The second one shows up as a
 * 403, so it is worth saying plainly what is wrong.
 */
export function driveReady() {
  try {
    serviceAccountCredentials();
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}
