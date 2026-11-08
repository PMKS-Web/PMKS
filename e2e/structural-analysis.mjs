/** Structural tab: published crank, analytical stresses, playback, gaps and phone layout. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openMechanism } from './app-ready.mjs';
import { startQuiet } from './quiet-start.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
const base = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const out = resolve('artifacts/structural-ui');
mkdirSync(out, { recursive: true });
const gallery = readFileSync('docs/fixture-urls.md', 'utf8');
const row = gallery.split('\n').find((line) => line.startsWith('| [Structural held crank]('));
if (!row) throw new Error('Missing published structural crank');
const url = `${base}/?${row.split('](')[1].split(')')[0].split('?')[1]}`;
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await startQuiet(context);
const page = await context.newPage();
page.setDefaultTimeout(12000);
const errors = [],
  checks = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('crash', () => errors.push('Page crashed'));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
};
const panel = page.locator('app-structural-panel');
const seek = (index) =>
  panel.getByLabel('Sample', { exact: true }).evaluate((input, value) => {
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, index);
const state = () =>
  panel.evaluate((host) => {
    const view = window.ng.getComponent(host).view;
    const current = view.mechanisms.currentSampleOf(view.mechanismIndex);
    return {
      coverage: view.result?.coverage,
      status: view.result?.status,
      maxMPa: view.result?.envelope?.maximumVonMises.extremum.valuePa / 1e6,
      current,
      time: view.result?.samples[current]?.timeSeconds,
      currentStatus: view.result?.samples[current]?.status,
      rootMass: view.mechanism?.links[0][0].mass,
      rootInertia: view.mechanism?.links[0][0].massMoI,
      graph: window.ng.getComponent(host).series,
    };
  });

try {
  await openMechanism(page, url);
  const transition = filmstrip(page, resolve(out, 'tab-transition'));
  await transition.shot('edit');
  await transition.during(45, 6, 'opening', () =>
    page.getByRole('button', { name: 'Structural Analysis', exact: true }).click()
  );
  await transition.shot('settled');
  check(
    'missing dimensions disable analysis with a reason',
    (await panel.getByRole('button', { name: 'Analyze Over Time' }).isDisabled()) &&
      (await panel.textContent()).includes('Enter positive section dimensions')
  );
  await panel.getByLabel('Width (mm)', { exact: true }).fill('10');
  await panel.getByLabel('Height (mm)', { exact: true }).fill('20');
  await panel.getByLabel('Yield Strength (MPa, Optional)', { exact: true }).fill('250');
  const before = await state();
  await page.screenshot({ path: resolve(out, 'setup.png') });
  const calculation = filmstrip(page, resolve(out, 'calculation'));
  await calculation.during(50, 6, 'calculating', () =>
    panel.getByRole('button', { name: 'Analyze Over Time' }).click()
  );
  await calculation.shot('settled');
  await panel.locator('.coverage').waitFor();
  await panel.locator('.apexcharts-svg').waitFor();
  let after = await state();
  check(
    'all solved samples analyzed',
    after.status === 'complete' && after.coverage.failed === 0,
    after.coverage
  );
  // URL opens in cm: 2 cm span, 100 N, 10 x 20 mm -> 3 MPa bending + 0.5 MPa axial.
  // Their phase-shifted combination peaks at sqrt(3² + 0.5²), within sampling error.
  check(
    'analytical peak stress uses display units correctly',
    Math.abs(after.maxMPa - Math.hypot(3, 0.5)) < 0.002,
    after.maxMPa
  );
  check(
    'analysis does not rewrite mass or inertia',
    before.rootMass === after.rootMass && before.rootInertia === after.rootInertia
  );
  await page.screenshot({ path: resolve(out, 'results.png') });
  await panel.getByRole('button', { name: /Stress Envelope and Yield/ }).click();
  await panel.getByRole('button', { name: 'Show Critical Stress Sample' }).click();
  check('critical stress button seeks a governing sample', (await state()).current !== 0);
  await panel.getByRole('button', { name: /Stress Envelope and Yield/ }).click();
  await panel.getByRole('button', { name: 'Normal', exact: true }).click();
  await seek(90);
  after = await state();
  check(
    'sample slider seeks the selected mechanism',
    after.current === 90 && after.time > 0,
    after.current
  );
  check(
    'fixed-point history has one curve',
    after.graph.length === 1 && after.graph[0].name === 'Fixed Material Point'
  );
  const playback = filmstrip(page, resolve(out, 'playback'));
  await playback.shot('before');
  await playback.during(80, 8, 'playing', async () => {
    await page.locator('.playButton').click();
    await page.waitForTimeout(800);
    await page.locator('.playButton').click();
  });
  await playback.shot('paused');
  const played = await state();
  check('playback advances structural sample readout', played.current !== after.current, {
    before: after.current,
    after: played.current,
  });
  await page.getByRole('button', { name: /^Kinematic Analysis/ }).click();
  await page.getByRole('button', { name: /^Force Analysis/ }).click();
  await page.getByRole('button', { name: 'Structural Analysis', exact: true }).click();
  after = await state();
  check(
    'switching analysis tabs retains results and pose',
    after.status === 'complete' && after.current === played.current
  );
  await panel.getByRole('button', { name: 'FoS', exact: true }).click();
  check(
    'factor-of-safety history is finite for specified yield',
    (await state()).graph[0].data.some((p) => p.y > 80)
  );
  await panel.getByRole('button', { name: /Section and Loading/ }).click();
  await panel.getByLabel('Height (mm)', { exact: true }).fill('40');
  check('changing setup clears stale results', (await panel.locator('.coverage').count()) === 0);
  await panel.getByRole('button', { name: 'Analyze Over Time' }).click();
  await panel.locator('.coverage').waitFor();
  check(
    'doubling depth recalculates bending and axial stress',
    Math.abs((await state()).maxMPa - Math.hypot(0.75, 0.25)) < 0.002
  );
  await panel.getByRole('button', { name: /Section and Loading/ }).click();
  await panel.getByRole('button', { name: 'Dynamic', exact: true }).click();
  check(
    'dynamic requires an explicit mass assumption',
    (await panel.getByRole('button', { name: 'Analyze Over Time' }).isDisabled()) &&
      (await panel.textContent()).includes('Dynamic stress requires')
  );
  await panel.getByLabel('Use the uniform rod mass assumption').check();
  check(
    'inconsistent mass and inertia receive a backend refusal',
    (await panel.getByRole('button', { name: 'Analyze Over Time' }).isDisabled()) &&
      (await panel.textContent()).includes('A uniform line must reproduce')
  );
  await panel.getByRole('button', { name: 'Quasi-static', exact: true }).click();
  await panel.getByLabel('Height (mm)', { exact: true }).fill('20');
  // Fault injection in one solved frame of the same published geometry. Preflight remains valid.
  await panel.evaluate((host) => {
    const view = window.ng.getComponent(host).view;
    view.mechanism.links[90][0].mass = NaN;
  });
  await panel.getByRole('button', { name: 'Analyze Over Time' }).click();
  await panel.locator('.coverage').waitFor();
  await panel.getByRole('button', { name: 'Von Mises', exact: true }).click();
  await seek(90);
  const gap = await state();
  check(
    'failed sample remains a gap with incomplete coverage',
    gap.status === 'incomplete' &&
      gap.coverage.failed === 1 &&
      gap.currentStatus === 'failed' &&
      gap.graph.every((s) => s.data[90].y === null),
    gap.coverage
  );
  check(
    'incomplete result disclaims full-motion safety',
    (await panel.textContent()).includes('do not establish safety over the full motion')
  );
  await page.screenshot({ path: resolve(out, 'gap.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Expand the panel', exact: true }).click();
  await page.waitForTimeout(400);
  await panel.locator('app-analysis-apex-chart').scrollIntoViewIfNeeded();
  check(
    'phone retains accessible structural mode and no horizontal overflow',
    (await page.getByRole('button', { name: 'Structural Analysis', exact: true }).isVisible()) &&
      (await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  );
  check(
    'phone uses one scrolling analysis card',
    (await panel.locator('#normalPanel').count()) === 1
  );
  await page.screenshot({ path: resolve(out, 'phone.png') });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Fit to view' }).click();
  await page.waitForTimeout(600);
  const grab = await page.evaluate(() => {
    const joint = [...document.querySelectorAll('#jointHolder > svg')].find((el) =>
      el.querySelector('#joint_B')
    );
    if (!joint) throw new Error('Joint B missing');
    const box = joint.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });
  const drag = filmstrip(page, resolve(out, 'posed-drag'));
  await drag.shot('before');
  await drag.during(75, 8, 'dragging', async () => {
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    for (let step = 1; step <= 6; step++) {
      await page.mouse.move(grab.x + step * 4, grab.y - step * 3);
      await page.waitForTimeout(55);
    }
    await page.mouse.up();
  });
  await drag.shot('settled');
  check(
    'a paused-pose drag clears the structural history',
    (await panel.locator('.coverage').count()) === 0
  );
  check('no browser errors', errors.length === 0, errors);
  for (const name of ['tab-transition', 'calculation', 'playback', 'posed-drag'])
    console.log(await contactSheet(`${out}/${name}/*.png`, `${out}/${name}.png`, 4, 0.5));
} catch (error) {
  check('suite completes', false, String(error));
  await page.screenshot({ path: resolve(out, 'failure.png') });
} finally {
  writeFileSync(resolve(out, 'report.json'), JSON.stringify({ checks, errors }, null, 2));
  await browser.close();
}
if (checks.some((c) => !c.ok) || errors.length) process.exitCode = 1;
