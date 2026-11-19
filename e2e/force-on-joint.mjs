/**
 * A force never sits on a joint where a second body meets its link (issue #138).
 *
 * A load acts on one body. On a tracer point that body is the link, and the
 * load may sit there. Where another link meets it, or the ground, or a
 * slider's slot, the load does not say which body carries it -- so:
 *
 *   - dragged onto a grounded pin, the anchor is held short of it and the
 *     reason is said, as it is at a pin two links share;
 *   - a drawing that arrives with a load on a grounded pin opens with the load
 *     moved a short way along its link, and says so;
 *   - a tracer point carrying a load that another link's end is merged onto
 *     keeps the merge, and the load moves off the joint and says so.
 *   - a loaded bar renamed by a merge, then welded, undoes one step at a time
 *     with no entry refusing to open (issue #322).
 *
 *   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/force-on-joint.mjs
 */

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { mkdirSync } from 'node:fs';
import { waitForReady } from './app-ready.mjs';
import { contactSheet, filmstrip } from './filmstrip.mjs';
import { TEMPLATE_LINKAGES as payloads } from './template-payloads.mjs';
import { onGrid } from './in-angular.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/force-on-joint';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

const results = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

/** Model-space point to screen, through the layer the mechanism is drawn in. */
const toScreen = (x, y) =>
  page.evaluate(
    ([modelX, modelY]) => {
      const m = document.querySelector('#linkHolder').getScreenCTM();
      return { x: modelX * m.a + modelY * m.c + m.e, y: modelX * m.b + modelY * m.d + m.f };
    },
    [x, y]
  );

/** The drawing as the service holds it, and what has been said. */
const state = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    return {
      joints: grid.mechanismSrv.joints.map((joint) => ({
        id: joint.id,
        x: joint.x,
        y: joint.y,
        ground: joint.ground,
        links: joint.links.length,
      })),
      force: grid.mechanismSrv.forces.map((force) => ({
        id: force.id,
        x: force.startCoord.x,
        y: force.startCoord.y,
        link: force.link.id,
      }))[0],
      said: grid.notify.live.map((one) => one.text),
    };
  });

const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
/** A joint's drawn radius, in model units: inside it, a load reads as on the joint. */
const pinRadius = async (id) =>
  page.evaluate((jointId) => {
    const node = document.querySelector(`#joint_${jointId}`);
    const m = document.querySelector('#linkHolder').getScreenCTM();
    return node.getBoundingClientRect().width / 2 / Math.hypot(m.a, m.b);
  }, id);

const openCrane = async () => {
  await page.goto(`${BASE}/?${payloads['Derrick_Crane']}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
};

// --- dragged onto the grounded foot of the boom, the anchor is held short ---
await openCrane();
const crane = await state();
const foot = crane.joints.find((joint) => joint.id === 'O');
record('the boom’s foot O is grounded on one link', foot.ground && foot.links === 1, foot);
const grab = await toScreen(crane.force.x, crane.force.y);
const ontoFoot = await toScreen(foot.x, foot.y);
const film = filmstrip(page, `${OUT}/drag-to-foot`);
await page.mouse.move(grab.x, grab.y);
await page.mouse.down();
await film.shot('0-taken-hold');
// Down the boom past C and onto the foot: the frames show the anchor held
// short of each pin in turn, and the reason changing from C's to O's.
for (let step = 1; step <= 4; step++) {
  const t = step / 4;
  await page.mouse.move(grab.x + (ontoFoot.x - grab.x) * t, grab.y + (ontoFoot.y - grab.y) * t, {
    steps: 6,
  });
  await page.waitForTimeout(120);
  await film.shot(`${step}-along-the-boom`);
}
await page.waitForTimeout(200);
const whileOver = await page.evaluate(() => !!document.querySelector('circle.snapRefused'));
await page.screenshot({ path: `${OUT}/1-over-grounded-foot.png` });
await page.mouse.up();
await page.waitForTimeout(400);
await film.shot('5-released');
contactSheet(`${OUT}/drag-to-foot/*.png`, `${OUT}/drag-to-foot-sheet.png`, 3);
const heldOff = await state();
record('over the grounded pin, the pin is ringed red', whileOver);
record(
  'and the reason is said',
  heldOff.said.some((text) => /cannot sit on joint O: the joint is grounded/.test(text)),
  heldOff.said
);
record(
  'and the anchor stops short of the pin, on the boom',
  gap(heldOff.force, foot) > (await pinRadius('O')) && heldOff.force.link === 'OCT',
  { force: heldOff.force, foot }
);

// --- a drawing that arrives with a load on a grounded pin -------------------
// The URL is made by the app itself, after the load is put on the pin behind
// the editor's back -- the way an old shared link or library drawing has it.
await openCrane();
const onPin = await onGrid(page, (grid) => {
  const force = grid.mechanismSrv.forces[0];
  const pin = grid.mechanismSrv.joints.find((joint) => joint.id === 'O');
  force.moveForceTo(pin.x, pin.y);
  return grid.saveHistoryService.urlGenerationService.generateUrlQuery();
});
await page.goto(`${BASE}/${onPin.startsWith('?') ? onPin : '?' + onPin}`, {
  waitUntil: 'domcontentloaded',
});
await waitForReady(page);
await page.waitForTimeout(300);
const opened = await state();
await page.screenshot({ path: `${OUT}/2-opened-off-the-pin.png` });
const footAgain = opened.joints.find((joint) => joint.id === 'O');
record(
  'opened, the load is no longer on the grounded pin',
  gap(opened.force, footAgain) > (await pinRadius('O')),
  { force: opened.force, foot: footAgain }
);
record(
  'and the reader is told where it went',
  opened.said.some((text) => /moved off joint O onto link Boom: the joint is grounded/.test(text)),
  opened.said
);

// --- a link merged onto the loaded tracer point -----------------------------
await openCrane();
const before = await state();
const hook = before.joints.find((joint) => joint.id === 'T');
record(
  'the load starts on the hook T, a tracer point',
  gap(before.force, hook) < 1e-6,
  before.force
);
// A new bar from empty grid beside the hook, then its free end dropped on it.
const hookOnScreen = await toScreen(hook.x, hook.y);
const from = { x: hookOnScreen.x + 220, y: hookOnScreen.y + 40 };
const to = { x: hookOnScreen.x + 120, y: hookOnScreen.y + 60 };
await page.mouse.move(from.x, from.y);
await page.mouse.click(from.x, from.y, { button: 'right' });
await page.waitForTimeout(450);
await page.locator('.cdk-overlay-container').getByText('Link', { exact: true }).first().click();
await page.waitForTimeout(350);
for (let i = 1; i <= 12; i++) {
  await page.mouse.move(from.x + ((to.x - from.x) * i) / 12, from.y + ((to.y - from.y) * i) / 12);
  await page.waitForTimeout(15);
}
await page.mouse.click(to.x, to.y);
await page.waitForTimeout(500);
const drawn = await state();
const looseEnds = drawn.joints.filter((joint) => !before.joints.some((old) => old.id === joint.id));
record('a new bar is drawn beside the hook', looseEnds.length === 2, looseEnds);
const end = looseEnds.reduce((a, b) => (gap(a, hook) < gap(b, hook) ? a : b));
const grabEnd = await toScreen(end.x, end.y);
await page.mouse.move(grabEnd.x, grabEnd.y);
await page.mouse.down();
for (let i = 1; i <= 24; i++) {
  await page.mouse.move(
    grabEnd.x + ((hookOnScreen.x - grabEnd.x) * i) / 24,
    grabEnd.y + ((hookOnScreen.y - grabEnd.y) * i) / 24
  );
  await page.waitForTimeout(10);
}
await page.waitForTimeout(150);
await page.mouse.up();
await page.waitForTimeout(600);
const merged = await state();
await page.screenshot({ path: `${OUT}/3-merged-onto-the-hook.png` });
const meeting = merged.joints.find((joint) => gap(joint, hook) < 1e-6);
record('the bar’s end merges onto the hook', !!meeting && meeting.links === 2, {
  meeting,
  said: merged.said,
});
record(
  'and the load moves off the joint, along the boom',
  !!meeting &&
    gap(merged.force, meeting) > (await pinRadius(meeting.id)) &&
    merged.force.link === 'OCT',
  { force: merged.force, meeting }
);
record(
  'and the reader is told',
  merged.said.some((text) => /moved off joint \w onto link Boom: 2 links meet there/.test(text)),
  merged.said
);

// --- a loaded bar renamed by a merge, then welded, still undoes (#322) ------
// The steps of the report's recording. Dropping D onto B renames bar CD to
// BC, and the force on it used to go on remembering "CD": every URL written
// after that named a bar the reader could not find, so each Undo refused to
// open its entry and skipped past it.
await page.evaluate(() => localStorage.clear());
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.keyboard.press('Escape');
const drawBar = async (from, to) => {
  const [start, end] = [await toScreen(from.x, from.y), await toScreen(to.x, to.y)];
  await page.mouse.click(start.x, start.y, { button: 'right' });
  await page.waitForTimeout(450);
  await page.locator('.cdk-overlay-container').getByText('Link', { exact: true }).first().click();
  await page.waitForTimeout(350);
  for (let i = 1; i <= 12; i++) {
    const along = {
      x: start.x + ((end.x - start.x) * i) / 12,
      y: start.y + ((end.y - start.y) * i) / 12,
    };
    await page.mouse.move(along.x, along.y);
    await page.waitForTimeout(15);
  }
  await page.mouse.click(end.x, end.y);
  await page.waitForTimeout(1200);
};
const dragOnScreen = async (from, to) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 20, from.y + ((to.y - from.y) * i) / 20);
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
  await page.waitForTimeout(700);
};
const shape = async () => {
  const now = await state();
  const links = await onGrid(page, (grid) => grid.mechanismSrv.links.map((link) => link.id).sort());
  return { ...now, links };
};
await drawBar({ x: -1100, y: 0 }, { x: -800, y: 280 });
await page.mouse.click(5, 500);
await drawBar({ x: -160, y: 240 }, { x: -660, y: 380 });
const nearD = await toScreen(-580, 360);
await page.mouse.click(nearD.x, nearD.y, { button: 'right' });
await page.waitForTimeout(450);
await page.locator('.cdk-overlay-container').getByText('Force', { exact: true }).first().click();
await page.waitForTimeout(350);
await page.mouse.move(nearD.x + 30, nearD.y - 100, { steps: 6 });
await page.mouse.click(nearD.x + 30, nearD.y - 100);
await page.waitForTimeout(500);
const loaded = await shape();
record(
  'two separate bars, and a force on CD',
  loaded.links.join() === 'AB,CD' && loaded.force?.link === 'CD',
  loaded
);
const pinB = loaded.joints.find((joint) => joint.id === 'B');
const pinD = loaded.joints.find((joint) => joint.id === 'D');
await dragOnScreen(await toScreen(pinD.x, pinD.y), await toScreen(pinB.x, pinB.y));
const onB = await toScreen(pinB.x, pinB.y);
await page.mouse.click(onB.x, onB.y);
await page.waitForTimeout(500);
await page.locator('app-left-tabs').getByText('Welded', { exact: true }).first().click();
await page.waitForTimeout(700);
const welded = await shape();
record(
  'D dropped onto B and B welded make one body ABC carrying the force',
  welded.links.join() === 'ABC' && welded.force?.link === 'ABC',
  welded
);
const anchor = await toScreen(welded.force.x, welded.force.y);
await page.mouse.click(anchor.x, anchor.y);
await page.waitForTimeout(400);
await dragOnScreen(anchor, onB);
const dropped = await shape();
record(
  'the force is dragged onto the welded joint B',
  gap(dropped.force, pinB) < 1e-6,
  dropped.force
);
await page.screenshot({ path: `${OUT}/4-force-on-the-welded-joint.png` });
const undoOnce = async () => {
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.waitForTimeout(900);
  return shape();
};
const undone = [await undoOnce(), await undoOnce(), await undoOnce()];
record(
  'Undo takes the force off B, then the weld, then the merge -- one step each',
  gap(undone[0].force, pinB) > 1e-6 &&
    undone[0].links.join() === 'ABC' &&
    undone[1].links.join() === 'AB,BC' &&
    undone[2].links.join() === 'AB,CD' &&
    undone[2].force?.link === 'CD',
  undone.map((one) => ({ links: one.links, force: one.force }))
);
record(
  'and no entry refuses to open',
  !undone.some((one) => one.said.some((text) => /could not be opened/.test(text))),
  undone.map((one) => one.said)
);
await page.screenshot({ path: `${OUT}/5-undone-to-the-two-bars.png` });

record('nothing threw', errors.length === 0, errors.slice(0, 2));
await browser.close();
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
