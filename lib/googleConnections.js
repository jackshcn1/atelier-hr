/**
 * lib/googleConnections.js — the Google accounts the site acts as.
 *
 * A service account cannot act **as** the restaurant. Google gives it no
 * storage of its own and no Business Profile of its own, so anything that has
 * to happen *as the restaurant* has to happen as a Google account the
 * restaurant owns — through Google's own sign-in.
 *
 * There are **two** such connections, and they are kept apart:
 *
 * | Connection          | What it lets the site do            | Where it lives |
 * |---------------------|-------------------------------------|----------------|
 * | `google`            | read and write the account's Drive  | `google_drive_tokens` |
 * | `google_business`   | read our Business Profile listing  | the same table, one row each |
 *
 * They are separate because they are **granted separately and they fail
 * separately**. The Business Profile permission is a sensitive one that
 * Google checks before it can be used, and a person can agree to the sign-in
 * and leave it unticked — so the Drive connection must not depend on it, and
 * a Drive token that has expired must not stop us reading our own reviews.
 *
 * This file holds only the **names and the permissions**, and the one question
 * that can be answered with a single row of the database: *is this connection
 * there at all?* It deliberately does not import the Google client library,
 * so a page that only wants to say "not connected yet" does not pay for the
 * whole of it.
 */

import { getSupabase } from './supabaseServer.js';

// Drive, read and write. The full scope is needed because the invoice folder
// is the accountant's own — a narrower scope only sees files this site
// created, and it could not put a file into that folder.
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

/**
 * The Google Business Profile listing, read.
 *
 * This is the scope Google's own Business Profile setup guide names, and the
 * one the API's reference pages list. It is a **sensitive** scope: Google
 * checks the application before it can be used, which is why the listing's
 * reviews are not in the books until a manager of the listing signs in and
 * agrees to it.
 *
 * The site never writes to the listing. The permission is asked for because
 * Google's API has no read-only form of it.
 */
export const BUSINESS_SCOPE = 'https://www.googleapis.com/auth/business.manage';

/**
 * The address of the account that signed in.
 *
 * The Business Profile API never says which account a token belongs to, and
 * the site has to say it plainly — otherwise nobody looking at the page
 * knows whose reviews are on screen.
 */
export const EMAIL_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';

/**
 * The connections the site knows how to make.
 *
 * @type {Record<string, {label: string, scopes: string[]}>}
 */
export const PROVIDERS = {
  google: {
    label: 'Google Drive',
    scopes: [DRIVE_SCOPE],
  },
  google_business: {
    label: 'Google Business Profile',
    scopes: [BUSINESS_SCOPE, EMAIL_SCOPE],
  },
};

export const DEFAULT_PROVIDER = 'google';

/** The connection a name stands for — or the default, when the name is not one. */
export function providerByKey(key) {
  const name = String(key || '').trim();
  return PROVIDERS[name] ? name : DEFAULT_PROVIDER;
}

/** The permissions a connection asks for. */
export function providerScopes(provider) {
  return PROVIDERS[providerByKey(provider)].scopes;
}

/** Is the OAuth side set up on the server? */
export function oauthConfigured() {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

/**
 * Is a connection there?
 *
 * The refresh token never leaves the server — this says only whether there is
 * one and which account it belongs to.
 *
 * @param {string} [provider]
 * @returns {Promise<{connected: boolean, email: string|null, reason?: string}>}
 */
export async function connectionStatus(provider = DEFAULT_PROVIDER) {
  if (!oauthConfigured()) return { connected: false, email: null, reason: 'not-configured' };
  const name = providerByKey(provider);
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('google_drive_tokens')
    .select('account_email, refresh_token')
    .eq('provider', name)
    .maybeSingle();
  if (error) throw error;
  return { connected: Boolean(data?.refresh_token), email: data?.account_email || null };
}
