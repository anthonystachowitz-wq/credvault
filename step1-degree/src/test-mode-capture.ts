import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage();
let postedMode: string | null = null;
await page.route('**/api/issuer/batch', async (route) => {
  const body = route.request().postDataJSON() as any;
  postedMode = body.cohort.transcriptMode;
  await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ jobId: 'fake-job-1' }) });
});
await page.route('**/api/issuer/jobs/**', async (route) => {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'done', log: ['ok'] }) });
});
await page.goto('http://localhost:4050/issuer.html');
await page.waitForTimeout(1200);
await page.setInputFiles('#csvFile', 'data/batch-monolithic-50.csv');
await page.waitForTimeout(500);
await page.selectOption('#mode', 'monolithic');   // change mode AFTER picking the file
await page.click('#batchBtn');
await page.waitForTimeout(1500);
console.log('mode sent to server:', postedMode, '→', postedMode === 'monolithic' ? '✅ FIXED' : '✗ still broken');
await browser.close();
process.exit(0);
