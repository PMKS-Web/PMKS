/**
 * Every library card, with its shipped backdrop, in every drawing style.
 *
 * Measures what a reader would notice rather than only what the geometry
 * promises: names printed on other names, on joint letters, on pins, on slider
 * and ground blocks or on force arrows, and any name drawn under the smallest
 * readable size. Small text fails; the overlaps are counted per view and listed
 * for review, because a dense drawing can hold one that nothing better can fix.
 * Screenshots are cropped to the mechanism with the app's chrome hidden, and
 * the three styles of a card are tiled into one review sheet.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { contactSheet } from './filmstrip.mjs';
import { openMechanism } from './app-ready.mjs';
import { onGrid } from './in-angular.mjs';
import { ALL_LINKAGES } from './template-payloads.mjs';
import { startQuiet } from './quiet-start.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = process.env.PMKS_AUDIT_OUT ?? 'artifacts/library-visual-audit';
const ONLY = process.env.ONLY?.split(',');
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await startQuiet(context);
const page = await context.newPage();
// Matches MIN_LABEL_PX in src/app/services/canvas-labels.service.ts.
const MIN_LABEL_PX = 11;
const HIDE_CHROME = `app-notification-stack, app-playback-bar, app-view-controls, app-bottombar,
  app-top-bar, app-left-tabs, app-right-panel { visibility: hidden !important; }`;
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(`${BASE}/?library`);
await page.locator('app-templates').waitFor();
const cards = await page.evaluate(() =>
  ng.getComponent(document.querySelector('app-templates')).groups.flatMap((group) => group.cards)
);
if (!cards.length || new Set(cards.map((card) => card.id)).size !== cards.length) {
  throw new Error('The library did not return a complete, unique card catalog');
}
const report = [];
const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`, ok ? '' : JSON.stringify(detail));
};
/** Overlaps and sizes on screen, in pixels, from the drawn elements themselves. */
const problems = () =>
  page.evaluate((minPx) => {
    const g = ng.getComponent(document.querySelector('app-new-grid'));
    const rotate = (p, a) => ({
      x: p.x * Math.cos(a) - p.y * Math.sin(a),
      y: p.x * Math.sin(a) + p.y * Math.cos(a),
    });
    const overlaps = (a, b) => {
      for (const angle of [a.angle, a.angle + Math.PI / 2, b.angle, b.angle + Math.PI / 2]) {
        const extent = (box) =>
          (Math.abs(Math.cos(box.angle - angle)) * box.width +
            Math.abs(Math.sin(box.angle - angle)) * box.height) /
          2;
        const gap = Math.abs((a.x - b.x) * Math.cos(angle) + (a.y - b.y) * Math.sin(angle));
        if (gap >= extent(a) + extent(b)) return false;
      }
      return true;
    };
    const touches = (box, disc) => {
      const local = rotate({ x: disc.x - box.x, y: disc.y - box.y }, -box.angle);
      return (
        Math.hypot(
          Math.max(0, Math.abs(local.x) - box.width / 2),
          Math.max(0, Math.abs(local.y) - box.height / 2)
        ) < disc.radius
      );
    };
    const aabb = (node, name) => {
      const r = node.getBoundingClientRect();
      return {
        name,
        x: r.x + r.width / 2,
        y: r.y + r.height / 2,
        width: r.width,
        height: r.height,
        angle: 0,
      };
    };
    const links = g.mechanismSrv.getLinks().map((link) => ({ link, tag: g.linkLabelStyle(link) }));
    const texts = [...document.querySelectorAll('#linkTagHolder text')];
    const names = texts.map((text, i) => {
      const ctm = text.getScreenCTM();
      const at = new DOMPoint(0, 0).matrixTransform(ctm);
      const perUnit = Math.hypot(ctm.a, ctm.b);
      const tag = links[i]?.tag ?? {};
      const font = parseFloat(getComputedStyle(text).fontSize);
      return {
        name: text.textContent.trim(),
        x: at.x,
        y: at.y,
        // The letters, not the padded box the layout keeps clear.
        width: (tag.width ?? text.getComputedTextLength()) * perUnit * 0.92,
        height: font * perUnit * 0.8,
        angle: Math.atan2(ctm.b, ctm.a),
        px: font * perUnit,
      };
    });
    const letters = [...document.querySelectorAll('#jointTagHolder text')]
      .filter((text) => text.textContent.trim())
      .map((text) => aabb(text, text.textContent.trim()));
    const frame = document.querySelector('#linkTagHolder').getScreenCTM();
    const toScreen = (p) => new DOMPoint(p.x, -p.y).matrixTransform(frame);
    const perModel = Math.hypot(frame.a, frame.b);
    const pins = g.mechanismSrv.visibleJoints().map((joint) => ({
      name: joint.name,
      ...toScreen(joint),
      radius: g.settings.drawingScale * 0.15 * perModel,
    }));
    const blocks = [
      ...[
        ...document.querySelectorAll(
          '#sliderHolder path[fill="#000000"], #sliderHolder .cylinder-seal'
        ),
      ].map((node) => aabb(node, 'block')),
      // The ground image is a square around its pin; the glyph is the part
      // below the pin, 0.78 of its 1.2 height. The input glyph wraps the pin.
      ...[...document.querySelectorAll('#jointBGHolder image')]
        .filter((node) => node.getAttribute('visibility') !== 'hidden')
        .map((node) => {
          const box = aabb(node, 'ground');
          if (!node.href?.baseVal?.includes('Ground')) return box;
          const height = (box.height * 0.78) / 1.2;
          return { ...box, y: box.y + box.height / 2 - height / 2, height };
        }),
    ].filter((box) => box.width > 0);
    const arrows = g.mechanismSrv.forces.flatMap((force) =>
      Array.from({ length: 13 }, (_, i) => ({
        name: force.name,
        ...toScreen({
          x: force.startCoord.x + ((force.endCoord.x - force.startCoord.x) * i) / 12,
          y: force.startCoord.y + ((force.endCoord.y - force.startCoord.y) * i) / 12,
        }),
        radius: g.settings.forceScale * 0.07 * perModel,
      }))
    );
    const pairs = (list, others, test) =>
      list.flatMap((one, i) =>
        others
          .filter((other, j) => (others !== list || j > i) && test(one, other))
          .map((other) => [one.name, other.name])
      );
    return {
      names: names.length,
      nameOnName: pairs(names, names, overlaps),
      nameOnLetter: pairs(names, letters, overlaps),
      nameOnPin: pairs(names, pins, touches),
      nameOnBlock: pairs(names, blocks, overlaps),
      nameOnArrow: [...new Set(pairs(names, arrows, touches).map((pair) => pair.join(' / ')))],
      small: names
        .filter((one) => one.px < minPx - 0.5)
        .map((one) => [one.name, +one.px.toFixed(1)]),
      sizes: [Math.min(...names.map((one) => one.px)), Math.max(...names.map((one) => one.px))],
    };
  }, MIN_LABEL_PX);
/** The mechanism and its names on screen, padded, within the window. */
const mechanismClip = () =>
  page.evaluate(() => {
    const boxes = [
      '#linkHolder',
      '#jointHolder',
      '#sliderHolder',
      '#jointBGHolder',
      '#linkTagHolder',
      '#jointTagHolder',
      '#forcesHolder',
    ]
      .map((id) => document.querySelector(id)?.getBoundingClientRect())
      .filter((r) => r && r.width > 0 && r.height > 0);
    const pad = 36;
    const x = Math.max(0, Math.min(...boxes.map((r) => r.left)) - pad);
    const y = Math.max(0, Math.min(...boxes.map((r) => r.top)) - pad);
    const right = Math.min(innerWidth, Math.max(...boxes.map((r) => r.right)) + pad);
    const bottom = Math.min(innerHeight, Math.max(...boxes.map((r) => r.bottom)) + pad);
    return { x, y, width: Math.max(40, right - x), height: Math.max(40, bottom - y) };
  });
const geometry = () =>
  page.evaluate(() => {
    const g = ng.getComponent(document.querySelector('app-new-grid'));
    return JSON.stringify({
      points: g.mechanismSrv.joints.map((j) => [j.id, j.x, j.y]),
      bodies: g.mechanismSrv.getLinks().map((l) => [l.id, l.d, l.mass, l.massMoI]),
      solve: g.mechanismSrv.solveRevision,
    });
  });
try {
  for (const card of cards.filter((card) => !ONLY || ONLY.includes(card.id))) {
    if (!ALL_LINKAGES[card.id]) throw new Error(`No payload for ${card.id}`);
    await openMechanism(page, `${BASE}/?${ALL_LINKAGES[card.id]}#backdrop=${card.id}`);
    await onGrid(page, (g) => {
      g.settings.isShowID.next(true);
      g.settings.isShowCOM.next(true);
      g.objectDisplay.chooseStyle('0');
      g.svgGrid.scaleToFitLinkage(false);
    });
    await page.addStyleTag({ content: HIDE_CHROME });
    await page.waitForTimeout(550);
    const authored = await geometry();
    const clip = await mechanismClip();
    mkdirSync(`${OUT}/${card.id}`, { recursive: true });
    const font = await page.evaluate(
      () => ng.getComponent(document.querySelector('app-new-grid')).tagFontSize
    );
    for (const [index, style] of ['standard', 'fine', 'schematic'].entries()) {
      await onGrid(page, (g, index) => g.objectDisplay.chooseStyle(String(index)), index);
      await page.waitForTimeout(100);
      const labels = await page.evaluate(() => {
        const g = ng.getComponent(document.querySelector('app-new-grid'));
        const read = (selector) =>
          [...document.querySelectorAll(selector)].map((node) => {
            const b = node.getBoundingClientRect();
            const font = node.getComputedTextLength?.() ?? 0;
            return {
              text: node.textContent.trim(),
              x: b.x,
              y: b.y,
              width: b.width,
              height: b.height,
              ink: getComputedStyle(node).fill,
              length: font,
            };
          });
        const collisions = [];
        for (const text of document.querySelectorAll('#linkTagHolder text')) {
          const rect = text.getBBox();
          const matrix = text.getScreenCTM();
          const inverse = matrix.inverse();
          for (const joint of g.mechanismSrv.visibleJoints()) {
            const screen = g.svgGrid.modelToScreen(joint);
            const local = new DOMPoint(screen.x, screen.y).matrixTransform(inverse);
            const dx = Math.max(rect.x - local.x, 0, local.x - rect.x - rect.width);
            const dy = Math.max(rect.y - local.y, 0, local.y - rect.y - rect.height);
            const radius =
              (g.settings.drawingScale * 0.15 * g.svgGrid.getZoom()) /
              Math.hypot(matrix.a, matrix.b);
            if (Math.hypot(dx, dy) < radius * 0.95)
              collisions.push([text.textContent.trim(), joint.id]);
          }
        }
        return {
          links: read('#linkTagHolder text'),
          joints: read('#jointTagHolder text'),
          font: g.tagFontSize,
          fontPixels: g.tagFontSize * g.svgGrid.getZoom(),
          attachments: g.mechanismSrv.getLinks().map((link) => ({
            name: g.mechanismSrv.visibleBodyName(link),
            tag: g.linkLabelStyle(link),
            joints: link.joints.map((joint) => ({ x: joint.x, y: joint.y })),
          })),
          collisions,
        };
      });
      check(
        `${card.id}/${style}: style preserves authored geometry and model type size`,
        (await geometry()) === authored && Math.abs(labels.font - font) < 1e-9
      );
      const found = await problems();
      check(
        `${card.id}/${style}: every name is at least ${MIN_LABEL_PX}px`,
        !found.small.length,
        found.small
      );
      const counted = ['nameOnName', 'nameOnLetter', 'nameOnPin', 'nameOnBlock', 'nameOnArrow'];
      const total = counted.reduce((sum, key) => sum + found[key].length, 0);
      if (total)
        console.log(
          `REVIEW ${card.id}/${style}: ${total} overlaps`,
          JSON.stringify(
            Object.fromEntries(counted.map((key) => [key, found[key]]).filter(([, v]) => v.length))
          )
        );
      if (
        ['Scotch_Yoke', 'Flywheel_Engine', 'Hydraulic_Crosshead', 'Car_Steering'].includes(card.id)
      ) {
        check(
          `${card.id}/${style}: names clear the visible pins`,
          labels.collisions.length === 0,
          labels.collisions
        );
      }
      // Dense drawings keep every name and keep their attachments fixed in
      // motion. Save possible pin overlaps for human review, rather than
      // demanding moving labels or hiding names to make the count zero.
      if (labels.collisions.length && card.id === 'Steam_Locomotive')
        console.log(
          `REVIEW ${card.id}/${style}: possible overlaps`,
          JSON.stringify(labels.collisions)
        );
      const image = `${card.id}/${index}-${style}.png`;
      await page.screenshot({ path: `${OUT}/${image}`, clip });
      report.push({
        id: card.id,
        name: card.name,
        category: card.category,
        style,
        image,
        labels,
        problems: found,
      });
    }
    writeFileSync(
      `${OUT}/report.json`,
      JSON.stringify({ cards: cards.length, report, errors, checks }, null, 2)
    );
    await contactSheet(
      `${OUT}/${card.id}/*.png`,
      `${OUT}/${card.id}-review.png`,
      clip.width > clip.height ? 1 : 3
    );
    console.log(`CAPTURED ${card.id}: Standard, Fine, Schematic`);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  const overlaps = report.map((view) =>
    ['nameOnName', 'nameOnLetter', 'nameOnPin', 'nameOnBlock', 'nameOnArrow'].reduce(
      (sum, key) => sum + view.problems[key].length,
      0
    )
  );
  console.log(
    `${checks.every((one) => one.ok) ? 'PASS' : 'FAIL'} ${report.length} views across ${report.length / 3} library mechanisms;`,
    `${overlaps.filter(Boolean).length} views with overlaps, ${overlaps.reduce((a, b) => a + b, 0)} in all`
  );
  if (checks.some((one) => !one.ok)) process.exitCode = 1;
} finally {
  await browser.close();
}
