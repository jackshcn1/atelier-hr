import { cookies } from 'next/headers';
import { google } from 'googleapis';
import {
  accountEmail,
  redirectUri,
  saveConnection,
  oauthConfigured,
} from '../../../../lib/googleUserDrive.js';
import { currentProfile } from '../../../../lib/sessionUser.js';

// Google sends the person back here after they sign in.
//
// The code in the address is swapped for a refresh token — that token is what
// lets the site upload as this account later, without asking again. Only the
// refresh token is kept.

const STATE_COOKIE = 'gdrive_oauth_state';

function safeNext(value) {
  const path = String(value || '').trim();
  if (!path.startsWith('/') || path.startsWith('//')) return '/settings';
  return path;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const denied = searchParams.get('error');

  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value || '';

  const back = (query) => Response.redirect(new URL(`/settings${query}`, request.url));

  if (denied) {
    return back('?drive=declined');
  }

  // The state has to be the one this browser was given, or somebody could
  // hand their own code to somebody else's session.
  if (!code || !state || !expected || state !== expected) {
    return back('?drive=failed&reason=state');
  }

  const profile = await currentProfile();
  if (!profile) {
    return back('?drive=failed&reason=signin');
  }

  if (!oauthConfigured()) {
    return back('?drive=failed&reason=not-configured');
  }

  try {
    const client = new google.auth.OAuth2(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      redirectUri(),
    );

    const { tokens } = await client.getToken(code);
    if (!tokens?.refresh_token) {
      // Google only gives a refresh token the first time, or when the person
      // is asked to agree again. `prompt=consent` makes that happen.
      return back('?drive=failed&reason=no-refresh-token');
    }

    const email = tokens.access_token ? await accountEmail(tokens.access_token) : null;

    await saveConnection({
      refreshToken: tokens.refresh_token,
      accountEmail: email,
      connectedBy: profile.user.id,
    });

    const next = safeNext(String(state).split('.')[1] || '/settings');
    return Response.redirect(new URL(`${next}${next.includes('?') ? '&' : '?'}drive=connected`, request.url));
  } catch (error) {
    console.error('Google Drive connection failed:', error?.message);
    return back('?drive=failed&reason=exchange');
  }
}
