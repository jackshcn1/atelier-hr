/**
 * tests/google-drive-verify.mjs
 *
 * The Google sign-in broke once already: the person agreed to everything, came
 * back, and the site said the sign-in had not gone through. The cause was a
 * single line — the access token was handed to the Drive library as a bare
 * string, which the library sends as an API key, and Drive turns an API key
 * away with "API keys are not supported by this API".
 *
 * Nothing caught it, because the one function it lived in had no test. These
 * checks look at what the request actually carries, against a local server —
 * no Google account, no network.
 *
 * Run: npm run test:drive
 */

import assert from 'node:assert/strict';
import http from 'node:http';
import { google } from 'googleapis';
import { accountEmail } from '../lib/googleUserDrive.js';

let passed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
    process.exitCode = 1;
  }
}

console.log('google drive');

// A local server that stands in for Drive, and remembers what it was sent.
let seen = null;
const server = http.createServer((req, res) => {
  seen = {
    url: req.url,
    authorization: req.headers.authorization || null,
  };
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ user: { emailAddress: 'apirishab@gmail.com' } }));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const rootUrl = `http://127.0.0.1:${server.address().port}/`;

await check('the access token travels as a bearer token, not as an API key', async () => {
  seen = null;
  const email = await accountEmail('ya29.fake-access-token', { rootUrl });

  assert.equal(email, 'apirishab@gmail.com', 'the account email was not read');
  assert.match(seen.authorization || '', /^Bearer ya29\.fake-access-token$/,
    `the request carried "${seen.authorization}" instead of a bearer token`);
  assert.equal(/[?&]key=/.test(seen.url), false,
    `the request sent the token as an API key: ${seen.url}`);
});

await check('a token handed over as a bare string is sent as an API key — the bug', async () => {
  // This is what the code used to do. It is spelled out here so the mistake
  // cannot come back unnoticed: Drive refuses an API key for this endpoint.
  seen = null;
  const client = google.drive({ version: 'v3', auth: 'ya29.fake-access-token', rootUrl });
  client.about.get({ fields: 'user' }).catch(() => {});

  // The request is made in the background; wait for it to arrive.
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal(seen?.authorization, null,
    'a bare token should not have produced a bearer header');
  assert.equal(/[?&]key=ya29\.fake-access-token/.test(seen?.url || ''), true,
    `a bare token should have been sent as an API key, not as "${seen?.url}"`);
});

server.close();

console.log(`\n${passed} check(s) passed`);
if (process.exitCode) process.exit(process.exitCode);
