// Where the invoices live.
//
// The file is stored in the restaurant's own Google Drive folder, and the bill
// keeps the link to it.
//
// **The upload is made as the restaurant's own Google account, not as the
// service account.** Google gives a service account no Drive storage of its
// own, so a file it creates is refused with "Service Accounts do not have
// storage quota" — sharing the folder does not help, because the file would
// still be owned by the account. The account connects once through Google's
// own sign-in (Settings → Google Drive), and the upload is then made as it.
// See `lib/googleUserDrive.js`.
//
// The service account still reads and writes the **sheets** — that is the
// nightly pull, and it works perfectly well.

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
