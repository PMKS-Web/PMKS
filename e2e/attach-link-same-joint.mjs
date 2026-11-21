// Attach Link: clicking the joint the gesture started from is a miss, not a
// cancel. The notice says "Click another point or joint to finish it", so the
// gesture has to still be open for that click.
//
//   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/attach-link-same-joint.mjs

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';

const results = [];
const errors = [];
const record = (label, ok, detail = '') => {
  results.push([label, ok]);
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : ` — ${JSON.stringify(detail)}`}`
  );
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
// The welcome tour covers the canvas on a first visit.
await page.evaluate(() => {
  const close = [...document.querySelectorAll('button, span, div')].find(
    (node) => node.textContent.trim() === '×'
  );
  close?.click();
});
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

/** Right-click at `at` and choose the menu's Link row. */
async function openLinkFrom(at) {
  await page.mouse.move(at.x, at.y);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await page.waitForTimeout(450);
  await page.locator('.cdk-overlay-container').getByText('Link', { exact: true }).first().click();
  await page.waitForTimeout(350);
}

/** Move in steps (the canvas places from tracked movement), then click. */
async function glideAndClick(from, to) {
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 12, from.y + ((to.y - from.y) * i) / 12);
    await page.waitForTimeout(15);
  }
  await page.mouse.click(to.x, to.y);
  await page.waitForTimeout(500);
}

const state = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    return {
      joints: document.querySelectorAll('#jointHolder [id^="joint_"]').length,
      links: document.querySelectorAll('#linkHolder path[data-channels]').length,
      creating: grid.dragState.grid !== 0,
      said: grid.notify.live.map((one) => one.text),
    };
  });

const jointCenters = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('#jointHolder [id^="joint_"]')].map((node) => {
      const box = node.getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    })
  );

// One link from empty grid.
const a = { x: 500, y: 560 };
const b = { x: 760, y: 560 };
await openLinkFrom(a);
await glideAndClick(a, b);
const built = await state();
record('a first link is drawn', built.joints === 2 && built.links === 1, built);

// Attach Link from its far joint, then click that same joint.
const [, far] = (await jointCenters()).sort((p, q) => p.x - q.x);
await openLinkFrom(far);
await page.mouse.move(far.x + 30, far.y - 30);
await page.waitForTimeout(100);
await page.mouse.move(far.x, far.y);
await page.mouse.click(far.x, far.y);
await page.waitForTimeout(500);
const missed = await state();
record(
  'clicking the start joint says a link needs two distinct joints',
  missed.said.some((text) => /two distinct joints/.test(text)),
  missed.said
);
record(
  'and leaves the gesture open, adding nothing',
  missed.creating && missed.joints === 2 && missed.links === 1,
  missed
);

// The click the notice asks for finishes the link from the same joint.
const to = { x: far.x + 140, y: far.y - 160 };
await glideAndClick(far, to);
const finished = await state();
record(
  'the next click finishes the link from that joint',
  !finished.creating && finished.joints === 3 && finished.links === 2,
  finished
);

// A joint with no links never reaches the shared-link test, so the start-joint
// check has to come first: clicking it again must not make a link with one
// joint at both ends.
const lone = { x: 560, y: 320 };
await page.evaluate(({ x, y }) => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const at = grid.svgGrid.screenToModelFromXY(x, y);
  const joint = grid.mechanismSrv.createRevJoint(at.x.toString(), at.y.toString());
  grid.mechanismSrv.mergeToJoints([joint]);
  grid.mechanismSrv.updateMechanism(true);
}, lone);
// A real input after the poke, so the canvas renders what was added.
await page.mouse.move(lone.x + 40, lone.y + 40);
await page.waitForTimeout(400);
const before = await state();
const loneAt = (await jointCenters()).find((p) => Math.hypot(p.x - lone.x, p.y - lone.y) < 20);
record('a joint with no links is drawn', !!loneAt && before.joints === 4, { before, loneAt });
if (loneAt) {
  await openLinkFrom(loneAt);
  await page.mouse.move(loneAt.x + 30, loneAt.y - 30);
  await page.waitForTimeout(100);
  await page.mouse.move(loneAt.x, loneAt.y);
  await page.mouse.click(loneAt.x, loneAt.y);
  await page.waitForTimeout(500);
  const self = await state();
  record(
    'clicking a lone start joint again adds no link',
    self.creating && self.joints === before.joints && self.links === before.links,
    self
  );
  record(
    'and says a link needs two distinct joints',
    self.said.some((text) => /two distinct joints/.test(text)),
    self.said
  );
  const next = { x: loneAt.x - 150, y: loneAt.y + 10 };
  await glideAndClick(loneAt, next);
  const joined = await state();
  record(
    'the next click finishes the link from the lone joint',
    !joined.creating && joined.joints === before.joints + 1 && joined.links === before.links + 1,
    joined
  );
}

await browser.close();
record('nothing threw', errors.length === 0, errors.slice(0, 5));
const failed = results.filter(([, ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
