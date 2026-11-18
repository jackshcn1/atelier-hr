import { uploadToDrive, INVOICE_FOLDER_ID, driveReady } from '../../../../../lib/googleDrive.js';

// The invoice upload.
//
// A bill typed in by hand can have the invoice itself attached — a PDF or a
// photograph of it. The file goes into the restaurant's own Drive folder, and
// the bill keeps the link to it.
//
// Two things have to be in place on the Google side, and both are said plainly
// when they are not:
//
//   1. the **Drive API** has to be switched on in the Google Cloud project
//      `my-project-27246-510206` (the Sheets API alone cannot store files);
//   2. the service account has to be given access to the invoice folder —
//      "Anyone with the link, Editor" is enough, and it is the same account
//      the sheet is shared with.

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
    const ready = driveReady();
    if (!ready.ok) {
      return Response.json(
        { success: false, error: `The Google key is not set up: ${ready.reason}` },
        { status: 503 },
      );
    }

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

    const uploaded = await uploadToDrive({
      folderId: INVOICE_FOLDER_ID,
      name: fileName(name || file.name, extension),
      mimeType: type,
      body,
    });

    return Response.json({ success: true, data: uploaded });
  } catch (error) {
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
            : 'Google refused the upload (403). The service account has to be given access to the ' +
              'invoice folder — share it with variable-pay-feedback-sync@my-project-27246-510206.iam.gserviceaccount.com.',
        },
        { status: 503 },
      );
    }
    if (status === 404) {
      return Response.json(
        {
          success: false,
          error:
            'The invoice folder was not found. The service account has to be given access to it — ' +
            'share it with variable-pay-feedback-sync@my-project-27246-510206.iam.gserviceaccount.com.',
        },
        { status: 503 },
      );
    }
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
