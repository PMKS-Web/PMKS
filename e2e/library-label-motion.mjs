/** Stable ink and body attachments, then actual Play filmstrips in every style. */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { ALL_LINKAGES } from './template-payloads.mjs';
import { openMechanism } from './app-ready.mjs';
import { onGrid } from './in-angular.mjs';
import { startQuiet } from './quiet-start.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/library-label-motion';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await startQuiet(context);
await context.addInitScript(() => localStorage.setItem('analysisInviteSeen', 'true'));
const page = await context.newPage();
const errors = [],
  results = [];
page.on('pageerror', (error) => errors.push(String(error)));
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`, ok ? '' : JSON.stringify(detail));
};
const read = () =>
  page.evaluate(() => {
    const g = ng.getComponent(document.querySelector('app-new-grid'));
    const texts = [...document.querySelectorAll('#linkTagHolder > svg')];
    const canvas = document.createElement('canvas').getContext('2d');
    canvas.lineWidth = g.tagFontSize * 1.8;
    return {
      font: g.tagFontSize,
      connectors: document.querySelectorAll('#linkTagHolder line, #linkTagHolder path').length,
      tags: g.mechanismSrv.getLinks().map((link, i) => {
        const text = texts[i].querySelector('text');
        const x = +texts[i].getAttribute('x'),
          y = -texts[i].getAttribute('y');
        const a = (link.isCircle && link.discCenter()) || link.joints[0],
          b = link.joints.find((j) => Math.hypot(j.x - a.x, j.y - a.y) > 1e-7);
        const angle = !link.isCircle && b ? Math.atan2(b.y - a.y, b.x - a.x) : 0;
        const dx = x - a.x,
          dy = y - a.y;
        const label = g.linkLabelStyle(link);
        const labelAngle = (-label.angle * Math.PI) / 180;
        const cylinder = g.mechanismSrv.cylinderOfBar(link);
        const barrel = cylinder?.barrel.id === link.id;
        const from = cylinder && (barrel ? cylinder.mountA : cylinder.seal);
        const to = cylinder && (barrel ? cylinder.seal : cylinder.mountB);
        const ownLine = new Path2D(
          cylinder ? `M ${from.x} ${from.y} L ${to.x} ${to.y}` : g.objectDisplay.skeleton(link)
        );
        const lineCheck = document.createElement('canvas').getContext('2d');
        lineCheck.lineWidth = g.tagFontSize * 1.1;
        const ownClear =
          link.joints.length !== 2 ||
          [-0.45, -0.225, 0, 0.225, 0.45].every((fraction) => {
            const along = text.getComputedTextLength() * fraction;
            return !lineCheck.isPointInStroke(
              ownLine,
              x + along * Math.cos(labelAngle),
              y + along * Math.sin(labelAngle)
            );
          });
        return {
          id: link.id,
          ink: getComputedStyle(text).fill,
          stroke: getComputedStyle(text).stroke,
          cylinder: !!g.mechanismSrv.cylinderOfBar(link),
          ownClear,
          close:
            canvas.isPointInPath(new Path2D(g.objectDisplay.path(link)), x, y) ||
            canvas.isPointInStroke(new Path2D(g.objectDisplay.path(link)), x, y),
          local: [
            dx * Math.cos(angle) + dy * Math.sin(angle),
            -dx * Math.sin(angle) + dy * Math.cos(angle),
          ],
        };
      }),
    };
  });
try {
  for (const id of process.env.ONLY?.split(',') ?? [
    'Steam_Locomotive',
    'Derrick_Crane',
    'Aircraft_Landing_Gear',
    'Whitworth_Quick_Return',
    'Double_Butterfly',
    'Jansen_Leg',
  ]) {
    await openMechanism(page, `${BASE}/?${ALL_LINKAGES[id]}#backdrop=${id}`);
    // The frames are for reading the names, so nothing of the app's own chrome
    // or its toasts sits over the drawing, and they are tiled at full size.
    await page.addStyleTag({
      content: `app-notification-stack, app-view-controls, app-bottombar, app-top-bar,
        app-left-tabs, app-right-panel { visibility: hidden !important; }`,
    });
    await page.waitForTimeout(500);
    for (const [index, style] of ['standard', 'fine', 'schematic'].entries()) {
      await onGrid(
        page,
        (g, index) => {
          g.mechanismSrv.animate(0, false);
          g.objectDisplay.chooseStyle(String(index));
          g.svgGrid.scaleToFitFullMotion(false);
        },
        index
      );
      await page.waitForTimeout(300);
      const initial = await read();
      const count = await page.evaluate(
        () =>
          ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.mechanisms[0].joints
            .length
      );
      let fixed = true,
        stable = true,
        close = true,
        ownClear = true,
        plain = true,
        maxDrift = 0;
      const strayed = new Set(),
        onLine = new Set();
      for (let i = 0; i <= 72; i++) {
        await onGrid(
          page,
          (g, step) => g.mechanismSrv.animate(step, false),
          Math.floor(((count - 1) * i) / 72)
        );
        const state = await read();
        close &&= state.tags.every((tag) => tag.close);
        ownClear &&= state.tags.every((tag) => tag.ownClear);
        state.tags.forEach((tag) => !tag.close && strayed.add(tag.id));
        state.tags.forEach((tag) => !tag.ownClear && onLine.add(tag.id));
        fixed &&= state.tags.every((tag, n) => tag.ink === initial.tags[n].ink);
        plain &&= state.connectors === 0 && state.tags.every((tag) => tag.stroke === 'none');
        for (const [n, tag] of state.tags.entries()) {
          if (tag.cylinder) continue;
          maxDrift = Math.max(
            maxDrift,
            Math.hypot(
              tag.local[0] - initial.tags[n].local[0],
              tag.local[1] - initial.tags[n].local[1]
            ) / state.font
          );
        }
        stable &&= maxDrift < 0.01 && Math.abs(state.font - initial.font) < 1e-8;
      }
      check(`${id}/${style}: fixed colors, no outlines or connecting lines`, fixed && plain);
      check(`${id}/${style}: names stay on or immediately beside their own bodies`, close, [
        ...strayed,
      ]);
      if (style === 'schematic')
        check(
          `${id}/${style}: bar names clear their own schematic lines throughout a cycle`,
          ownClear,
          [...onLine]
        );
      check(`${id}/${style}: labels keep their body attachments for a full cycle`, stable, {
        maxDrift,
      });
      await onGrid(page, (g) => g.mechanismSrv.animate(0, false));
      const film = filmstrip(page, `${OUT}/${id}-${style}`, {
        x: 260,
        y: 80,
        width: 1240,
        height: 790,
      });
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      const playing = [];
      for (let i = 0; i < 12; i++) {
        await film.shot('playing');
        playing.push(await read());
        await page.waitForTimeout(220);
      }
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      check(
        `${id}/${style}: actual Play keeps colors and type size steady`,
        playing.every(
          (state) =>
            state.font === initial.font &&
            state.tags.every((tag, n) => tag.ink === initial.tags[n].ink)
        )
      );
      await contactSheet(`${OUT}/${id}-${style}/*.png`, `${OUT}/${id}-${style}.png`, 3, 1);
      writeFileSync(`${OUT}/report.json`, JSON.stringify({ results, errors }, null, 2));
    }
  }
  check('no browser errors', errors.length === 0, errors);
  if (results.some((one) => !one.ok)) process.exitCode = 1;
} finally {
  await browser.close();
}
