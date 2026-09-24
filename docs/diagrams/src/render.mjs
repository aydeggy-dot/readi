/**
 * Renders every diagram in this folder.
 *
 *   node docs/diagrams/src/render.mjs            # SVG into docs/diagrams (what the repo keeps)
 *   node docs/diagrams/src/render.mjs --png      # PNG at 2x, for slides or a Word export
 *   node docs/diagrams/src/render.mjs --png out/ # PNG into another folder
 *
 * Needs the Chromium Playwright installs for the e2e suite
 * (`pnpm --filter @readi/web exec playwright install chromium`).
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const png = args.includes('--png');
const outDir = path.resolve(args.find((a) => !a.startsWith('--')) ?? path.join(here, '..'));
const require = createRequire(path.join(process.cwd(), 'apps/web/package.json'));
const { chromium } = require('@playwright/test');

const NAMES = {
  d1: 'figure-01-system-architecture', d11: 'figure-02-contract-pipeline',
  d2: 'figure-03-delivery-map', d3: 'figure-04-candidate-journey',
  d7: 'figure-05-data-model', d5: 'figure-06-content-workflow',
  d12: 'figure-07-question-bank-status', d9: 'figure-08-privacy-lifecycle',
  d4: 'figure-09-interview-state-machine', d6: 'figure-10-evaluation-to-readiness',
  d8: 'figure-11-voice-mode-latency', d10: 'figure-12-dependencies-by-milestone',
};

const parts = [fs.readFileSync(path.join(here, 'head.html'), 'utf8')];
for (let i = 1; i <= 12; i++) parts.push(fs.readFileSync(path.join(here, `d${i}.html`), 'utf8'));
parts.push('</body></html>');
// The page must sit beside kit.js, or its <script src> does not resolve.
const pageFile = path.join(here, '.render.html');
fs.writeFileSync(pageFile, parts.join('\n'));

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto('file://' + pageFile);
await page.waitForTimeout(300);
fs.mkdirSync(outDir, { recursive: true });

for (const id of await page.$$eval('.d', (els) => els.map((e) => e.id))) {
  const name = NAMES[id] ?? id;
  if (png) {
    const file = path.join(outDir, `${name}.png`);
    await (await page.$('#' + id)).screenshot({ path: file });
    console.log('wrote', path.relative(process.cwd(), file));
  } else {
    const svg = await page.$eval(`#${id} svg`, (el) => el.outerHTML);
    const file = path.join(outDir, `${name}.svg`);
    fs.writeFileSync(file, `<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n`);
    console.log('wrote', path.relative(process.cwd(), file), `(${(Buffer.byteLength(svg) / 1024).toFixed(0)} KB)`);
  }
}
await browser.close();
fs.unlinkSync(pageFile);
