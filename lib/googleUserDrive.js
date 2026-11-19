/**
 * lib/googleUserDrive.js — Drive, as the restaurant's own account.
 *
 * A service account cannot put a file into Drive. Google gives a service
 * account no storage of its own, so an upload it makes is refused with
 * "Service Accounts do not have storage quota" — the account may be given
 * access to the folder, but it still owns nothing, and Drive will not store
 * the file.
 *
 * So a Google account connects to the site once, through Google's own
 * sign-in, and the upload is made **as that account**. The file is then owned
 * by the account, it lands in the folder, and the person who signed in can
 * open it.
 *
 * Which account connects is a choice, not a fixed one: the account has to be
 * able to write to the invoice folder, and it owns the files the site uploads.
 * Any other account is left untouched by the site.
 *
 * Only the refresh token is kept, in the database, and it never leaves the
 * server. The access token is not stored at all — it is fetched fresh each
 * time, and thrown away afterwards.
 */

import { google } from 'googleapis';
import { Readable } from 'node:stream';
import { getSupabase } from './supabaseServer.js';
import { INVOICE_FOLDER_ID, driveFileLink } from './googleDrive.js';

// Drive, read and write. The full scope is needed because the invoice folder
// is the accountant's own — a narrower scope only sees files this site
// created, and it could not put a file into that folder.
const SCOPES = ['https://www.googleapis.com/auth/drive'];

/** Is the OAuth side set up on the server? */
export function oauthConfigured() {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

/** Where Google sends the person back to. It has to match the console exactly. */
export function redirectUri() {
  return (
    process.env.GOOGLE_OAUTH_REDIRECT_URI ||
    'https://atelier-hr-inky.vercel.app/api/google-drive/callback'
  );
}

function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri(),
  );
}

/**
 * The link that starts the sign-in.
 *
 * `access_type: offline` is what asks for a refresh token — without it the
 * connection would last an hour and then stop.
 */
export function consentUrl(state) {
  return oauthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: SCOPES,
    state,
  });
}

/** The saved connection, if there is one. */
async function tokenRow() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('google_drive_tokens')
    .select('*')
    .eq('provider', 'google')
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * Is an account connected?
 *
 * @returns {Promise<{connected: boolean, email: string|null, reason?: string}>}
 */
export async function driveConnection() {
  if (!oauthConfigured()) return { connected: false, email: null, reason: 'not-configured' };
  const row = await tokenRow();
  return { connected: Boolean(row?.refresh_token), email: row?.account_email || null };
}

/**
 * The Drive client, acting as the connected account.
 *
 * The refresh token is exchanged for an access token here, in memory, and the
 * access token is never written down.
 *
 * A refresh token can stop working — Google expires the token of an app
 * whose consent screen is in *Testing* status after seven days, and a person
 * can revoke the connection at any time. That is caught here and said plainly
 * rather than surfacing as a failed upload.
 */
export async function userDriveClient() {
  const row = await tokenRow();
  if (!row?.refresh_token) {
    const error = new Error('A Google account is not connected to the site yet.');
    error.code = 'NOT_CONNECTED';
    throw error;
  }
  const client = oauthClient();
  client.setCredentials({ refresh_token: row.refresh_token });
  return {
    drive: google.drive({ version: 'v3', auth: client }),
    email: row.account_email || null,
  };
}

/**
 * Did Google turn the connection away?
 *
 * `invalid_grant` is what Google says when the refresh token has expired or
 * been revoked; `unauthorized` is what it says when the account has pulled
 * the connection apart.
 */
export function isDeadConnection(error) {
  const raw = String(error?.message || '') + String(error?.response?.data?.error || '');
  return /invalid_grant|unauthorized|token has been expired|revoked/i.test(raw);
}

/**
 * Forget a connection that no longer works.
 *
 * The token is then gone, so the site asks to connect again instead of
 * failing with an error nobody can act on.
 */
export async function clearConnection() {
  const supabase = getSupabase();
  const { error } = await supabase.from('google_drive_tokens').delete().eq('provider', 'google');
  if (error) throw error;
}

/** Keep the connection. Re-connecting replaces it. */
export async function saveConnection({ refreshToken, accountEmail, connectedBy }) {  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('google_drive_tokens')
    .upsert(
      {
        provider: 'google',
        refresh_token: refreshToken,
        account_email: accountEmail || null,
        connected_by: connectedBy || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'provider' },
    )
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Which account signed in?
 *
 * @param {string} accessToken
 * @returns {Promise<string|null>}
 */
export async function accountEmail(accessToken) {
  const drive = google.drive({ version: 'v3', auth: accessToken });
  const res = await drive.about.get({ fields: 'user' });
  return res.data?.user?.emailAddress || null;
}

/**
 * Put a file into the invoice folder, as the connected account.
 *
 * @param {{folderId?: string, name: string, mimeType: string, body: Buffer}} input
 * @returns {Promise<{fileId: string, link: string, name: string, mimeType: string}>}
 */
export async function uploadInvoiceToDrive({ folderId, name, mimeType, body }) {
  const target = folderId || INVOICE_FOLDER_ID;
  if (!target) throw new Error('No Drive folder for the invoices.');

  const { drive } = await userDriveClient();

  const res = await drive.files.create({
    requestBody: { name, mimeType, parents: [target] },
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
 * The file id inside a Drive link.
 *
 * Two shapes are in use: the one the site makes (`/file/d/<id>/view`) and the
 * one the Google Form writes (`open?id=<id>`). Anything that is not a Drive
 * link has no file id — that is the point of the check.
 *
 * @param {string} link
 * @returns {string|null}
 */
export function driveFileId(link) {
  const raw = String(link || '').trim();
  if (!raw.startsWith('https://drive.google.com/')) return null;

  const byPath = raw.match(/\/d\/([A-Za-z0-9_-]{10,})/);
  if (byPath) return byPath[1];

  const byQuery = raw.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (byQuery) return byQuery[1];

  return null;
}

/**
 * Read a file back from Drive, as the connected account.
 *
 * The file is served to the person through the site, so it does not matter
 * whether their own Google account could open it in Drive.
 *
 * @param {string} fileId
 * @returns {Promise<{body: Buffer, name: string, mimeType: string}>}
 */
export async function downloadFromDrive(fileId) {
  const { drive } = await userDriveClient();

  const meta = await drive.files.get({ fileId, fields: 'id, name, mimeType' });
  const res = await drive.files.get({ fileId, alt: 'media' });

  let body = res.data;
  if (body && typeof body.pipe === 'function') {
    const chunks = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    body = Buffer.concat(chunks);
  }
  if (!body || !Buffer.isBuffer(body)) {
    throw new Error('The invoice could not be read from Drive.');
  }

  return {
    body,
    name: meta.data.name || 'invoice',
    mimeType: meta.data.mimeType || 'application/octet-stream',
  };
}

