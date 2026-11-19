import { clearConnection, driveConnection } from '../../../../lib/googleUserDrive.js';
import { currentProfile, isAdmin } from '../../../../lib/sessionUser.js';

// Disconnect the Google account.
//
// The site keeps one refresh token, for one account. If the wrong account was
// connected, or the account should not be connected at all, this forgets it —
// the token is deleted and the site stops acting as that account.
//
// Nothing is deleted in Drive: the files the site uploaded stay exactly where
// they are. Only the site's permission to act as the account is given up.
//
// Only an administrator may do it, for the same reason as connecting: the
// connection can read and write the whole of that account's Drive.

export async function DELETE() {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return Response.json({ success: false, error: 'Please sign in first.' }, { status: 401 });
    }
    if (!isAdmin(profile.profile)) {
      return Response.json(
        { success: false, error: 'Only an administrator can disconnect the account.' },
        { status: 403 },
      );
    }

    const before = await driveConnection();
    await clearConnection();

    return Response.json({
      success: true,
      data: { disconnected: before.connected, email: before.email },
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
