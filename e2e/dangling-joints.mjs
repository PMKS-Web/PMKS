/**
 * Issue #248: detached joints survive neighboring deletions and round-trip history.
 * Run with PMKS_BASE_URL and PMKS_PLAYWRIGHT_DIR as described in e2e/README.md.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { TEMPLATE_LINKAGES as payloads } from './template-payloads.mjs';
import { waitForReady } from './app-ready.mjs';
import { onGrid } from './in-angular.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
const base = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const dir = 'artifacts/dangling-joints';
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
const results = [];
page.on('pageerror', (error) => errors.push(String(error)));

const state = () =>
  page.evaluate(() => {
    const g = ng.getComponent(document.querySelector('app-new-grid'));
    const m = g.mechanismSrv;
    for (const joint of m.joints) {
      if (joint.links.some((link) => !m.links.includes(link))) throw Error('Stale joint link');
      if (joint.connectedJoints.some((other) => !m.joints.includes(other)))
        throw Error('Stale connected joint');
    }
    return {
      joints: m.joints.map((j) => ({
        id: j.id,
        x: Math.round(j.x * 100) / 100,
        y: Math.round(j.y * 100) / 100,
        links: j.links.map((l) => l.id).sort(),
        ground: j.ground,
        input: j.input,
      })),
      links: m.links.map((l) => l.id).sort(),
      drawn: [...document.querySelectorAll('[id^="joint_"]')].map((n) => n.id).sort(),
    };
  });
const index = () =>
  page.evaluate(
    () => ng.getComponent(document.querySelector('app-new-grid')).saveHistoryService.index
  );
const select = (id, kind = 'joints') =>
  onGrid(
    page,
    (g, { id, kind }) => {
      g.activeObjService.updateSelectedObj(g.mechanismSrv[kind].find((part) => part.id === id));
    },
    { id, kind }
  );
const history = async (action) => {
  await onGrid(page, (g, action) => g.saveHistoryService[action](), action);
  await page.waitForTimeout(100);
};
async function edit(label, work) {
  const before = await state();
  const at = await index();
  await work();
  await page.waitForTimeout(150);
  const after = await state();
  assert.equal(await index(), at + 1, `${label}: one history entry`);
  await history('undo');
  assert.deepEqual(await state(), before, `${label}: undo`);
  await history('redo');
  assert.deepEqual(await state(), after, `${label}: redo`);
  await history('undo');
  assert.deepEqual(await state(), before, `${label}: repeated undo`);
  await history('redo');
  results.push(label);
  console.log(`PASS ${label}`);
  return after;
}
const deleteKey = () => page.keyboard.press('Delete');

try {
  await page.goto(`${base}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  await page.mouse.move(1400, 900);
  await select('B');
  const detached = await edit('Deleting B leaves orphan A beside CD', deleteKey);
  assert.deepEqual(detached.joints.find((j) => j.id === 'A').links, []);
  assert.deepEqual(detached.links, ['CD']);

  await select('CD', 'links');
  const alone = await edit('Deleting CD preserves unrelated orphan A', deleteKey);
  assert.deepEqual(
    alone.joints.map((j) => j.id),
    ['A']
  );
  assert.deepEqual(alone.drawn, ['joint_A']);

  await select('A');
  const box = await page.locator('#joint_A').boundingBox();
  assert.ok(box, 'Orphan has a canvas hit target');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const frames = filmstrip(page, dir);
  const moved = await edit('Dragging orphan A survives undo and redo', () =>
    frames.during(40, 12, 'drag', async () => {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 100, y - 60, { steps: 12 });
      await page.mouse.up();
    })
  );
  assert.notDeepEqual(moved.joints, alone.joints, 'The drag moved the orphan');
  await select('A');
  const empty = await edit('Deleting the last orphan survives undo and redo', deleteKey);
  assert.deepEqual(empty, { joints: [], links: [], drawn: [] });
  await history('undo');
  await page.screenshot({ path: `${dir}/restored-orphan.png` });
  assert.deepEqual(errors, [], 'No browser errors');
  await contactSheet(`${dir}/*-drag.png`, `${dir}/filmstrip.png`, 4);
} finally {
  await writeFile(`${dir}/report.json`, JSON.stringify({ results, errors }, null, 2));
  await browser.close();
}
