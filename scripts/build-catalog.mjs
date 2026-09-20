// Renders docs/catalog/asset-catalog.pdf from src/data/catalog.json.
//
//   npm run catalog
//
// Everything in the catalogue is drawn by the game's own model code, so the
// page has to run in a browser with WebGL: this starts the Vite dev server,
// opens scripts/catalog/page.html in headless Chromium, waits for the renders
// and prints the result.

import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const OUT = resolve(root, 'docs/catalog/asset-catalog.pdf');
const PORT = 5199;

// Playwright is a development tool, not a dependency of the game — take it
// from wherever this machine has it.
function loadPlaywright() {
  const require = createRequire(import.meta.url);
  for (const id of ['playwright', 'playwright-core', '/opt/node22/lib/node_modules/playwright/index.js']) {
    try { return require(id); } catch { /* try the next one */ }
  }
  throw new Error('catalogue: playwright not found — install it, or run this where it is available');
}

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

async function serve() {
  const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: root, stdio: 'ignore', detached: false,
  });
  for (let attempt = 0; attempt < 40; attempt++) {
    await wait(250);
    try {
      const response = await fetch(`http://localhost:${PORT}/scripts/catalog/page.html`);
      if (response.ok) return server;
    } catch { /* not up yet */ }
  }
  server.kill();
  throw new Error('catalogue: dev server did not start');
}

async function main() {
  const { chromium } = loadPlaywright();
  const server = await serve();
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });

  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });
    page.on('pageerror', (error) => console.error('page error:', error.message));
    await page.goto(`http://localhost:${PORT}/scripts/catalog/page.html`);
    await page.waitForSelector('body[data-ready="yes"]', { timeout: 15 * 60 * 1000 });

    const counts = await page.evaluate(() => window.__catalogue);
    await mkdir(dirname(OUT), { recursive: true });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    await writeFile(OUT, pdf);

    const size = (pdf.length / 1024 / 1024).toFixed(1);
    console.log(`catalogue: ${counts.assets} assets in ${counts.categories} categories `
      + `(${counts.built} modelled) → ${OUT} (${size} MB)`);
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }
}

await main();
