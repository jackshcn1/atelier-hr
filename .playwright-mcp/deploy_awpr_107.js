const fs = require('fs');
const { chromadb } = {}; // unused
async (page) => {
  const phpPath = '/Users/claude/Documents/Claude Code Projects/Ambrosia Website 2026/custom-plugins/ambrosia-weight-picker-repair/ambrosia-weight-picker-repair.php';
  const content = fs.readFileSync(phpPath, 'utf8');
  await page.goto('https://staging.theambrosia.com/wp-admin/plugin-editor.php?file=ambrosia-weight-picker-repair/ambrosia-weight-picker-repair.php');
  await page.waitForSelector('.CodeMirror');
  await page.waitForTimeout(500);
  // Set value via CodeMirror
  await page.evaluate((c) => {
    const cm = document.querySelector('.CodeMirror');
    if (cm && cm.CodeMirror) cm.CodeMirror.setValue(c);
  }, content);
  await page.waitForTimeout(800);
  const len = await page.evaluate(() => {
    const cm = document.querySelector('.CodeMirror');
    return cm ? cm.CodeMirror.getValue().length : 0;
  });
  // Submit
  await page.click('#submit');
  // Wait for either networkidle or the notice
  let notice = '';
  for (let i = 0; i < 30; i++) {
    notice = await page.evaluate(() => {
      const el = document.querySelector('.updated, .notice, .error, .success');
      return el ? el.textContent.substring(0, 200) : '';
    }).catch(() => '');
    if (notice) break;
    await page.waitForTimeout(500);
  }
  const finalUrl = page.url();
  return { submitted: true, cmLen: len, lenExpected: content.length, notice, finalUrl };
}
