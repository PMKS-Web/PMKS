/**
 * A tracer point lands on its bar's own line when it is nearly there (#307).
 *
 * The axis snap only lines a joint up with another joint's x or y, so on a
 * slanted bar a tracer almost never landed on the line and the bar became a
 * three-joint plate. This places one from the right-click menu a few pixels
 * off a slanted coupler, drags it away and back, and checks that it ends on
 * the line with the dotted guide showing while the hand is still down -- and
 * that Option, which turns every alignment help off, turns this one off too.
 *
 *   PMKS_BASE_URL=http://localhost:4200 node e2e/tracer-line-snap.mjs
 */

const playwright = process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright';
const { chromium } = await import(playwright + '/node_modules/playwright/index.mjs');
import { mkdirSync } from 'node:fs';
import { openMechanism } from './app-ready.mjs';
import { startQuiet } from './quiet-start.mjs';
import { TEMPLATE_LINKAGES } from './template-payloads.mjs';

const BASE = process.env.PMKS_BASE_URL ?? process.env.PMKS_URL ?? 'http://localhost:4200';
const SHOTS = 'artifacts/tracer-line-snap';
mkdirSync(SHOTS, { recursive: true });

const results = [];
const record = (name, ok, detail) => {
  results.push([name, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await startQuiet(context);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

/**
 * The coupler BC on screen, a point `t` along it pushed `off` pixels across
 * it, and how far (in screen pixels) the tracer `id` sits from its line.
 */
const geometry = (t, off, id) =>
  page.evaluate(
    ([t, off, id]) => {
      const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
      const joints = grid.mechanismSrv.joints;
      const find = (name) => joints.find((joint) => joint.id === name);
      const screen = (joint) => grid.svgGrid.modelToScreen({ x: joint.x, y: joint.y });
      const b = screen(find('B'));
      const c = screen(find('C'));
      const length = Math.hypot(c.x - b.x, c.y - b.y);
      const nx = -(c.y - b.y) / length;
      const ny = (c.x - b.x) / length;
      const tracer = id ? find(id) : undefined;
      const across = (p) => (p.x - b.x) * nx + (p.y - b.y) * ny;
      return {
        point: { x: b.x + (c.x - b.x) * t + nx * off, y: b.y + (c.y - b.y) * t + ny * off },
        slant: (Math.atan2(-(c.y - b.y), c.x - b.x) * 180) / Math.PI,
        tracerOff: tracer ? across(screen(tracer)) : null,
        tracerAt: tracer ? { x: screen(tracer).x, y: screen(tracer).y } : null,
        tracerIds: joints.map((joint) => joint.id),
        guides: grid.axisSnapGuides.length,
      };
    },
    [t, off, id]
  );

await openMechanism(page, `${BASE}/?${TEMPLATE_LINKAGES['4-Bar']}`);
const before = await geometry(0.5, 4);
record(
  'the coupler is slanted, so no axis snap can put a point on it',
  Math.abs(before.slant) > 5 && Math.abs(before.slant) < 85,
  before.slant
);

// --- placing -----------------------------------------------------------------
await page.mouse.click(before.point.x, before.point.y, { button: 'right' });
await page.getByRole('menuitem', { name: /Tracer Point/ }).click();
await page.waitForTimeout(400);
const added = before.tracerIds;
const now = (await geometry(0.5, 0)).tracerIds;
const tracer = now.find((id) => !added.includes(id));
const placed = await geometry(0.5, 0, tracer);
record(
  'a tracer placed 4px off a slanted bar lands on its line',
  tracer && Math.abs(placed.tracerOff) < 0.05,
  placed
);

// --- dragging ----------------------------------------------------------------
const start = placed.tracerAt;
const away = await geometry(0.3, 40);
const near = await geometry(0.3, 5);
await page.mouse.move(start.x, start.y);
await page.mouse.down();
await page.mouse.move(away.point.x, away.point.y, { steps: 10 });
await page.waitForTimeout(100);
const clear = await geometry(0.3, 0, tracer);
record(
  'dragged 40px clear it leaves the line and draws no line guide',
  Math.abs(clear.tracerOff) > 20,
  clear
);
await page.mouse.move(near.point.x, near.point.y, { steps: 10 });
await page.waitForTimeout(150);
const held = await geometry(0.3, 0, tracer);
await page.screenshot({ path: `${SHOTS}/guide-while-dragging.png` });
record(
  'brought back within 5px it is on the line, with the dotted guide, before release',
  Math.abs(held.tracerOff) < 0.05 && held.guides >= 1,
  held
);
await page.mouse.up();
await page.waitForTimeout(300);
const released = await geometry(0.3, 0, tracer);
record('and stays there once released', Math.abs(released.tracerOff) < 0.05, released);

// --- Option turns it off -----------------------------------------------------
const from = released.tracerAt;
const nearAgain = await geometry(0.6, 5);
await page.mouse.move(from.x, from.y);
await page.mouse.down();
await page.keyboard.down('Alt');
await page.mouse.move(nearAgain.point.x, nearAgain.point.y, { steps: 10 });
await page.waitForTimeout(150);
const suspended = await geometry(0.6, 0, tracer);
await page.mouse.up();
await page.keyboard.up('Alt');
record(
  'with Option held it goes where the hand is, off the line',
  Math.abs(suspended.tracerOff) > 3,
  suspended
);

record('no page errors', errors.length === 0, errors.slice(0, 3));

await browser.close();
const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exitCode = 1;
