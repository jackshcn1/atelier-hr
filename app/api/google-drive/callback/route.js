import { cookies } from 'next/headers';
import { google } from 'googleapis';
import {
  accountEmail,
  redirectUri,
  saveConnection,
  oauthConfigured,
  userinfoEmail,
} from '../../../../lib/googleUserDrive.js';
import { PROVIDERS, providerByKey } from '../../../../lib/googleConnections.js';
import { currentProfile } from '../../../../lib/sessionUser.js';

// Google sends the person back here after they sign in.
//
// The code in the address is swapped for a refresh token — that token is what
// lets the site act as this account later, without asking again. Only the
// refresh token is kept.
//
// **Which connection this is** is read from the state cookie, not from the
// address: the state is the one thing the browser was given and could not
// have written itself. The token goes into that connection's row, so the
// Drive connection and the Business Profile connection never take each
// other's place.
//
// A token that does not carry the permissions the connection asked for is
// **refused**, and the old token is left alone. A person who agrees to the
// sign-in and leaves a permission unticked must not be left holding a token
// that cannot do the job.

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

  // The state is `<random>.<provider>.<where to go back to>`.
  const parts = expected ? expected.split('.') : [];
  const provider = providerByKey(parts[1]);
  const setup = PROVIDERS[provider];

  // Where to send the person back, and how to say it worked. The Drive
  // connection has always said "drive"; the other one says its own name.
  const backTo = safeNext(parts.slice(2).join('.'));
  const flag = provider === 'google' ? 'drive' : 'business';

  const back = (query) => Response.redirect(new URL(`${backTo}${query}`, request.url));

  if (denied) {
    return back(`?${flag}=declined`);
  }

  // The state has to be the one this browser was given, or somebody could
  // hand their own code to somebody else's session.
  if (!code || !state || !expected || state !== expected) {
    return back(`?${flag}=failed&reason=state`);
  }

  const profile = await currentProfile();
  if (!profile) {
    return back(`?${flag}=failed&reason=signin`);
  }

  if (!oauthConfigured()) {
    return back(`?${flag}=failed&reason=not-configured`);
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
      return back(`?${flag}=failed&reason=no-refresh-token`);
    }

    // What Google actually agreed to. A person can untick a permission on the
    // consent screen, and the API then turns the request away with a sentence
    // that means nothing to the person reading it — so it is checked here,
    // where the answer can be said plainly.
    const granted = String(tokens.scope || '').split(/\s+/).filter(Boolean);
    const missing = setup.scopes.filter((scope) => !granted.includes(scope));
    if (missing.length > 0) {
      return back(`?${flag}=failed&reason=scope`);
    }

    // Which account signed in. Drive's own "about" call needs the Drive
    // permission; the Business Profile connection has no Drive permission, so
    // it asks Google's account information instead.
    const email = provider === 'google'
      ? (tokens.access_token ? await accountEmail(tokens.access_token) : null)
      : await userinfoEmail(tokens.access_token);

    await saveConnection({
      provider,
      refreshToken: tokens.refresh_token,
      accountEmail: email,
      connectedBy: profile.user.id,
    });

    return back(`?${flag}=connected`);
  } catch (error) {
    console.error(`Google ${provider} connection failed:`, error?.message);
    return back(`?${flag}=failed&reason=exchange`);
  }
}
