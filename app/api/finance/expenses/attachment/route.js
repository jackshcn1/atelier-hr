import { uploadInvoiceToDrive } from '../../../../../lib/googleUserDrive.js';
import { INVOICE_FOLDER_ID } from '../../../../../lib/googleDrive.js';

// The invoice upload.
//
// A bill typed in by hand can have the invoice itself attached — a PDF or a
// photograph of it. The file goes into the restaurant's own Drive folder, and
// the bill keeps the link to it.
//
// The upload is made as the restaurant's **own Google account**, not as the
// service account: Google gives a service account no Drive storage of its
// own, so a file it creates is refused with "Service Accounts do not have
// storage quota". The account connects once, through Google's own sign-in
// (Settings → Google Drive), and from then on the upload goes in as that
// account — the file is owned by the account, it lands in the folder, and
// the person can open it.
//
// Two things have to be in place on the Google side, and both are said
// plainly when they are not:
//
//   1. the **Drive API** has to be switched on in the Google Cloud project
//      `my-project-27246-510206` (the Sheets API alone cannot store files);
//   2. the restaurant's Google account has to be connected, in Settings.

const ALLOWED = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
};

// A bill's invoice is a page or a photograph. Ten megabytes is plenty.
const MAX_BYTES = 10 * 1024 * 1024;

/** A safe file name — the one the file is given in Drive. */
function fileName(name, extension) {
  const base = String(name || 'invoice')
    .replace(/\.[A-Za-z0-9]+$/, '')
    .replace(/[^A-Za-z0-9 _.-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'invoice';
  return `${base}.${extension}`;
}

export async function POST(request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    const name = String(form.get('name') || '').trim();

    if (!file || typeof file === 'string') {
      return Response.json({ success: false, error: 'No file was sent.' }, { status: 400 });
    }

    const type = String(file.type || '').toLowerCase();
    const extension = ALLOWED[type];
    if (!extension) {
      return Response.json(
        { success: false, error: 'The invoice has to be a PDF or a JPEG (or a PNG).' },
        { status: 400 },
      );
    }

    const body = Buffer.from(await file.arrayBuffer());
    if (body.length === 0) {
      return Response.json({ success: false, error: 'The file is empty.' }, { status: 400 });
    }
    if (body.length > MAX_BYTES) {
      return Response.json(
        { success: false, error: 'The invoice is too large — ten megabytes is the limit.' },
        { status: 400 },
      );
    }

    const uploaded = await uploadInvoiceToDrive({
      folderId: INVOICE_FOLDER_ID,
      name: fileName(name || file.name, extension),
      mimeType: type,
      body,
    });

    return Response.json({ success: true, data: uploaded });
  } catch (error) {
    // The account has not been connected yet — that is the one thing the
    // person can fix themselves, so it says exactly what to do.
    if (error?.code === 'NOT_CONNECTED') {
      return Response.json(
        {
          success: false,
          error:
            "The restaurant's Google account is not connected yet. Open Settings → Google Drive and " +
            'press "Connect Google Drive", then attach the invoice again.',
          connectUrl: '/api/google-drive/connect',
        },
        { status: 503 },
      );
    }

    const status = error?.response?.status;
    if (status === 403) {
      const raw = String(error?.message || '');
      // Google says which of the two things is missing.
      const apiOff = raw.includes('Drive API has not been used');
      return Response.json(
        {
          success: false,
          error: apiOff
            ? 'The Drive API is not switched on for the project. Turn it on at ' +
              'https://console.cloud.google.com/apis/library/drive.googleapis.com?project=my-project-27246-510206 ' +
              'and try again.'
            : 'Google refused the upload (403). The connected account may not have access to the ' +
              'invoice folder — check that the folder is shared with ' +
              'ateliernextplate@gmail.com.',
        },
        { status: 503 },
      );
    }
    if (status === 404) {
      return Response.json(
        {
          success: false,
          error:
            'The invoice folder was not found. The connected account has to have access to it — ' +
            'share the folder with ateliernextplate@gmail.com.',
        },
        { status: 503 },
      );
    }
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
