/**
 * Points of interest on the playback scrub rail (issue #386).
 *
 * Checks toggle/branch diamonds and maximum input torque/force circles across
 * Edit, Kinematic Analysis, and Force Analysis, across Grashof and non-Grashof
 * templates, synced vs. unsynced multi-mechanism bars, click/keyboard jumps,
 * tooltips, and phone layout. Captures screenshots and a contact-sheet
 * filmstrip under gitignored `artifacts/playback-poi/`.
 *
 *   PMKS_BASE_URL=http://localhost:4205 PMKS_PLAYWRIGHT_DIR=.. node e2e/playback-points.mjs
 */

import { mkdirSync } from 'node:fs';
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';
import { TEMPLATE_LINKAGES as payloads } from './template-payloads.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/playback-poi';
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

const tab = (name) => page.locator('.tabButton', { hasText: name });

async function openTemplate(name) {
  const payload = payloads[name];
  if (!payload) throw new Error(`Missing template payload: ${name}`);
  await page.goto(`${BASE}/?${payload}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  await page.waitForTimeout(300);
}

async function playbackClip() {
  const box = await page.locator('app-playback-bar .scrubCard').boundingBox();
  if (!box) return undefined;
  return {
    x: Math.max(0, Math.floor(box.x - 40)),
    y: Math.max(0, Math.floor(box.y - 90)),
    width: Math.min(1500, Math.ceil(box.width + 80)),
    height: Math.min(950, Math.ceil(box.height + 120)),
  };
}

async function shotBar(filename) {
  const clip = await playbackClip();
  await page.screenshot({ path: `${OUT}/${filename}`, ...(clip ? { clip } : {}) });
}

// --- 1. 4-Bar in Edit mode: toggles only, no max-effort ----------------------
await openTemplate('4-Bar');
const fourBarEditToggles = await page.locator('.poiMarker.toggle').count();
const fourBarEditEffort = await page.locator('.poiMarker.maxEffort').count();
record('4-Bar in Edit shows 2 toggle markers', fourBarEditToggles === 2, { fourBarEditToggles });
record('4-Bar in Edit hides max-effort markers', fourBarEditEffort === 0, { fourBarEditEffort });
await shotBar('01-four-bar-edit.png');

// --- 2. Parallelogram: branch markers and tooltip ----------------------------
await openTemplate('Parallelogram');
const paraToggles = await page.locator('.poiMarker.toggle').count();
record('Parallelogram shows 2 branch markers', paraToggles === 2, { paraToggles });
await page.locator('.poiMarker.toggle').first().hover();
await page.waitForTimeout(450);
const paraTooltip = (await page.locator('.mat-mdc-tooltip').first().textContent())?.trim() ?? '';
record(
  'Parallelogram marker tooltip describes a branch point in complete sentences',
  /Branch point at .+\. Click to jump here\.$/.test(paraTooltip),
  { paraTooltip }
);
await shotBar('02-parallelogram-branch-tooltip.png');
await page.mouse.move(10, 10);
await page.waitForTimeout(200);

// --- 3. Punch Press: Kinematic & Force Analysis show max input torque --------
await openTemplate('Punch_Press');
const ppEditEffort = await page.locator('.poiMarker.maxEffort').count();
record('Punch Press hides max-effort in Edit', ppEditEffort === 0, { ppEditEffort });

await tab('Kinematic').click();
await page.waitForTimeout(600);
const ppKinToggles = await page.locator('.poiMarker.toggle').count();
const ppKinEffort = await page.locator('.poiMarker.maxEffort').count();
record(
  'Punch Press in Kinematic Analysis shows both toggle and max-effort markers',
  ppKinToggles === 2 && ppKinEffort >= 1,
  { ppKinToggles, ppKinEffort }
);

await tab('Force').click();
await page.waitForTimeout(700);
const ppForceToggles = await page.locator('.poiMarker.toggle').count();
const ppForceEffort = await page.locator('.poiMarker.maxEffort').count();
record(
  'Punch Press in Force Analysis shows toggle and max-effort markers',
  ppForceToggles === 2 && ppForceEffort >= 1,
  { ppForceToggles, ppForceEffort }
);

const markerColors = await page.evaluate(() => ({
  toggle: getComputedStyle(document.querySelector('.poiMarker.toggle .poiGlyph')).backgroundColor,
  maxEffort: getComputedStyle(document.querySelector('.poiMarker.maxEffort .poiGlyph'))
    .backgroundColor,
  oldToggleBadge: document.querySelectorAll('.rowToggle').length,
}));
record(
  'Both marker types use PMKS accent yellow and the old row Toggle badge is gone',
  markerColors.toggle === 'rgb(255, 193, 7)' &&
    markerColors.maxEffort === 'rgb(255, 193, 7)' &&
    markerColors.oldToggleBadge === 0,
  markerColors
);

const firstEffort = page.locator('.poiMarker.maxEffort').first();
await firstEffort.hover();
await page.waitForTimeout(450);
const effortTooltip = (await page.locator('.mat-mdc-tooltip').first().textContent())?.trim() ?? '';
record(
  'Max-effort tooltip reports input torque with unit and complete sentences',
  /Maximum (static|dynamic) input torque is .+\. Click to jump here\.$/.test(effortTooltip),
  { effortTooltip }
);
await shotBar('03-punch-press-force-tooltip.png');

// --- 4. Clicking a marker while playing jumps straight there and pauses ------
await page.locator('.playButton').click();
await page.waitForTimeout(450);
const playingBeforeClick = await page.evaluate(
  () => ng.getComponent(document.querySelector('app-playback-bar')).rows[0]?.playing ?? false
);
const targetMarker = page.locator('.poiMarker.maxEffort').last();
const targetLeftPct = await targetMarker.evaluate((el) =>
  parseFloat(el.style.getPropertyValue('--at'))
);

const clip = await playbackClip();
const film = filmstrip(page, `${OUT}/jump-filmstrip`, clip);
await film.shot('before-click');
await film.during(45, 6, 'click-jump', () => targetMarker.click());
await page.waitForTimeout(150);
await film.shot('settled');
await contactSheet(`${OUT}/jump-filmstrip/*.png`, `${OUT}/04-jump-filmstrip-sheet.png`, 4, 1);

const afterJump = await page.evaluate(() => {
  const bar = ng.getComponent(document.querySelector('app-playback-bar'));
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  return {
    playing: bar.rows[0]?.playing ?? false,
    scrub: bar.rows[0]?.scrub ?? -1,
    seconds: grid.mechanismSrv.currentTimeSeconds(),
  };
});
record(
  'Clicking a marker while playing pauses playback and jumps to the marker position',
  playingBeforeClick === true &&
    afterJump.playing === false &&
    Math.abs(afterJump.scrub / 10 - targetLeftPct) < 2.5 &&
    afterJump.seconds > 0,
  { playingBeforeClick, targetLeftPct, afterJump }
);

// --- 5. Keyboard activation on a marker --------------------------------------
const firstToggle = page.locator('.poiMarker.toggle').first();
const toggleLeftPct = await firstToggle.evaluate((el) =>
  parseFloat(el.style.getPropertyValue('--at'))
);
await firstToggle.focus();
await page.keyboard.press('Enter');
await page.waitForTimeout(250);
const afterKey = await page.evaluate(() => {
  const bar = ng.getComponent(document.querySelector('app-playback-bar'));
  return { scrub: bar.rows[0]?.scrub ?? -1, playing: bar.rows[0]?.playing ?? false };
});
record(
  'Pressing Enter on a focused marker jumps to that toggle position',
  !afterKey.playing && Math.abs(afterKey.scrub / 10 - toggleLeftPct) < 2.5,
  { toggleLeftPct, afterKey }
);

// --- 6. Toggle Clamp in Force Analysis ---------------------------------------
await openTemplate('Toggle_Clamp');
await tab('Force').click();
await page.waitForTimeout(600);
const tcToggles = await page.locator('.poiMarker.toggle').count();
const tcEffort = await page.locator('.poiMarker.maxEffort').count();
record('Toggle Clamp shows 2 toggles and max-effort marker', tcToggles === 2 && tcEffort >= 1, {
  tcToggles,
  tcEffort,
});
await shotBar('05-toggle-clamp-force.png');

// --- 7. Offset Load Rocker (non-Grashof): 1 interior toggle, 0 at ends -------
await openTemplate('Offset_Load_Rocker');
await tab('Force').click();
await page.waitForTimeout(600);
const rockerToggles = await page
  .locator('.poiMarker.toggle')
  .evaluateAll((els) => els.map((el) => parseFloat(el.style.getPropertyValue('--at'))));
const rockerEffort = await page.locator('.poiMarker.maxEffort').count();
record(
  'Non-Grashof Offset Load Rocker marks only its interior toggle (none at 0% or 100%)',
  rockerToggles.length === 1 && rockerToggles[0] > 5 && rockerToggles[0] < 95,
  { rockerToggles }
);
record('Offset Load Rocker shows max-effort marker in Force Analysis', rockerEffort >= 1, {
  rockerEffort,
});
// Jump to max-effort so the thumb moves away from the interior toggle for visual inspection.
await page.locator('.poiMarker.maxEffort').first().click();
await page.waitForTimeout(250);
await shotBar('06-offset-load-rocker-force.png');

// --- 8. Multi-mechanism Four_Bar_Inversions: synced vs. unsynced -------------
await openTemplate('Four_Bar_Inversions');
const syncButton = page.locator('.syncToggle');
const isSynced = await syncButton.evaluate((el) => el.classList.contains('on'));
if (!isSynced) {
  await syncButton.click();
  await page.waitForTimeout(300);
}
const syncedPois = await page.locator('.poiMarker').count();
record('Synced "All" row hides POI markers', syncedPois === 0, { syncedPois });
await shotBar('07-inversions-synced.png');

await syncButton.click();
await page.waitForTimeout(400);
const unsyncedCounts = await page
  .locator('.mechRow')
  .evaluateAll((rows) => rows.map((row) => row.querySelectorAll('.poiMarker.toggle').length));
record(
  'Unsynced Four-Bar Inversions rows show [2, 2, 0, 1] toggles',
  JSON.stringify(unsyncedCounts) === JSON.stringify([2, 2, 0, 1]),
  { unsyncedCounts }
);
await shotBar('08-inversions-unsynced.png');

// --- 9. Phone viewport (< 600px) ---------------------------------------------
await page.setViewportSize({ width: 390, height: 844 });
await openTemplate('Punch_Press');
await tab('Force').click();
await page.waitForTimeout(600);
const phoneCheck = await page.evaluate(() => {
  const rail = document.querySelector('.trackWell')?.getBoundingClientRect();
  const markers = [...document.querySelectorAll('.poiMarker')].map((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, width: r.width, height: r.height };
  });
  return {
    count: markers.length,
    insideRail:
      !!rail &&
      markers.every((m) => m.left >= rail.left - 8 && m.right <= rail.right + 8 && m.width > 0),
  };
});
record(
  'Phone viewport renders markers inside the scrub rail',
  phoneCheck.count >= 3 && phoneCheck.insideRail,
  phoneCheck
);
await page.screenshot({ path: `${OUT}/09-phone-punch-press.png` });

record('nothing threw', errors.length === 0, errors.slice(0, 3));

await browser.close();
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
