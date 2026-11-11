/**
 * Where a link's automatic center of mass is, during a gesture and after it (#156).
 *
 * - A tracer point dragged along a bar does not pull the CoM mark: mid-drag and
 *   after release it is the middle of the bar.
 * - Dragged off the bar, the mark shown mid-drag is the one the drag settles on
 *   -- no jump at release.
 * - A crank drawn as a disc has its CoM on its ground pin.
 * - A welded body whose CoM was placed by hand says so when unwelding drops it.
 *
 * Every step leaves a screenshot in artifacts/center-of-mass/, the drags as a
 * three-frame filmstrip (before, held, released).
 *
 *   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/center-of-mass.mjs
 */

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { mkdirSync } from 'node:fs';
import { waitForReady } from './app-ready.mjs';
import { inAngular } from './in-angular.mjs';
import { TEMPLATE_LINKAGES } from './template-payloads.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/center-of-mass';
mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};
const near = (a, b, tol = 1e-6) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol;
const fmt = (p) => `(${p[0].toFixed(3)}, ${p[1].toFixed(3)})`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
await page.addInitScript(() => {
  localStorage.setItem('whatsNewSeen', '2026.09');
  localStorage.setItem('tutorialSeen', '1');
});
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

async function open() {
  await page.goto(`${BASE}/?${TEMPLATE_LINKAGES['4-Bar']}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  // The templates store every link's CoM as placed by hand, at the bar's
  // middle. Hand it back to the shape, as a freshly drawn link has it --
  // which is what "Back to the shape's centroid" does.
  await inAngular(page, () => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    grid.mechanismSrv.links.forEach((link) => {
      link.comIsCustom = false;
      link.moiIsCustom = false;
    });
    grid.mechanismSrv.updateMechanism(true);
  });
  await page.waitForTimeout(400);
}

/** The coupler: the one bar with no ground pin. */
const couplerCoM = () =>
  inAngular(page, () => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const link = grid.mechanismSrv.links.find(
      (one) => one.joints.length >= 2 && one.joints.every((joint) => !joint.ground)
    );
    return [link.CoM.x, link.CoM.y];
  });

/** A joint's position on screen, in client pixels. */
const screenOf = (id) =>
  inAngular(
    page,
    (jointId) => {
      const grid = ng.getComponent(document.querySelector('app-new-grid'));
      const joint = grid.mechanismSrv.joints.find((one) => one.id === jointId);
      const at = grid.svgGrid.modelToScreen({ x: joint.x, y: joint.y });
      return [at.x, at.y];
    },
    id
  );

// --- A tracer on the coupler ----------------------------------------------
await open();
const tracer = await inAngular(page, () => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const srv = grid.mechanismSrv;
  const link = srv.links.find(
    (one) => one.joints.length === 2 && one.joints.every((joint) => !joint.ground)
  );
  link.mass = 1;
  srv.updateMechanism(true);
  grid.activeObjService.updateSelectedObj(link);
  const [a, b] = link.joints;
  // A quarter of the way along the bar, exactly on its line.
  srv.addJointAt({ x: a.x + (b.x - a.x) * 0.25, y: a.y + (b.y - a.y) * 0.25 });
  const added = srv.joints[srv.joints.length - 1];
  grid.activeObjService.updateSelectedObj(added);
  return { id: added.id, a: [a.x, a.y], b: [b.x, b.y] };
});
await page.waitForTimeout(400);
const middle = [(tracer.a[0] + tracer.b[0]) / 2, (tracer.a[1] + tracer.b[1]) / 2];
check(near(await couplerCoM(), middle), 'a tracer on the bar leaves its CoM in the middle');

const [tx, ty] = await screenOf(tracer.id);
// Along the bar, toward its far end.
const [ex, ey] = await inAngular(
  page,
  ({ b }) => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const at = grid.svgGrid.modelToScreen({ x: b[0], y: b[1] });
    return [at.x, at.y];
  },
  { b: tracer.b }
);
await page.screenshot({ path: `${OUT}/along-1-before.png` });
await page.mouse.move(tx, ty);
await page.mouse.down();
const along = [tx + (ex - tx) * 0.6, ty + (ey - ty) * 0.6];
await page.mouse.move(along[0], along[1], { steps: 12 });
await page.waitForTimeout(150);
const heldAlong = await couplerCoM();
await page.screenshot({ path: `${OUT}/along-2-held.png` });
await page.mouse.up();
await page.waitForTimeout(400);
const releasedAlong = await couplerCoM();
await page.screenshot({ path: `${OUT}/along-3-released.png` });
check(
  near(heldAlong, middle, 1e-3),
  'dragged along the bar, the held CoM stays in the middle',
  fmt(heldAlong)
);
check(near(releasedAlong, heldAlong, 1e-3), 'and release does not move it', fmt(releasedAlong));

// Off the bar: what shows while held is what it settles on.
const [ox, oy] = await screenOf(tracer.id);
await page.mouse.move(ox, oy);
await page.mouse.down();
await page.mouse.move(ox + 10, oy - 90, { steps: 12 });
await page.waitForTimeout(150);
const heldOff = await couplerCoM();
await page.screenshot({ path: `${OUT}/off-2-held.png` });
await page.mouse.up();
await page.waitForTimeout(400);
const releasedOff = await couplerCoM();
await page.screenshot({ path: `${OUT}/off-3-released.png` });
check(!near(heldOff, middle, 1e-3), 'dragged off the bar, the CoM moves into the plate');
check(
  near(releasedOff, heldOff, 1e-3),
  'and the mark shown while held is where it settles',
  `${fmt(heldOff)} → ${fmt(releasedOff)}`
);

// --- A crank drawn as a disc ----------------------------------------------
await open();
const disc = await inAngular(page, () => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const srv = grid.mechanismSrv;
  const crank = srv.links.find((one) => one.canBeCircular && one.canBeCircular());
  if (!crank) throw new Error('no link can be drawn as a disc');
  crank.mass = 1;
  crank.isCircle = true;
  srv.updateMechanism(true);
  grid.activeObjService.updateSelectedObj(crank);
  const pin = crank.groundPivot();
  return { com: [crank.CoM.x, crank.CoM.y], pin: [pin.x, pin.y], moi: crank.massMoI };
});
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/disc.png` });
check(near(disc.com, disc.pin), 'a disc has its CoM on its ground pin', fmt(disc.com));
check(disc.moi > 0, 'and an inertia of its own', String(disc.moi));

// --- Unwelding a body with a hand-placed CoM -------------------------------
await open();
await inAngular(page, () => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const srv = grid.mechanismSrv;
  // The coupler's far end, shared with the rocker.
  const coupler = srv.links.find(
    (one) => one.joints.length === 2 && one.joints.every((joint) => !joint.ground)
  );
  const shared = coupler.joints.find(
    (joint) =>
      !srv.links.some(
        (link) =>
          link !== coupler && link.joints.includes(joint) && link.joints.some((j) => j.input)
      )
  );
  grid.activeObjService.updateSelectedObj(shared);
  srv.weldJoint();
  if (!srv.links.some((link) => link.subset && link.subset.length > 0)) throw new Error('no weld');
  const body = srv.links.find((link) => link.subset && link.subset.length > 0);
  body.placeCustomCoM({ x: body.CoM.x + 50, y: body.CoM.y + 50 });
  srv.updateMechanism(true);
  grid.activeObjService.updateSelectedObj(shared);
  srv.unweldSelectedJoint();
});
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/unweld-notice.png` });
const notice = await page.locator('app-notification-stack').allInnerTexts();
check(
  notice.some((text) => /came apart, so the center of mass you set/.test(text)),
  'unwelding says the placed CoM no longer applies',
  JSON.stringify(notice)
);

check(errors.length === 0, 'no page errors', errors.join(' | '));
await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
