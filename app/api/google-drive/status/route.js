import { driveConnection, oauthConfigured } from '../../../../lib/googleUserDrive.js';
import { currentProfile, isAdmin } from '../../../../lib/sessionUser.js';

// Is the restaurant's Google account connected?
//
// The Settings page asks this so it can say "Connected as …" or offer the
// button that connects it. The refresh token is never sent to the browser —
// only whether there is one, and which account it belongs to.

export async function GET() {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return Response.json({ success: false, error: 'Please sign in first.' }, { status: 401 });
    }
    if (!isAdmin(profile.profile)) {
      return Response.json(
        { success: false, error: 'Only an administrator can see this.' },
        { status: 403 },
      );
    }

    const connection = await driveConnection();

    return Response.json({
      success: true,
      data: {
        connected: connection.connected,
        email: connection.email,
        configured: oauthConfigured(),
      },
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
