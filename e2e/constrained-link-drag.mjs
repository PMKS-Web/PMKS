/**
 * #259: a neighboring hold must not stretch a dragged body or make it creep.
 * #261: under the pointer a ground pin gives like any joint; only a Lock holds.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { TEMPLATE_LINKAGES } from './template-payloads.mjs';
import { waitForReady } from './app-ready.mjs';
import { onGrid } from './in-angular.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
const base = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const out = 'artifacts/constrained-link-drag';
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
const results = [];
page.on('pageerror', (error) => errors.push(String(error)));
const read = () =>
  page.evaluate(() => {
    const g = ng.getComponent(document.querySelector('app-new-grid'));
    return {
      joints: g.mechanismSrv.joints.map(({ id, x, y }) => ({ id, x, y })),
      links: g.mechanismSrv.links.map((l) => ({
        id: l.id,
        hold: l.hold ?? null,
        length: Math.hypot(l.joints[1].x - l.joints[0].x, l.joints[1].y - l.joints[0].y),
        angle: Math.atan2(l.joints[1].y - l.joints[0].y, l.joints[1].x - l.joints[0].x),
      })),
      // A posed edit stays on its displayed phase; history restores the design.
      start: (g.mechanismSrv.mechanisms[0]?.joints[0] ?? g.mechanismSrv.joints).map(
        ({ id, x, y }) => ({ id, x, y })
      ),
      index: g.saveHistoryService.index,
    };
  });
const link = (state, id) => state.links.find((l) => l.id === id);
const near = (a, b, label, tolerance = 1e-4) =>
  assert.ok(Math.abs(a - b) < tolerance, `${label}: ${a} != ${b}`);
const samePose = (a, b, label) =>
  a.joints.forEach((j, i) => {
    assert.equal(j.id, b.joints[i].id);
    near(j.x, b.joints[i].x, label + ' X');
    near(j.y, b.joints[i].y, label + ' Y');
  });
const history = (action) => onGrid(page, (g, action) => g.saveHistoryService[action](), action);
try {
  for (const scenario of ['none', 'length', 'angle', 'length-paused'].filter(
    (name) => !process.env.PMKS_ONLY || name === process.env.PMKS_ONLY
  )) {
    const paused = scenario.endsWith('-paused');
    const hold = paused ? 'length' : scenario;
    await page.goto(`${base}/?${TEMPLATE_LINKAGES['4-Bar']}`);
    await waitForReady(page);
    await onGrid(page, (g) =>
      g.activeObjService.updateSelectedObj(g.mechanismSrv.links.find((l) => l.id === 'AB'))
    );
    if (hold !== 'none') await page.locator(`[data-hold-toggle="${hold}"]`).click();
    const authored = await read();
    if (paused) {
      await onGrid(page, (g) => {
        const m = g.mechanismSrv;
        m.seekMechanism(0, m.mechanisms[0].cyclePeriod / 3);
      });
      await page.getByRole('button', { name: 'Fit to view', exact: true }).click();
      await page.waitForTimeout(700);
    }
    const before = await read();
    const grab = await page.evaluate(() => {
      const points = ['B', 'C'].map((id) => {
        const r = document.querySelector('#joint_' + id).getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      return { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
    });
    const film = filmstrip(page, `${out}/${scenario}`);
    await film.shot('before');
    const samples = [];
    await film.during(40, 16, 'drag', async () => {
      await page.mouse.move(grab.x, grab.y);
      await page.mouse.down();
      for (let i = 1; i <= 16; i++) {
        await page.mouse.move(grab.x + (120 * i) / 16, grab.y + (80 * i) / 16);
        await page.waitForTimeout(35);
        samples.push(await read());
      }
    });
    const landed = await read();
    for (let i = 0; i < 12; i++) await page.mouse.move(grab.x + 120, grab.y + 80);
    const stationary = await read();
    await page.mouse.up();
    const after = await read();
    await film.shot('after');
    for (const sample of [...samples, stationary, after]) {
      // Release re-anchors through interpolated cycle samples (under 0.0005 cm).
      // Every in-flight frame still has the strict body/hold tolerance.
      const tolerance = paused && sample === after ? 0.1 : 1e-4;
      near(
        link(sample, 'BC').length,
        link(before, 'BC').length,
        `${scenario}: BC stays rigid`,
        tolerance
      );
      if (hold !== 'none')
        near(
          link(sample, 'AB')[hold],
          link(before, 'AB')[hold],
          `${scenario}: AB holds its value`,
          tolerance
        );
      assert.equal(link(sample, 'BC').hold, null, 'No persistent hold was added');
    }
    samePose(stationary, landed, `${hold}: stationary pointer does not creep`);
    // #261: a ground pin is not a Lock. With AB holding a value, A follows the
    // drag rather than stopping it; with nothing held, nothing reaches A.
    const groundA = (state) => state.joints.find((j) => j.id === 'A');
    const aMoved = Math.hypot(
      groundA(landed).x - groundA(before).x,
      groundA(landed).y - groundA(before).y
    );
    if (hold === 'none') near(aMoved, 0, `${scenario}: unheld drag leaves ground pin A`);
    else assert.ok(aMoved > 0.1, `${scenario}: held AB swings ground pin A (moved ${aMoved})`);
    assert.ok(
      after.joints.some(
        (j, i) => Math.hypot(j.x - before.joints[i].x, j.y - before.joints[i].y) > 1
      ),
      'Drag actually moved the drawing'
    );
    assert.equal(after.index, before.index + 1, 'One drag is one history entry');
    await history('undo');
    samePose(await read(), authored, 'Undo');
    await history('redo');
    const redone = await read();
    samePose(
      paused ? { joints: redone.start } : redone,
      paused ? { joints: after.start } : after,
      'Redo'
    );
    await contactSheet(
      `${out}/${scenario}/*-drag.png`,
      `${out}/${scenario}/filmstrip.png`,
      4,
      0.35
    );
    results.push({ scenario, before, after, samples });
    console.log(`PASS ${scenario}: rigid body, stable pointer, one-step undo/redo`);
  }
  assert.deepEqual(errors, [], 'No browser errors');
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify({ results, errors }, null, 2));
  await browser.close();
}
