/**
 * A link's Mass Settings, read the way a reader reads them.
 *
 * - The CoM frame choice is labeled "CoM measured from", with a help mark just
 *   after "from" that names both of the choice's jobs: what X and Y count from,
 *   and what the point keeps its place against while editing.
 * - The help opens to the right, toward the canvas, and the pointer passes
 *   through where it still overlaps the select.
 * - Its options say what they measure from: Shape's centroid, each joint, and
 *   Grid origin (0, 0). The select is named by that label.
 * - Picking a joint re-describes where the point already is: X and Y become its
 *   offset from that joint and the point does not move.
 * - Inertia is one word on one line, so its help mark has room again.
 *
 *   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/link-mass-fields.mjs
 */

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { mkdirSync } from 'node:fs';
import { waitForReady } from './app-ready.mjs';
import { inAngular } from './in-angular.mjs';
import { TEMPLATE_LINKAGES } from './template-payloads.mjs';
import { openMechanism } from './app-ready.mjs';
import { onGrid } from './in-angular.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/link-mass-fields';
/** The drawing stores lengths in model units; the panel reads them in cm. */
const MODEL_PER_CM = 200;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
await page.addInitScript(() => {
  localStorage.setItem('whatsNewSeen', '2026.09');
  localStorage.setItem('tutorialSeen', '1');
});
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

await page.goto(`${BASE}/?${TEMPLATE_LINKAGES['4-Bar']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);

// The coupler, given a mass so the derived fields appear.
const linkId = await inAngular(page, () => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const link = grid.mechanismSrv.links.find((one) => one.joints.length === 2 && !one.isGround);
  link.mass = 10;
  grid.mechanismSrv.updateMechanism(true);
  grid.activeObjService.updateSelectedObj(link);
  return link.id;
});
await page.waitForTimeout(400);
const massSection = page.locator('collapsible-subsection', { hasText: 'Mass Settings' }).first();
if (!(await page.locator('app-edit-panel .comFrameSelect').count())) {
  await massSection.locator('.title, button').first().click();
}
await page.locator('app-edit-panel .comFrameSelect').waitFor();
await page.locator('app-edit-panel .massArea').screenshot({ path: `${OUT}/mass-area.png` });

const layout = await page.evaluate(() => {
  const area = document.querySelector('app-edit-panel .massArea');
  const label = area.querySelector('#comFrameLabel');
  const help = label.parentElement.querySelector('.label-help');
  const select = area.querySelector('.comFrameSelect');
  const labelledBy = document.getElementById(select.getAttribute('aria-labelledby'));
  const moi = area.querySelector('.moiBlock');
  const moiLabel = moi.querySelector('.label');
  const moiHelp = moi.querySelector('.label-help');
  const box = (node) => node.getBoundingClientRect();
  return {
    label: label.textContent.trim(),
    gap: box(help).left - box(label).right,
    sameLine: Math.abs(
      box(help).top + box(help).height / 2 - (box(label).top + box(label).height / 2)
    ),
    options: [...select.options].map((option) => option.textContent.trim()),
    named: labelledBy?.textContent.trim() ?? null,
    selectInside:
      box(select).left >= box(area).left - 1 && box(select).right <= box(area).right + 1,
    moiLabel: moiLabel.textContent.trim(),
    moiLines: Math.round(box(moiLabel).height / parseFloat(getComputedStyle(moiLabel).lineHeight)),
    moiHelpShown:
      !!moiHelp && getComputedStyle(moiHelp).display !== 'none' && box(moiHelp).width > 0,
  };
});

await page.locator('app-edit-panel .comFrameRow .label-help').hover();
const tip = page.locator('.mat-mdc-tooltip').last();
await tip.waitFor({ timeout: 3000 }).catch(() => undefined);
const tipText = (await tip.textContent().catch(() => '')) ?? '';
await page.waitForTimeout(250);
// The help opens to the right but still overlaps the select's far end; the
// pointer has to reach the select through it.
const overlap = await page.evaluate(() => {
  const pane = document.querySelector('.mat-mdc-tooltip-panel:has(.mat-mdc-tooltip)');
  const tipBox = pane?.querySelector('.mat-mdc-tooltip')?.getBoundingClientRect();
  const select = document.querySelector('app-edit-panel .comFrameSelect');
  const selectBox = select.getBoundingClientRect();
  const x = Math.min(selectBox.right - 6, (tipBox?.left ?? selectBox.right) + 6);
  const y = selectBox.top + selectBox.height / 2;
  return {
    beside: !!tipBox && tipBox.left > selectBox.left + selectBox.width / 2,
    passesThrough: document.elementFromPoint(x, y) === select,
  };
});
await page.mouse.move(900, 500);

// Re-describe, don't move: the point stays, X and Y become its offset from A.
const before = await page.evaluate((id) => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const link = grid.mechanismSrv.links.find((one) => one.id === id);
  return { x: link.CoM.x, y: link.CoM.y, joint: link.joints[0].id };
}, linkId);
await page.locator('app-edit-panel .comFrameSelect').selectOption(`joint:${before.joint}`);
await page.waitForTimeout(400);
const after = await page.evaluate((id) => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const link = grid.mechanismSrv.links.find((one) => one.id === id);
  const joint = link.joints[0];
  const fields = [...document.querySelectorAll('app-edit-panel .comPairRow input')];
  return {
    x: link.CoM.x,
    y: link.CoM.y,
    dx: link.CoM.x - joint.x,
    dy: link.CoM.y - joint.y,
    shownX: parseFloat(fields[0]?.value ?? 'NaN'),
    shownY: parseFloat(fields[1]?.value ?? 'NaN'),
    chosen: document
      .querySelector('app-edit-panel .comFrameSelect')
      .selectedOptions[0]?.textContent.trim(),
  };
}, linkId);
await page.locator('app-edit-panel .massArea').screenshot({ path: `${OUT}/from-joint.png` });

const results = [
  ['the frame choice is labeled "CoM measured from"', layout.label === 'CoM measured from'],
  [
    'its help mark sits just after "from", on the same line',
    layout.gap >= -1 && layout.gap <= 8 && layout.sameLine <= 3,
  ],
  [
    'the help mark names both jobs',
    /measured from this point/.test(tipText) && /keeps its place/.test(tipText),
  ],
  [
    'the options say what they measure from',
    layout.options[0] === "Shape's centroid" &&
      layout.options.at(-1) === 'Grid origin (0, 0)' &&
      layout.options.slice(1, -1).every((option) => /^Joint \S+$/.test(option)),
  ],
  [
    'the help opens beside the select, and the pointer goes through it',
    overlap.beside && overlap.passesThrough,
  ],
  ['the select is named by its label', layout.named === 'CoM measured from'],
  ['the select stays inside the panel', layout.selectInside],
  [
    'picking a joint leaves the point where it was',
    Math.abs(after.x - before.x) < 1e-6 && Math.abs(after.y - before.y) < 1e-6,
  ],
  [
    'and X and Y read its offset from that joint',
    after.chosen === `Joint ${before.joint}` &&
      Math.abs(after.shownX - after.dx / MODEL_PER_CM) < 0.006 &&
      Math.abs(after.shownY - after.dy / MODEL_PER_CM) < 0.006,
  ],
  [
    'Inertia is one word on one line, with its help mark',
    layout.moiLabel === 'Inertia' && layout.moiLines === 1 && layout.moiHelpShown,
  ],
  ['nothing threw', errors.length === 0],
];

// A CoM drag means "put it here at this pose", whatever frame its typed fields
// use. Exercise real pointer events: the old handler drew a live ring but then
// silently asked the typed-property gate and refused every mid-cycle grab.
const film = filmstrip(page, `${OUT}/drags`);
const grid = (work, arg) => onGrid(page, work, arg);
for (const mode of [1, 2, 3]) {
  for (const frame of ['centroid', 'joint', 'grid']) {
    for (const posed of mode === 1 && frame === 'centroid' ? [false, true] : [true]) {
      await openMechanism(page, `${BASE}/?${TEMPLATE_LINKAGES['4-Bar']}`);
      const before = await grid(
        (g, { mode, frame, posed }) => {
          const s = g.mechanismSrv;
          const link = s.links.find((l) => !l.joints.some((j) => j.ground));
          link.mass = 10;
          link.comAnchor = frame === 'joint' ? { joint: link.joints[0].id } : frame;
          link.captureComOffset();
          s.updateMechanism(true);
          g.settings.isShowCOM.next(true);
          g.tabService.setTab(mode);
          const seconds = posed ? s.mechanisms[0].cyclePeriod * 0.217 : 0;
          s.seekMechanism(0, seconds);
          g.activeObjService.updateSelectedObj(link);
          const at = g.svgGrid.modelToScreen(link.CoM);
          return {
            id: link.id,
            x: at.x,
            y: at.y,
            com: { x: link.CoM.x, y: link.CoM.y },
            seconds,
            start: s.mechanisms[0].joints[0].map((j) => ({ id: j.id, x: j.x, y: j.y })),
            joints: s.joints.map((j) => ({ id: j.id, x: j.x, y: j.y })),
            depth: g.saveHistoryService.history.length,
          };
        },
        { mode, frame, posed }
      );
      const label = `mode ${mode}, ${frame}, ${posed ? 'mid-cycle' : 'start'}`;
      if (mode === 1) {
        if (!(await page.locator('app-edit-panel .comFrameSelect').count())) {
          await page
            .locator('collapsible-subsection', { hasText: 'Mass Settings' })
            .first()
            .locator('.title, button')
            .first()
            .click();
        }
        const fields = page.locator('app-edit-panel .comPairRow input');
        results.push([
          `${label}: typed CoM fields follow the start-only rule`,
          (await fields.count()) === 2 &&
            (await fields.nth(0).isDisabled()) === posed &&
            (await fields.nth(1).isDisabled()) === posed,
        ]);
      }
      // Opening an analysis panel reframes the canvas. Take the handle's
      // position after that transition, as a reader sees it.
      await page.waitForTimeout(400);
      Object.assign(
        before,
        await grid((g, id) => {
          const at = g.svgGrid.modelToScreen(g.mechanismSrv.links.find((l) => l.id === id).CoM);
          return { x: at.x, y: at.y };
        }, before.id)
      );
      const target = { x: before.x + 48, y: before.y - 32 };
      const drag = async () => {
        await page.mouse.move(before.x, before.y);
        await page.keyboard.down('Alt');
        await page.mouse.down();
        await page.mouse.move(target.x, target.y, { steps: 12 });
        await page.mouse.up();
        await page.keyboard.up('Alt');
      };
      if (frame === 'centroid') {
        await film.during(60, 8, `com-mode-${mode}-${posed ? 'posed' : 'start'}`, drag);
      } else await drag();
      const after = await grid(
        (g, { id, target, seconds }) => {
          const s = g.mechanismSrv;
          const link = s.links.find((l) => l.id === id);
          const desired = g.svgGrid.screenToModelFromXY(target.x, target.y);
          const com = { x: link.CoM.x, y: link.CoM.y };
          s.seekMechanism(0, 0);
          s.seekMechanism(0, seconds);
          return {
            com,
            desired: { x: desired.x, y: desired.y },
            restored: { x: link.CoM.x, y: link.CoM.y },
            start: s.mechanisms[0].joints[0].map((j) => ({ id: j.id, x: j.x, y: j.y })),
            joints: s.joints.map((j) => ({ id: j.id, x: j.x, y: j.y })),
            depth: g.saveHistoryService.history.length,
            custom: link.comIsCustom,
          };
        },
        { id: before.id, target, seconds: before.seconds }
      );
      const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 0.1;
      results.push(
        [`${label}: CoM lands under the pointer`, after.custom && near(after.com, after.desired)],
        [`${label}: playback retains the new CoM`, near(after.com, after.restored)],
        [
          `${label}: the authored joints stay put`,
          before.start.every((j, i) => near(j, after.start[i])),
        ],
        [
          `${label}: the displayed joints stay put`,
          before.joints.every((j, i) => near(j, after.joints[i])),
        ],
        [`${label}: one drag saves once`, after.depth === before.depth + 1]
      );
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      const undone = await grid(
        (g, { id, seconds }) => {
          g.mechanismSrv.seekMechanism(0, seconds);
          const link = g.mechanismSrv.links.find((l) => l.id === id);
          return { x: link.CoM.x, y: link.CoM.y };
        },
        { id: before.id, seconds: before.seconds }
      );
      results.push([`${label}: one Undo restores the old CoM`, near(undone, before.com)]);
      await page.getByRole('button', { name: 'Redo', exact: true }).click();
      const redone = await grid(
        (g, { id, seconds }) => {
          g.mechanismSrv.seekMechanism(0, seconds);
          const link = g.mechanismSrv.links.find((l) => l.id === id);
          return { x: link.CoM.x, y: link.CoM.y };
        },
        { id: before.id, seconds: before.seconds }
      );
      results.push([`${label}: Redo restores the dragged CoM`, near(redone, after.com)]);
      if (!near(after.com, after.desired)) console.log(JSON.stringify({ label, before, after }));
    }
  }
}
await contactSheet(`${OUT}/drags/*com-*.png`, `${OUT}/com-filmstrip.jpg`, 8, 0.5);
results.push(['CoM gestures throw no errors', errors.length === 0]);
for (const [what, ok] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
if (results.some(([, ok]) => !ok))
  console.log(JSON.stringify({ layout, tipText, overlap, before, after, errors }, null, 2));
await browser.close();
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
