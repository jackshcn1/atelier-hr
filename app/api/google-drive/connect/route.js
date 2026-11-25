import { cookies } from 'next/headers';
import { randomBytes } from 'node:crypto';
import { consentUrl, oauthConfigured } from '../../../../lib/googleUserDrive.js';
import { providerByKey } from '../../../../lib/googleConnections.js';
import { currentProfile, isAdmin } from '../../../../lib/sessionUser.js';

// Connect a Google account to the site.
//
// A service account cannot store files in Drive — Google gives it no
// storage of its own — so the upload is made as the restaurant's own Google
// account instead. This route sends the person to Google's sign-in, and
// Google sends them back to `/api/google-drive/callback`.
//
// **There are two connections**, and this route starts either of them:
// `?provider=google` (the default) asks for Drive, and
// `?provider=google_business` asks for our Business Profile listing. They
// are apart on purpose — see `lib/googleConnections.js`.
//
// Only an administrator may do it: the Drive connection can read and write
// the whole of that account's Drive, and the Business Profile connection can
// read our listing's reviews.

const STATE_COOKIE = 'gdrive_oauth_state';
const STATE_MINUTES = 10;

/** Only a path inside the site — never a full address. */
function safeNext(value) {
  const path = String(value || '').trim();
  if (!path.startsWith('/') || path.startsWith('//')) return '/settings';
  return path;
}

export async function GET(request) {
  const profile = await currentProfile();
  if (!profile) {
    return Response.json({ success: false, error: 'Please sign in first.' }, { status: 401 });
  }
  if (!isAdmin(profile.profile)) {
    return Response.json(
      { success: false, error: 'Only an administrator can connect the account.' },
      { status: 403 },
    );
  }
  if (!oauthConfigured()) {
    return Response.json(
      {
        success: false,
        error:
          'The Google sign-in is not set up on the server yet. The client id and secret have to be ' +
          'on Vercel as GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.',
      },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const next = safeNext(searchParams.get('next'));
  const provider = providerByKey(searchParams.get('provider'));

  // The state is what proves the person who came back is the person who
  // left. It is kept in a cookie for ten minutes and checked on the way back.
  //
  // It carries **which connection** this is, because the callback has to
  // know where to put the token it is given.
  const state = `${randomBytes(16).toString('hex')}.${provider}.${next}`;

  const jar = await cookies();
  jar.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: STATE_MINUTES * 60,
  });

  return Response.redirect(consentUrl(state, provider));
}
