// Google service account credentials, shared by the Sheets and Drive helpers.
//
// The project talks to Google as a service account — no interactive OAuth, so
// everything runs unattended.
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
export function serviceAccountCredentials() {
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

/**
 * An authenticated client for a Google API.
 *
 * @param {string[]} scopes the scopes to ask for
 */
export function googleAuthClient(scopes) {
  return new google.auth.JWT({ ...serviceAccountCredentials(), scopes });
}

/**
 * Is the Google service account set up?
 *
 * The nightly run calls this before it tries to read anything, so a missing
 * key is a clear "not configured" line rather than a failed run.
 */
export function googleConfigured() {
  return Boolean(
    process.env.GOOGLE_PRIVATE_KEY ||
      process.env.GOOGLE_PRIVATE_KEY_PATH ||
      existsSync(LOCAL_KEY_PATH),
  );
}
