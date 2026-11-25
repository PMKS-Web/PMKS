/**
 * Kinematic points of interest on the playback scrub rail (issue #386).
 *
 * Checks toggle, limit, and branch markers across Edit, Kinematic Analysis, and
 * Force Analysis, across Grashof and non-Grashof templates, synced vs. unsynced
 * multi-mechanism bars, click/keyboard jumps, tooltips, and phone layout.
 * Captures screenshots and a contact-sheet filmstrip under gitignored
 * `artifacts/playback-poi/`.
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

// --- 1. 4-Bar: 2 toggles visible across Edit, Kinematic, and Force -----------
await openTemplate('4-Bar');
const fourBarEditToggles = await page.locator('.poiMarker[data-poi-kind="toggle"]').count();
record('4-Bar in Edit shows 2 toggle markers', fourBarEditToggles === 2, { fourBarEditToggles });
await page.locator('.poiMarker[data-poi-kind="toggle"]').first().hover();
await page.waitForTimeout(450);
const fourBarTip = (await page.locator('.mat-mdc-tooltip').first().textContent())?.trim() ?? '';
record(
  '4-Bar toggle tooltip explains link alignment and reversal',
  /^Toggle position at .+, where links align and output motion reverses\. Click to jump here\.$/.test(
    fourBarTip
  ),
  { fourBarTip }
);
await shotBar('01-four-bar-edit-tooltip.png');
await page.mouse.move(10, 10);
await page.waitForTimeout(200);

await tab('Kinematic').click();
await page.waitForTimeout(500);
const fourBarKinToggles = await page.locator('.poiMarker[data-poi-kind="toggle"]').count();
record('4-Bar in Kinematic Analysis shows 2 toggle markers', fourBarKinToggles === 2, {
  fourBarKinToggles,
});

// --- 2. Scotch Yoke: slot-driven limit markers (not toggles) -----------------
await openTemplate('Scotch_Yoke');
const yokeLimits = await page.locator('.poiMarker[data-poi-kind="limit"]').count();
const yokeToggles = await page.locator('.poiMarker[data-poi-kind="toggle"]').count();
record('Scotch Yoke marks 2 limit positions and 0 toggles', yokeLimits === 2 && yokeToggles === 0, {
  yokeLimits,
  yokeToggles,
});
await page.locator('.poiMarker[data-poi-kind="limit"]:not(.covered)').first().hover();
await page.waitForTimeout(450);
const yokeTooltip = (await page.locator('.mat-mdc-tooltip').first().textContent())?.trim() ?? '';
record(
  'Scotch Yoke limit tooltip avoids claiming link collinearity',
  /^Limit position at .+, where output motion stops and reverses\. Click to jump here\.$/.test(
    yokeTooltip
  ),
  { yokeTooltip }
);
await shotBar('02-scotch-yoke-limit-tooltip.png');
await page.mouse.move(10, 10);
await page.waitForTimeout(200);

// --- 3. Parallelogram: branch markers and tooltip ----------------------------
await openTemplate('Parallelogram');
const paraBranches = await page.locator('.poiMarker[data-poi-kind="branch"]').count();
record('Parallelogram shows 2 branch markers in Edit mode', paraBranches === 2, {
  paraBranches,
});
await page.locator('.poiMarker[data-poi-kind="branch"]').first().hover();
await page.waitForTimeout(450);
const paraTooltip = (await page.locator('.mat-mdc-tooltip').first().textContent())?.trim() ?? '';
record(
  'Parallelogram marker tooltip describes a branch point in complete sentences',
  /^Branch point at .+, where the mechanism can switch assembly branches\. Click to jump here\.$/.test(
    paraTooltip
  ),
  { paraTooltip }
);
await shotBar('02b-parallelogram-branch-tooltip.png');
await page.mouse.move(10, 10);
await page.waitForTimeout(200);

// --- 4. Punch Press: 2 toggles only (no max-effort) across all modes ---------
await openTemplate('Punch_Press');
const ppEditToggles = await page.locator('.poiMarker[data-poi-kind="toggle"]').count();
const ppEditTotal = await page.locator('.poiMarker').count();
record(
  'Punch Press in Edit shows 2 toggle markers and no effort markers',
  ppEditToggles === 2 && ppEditTotal === 2,
  { ppEditToggles, ppEditTotal }
);

await tab('Kinematic').click();
await page.waitForTimeout(600);
const ppKinToggles = await page.locator('.poiMarker[data-poi-kind="toggle"]').count();
const ppKinTotal = await page.locator('.poiMarker').count();
record(
  'Punch Press in Kinematic Analysis shows 2 toggle markers and no effort markers',
  ppKinToggles === 2 && ppKinTotal === 2,
  { ppKinToggles, ppKinTotal }
);

await tab('Force').click();
await page.waitForTimeout(700);
const ppForceToggles = await page.locator('.poiMarker[data-poi-kind="toggle"]').count();
const ppForceTotal = await page.locator('.poiMarker').count();
record(
  'Punch Press in Force Analysis shows 2 toggle markers and no effort markers',
  ppForceToggles === 2 && ppForceTotal === 2,
  { ppForceToggles, ppForceTotal }
);

const markerStyle = await page.evaluate(() => {
  const toggleGlyph = document.querySelector('.poiMarker[data-poi-kind="toggle"] .poiGlyph');
  const tStyle = toggleGlyph ? getComputedStyle(toggleGlyph) : null;
  return {
    toggleBg: tStyle?.backgroundColor,
    toggleRadius: tStyle?.borderRadius,
    toggleTransform: tStyle?.transform,
    oldToggleBadge: document.querySelectorAll('.rowToggle').length,
  };
});
record(
  'POI markers use the circular PMKS yellow glyph and the old row Toggle badge is gone',
  markerStyle.toggleBg === 'rgb(255, 193, 7)' &&
    markerStyle.toggleRadius === '50%' &&
    markerStyle.toggleTransform === 'none' &&
    markerStyle.oldToggleBadge === 0,
  markerStyle
);
await shotBar('03-punch-press-force.png');

// --- 5. Clicking a marker while playing jumps straight there and pauses ------
await page.locator('.playButton').click();
await page.waitForTimeout(450);
const playingBeforeClick = await page.evaluate(
  () => ng.getComponent(document.querySelector('app-playback-bar')).rows[0]?.playing ?? false
);
const targetMarker = page.locator('.poiMarker[data-poi-kind="toggle"]').last();
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

// --- 6. Keyboard activation on a marker --------------------------------------
const firstToggle = page.locator('.poiMarker[data-poi-kind="toggle"]').first();
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

// --- 7. Toggle Clamp ---------------------------------------------------------
await openTemplate('Toggle_Clamp');
const tcToggles = await page.locator('.poiMarker[data-poi-kind="toggle"]').count();
record('Toggle Clamp shows 2 toggles in Edit mode', tcToggles === 2, { tcToggles });
await shotBar('05-toggle-clamp-edit.png');

// --- 8. Offset Load Rocker (non-Grashof): 1 interior toggle, 0 at ends -------
await openTemplate('Offset_Load_Rocker');
const rockerToggles = await page
  .locator('.poiMarker[data-poi-kind="toggle"]')
  .evaluateAll((els) => els.map((el) => parseFloat(el.style.getPropertyValue('--at'))));
record(
  'Non-Grashof Offset Load Rocker marks only its interior toggle (none at 0% or 100%)',
  rockerToggles.length === 1 && rockerToggles[0] > 5 && rockerToggles[0] < 95,
  { rockerToggles }
);
await shotBar('06-offset-load-rocker-edit.png');

// --- 9. Multi-mechanism Four_Bar_Inversions: synced vs. unsynced -------------
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
  .evaluateAll((rows) =>
    rows.map((row) => row.querySelectorAll('.poiMarker[data-poi-kind="toggle"]').length)
  );
record(
  'Unsynced Four-Bar Inversions rows show [2, 2, 0, 1] toggles',
  JSON.stringify(unsyncedCounts) === JSON.stringify([2, 2, 0, 1]),
  { unsyncedCounts }
);
await shotBar('08-inversions-unsynced.png');

// --- 10. Phone viewport (< 600px) --------------------------------------------
await page.setViewportSize({ width: 390, height: 844 });
await openTemplate('Punch_Press');
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
  phoneCheck.count === 2 && phoneCheck.insideRail,
  phoneCheck
);
await page.screenshot({ path: `${OUT}/09-phone-punch-press.png` });

record('nothing threw', errors.length === 0, errors.slice(0, 3));

await browser.close();
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
