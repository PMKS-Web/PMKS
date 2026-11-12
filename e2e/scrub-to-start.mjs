/**
 * Dragging a scrub handle back lands on the start pose (#304).
 *
 * A range input counts in thousandths, so a hand dragging back to the left end
 * used to stop a sample short -- 79° and 0.01 s -- and the editor stayed shut,
 * asking the reader to go back to the start they could see they were at. The
 * start is now a seat the handle drops into from a few pixels away. This drags
 * with the real mouse, because the bug lived in where a pointer happens to land.
 *
 *   PMKS_BASE_URL=http://localhost:4200 node e2e/scrub-to-start.mjs
 */

const playwright = process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright';
const { chromium } = await import(playwright + '/node_modules/playwright/index.mjs');
import { mkdirSync } from 'node:fs';
import { openMechanism } from './app-ready.mjs';
import { startQuiet } from './quiet-start.mjs';
import { TEMPLATE_LINKAGES } from './template-payloads.mjs';

const BASE = process.env.PMKS_BASE_URL ?? process.env.PMKS_URL ?? 'http://localhost:4200';
const SHOTS = 'artifacts/scrub-to-start';
mkdirSync(SHOTS, { recursive: true });

/** Two four-bars side by side, each with its own drive: one drawing, two clocks. */
const TWO_FOUR_BARS =
  '2P.Ay,1E8.K,0.1011.6A,A,0mv,0VU,0.0B,B,0e_,E6,0.0C,C,l1,WW,0.4D,D,qD,0Pk,0.6E,E,2Y_,0,0.' +
  '0F,F,2Y_,GJ,0.0G,G,3Jt,Wc,0.4H,H,3aA,0,0..YRAB,AB,Fe,Fe,0ix,08i,c5cae9,A,B,,.' +
  'YRBC,BC,Fe,Fe,32,NJ,303e9f,B,C,,.YRCD,CD,Fe,Fe,nd,3P,0d125a,C,D,,.' +
  'AREF,EF,0,0,2Y_,8A,555555,E,F,,.ARFG,FG,0,0,2xQ,OS,555555,F,G,,.' +
  'ARGH,GH,0,0,3S0,GJ,555555,G,H,,...N_L';

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

/** Where row `n`'s handle and seat are on screen, and where the machine is. */
const handle = (n) =>
  page.evaluate((n) => {
    const bar = window.ng.getComponent(document.querySelector('app-playback-bar'));
    const srv = bar.mechanism;
    const rows = bar.rows.filter((row) => !row.inert);
    const row = rows[n];
    const input = document.querySelectorAll('.rowScrubber')[n];
    const box = input.getBoundingClientRect();
    // A range thumb's centre: half a thumb in, half a thumb short of the end.
    const centreAt = (per1000) => box.left + 12 + ((box.width - 24) * per1000) / 1000;
    return {
      y: box.top + box.height / 2,
      thumbX: centreAt(row.scrub),
      seatX: centreAt(row.anchorAt ?? 0),
      awayX: centreAt(((row.anchorAt ?? 0) + 500) % 1000),
      scrub: row.scrub,
      anchorAt: row.anchorAt,
      position: row.position,
      time: row.time,
      atStart: srv.isAtStartPose(),
    };
  }, n);

/** Pick row `n`'s handle up, carry it well away, and bring it back to `offset` px from the seat. */
const dragBackTo = async (n, offset) => {
  const start = await handle(n);
  await page.mouse.move(start.thumbX, start.y);
  await page.mouse.down();
  await page.mouse.move(start.awayX, start.y, { steps: 12 });
  await page.waitForTimeout(100);
  const away = await handle(n);
  await page.mouse.move(start.seatX + offset, start.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  return { away, back: await handle(n) };
};

// --- the shared row ---------------------------------------------------------
await openMechanism(page, `${BASE}/?${TEMPLATE_LINKAGES['4-Bar']}`);
for (const offset of [3, -2, 5]) {
  const { away, back } = await dragBackTo(0, offset);
  record(
    `shared row: carried away and let go ${offset}px from the seat lands on the start`,
    !away.atStart && back.atStart && back.scrub === back.anchorAt,
    { away, back }
  );
}
await page.screenshot({ path: `${SHOTS}/shared-row.png` });

const { back: clear } = await dragBackTo(0, 30);
record('shared row: let go 30px clear of the seat stays where it was put', !clear.atStart, clear);

// --- an unsynced machine's own row -------------------------------------------
await openMechanism(page, `${BASE}/?${TWO_FOUR_BARS}`);
await page.locator('.syncToggle').click();
await page.waitForTimeout(400);
record('unsynced, the transport lists both', (await page.locator('.rowScrubber').count()) === 2);
const { away, back } = await dragBackTo(1, 3);
record(
  "unsynced: the second machine's handle let go near its seat lands on the start",
  !away.atStart && back.atStart && back.scrub === back.anchorAt,
  { away, back }
);
await page.screenshot({ path: `${SHOTS}/unsynced-row.png` });

record('no page errors', errors.length === 0, errors.slice(0, 3));

await browser.close();
const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exitCode = 1;
