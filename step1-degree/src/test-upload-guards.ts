import * as fs from 'node:fs';
import { chromium } from 'playwright';
fs.writeFileSync('/tmp/fake-transcript.pdf', '%PDF-1.4 fake binary content \x00\x01\x02 that is not csv at all,,,,');
fs.writeFileSync('/tmp/bad.csv', 'hello,world\nthis,is,not,a,cohort,csv\n1,2,3\n');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:4050/issuer.html');
await page.waitForTimeout(1200);

await page.setInputFiles('#csvFile', '/tmp/fake-transcript.pdf');
await page.waitForTimeout(500);
console.log('PDF upload →', (await page.locator('#preview').textContent())?.slice(0, 90));
console.log('  batch button disabled?', await page.locator('#batchBtn').isDisabled());

await page.setInputFiles('#csvFile', '/tmp/bad.csv');
await page.waitForTimeout(500);
console.log('bad CSV →', (await page.locator('#preview').textContent())?.slice(0, 90));

await page.setInputFiles('#csvFile', 'data/batch-granular-50.csv');
await page.waitForTimeout(500);
console.log('good CSV →', (await page.locator('#preview').textContent())?.slice(0, 60));
console.log('  batch button disabled?', await page.locator('#batchBtn').isDisabled());
await browser.close();
process.exit(0);
