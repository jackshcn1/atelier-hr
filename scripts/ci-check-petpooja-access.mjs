/**
 * ci-check-petpooja-access.mjs — diagnose why billing.petpooja.com refuses a
 * connection from a CI runner.
 *
 * Prints, for the runner's IP:
 *   1. Plain HTTP status (no browser)
 *   2. Status with a normal desktop Chrome User-Agent
 *   3. Status + page title + body excerpt through real Chrome
 *
 * A bare "403 Forbidden" body points at an edge/IP reputation block, while a
 * Cloudflare or CAPTCHA page points at bot detection that can be worked around.
 */
const URL = 'https://billing.petpooja.com/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const show = (label, status, body) => {
  const text = String(body || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  console.log(`--- ${label} ---`);
  console.log(`  status: ${status}`);
  console.log(`  body  : ${text || '(empty)'}`);
  console.log('');
};

for (const [label, headers] of [
  ['plain fetch', {}],
  ['chrome user-agent', { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' }],
]) {
  try {
    const res = await fetch(URL, { headers, redirect: 'follow' });
    show(label, res.status, await res.text());
  } catch (e) {
    show(label, 'ERROR', e.message);
  }
}

try {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: false, channel: 'chrome' });
  const page = await browser.newPage();
  const res = await page.goto(URL, { waitUntil: 'load', timeout: 45000 });
  const title = await page.title();
  const body = await page.locator('body').innerText().catch(() => '');
  console.log('--- real chrome (headed) ---');
  console.log(`  status: ${res ? res.status() : 'no response'}`);
  console.log(`  title  : ${title}`);
  console.log(`  body   : ${String(body).replace(/\s+/g, ' ').trim().slice(0, 300) || '(empty)'}`);
  console.log(`  final  : ${page.url()}`);
  await browser.close();
} catch (e) {
  console.log('--- real chrome (headed) ---');
  console.log(`  ERROR: ${e.message.split('\n')[0]}`);
}
