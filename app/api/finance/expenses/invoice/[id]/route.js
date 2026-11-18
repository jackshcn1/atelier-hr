import { getSupabase } from '../../../../../../lib/supabaseServer.js';
import {
  downloadFromDrive,
  driveFileId,
  isDeadConnection,
  clearConnection,
} from '../../../../../../lib/googleUserDrive.js';

// The invoice itself, served to whoever is signed in.
//
// The file lives in the restaurant's Google Drive, owned by the connected
// account. A Drive link would ask Google's permission system for access, and
// a colleague without a Google account — or with a different one — would be
// told they need access. So the site serves the file itself: the person signs
// in to the site, and the invoice opens.
//
// The file id is **never** taken from the request. It is looked up from the
// bill, so this route can only ever hand out a file the site has on record —
// it is not a way to read anything else in that Drive.

export async function GET(request, { params }) {
  try {
    const id = params?.id;
    if (!id) {
      return Response.json({ success: false, error: 'Which bill?' }, { status: 400 });
    }

    // The id is a bill's id, not a file's. Anything that is not a bill id is
    // not a bill — the database would only throw at it.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json(
        { success: false, error: 'That bill is not in the ledger.' },
        { status: 404 },
      );
    }

    const supabase = getSupabase();
    const { data: bill, error } = await supabase
      .from('expenses')
      .select('id, invoice_attachment')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;

    if (!bill) {
      return Response.json(
        { success: false, error: 'That bill is not in the ledger.' },
        { status: 404 },
      );
    }

    const fileId = driveFileId(bill.invoice_attachment);
    if (!fileId) {
      return Response.json(
        { success: false, error: 'This bill has no invoice attached.' },
        { status: 404 },
      );
    }

    const file = await downloadFromDrive(fileId);

    return new Response(file.body, {
      status: 200,
      headers: {
        'Content-Type': file.mimeType,
        'Content-Disposition': `inline; filename="${String(file.name).replace(/["\\]/g, '')}"`,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (error) {
    if (error?.code === 'NOT_CONNECTED') {
      return Response.json(
        {
          success: false,
          error:
            "The restaurant's Google account is not connected yet. Open Settings → Google Drive " +
            'and press "Connect Google Drive".',
        },
        { status: 503 },
      );
    }
    if (isDeadConnection(error)) {
      await clearConnection().catch(() => {});
      return Response.json(
        {
          success: false,
          error:
            'The Google connection has stopped working — it may have expired or been revoked. ' +
            'Open Settings → Google Drive and press "Connect Google Drive" again.',
        },
        { status: 503 },
      );
    }
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
