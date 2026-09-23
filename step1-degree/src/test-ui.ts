import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto('http://localhost:4050/issuer.html');
await page.waitForTimeout(1500);
await page.setInputFiles('#csvFile', 'data/batch-granular-50.csv');
await page.waitForTimeout(1000);
console.log('preview:', (await page.locator('#preview').textContent())?.slice(0, 80).replace(/\s+/g, ' '));
console.log('button disabled after CSV?', await page.locator('#batchBtn').isDisabled());

await page.click('#batchBtn');
await page.waitForTimeout(3000);
console.log('batchMsg:', await page.locator('#batchMsg').textContent());

await page.waitForFunction(
  () => document.querySelector('#batchMsg')?.textContent?.match(/✅|✗/),
  { timeout: 180000 },
).catch(() => console.log('(timed out waiting for finish)'));
console.log('final batchMsg:', await page.locator('#batchMsg').textContent());
const students = await page.locator('#students table').count();
console.log('students table rendered:', students > 0 ? 'yes' : 'no');
await browser.close();
process.exit(0);
