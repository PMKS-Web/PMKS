/**
 * The logo, icons and favicons, as a browser actually receives them.
 *
 * `src/app/model/brand.spec.ts` checks that every brand file the source names
 * exists. This checks what the unit test cannot: that the server hands each one
 * out under the address the page asks for, with a type a browser will accept,
 * and that the two places the logo is drawn -- the startup screen and the top
 * bar -- draw it. A favicon that 404s raises no error anywhere; it is simply a
 * blank tab.
 *
 *   PMKS_BASE_URL=http://localhost:4200 node e2e/brand.mjs
 */

const playwright = process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright';
const { chromium } = await import(playwright + '/node_modules/playwright/index.mjs');
import { mkdirSync } from 'node:fs';
import { waitForReady } from './app-ready.mjs';
import { startQuiet } from './quiet-start.mjs';
import { TEMPLATE_LINKAGES as payloads } from './template-payloads.mjs';

const BASE = process.env.PMKS_BASE_URL ?? process.env.PMKS_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/brand';
mkdirSync(OUT, { recursive: true });

const results = [];
const record = (name, ok, detail) => {
  results.push([name, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

const TYPES = {
  svg: /image\/svg\+xml/,
  png: /image\/png/,
  ico: /image\/(x-icon|vnd\.microsoft\.icon)/,
};
const browser = await chromium.launch();
const errors = [];

/** Fetch `path` from the app's own server and say whether it came back as its kind. */
async function served(request, path) {
  const response = await request.get(new URL(path, BASE + '/').href);
  const kind = path.split('.').pop();
  const type = response.headers()['content-type'] ?? '';
  return {
    ok: response.status() === 200 && TYPES[kind].test(type),
    status: response.status(),
    type,
  };
}

// The startup screen, held up by turning scripts off: it is painted from the
// HTML before the bundle runs, and taken down by the bundle, so without
// scripts it stays and can be looked at.
{
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    javaScriptEnabled: false,
  });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  const mark = await page.locator('#bootSplash .bootMark').evaluate((img) => ({
    loaded: img.complete && img.naturalWidth > 0,
    src: img.currentSrc,
    height: img.getBoundingClientRect().height,
  }));
  record(
    'the startup screen draws the logo',
    mark.loaded && mark.src.endsWith('assets/brand/pmks-logo.svg'),
    mark
  );
  record('at the height it holds room for', Math.abs(mark.height - 44) < 0.5, mark);
  await page.locator('#bootSplash').screenshot({ path: `${OUT}/startup.png` });

  // Every icon the head names, and every icon the manifest names.
  const head = await page.evaluate(() =>
    [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')].map((link) =>
      link.getAttribute('href')
    )
  );
  record('the head names a favicon, an SVG favicon and a touch icon', head.length === 3, head);
  for (const href of head) {
    const result = await served(context.request, href);
    record(`the head's ${href} is served`, result.ok, result);
  }

  const manifest = await (await context.request.get(`${BASE}/manifest.webmanifest`)).json();
  for (const { src } of manifest.icons) {
    const result = await served(context.request, src);
    record(`the manifest's ${src} is served`, result.ok, result);
  }

  // Asked for when a page names no icon, and by most crawlers regardless.
  const root = await served(context.request, 'favicon.ico');
  record('/favicon.ico is served', root.ok, root);

  // The preview card is named absolutely, at production; this checks the same
  // path on the server under test.
  const card = await page.locator('meta[property="og:image"]').getAttribute('content');
  const cardPath = new URL(card).pathname.slice(1);
  record(
    'the link preview names the card at production',
    card === 'https://app.pmksplus.com/assets/brand/social-card.png',
    card
  );
  const cardServed = await served(context.request, cardPath);
  record('and the card is served', cardServed.ok, cardServed);
  await context.close();
}

// The top bar, in the running app.
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await startQuiet(context);
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  // The app can be ready before the image is: wait for the request to settle
  // either way, so a slow load is not read as a missing logo.
  await page
    .locator('app-top-bar img.logo')
    .evaluate((img) => (img.complete ? null : img.decode().catch(() => null)));
  const logo = await page.locator('app-top-bar img.logo').evaluate((img) => {
    const box = img.getBoundingClientRect();
    return {
      loaded: img.complete && img.naturalWidth > 0,
      src: img.currentSrc,
      width: box.width,
      height: box.height,
    };
  });
  record(
    'the top bar draws the logo',
    logo.loaded && logo.src.endsWith('assets/brand/pmks-logo.svg'),
    logo
  );
  // The SVG's own proportions, not a box it is squeezed into.
  record(
    'in its own proportions',
    Math.abs(logo.width / logo.height - 90.029 / 34.55) < 0.02,
    logo
  );
  await page.locator('app-top-bar .brandCard').screenshot({ path: `${OUT}/top-bar.png` });
  await context.close();
}

record('no page errors', errors.length === 0, errors);
await browser.close();

const failed = results.filter(([, ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
