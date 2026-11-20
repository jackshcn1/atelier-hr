/**
 * scripts/verify-invoice-upload.mjs — the whole invoice path, once, for real.
 *
 *   1. upload a PDF as the connected account
 *   2. check the file really landed in the invoice folder, owned by that account
 *   3. save a bill that carries the invoice's link
 *   4. serve the invoice back through the site
 *   5. clean up: the file and the bill both go
 *
 * This is a check to run by hand, not a test: it puts a real file in the real
 * Drive and writes a real bill, so it needs a connected Google account. It
 * takes them both away again when it is done.
 *
 * Run: node scripts/verify-invoice-upload.mjs
 *
 * It needs the same credentials the server has — the OAuth client in
 * `scripts/google-oauth-client.json`, and `.env.local` for the database.
 */

import { readFileSync } from 'node:fs';
import { google } from 'googleapis';

for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && process.env[match[1]] === undefined) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
}

// The OAuth client, the same one the server has.
const oauthFile = JSON.parse(
  readFileSync(new URL('google-oauth-client.json', import.meta.url), 'utf8'),
);
const web = oauthFile.web || oauthFile.installed;
process.env.GOOGLE_OAUTH_CLIENT_ID = web.client_id;
process.env.GOOGLE_OAUTH_CLIENT_SECRET = web.client_secret;
process.env.GOOGLE_OAUTH_REDIRECT_URI =
  process.env.GOOGLE_OAUTH_REDIRECT_URI ||
  'https://atelier-hr-inky.vercel.app/api/google-drive/callback';

const { POST: attachmentPOST } = await import('../app/api/finance/expenses/attachment/route.js');
const { POST: sheetPOST } = await import('../app/api/finance/expenses/sheet/route.js');
const { GET: invoiceGET } = await import('../app/api/finance/expenses/invoice/[id]/route.js');
const { INVOICE_FOLDER_ID } = await import('../lib/googleDrive.js');
const { driveConnection, userDriveClient } = await import('../lib/googleUserDrive.js');
const { fetchGoogleSheetsData, googleSheetsClient } = await import('../lib/googleSheetsService.js');
const { createClient } = await import('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// A tiny but real PDF.
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n' +
    '4 0 obj<</Length 62>>stream\nBT /F1 12 Tf 20 100 Td (Atelier upload check) Tj ET\nendstream endobj\n' +
    '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
  'latin1',
);

const connection = await driveConnection();
if (!connection.connected) {
  console.log('✗ No Google account is connected. Settings → Google Drive → Connect Google Drive.');
  process.exit(1);
}
console.log(`✓ Connected account: ${connection.email}\n`);

const stamp = Date.now();
const fileName = `atelier-upload-check-${stamp}.pdf`;

let fileId = null;
let billId = null;
let entryId = null;
let failed = null;

try {
  // 1. The upload.
  console.log('1. uploading a PDF as the connected account…');
  const form = new FormData();
  form.append('file', new Blob([PDF], { type: 'application/pdf' }), fileName);
  form.append('name', fileName);

  const uploaded = await attachmentPOST(
    new Request('https://atelier.test/api/finance/expenses/attachment', { method: 'POST', body: form }),
  );
  const uploadBody = await uploaded.json();
  if (!uploadBody.success) throw new Error(uploadBody.error);
  fileId = uploadBody.data.fileId;
  console.log(`   ok  ${fileId}`);

  // 2. Where it landed, and who owns it.
  console.log('2. checking the file in Drive…');
  const serviceKey = JSON.parse(
    readFileSync(new URL('google-service-account.json', import.meta.url), 'utf8'),
  );
  const serviceAuth = new google.auth.GoogleAuth({
    credentials: serviceKey,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  const serviceDrive = google.drive({ version: 'v3', auth: await serviceAuth.getClient() });

  const meta = await serviceDrive.files.get({
    fileId,
    fields: 'id,name,owners,parents,size',
  });
  const owner = meta.data.owners?.[0]?.emailAddress;
  console.log(`   name   : ${meta.data.name}`);
  console.log(`   owner  : ${owner}`);
  console.log(`   parent : ${meta.data.parents?.[0]}`);
  console.log(`   bytes  : ${meta.data.size}`);

  if (meta.data.parents?.[0] !== INVOICE_FOLDER_ID) {
    throw new Error(`the file landed in ${meta.data.parents?.[0]}, not in the invoice folder`);
  }
  if (owner !== connection.email) {
    throw new Error(`the file is owned by ${owner}, not by the connected account`);
  }
  console.log('   ok  in the invoice folder, owned by the connected account');

  // 3. The bill — through the sheet, the way the site enters it.
  console.log('3. saving a bill that carries the invoice link…');
  const bill = await sheetPOST(
    new Request('https://atelier.test/api/finance/expenses/sheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'variable',
        costType: 'Atelier Upload Check',
        vendor: 'Atelier Upload Check',
        amount: 1,
        invoiceDate: new Date().toISOString().slice(0, 10),
        invoiceNo: `CHECK-${stamp}`,
        description: 'The invoice path check',
        attachment: uploadBody.data.link,
      }),
    }),
  );
  const billBody = await bill.json();
  if (!billBody.success) throw new Error(billBody.error);
  billId = billBody.data.bill?.id;
  entryId = billBody.data.entryId;
  if (!billId) throw new Error('the bill was not written to the books');
  console.log(`   ok  ${billId}`);

  // 4. The invoice, served back.
  console.log('4. serving the invoice through the site…');
  const served = await invoiceGET(
    new Request(`https://atelier.test/api/finance/expenses/invoice/${billId}`),
    { params: { id: billId } },
  );
  const bytes = Buffer.from(await served.arrayBuffer());
  console.log(`   status : ${served.status}`);
  console.log(`   type   : ${served.headers.get('content-type')}`);
  console.log(`   bytes  : ${bytes.length}`);

  if (served.status !== 200) {
    throw new Error(`the invoice was not served: ${bytes.toString('utf8').slice(0, 200)}`);
  }
  if (!bytes.subarray(0, 4).toString('latin1').startsWith('%PDF')) {
    throw new Error('what came back is not the PDF that went up');
  }
  console.log('   ok  the same PDF came back');

  console.log('\n✓ The invoice path works end to end.');
} catch (error) {
  failed = error;
  console.log(`\n✗ The invoice path failed — ${error.message}`);
  process.exitCode = 1;
} finally {
  if (entryId) {
    // The row goes out of the accountant's sheet again, so the sheet is left
    // as it was.
    const SHEET_ID = '1_25bZSbaJHkKosX7RZ4_LPgQp_NwSvpTXJUFwBLSeig';
    const SHEET_TAB = 'Form Responses 1';
    const client = googleSheetsClient();
    const sheet = await client.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties' });
    const tab = (sheet.data.sheets || []).map((s) => s.properties).find((p) => p.title === SHEET_TAB);
    const rows = await fetchGoogleSheetsData({ spreadsheetId: SHEET_ID, sheetName: SHEET_TAB, range: 'A:AZ' });
    const at = rows.findIndex((row) => (row || []).includes(entryId));
    if (at !== -1) {
      await client.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          requests: [
            { deleteDimension: { range: { sheetId: tab.sheetId, dimension: 'ROWS', startIndex: at, endIndex: at + 1 } } },
          ],
        },
      });
    }
    console.log('   cleanup: the row is removed from the sheet');
  }
  if (billId) {
    await supabase.from('expenses').delete().eq('id', billId);
    console.log('   cleanup: the test bill is removed');
  }
  if (fileId) {
    // Deleted as the connected account — it owns the file, and the service
    // account cannot delete a file it does not own.
    const { drive } = await userDriveClient();
    await drive.files.delete({ fileId }).catch(() => {});
    console.log('   cleanup: the test file is deleted from Drive');
  }
}

if (failed) process.exit(1);
