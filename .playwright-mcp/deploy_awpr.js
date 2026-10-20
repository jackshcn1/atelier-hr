async (page) => {
  const fs = require('fs');
  const phpPath = '/Users/claude/Documents/Claude Code Projects/Ambrosia Website 2026/custom-plugins/ambrosia-weight-picker-repair/ambrosia-weight-picker-repair.php';
  const content = fs.readFileSync(phpPath, 'utf8');

  await page.goto('https://staging.theambrosia.com/wp-admin/plugin-editor.php?file=ambrosia-weight-picker-repair/ambrosia-weight-picker-repair.php');
  await page.waitForTimeout(3000);

  const mode = await page.evaluate((c) => {
    const cm = document.querySelector('.CodeMirror');
    if (cm && cm.CodeMirror) { cm.CodeMirror.setValue(c); return 'codemirror'; }
    const ta = document.querySelector('#newcontent');
    if (ta) { ta.value = c; return 'textarea'; }
    return 'none';
  }, content);
  await page.waitForTimeout(1500);

  const len = await page.evaluate(() => {
    const cm = document.querySelector('.CodeMirror');
    if (cm && cm.CodeMirror) return cm.CodeMirror.getValue().length;
    const ta = document.querySelector('#newcontent');
    return ta ? ta.value.length : 0;
  });

  await page.click('#submit');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  const msg = await page.evaluate(() => {
    const el = document.querySelector('.notice, .updated, .error');
    return el ? el.innerText.substring(0, 400) : 'no notice';
  });

  return { mode, len, expected: content.length, msg };
}
