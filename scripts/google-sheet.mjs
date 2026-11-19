/**
 * scripts/google-sheet.mjs — read and write Google Sheets with the project's
 * service account.
 *
 * The service account is the one already set up for the customer-feedback
 * pull:
 *
 *   variable-pay-feedback-sync@atelier-hr-drive.iam.gserviceaccount.com
 *
 * Its credentials come from `scripts/petpooja-config.json` (which is
 * gitignored and never deployed), or from the environment, or from a key file
 * given on the command line.
 *
 * The key file path in `scripts/petpooja-config.json` points at the office
 * computer, so on any other machine the key has to be given another way.
 *
 * ## Commands
 *
 *   node scripts/google-sheet.mjs list
 *       Lists the spreadsheets the service account can see. This is the
 *       "is my connection working?" check.
 *
 *   node scripts/google-sheet.mjs read [spreadsheetId] [--sheet <tab>] [--gid <number>] [--range <A1>]
 *       Prints the headings and the rows of a sheet.
 *
 *   node scripts/google-sheet.mjs append <spreadsheetId> --tab <tab> --row <json>
 *       Appends one row. Used by the site's expense form, so the sheet stays
 *       the place an amount is written.
 *
 * ## Credentials, in the order they are looked for
 *
 *   1. GOOGLE_PRIVATE_KEY      — the PEM content (preferred on Vercel)
 *   2. --key <path>            — a key file on this machine
 *   3. scripts/petpooja-config.json — GOOGLE_SERVICE_ACCOUNT_EMAIL and
 *                                  GOOGLE_PRIVATE_KEY_PATH
 *
 * The private key is never printed, and never written to a file.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';

const here = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(here, 'petpooja-config.json');

// Where the downloaded Google Cloud key file is expected. Gitignored.
const LOCAL_KEY_PATH = join(here, 'google-service-account.json');

const SCOPES = [
  // Read and write. The site's expense form appends a row to the sheet, so a
  // read-only scope would let the nightly pull work and the form fail.
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.readonly',
];

// ---- arguments ----------------------------------------------------------

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const name = token.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[name] = next;
        i += 1;
      } else {
        args[name] = true;
      }
    } else {
      args._.push(token);
    }
  }
  return args;
}

// ---- credentials --------------------------------------------------------

/**
 * The service account's credentials, from wherever they are.
 *
 * A key file can be two things:
 *
 *   - the **JSON** key Google Cloud downloads — it holds `client_email` and
 *     `private_key` inside it. This is the one to expect.
 *   - a **PEM** file — the bare private key, no wrapper.
 *
 * They are read differently, and the JSON one is not a PEM, so it cannot be
 * handed straight to the auth library.
 *
 * @returns {{email: string, key?: string, keyFile?: string}}
 */
function loadCredentials(args) {
  const config = existsSync(CONFIG_PATH) ? readFileSync(CONFIG_PATH, 'utf8') : '';
  let file = {};
  try {
    file = config ? JSON.parse(config) : {};
  } catch {
    file = {};
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || file.GOOGLE_SERVICE_ACCOUNT_EMAIL;

  // 1. The PEM content, in the environment. This is what Vercel can hold.
  const inline = process.env.GOOGLE_PRIVATE_KEY;
  if (inline) {
    return { email, key: inline.replace(/\\n/g, '\n') };
  }

  // 2. A key file given on the command line, or dropped in the usual place.
  const keyPath = args.key
    ? resolve(String(args.key))
    : existsSync(LOCAL_KEY_PATH)
      ? LOCAL_KEY_PATH
      : null;

  if (keyPath) {
    if (!existsSync(keyPath)) {
      throw new Error(`The key file is not there: ${keyPath}`);
    }
    const raw = readFileSync(keyPath, 'utf8');
    const parsed = (() => {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    })();

    if (parsed && parsed.private_key) {
      // The JSON key from Google Cloud. It carries its own address, so it
      // wins over whatever the config file says.
      return {
        email: parsed.client_email || email,
        key: String(parsed.private_key).replace(/\\n/g, '\n'),
      };
    }

    // A bare PEM file.
    return { email, keyFile: keyPath };
  }

  // 3. The path in the local config file.
  const configured = process.env.GOOGLE_PRIVATE_KEY_PATH || file.GOOGLE_PRIVATE_KEY_PATH;
  if (configured) {
    const path = resolve(String(configured));
    if (existsSync(path)) {
      return { email, keyFile: path };
    }
    // The path in the config points at the office computer. Say so plainly
    // rather than failing with a file-not-found.
    throw new Error(
      `The service account key is not on this machine.\n` +
        `   It is configured at: ${configured}\n` +
        `   which is the office computer, not this one.\n` +
        `   Download it from Google Cloud and put it here:\n` +
        `     ${LOCAL_KEY_PATH}\n` +
        `   or pass it with --key <path>, or put the PEM content in the\n` +
        `   GOOGLE_PRIVATE_KEY environment variable.`,
    );
  }

  throw new Error(
    'No Google service account credentials found.\n' +
      `   Expected GOOGLE_PRIVATE_KEY, a key file at\n` +
      `   ${LOCAL_KEY_PATH}, --key <path>, or GOOGLE_PRIVATE_KEY_PATH in\n` +
      `   ${CONFIG_PATH}`,
  );
}

function buildAuth(credentials) {
  const options = { email: credentials.email, scopes: SCOPES };
  if (credentials.key) options.key = credentials.key;
  if (credentials.keyFile) options.keyFile = credentials.keyFile;
  return new google.auth.JWT(options);
}

// ---- the commands -------------------------------------------------------

async function listSpreadsheets(drive) {
  const res = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    fields: 'files(id,name,modifiedTime,owners(emailAddress))',
    orderBy: 'name',
    pageSize: 50,
  });
  const files = res.data.files || [];
  if (files.length === 0) {
    console.log('No spreadsheets are shared with this service account.');
    return;
  }
  console.log(`${files.length} spreadsheet(s):\n`);
  for (const file of files) {
    console.log(`  ${file.name}`);
    console.log(`    id: ${file.id}`);
    console.log(`    last changed: ${file.modifiedTime}`);
    console.log('');
  }
}

async function readSheet(sheets, spreadsheetId, sheetName, range, gid) {
  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'properties.title,sheets.properties',
  });
  const tabs = (res.data.sheets || []).map((s) => s.properties);
  console.log(`Spreadsheet: ${res.data.properties?.title || spreadsheetId}`);
  console.log(`Tabs: ${tabs.map((t) => `${t.title}(${t.gridProperties?.rowCount}x${t.gridProperties?.columnCount})`).join(', ')}\n`);

  // A tab can be named or numbered. The number is the one in the tab's link
  // (the `gid=` in the address), which is what a screenshot of the link gives.
  const target =
    sheetName ||
    (gid !== undefined && gid !== true
      ? (tabs.find((t) => String(t.sheetId) === String(gid)) || {}).title
      : undefined) ||
    tabs[0]?.title;

  if (!target) {
    console.error(`No tab with the number ${gid} on this spreadsheet.`);
    console.error(`The tabs are: ${tabs.map((t) => `${t.title} (${t.sheetId})`).join(', ')}`);
    process.exit(1);
  }

  const values = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${target}!${range || 'A:Z'}`,
  });
  const rows = values.data.values || [];

  if (rows.length === 0) {
    console.log(`The tab "${target}" is empty.`);
    return;
  }

  const width = Math.max(...rows.map((r) => r.length));
  const letter = (n) => {
    let s = '';
    let x = n;
    while (x > 0) {
      const m = (x - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      x = Math.floor((x - 1) / 26);
    }
    return s;
  };

  console.log(`Tab "${target}" — ${rows.length} row(s), ${width} column(s)\n`);
  console.log('HEADINGS');
  rows[0].forEach((cell, i) => {
    if (String(cell ?? '').trim() !== '') console.log(`  ${letter(i + 1)}  ${cell}`);
  });
  console.log('');

  for (let r = 1; r < rows.length; r += 1) {
    console.log(`ROW ${r + 1}`);
    rows[r].forEach((cell, i) => {
      if (String(cell ?? '').trim() !== '') console.log(`  ${letter(i + 1)}  ${cell}`);
    });
    console.log('');
  }
}

async function appendRow(sheets, spreadsheetId, tab, row) {
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tab}!A:Z`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });
  console.log(`Appended one row to "${tab}".`);
}

// ---- entry point --------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] || 'list';

  let credentials;
  try {
    credentials = loadCredentials(args);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  if (!credentials.email) {
    console.error('GOOGLE_SERVICE_ACCOUNT_EMAIL is not set.');
    process.exit(1);
  }

  console.log(`Using service account: ${credentials.email}\n`);

  const auth = buildAuth(credentials);
  const sheets = google.sheets({ version: 'v4', auth });
  const drive = google.drive({ version: 'v3', auth });

  try {
    if (command === 'list') {
      await listSpreadsheets(drive);
    } else if (command === 'read') {
      const id = args._[1] || process.env.INVOICE_SHEET_SPREADSHEET_ID || '1_25bZSbaJHkKosX7RZ4_LPgQp_NwSvpTXJUFwBLSeig';
      await readSheet(sheets, id, args.sheet, args.range, args.gid);
    } else if (command === 'append') {
      const id = args._[1];
      if (!id) throw new Error('append needs a spreadsheet id.');
      const row = JSON.parse(String(args.row || '[]'));
      await appendRow(sheets, id, String(args.tab || 'Sheet1'), row);
    } else {
      console.error(`Unknown command "${command}". Use list, read or append.`);
      process.exit(1);
    }
  } catch (error) {
    const status = error?.response?.status;
    if (status === 403) {
      console.error(
        `Google refused the request (403).\n` +
          `   The service account has to be given access to the sheet:\n` +
          `   Share it with ${credentials.email} as an Editor — the site's\n` +
          `   expense form writes rows into it, so Viewer is not enough.`,
      );
    } else if (status === 404) {
      console.error(
        `Google could not find the sheet (404).\n` +
          `   Check the spreadsheet id, and that the sheet is shared with\n` +
          `   ${credentials.email}.`,
      );
    } else {
      console.error(`It failed: ${error?.message || error}`);
    }
    process.exit(1);
  }
}

main();
