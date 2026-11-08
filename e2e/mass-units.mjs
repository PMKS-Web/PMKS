/**
 * Length, mass and force are picked separately, and everything else follows.
 *
 * Issue #142. Settings used to offer English / Metric / SI, where "Metric" and
 * "SI" were really two lengths and the mass came along unasked: grams with
 * centimeters, kilograms with meters. Now the row is Length Units, a Mass Units
 * row offers grams or kilograms under either metric length, and a note says
 * what torque and inertia come to -- and, under inches, where the mass and
 * force rows hide for having one option each, that the force is in lbf.
 *
 * What a mass pick must not do is change what is *stored*. Masses stay in the
 * length's own unit, and the panel, the strip and the URL convert at their own
 * edges, exactly as kilograms-force does for a force.
 *
 *   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/mass-units.mjs
 */

import { mkdirSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { openMechanism } from './app-ready.mjs';
import { TEMPLATE_LINKAGES as payloads } from './template-payloads.mjs';
import { inAngular } from './in-angular.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/mass-units';
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

/** The Settings drawer, open — through the project menu, as a hand would. */
const openSettings = async () => {
  if ((await page.locator('#settingsWrapper').count()) > 0) return;
  await page.locator('.topStrip .iconButton').first().click();
  await page.locator('.menuItem', { hasText: 'Settings' }).first().click();
  await page.waitForTimeout(700);
};

/** One labeled pill row in Settings: its options and which is chosen. */
const pill = (label) =>
  page.evaluate((wanted) => {
    const block = [...document.querySelectorAll('#settingsWrapper #radio-block')].find((one) =>
      one.textContent.trim().startsWith(wanted)
    );
    if (!block) return null;
    const buttons = [...block.querySelectorAll('.segmented button')];
    return {
      options: buttons.map((one) => one.textContent.trim()),
      chosen: buttons.findIndex((one) => one.classList.contains('chosen')),
    };
  }, label);

const pick = async (label, option) => {
  await page
    .locator('#settingsWrapper #radio-block', { hasText: label })
    .locator('.segmented button', { hasText: option })
    .first()
    .click();
  await page.waitForTimeout(700);
};

const note = () =>
  page.evaluate(() => document.querySelector('#settingsWrapper .unitsNote')?.textContent.trim());

/** The selected link's mass as stored, and its two fields as the panel shows them. */
const linkState = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const panel = ng.getComponent(document.querySelector('app-edit-panel'));
    const settings = grid.mechanismSrv.settingsService;
    const link = grid.mechanismSrv.activeObjService.selectedLink;
    return {
      stored: link?.mass,
      shownMass: panel?.linkForm.controls['mass'].value,
      shownInertia: panel?.linkForm.controls['massMoI'].value,
      massUnit: settings.massUnit.value,
      lengthUnit: settings.lengthUnit.value,
      strip: document.querySelector('app-bottombar .units')?.textContent.trim() ?? '',
    };
  });

const selectFirstBar = () =>
  inAngular(page, () => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const bar = grid.mechanismSrv.links.find((link) => link.constructor.name === 'RealLink');
    grid.mechanismSrv.activeObjService.updateSelectedObj(bar ?? grid.mechanismSrv.links[0]);
  });

const typeMass = (text) =>
  inAngular(
    page,
    (value) => {
      const panel = ng.getComponent(document.querySelector('app-edit-panel'));
      panel.linkForm.controls['mass'].setValue(value);
    },
    text
  );

const shot = (name) => page.locator('#settingsWrapper').screenshot({ path: `${OUT}/${name}.png` });

await openMechanism(page, `${BASE}/?${payloads['Crane_Two_Loads']}`);
await openSettings();

// ---- The rows are the units, not named systems ------------------------------
const length = await pill('Length Units');
record(
  'Length Units offers the three lengths by name',
  length?.options.join(' · ') === 'Inch (in) · Centimeter (cm) · Meter (m)' && length.chosen === 1,
  length
);
const angle = await pill('Angle Units');
record(
  'Radian carries its symbol',
  angle?.options.join(' · ') === 'Degree (°) · Radian (rad)',
  angle
);
const mass = await pill('Mass Units');
record(
  'centimeters offer grams or kilograms, on grams',
  mass?.options.join(' · ') === 'Gram (g) · Kilogram (kg)' && mass.chosen === 0,
  mass
);
record(
  'and the note says what torque and inertia come to',
  (await note()) === 'Torque reads in N·cm and inertia in g·cm².',
  await note()
);
await shot('settings-cm-grams');

// ---- A mass pick changes the reading, never the stored number ---------------
await selectFirstBar();
await page.waitForTimeout(500);
await typeMass('500');
await page.waitForTimeout(500);
const inGrams = await linkState();
record(
  'a mass typed in grams is stored in grams',
  inGrams.stored === 500 && inGrams.shownMass === '500.00 g',
  inGrams
);

await pick('Mass Units', 'Kilogram (kg)');
const inKg = await linkState();
record(
  'picking kilograms leaves the stored mass where it was',
  inKg.stored === 500 && inKg.massUnit === 42,
  inKg
);
record('while the panel reads it in kilograms', inKg.shownMass === '0.50 kg', inKg);
record('and the inertia in kg·cm²', /kg·cm²$/.test(inKg.shownInertia ?? ''), inKg);
record('and the strip names kg', /\bcm, kg, N\b/.test(inKg.strip), inKg.strip);
record(
  'and the note follows the mass',
  (await note()) === 'Torque reads in N·cm and inertia in kg·cm².',
  await note()
);
await shot('settings-cm-kilograms');

await typeMass('2');
await page.waitForTimeout(500);
const typedKg = await linkState();
record(
  'a number typed in kilograms is stored as the grams it is worth',
  typedKg.stored === 2000 && typedKg.shownMass === '2.00 kg',
  typedKg
);

// ---- The pick rides the URL -------------------------------------------------
const url = await page.evaluate(() =>
  ng.getComponent(document.querySelector('app-top-bar')).urlGeneration.generateUrlQuery()
);
await openMechanism(page, `${BASE}/?${url}`);
await openSettings();
await selectFirstBar();
await page.waitForTimeout(500);
const reopened = await linkState();
record(
  'a link shared in kilograms opens in kilograms, at the same stored mass',
  reopened.massUnit === 42 && reopened.stored === 2000 && reopened.shownMass === '2.00 kg',
  reopened
);
record('and the pill says so', (await pill('Mass Units'))?.chosen === 1, await pill('Mass Units'));

// ---- A change of length lands on that length's own mass ---------------------
await pick('Mass Units', 'Gram (g)');
await pick('Length Units', 'Meter (m)');
const inMeters = await linkState();
record(
  'meters land on kilograms, with the mass rescaled into them',
  Math.abs(inMeters.stored - 2) < 1e-9 && inMeters.shownMass === '2.00 kg',
  inMeters
);
record(
  'and the pill moves to Kilogram',
  (await pill('Mass Units'))?.chosen === 1,
  await pill('Mass Units')
);
await pick('Mass Units', 'Gram (g)');
const metersInGrams = await linkState();
record(
  'and grams under meters read the same body in grams and g·m²',
  metersInGrams.shownMass === '2000.00 g' && /g·m²$/.test(metersInGrams.shownInertia ?? ''),
  metersInGrams
);
await shot('settings-m-grams');

// ---- Inches: one mass, one force, and the note says which -------------------
await pick('Length Units', 'Inch (in)');
const inInches = await linkState();
record(
  'English hides the Mass Units row',
  (await pill('Mass Units')) === null,
  await pill('Mass Units')
);
record('and the Force Units row', (await pill('Force Units')) === null, await pill('Force Units'));
record(
  'and the note names both, with what follows from them',
  (await note()) ===
    'Mass is in lbm and force in lbf. Torque reads in lbf·in and inertia in lbm·in².',
  await note()
);
record('the strip names lbm and lbf', /\bin, lbm, lbf\b/.test(inInches.strip), inInches.strip);
record('and the panel reads pounds-mass', /lbm$/.test(inInches.shownMass ?? ''), inInches);
await shot('settings-inches');

await pick('Length Units', 'Centimeter (cm)');
const back = await linkState();
record(
  'coming back to centimeters reads grams',
  / g$/.test(back.shownMass ?? '') && (await pill('Mass Units'))?.chosen === 0,
  back
);

record('nothing threw', errors.length === 0, errors.slice(0, 3));
await browser.close();

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
