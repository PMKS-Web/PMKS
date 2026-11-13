/**
 * A link is named after its joints until somebody names it (#317).
 *
 * Opened from a template, the four-bar's crank `AB` used to keep that name when
 * a tracer point was added to it, while the same link drawn by hand became
 * `ABE`. The URL wrote the automatic name down and the reader took it back as
 * one somebody typed. This drives the template the way a reader would --
 * right-click the crank, Tracer Point, click the crank -- and reads the name
 * the Edit panel heads it with. Then an undo and a redo, which round-trip the
 * drawing through the URL again, and a second tracer point.
 *
 *   PMKS_PLAYWRIGHT_DIR=$PWD PMKS_BASE_URL=http://localhost:4200 node e2e/link-auto-names.mjs
 */
import { mkdirSync } from 'node:fs';

const playwright = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
const { chromium } = playwright;
import { waitForReady } from './app-ready.mjs';
import { TEMPLATE_LINKAGES as payloads } from './template-payloads.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/link-auto-names';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.addInitScript(() => localStorage.setItem('whatsNewSeen', '2026.09'));
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

const results = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

/** A point on the link a little to one side of the middle, so the click lands on the bar. */
const onLink = (id, along = 0.5) =>
  page.evaluate(
    ([linkId, t]) => {
      const c = ng.getComponent(document.querySelector('app-new-grid'));
      const link = c.mechanismSrv.links.find((l) => l.id === linkId);
      const [a, b] = link.joints
        .slice(0, 2)
        .map((j) =>
          document.querySelector(`#joint_${j.id}`).closest('svg[x]').getBoundingClientRect()
        );
      const ax = a.x + a.width / 2;
      const ay = a.y + a.height / 2;
      const bx = b.x + b.width / 2;
      const by = b.y + b.height / 2;
      return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
    },
    [id, along]
  );

const links = () =>
  page.evaluate(() =>
    ng
      .getComponent(document.querySelector('app-new-grid'))
      .mechanismSrv.links.map((l) => ({ id: l.id, name: l.name }))
  );

const panelTitle = () =>
  page.evaluate(
    () =>
      document
        .querySelector('editable-title-block .titleRow')
        ?.textContent?.replace(/\s+/g, ' ')
        .trim() ?? ''
  );

async function addTracer(linkId, along) {
  const at = await onLink(linkId, along);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await page.waitForTimeout(300);
  await page.locator('#contextMenu .cm-row__label', { hasText: 'Tracer Point' }).first().click();
  await page.waitForTimeout(700);
}

async function selectLink(linkId, along) {
  await page.mouse.click(1300, 120);
  await page.waitForTimeout(200);
  const at = await onLink(linkId, along);
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(400);
}

await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);

await addTracer('AB', 0.5);
const grown = (await links()).find((l) => l.id.startsWith('AB') && l.id.length === 3);
record(
  'a tracer point on a template’s crank renames it after its joints',
  grown && grown.name === grown.id,
  await links()
);
await selectLink(grown?.id ?? 'AB', 0.25);
const title = await panelTitle();
record('and the Edit panel heads it with that name', title.includes(grown?.id ?? '?'), title);
await page.screenshot({ path: `${OUT}/template-crank-after-tracer.png` });

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
await page.mouse.click(1300, 120);
await page.keyboard.press(`${mod}+z`);
await page.waitForTimeout(700);
await page.keyboard.press(`${mod}+Shift+z`);
await page.waitForTimeout(700);
await addTracer(grown?.id ?? 'AB', 0.75);
const twice = (await links()).find((l) => l.id.startsWith('AB') && l.id.length === 4);
record(
  'and after an undo and a redo, a second one renames it again',
  twice && twice.name === twice.id,
  await links()
);

record('no page errors', errors.length === 0, errors);
await browser.close();
const failed = results.filter(([, ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
