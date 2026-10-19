const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://atelier-erp.vercel.app/login');
  await page.fill('input[name="email"]', 'rishvin787@gmail.com');
  await page.fill('input[name="password"]', 'temp098');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/');
  await page.goto('https://atelier-erp.vercel.app/operations/maintenance');
  await page.waitForTimeout(3000);
  const text = await page.innerText('body');
  console.log('Maintenance page text snippet:', text.slice(0,500));
  await browser.close();
})();
