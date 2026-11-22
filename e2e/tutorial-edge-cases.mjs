/**
 * The tutorial, driven by a student who does not follow it.
 *
 * `tutorial.mjs` walks the five steps the way they are written. This suite
 * does everything else: starts it over somebody else's mechanism, undoes past
 * its start, opens a template in the middle, draws the wrong shape, grounds
 * the wrong joint, wanders into another mode. Each section is one way the
 * tutorial used to break (issue #375).
 *
 *   PMKS_BASE_URL=<origin> node e2e/tutorial-edge-cases.mjs
 */

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { mkdirSync } from 'node:fs';
import { waitForReady } from './app-ready.mjs';
import { TEMPLATE_LINKAGES } from './template-payloads.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const SIX_BAR = TEMPLATE_LINKAGES['Watt_I'];
const OUT = 'artifacts/tutorial-edge-cases';
mkdirSync(OUT, { recursive: true });

const passed = [];
const failed = [];
const check = (name, pass, extra = '') => {
  (pass ? passed : failed).push(name);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
};

const browser = await chromium.launch();
const errors = [];

async function freshPage(query = '') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/${query ? `?${query}` : ''}`, { waitUntil: 'networkidle' });
  await waitForReady(page);
  return page;
}

const stepOn = async (page) => {
  const lead = await page
    .locator('.cardLead')
    .innerText()
    .catch(() => '');
  const found = lead.match(/Step (\d) of 5/);
  return found ? Number(found[1]) : null;
};
const cardShowing = (page) => page.locator('.tutorialCard').isVisible();
const jointCount = (page) => page.locator('#jointHolder [id^="joint_"]').count();
const dialogText = (page) =>
  page
    .locator('mat-dialog-container')
    .innerText()
    .catch(() => '');
const notices = (page) =>
  page
    .locator('app-notification-stack')
    .innerText()
    .catch(() => '');

async function menuTutorial(page) {
  await page.locator('.brandCard .iconButton').click();
  await page.waitForTimeout(350);
  await page.locator('#tutorialButton').click();
  await page.waitForTimeout(700);
}

/**
 * Change the drawing through the service, then give Angular a real input so it
 * draws the result -- a poke from `evaluate` alone leaves the page stale.
 */
async function poke(page, fn, arg) {
  const result = await page.evaluate(
    ([source, value]) => {
      const grid = ng.getComponent(document.querySelector('app-new-grid'));
      const tutorialCard = document.querySelector('app-tutorial-panel');
      const tutorial = tutorialCard ? ng.getComponent(tutorialCard).tutorial : undefined;
      return new Function('srv', 'tutorial', 'value', source)(grid.mechanismSrv, tutorial, value);
    },
    [fn, arg]
  );
  await page.mouse.move(5, 450);
  await page.mouse.move(8, 452);
  await page.waitForTimeout(400);
  return result;
}

/** A bar from one model point to another, through the call the menu uses. */
const ADD_BAR = `
  const [ax, ay, bx, by] = value;
  return srv.addBar({ x: ax, y: ay }, { x: bx, y: by }) ? srv.links.length : -1;
`;
const EXTEND = `
  const [id, x, y] = value;
  const anchor = srv.joints.find((j) => j.id === id);
  return srv.addBarFrom(anchor, { x, y }) ? srv.links.length : -1;
`;

// ---- 1. starting over somebody else's mechanism ----
{
  const page = await freshPage(SIX_BAR);
  const before = await jointCount(page);
  await menuTutorial(page);
  check('starting on a drawing asks first', /clears the grid/.test(await dialogText(page)));
  check('and says Undo brings it back', /Undo/.test(await dialogText(page)));
  check('without opening the tutorial behind it', !(await cardShowing(page)));
  await page.screenshot({ path: `${OUT}/01-asks.png` });
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForTimeout(500);
  check('Cancel leaves the drawing', (await jointCount(page)) === before, `${before}`);
  check('and the tutorial closed', !(await cardShowing(page)));

  await menuTutorial(page);
  await page.getByRole('button', { name: 'Clear and Start' }).click();
  await page.waitForTimeout(900);
  check('Clear and Start empties the grid', (await jointCount(page)) === 0);
  check('and begins at step 1', (await stepOn(page)) === 1, String(await stepOn(page)));
  await page.screenshot({ path: `${OUT}/02-cleared.png` });

  // ---- 2. undo back past the clear ----
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.waitForTimeout(900);
  check('undo past the clear brings the six-bar back', (await jointCount(page)) === before);
  check('and puts the tutorial away', !(await cardShowing(page)));
  check('saying why', /Undo brought back/.test(await notices(page)));
  check(
    'with no resume line over somebody else’s drawing',
    (await page.locator('.resumeCard').count()) === 0
  );
  await page.screenshot({ path: `${OUT}/03-undone.png` });
  await page.getByRole('button', { name: 'Redo' }).click();
  await page.waitForTimeout(900);
  check('redo returns to the tutorial’s empty grid', (await jointCount(page)) === 0);
  check('and offers the way back in', await page.locator('.resumeCard').isVisible());
  await page.locator('.resumeCard').click();
  await page.waitForTimeout(700);
  check('which resumes without asking', (await dialogText(page)) === '');
  check('at step 1', (await stepOn(page)) === 1);

  // ---- 3. a template opened mid-tutorial ----
  await page.locator('.doItButton').click();
  await page.waitForTimeout(700);
  await page.locator('.brandCard .iconButton').click();
  await page.waitForTimeout(350);
  await page.locator('#templatesButton').click();
  await page.waitForTimeout(900);
  await page.locator('#templates app-template-card').first().click();
  await page.waitForTimeout(600);
  // The library asks before it replaces a drawing.
  await page.getByRole('button', { name: 'Replace', exact: true }).click();
  await page.waitForTimeout(1800);
  check('a template closes the tutorial', !(await cardShowing(page)));
  check(
    'and leaves no resume line pointing at the template',
    (await page.locator('.resumeCard').count()) === 0
  );
  await page.screenshot({ path: `${OUT}/04-template.png` });
  // The library says that replacing can be undone, and undoing it puts the
  // tutorial's own drawing back -- which is the tutorial's to resume again.
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.waitForTimeout(900);
  check(
    'undoing the template offers the tutorial back',
    await page.locator('.resumeCard').isVisible()
  );
  await page.context().close();
}

// ---- 4. Do This Step For Me on two bars that do not touch ----
{
  const page = await freshPage();
  await page.getByRole('button', { name: 'Start Tutorial', exact: true }).click();
  await page.waitForTimeout(600);
  await poke(page, ADD_BAR, [-3, 0, -3, 1]);
  await poke(page, ADD_BAR, [3, 0, 3, 1]);
  await page.waitForTimeout(3000);
  check('two loose bars are still step 2', (await stepOn(page)) === 2);
  await page.locator('.doItButton').click();
  await page.waitForTimeout(3600);
  const shape = await poke(
    page,
    `return srv.links.map((l) => {
       const [a, b] = l.joints; return Math.hypot(a.x - b.x, a.y - b.y);
     });`
  );
  check('it finishes the chain', (await stepOn(page)) === 3, String(await stepOn(page)));
  check(
    'with no bar of zero length',
    shape.every((length) => length > 0.05),
    shape.map((n) => n.toFixed(2)).join(', ')
  );
  await page.screenshot({ path: `${OUT}/05-two-loose.png` });

  // Ground the middle joint first.
  await poke(
    page,
    `const j = srv.links[0].joints[1]; srv.activeObjService.updateSelectedObj(j); srv.toggleGround();`
  );
  check(
    'a ground in the middle names the control that undoes it',
    /Turn off Grounded for joint/.test(
      await page
        .locator('.warnHint')
        .innerText()
        .catch(() => '')
    )
  );
  await page.screenshot({ path: `${OUT}/08-middle-ground.png` });
  await poke(
    page,
    `const j = srv.links[0].joints[1]; srv.activeObjService.updateSelectedObj(j); srv.toggleGround();`
  );

  await page.context().close();
}

// ---- 5. wrong shapes say so ----
{
  const page = await freshPage();
  await page.getByRole('button', { name: 'Start Tutorial', exact: true }).click();
  await page.waitForTimeout(600);
  for (const x of [-4, 0, 4]) await poke(page, ADD_BAR, [x, 0, x, 1]);
  check(
    'three loose bars are told about Attach',
    /do not touch/.test(
      await page
        .locator('.warnHint')
        .innerText()
        .catch(() => '')
    )
  );
  await page.screenshot({ path: `${OUT}/06-loose.png` });

  await page.locator('.startOver').click();
  await page.waitForTimeout(500);
  check('Start Over asks first', /Start the tutorial again/.test(await dialogText(page)));
  await page.getByRole('button', { name: 'Clear and Start' }).click();
  await page.waitForTimeout(800);
  check('and clears', (await jointCount(page)) === 0 && (await stepOn(page)) === 1);

  // A chain of four, grounded at its ends and driven: it passes every step and
  // cannot run.
  await poke(page, ADD_BAR, [-3, 0, -3, 1]);
  const ids = await poke(page, 'return srv.joints.map((j) => j.id);');
  await poke(page, EXTEND, [ids[1], -1, 2]);
  const ids2 = await poke(page, 'return srv.joints.map((j) => j.id);');
  await poke(page, EXTEND, [ids2[2], 1, 2]);
  const ids3 = await poke(page, 'return srv.joints.map((j) => j.id);');
  await poke(page, EXTEND, [ids3[3], 3, 0]);
  await page.waitForTimeout(3000);
  check(
    'a chain of four is warned about at the grounding step',
    /4 links/.test(
      await page
        .locator('.warnHint')
        .innerText()
        .catch(() => '')
    )
  );
  await page.screenshot({ path: `${OUT}/07-four-links.png` });

  for (let i = 0; i < 2; i++) {
    await page.locator('.doItButton').click();
    await page.waitForTimeout(3600);
  }
  check('it reaches step 5', (await stepOn(page)) === 5, String(await stepOn(page)));
  const stuck = await page.locator('.warnHint').allInnerTexts();
  check(
    'and says it cannot run yet',
    stuck.some((t) => /can’t run yet/.test(t)),
    stuck.join(' | ')
  );
  check(
    'the button offers the list instead of a play that reads nothing',
    /Show What’s Missing/.test(await page.locator('.doItButton').innerText())
  );
  await page.locator('.doItButton').click();
  await page.waitForTimeout(800);
  check(
    'which opens the setup under the card',
    await page.locator('#rightPanel app-analysis-setup').isVisible()
  );
  await page.screenshot({ path: `${OUT}/09-stuck.png` });
  await page.context().close();
}

// ---- 6. the wrong mode ----
{
  const page = await freshPage();
  await page.getByRole('button', { name: 'Start Tutorial', exact: true }).click();
  await page.waitForTimeout(600);
  await page.locator('app-top-bar').getByText('Synthesis', { exact: true }).first().click();
  await page.waitForTimeout(600);
  check(
    'step 1 in Synthesis points back to Edit',
    /made in Edit/.test(
      await page
        .locator('.warnHint')
        .innerText()
        .catch(() => '')
    )
  );
  await page.screenshot({ path: `${OUT}/10-wrong-mode.png` });
  await page.locator('.doItButton').click();
  await page.waitForTimeout(800);
  check(
    'Do This Step For Me goes back to Edit to do it',
    (await stepOn(page)) !== null && (await page.locator('.warnHint').count()) === 0
  );
  await page.context().close();
}

// ---- 7. a finished tutorial, started again from the menu ----
{
  const page = await freshPage();
  await page.getByRole('button', { name: 'Start Tutorial', exact: true }).click();
  await page.waitForTimeout(600);
  for (let i = 0; i < 5; i++) {
    await page.locator('.doItButton').click();
    await page.waitForTimeout(3600);
  }
  check('the tutorial finishes', await page.locator('.doneCard').isVisible());
  await page.locator('.primaryButton').click();
  await page.waitForTimeout(600);
  await menuTutorial(page);
  check(
    'starting it again asks to clear the finished four-bar',
    /clears the grid/.test(await dialogText(page))
  );
  await page.getByRole('button', { name: 'Clear and Start' }).click();
  await page.waitForTimeout(900);
  check(
    'and starts at step 1 rather than reopening the finished card',
    (await stepOn(page)) === 1 && (await page.locator('.doneCard').count()) === 0
  );
  await page.screenshot({ path: `${OUT}/11-again.png` });
  await page.context().close();
}

// ---- found by a second pass that went looking (PR #376) ----

const doIt = async (page, times = 1) => {
  for (let i = 0; i < times; i++) {
    await page.locator('.doItButton').click();
    await page.waitForTimeout(3600);
  }
};
const startFresh = async (page) => {
  await page.getByRole('button', { name: 'Start Tutorial', exact: true }).click();
  await page.waitForTimeout(600);
};
const toKinematic = async (page) => {
  await page
    .locator('app-top-bar')
    .getByText('Kinematic Analysis', { exact: true })
    .first()
    .click();
  await page.waitForTimeout(700);
};

// 8. A tracer point on the coupler is not an end of the chain.
{
  const page = await freshPage();
  await startFresh(page);
  await doIt(page, 2);
  await poke(
    page,
    `const link = srv.links[1];
     srv.activeObjService.updateSelectedObj(link);
     const [p, q] = link.joints;
     srv.addJointAt({ x: (p.x + q.x) / 2 + 0.3, y: (p.y + q.y) / 2 + 0.3 });`
  );
  check('a tracer on the coupler leaves the step at 3', (await stepOn(page)) === 3);
  check(
    'and is not called a branch',
    (await page.locator('.warnHint').count()) === 0,
    (await page.locator('.warnHint').allInnerTexts()).join(' | ')
  );
  await doIt(page, 2);
  const grounded = await poke(
    page,
    'return srv.joints.filter((j) => j.ground).map((j) => j.links.length + ":" + j.links[0].joints.length);'
  );
  check(
    'Do This Step For Me grounds the two bar ends, not the tracer',
    grounded.length === 2 && grounded.every((g) => g === '1:2'),
    grounded.join(', ')
  );
  check('and the four-bar runs', (await page.locator('.warnHint').count()) === 0);
  await page.screenshot({ path: `${OUT}/12-tracer.png` });
  await page.context().close();
}

// 9. Two templates over the tutorial, then one undo, is still a template.
{
  const page = await freshPage();
  await startFresh(page);
  await doIt(page, 1);
  for (const which of [2, 3]) {
    await page.locator('.brandCard .iconButton').click();
    await page.waitForTimeout(350);
    await page.locator('#templatesButton').click();
    await page.waitForTimeout(900);
    await page.locator('#templates app-template-card').nth(which).click();
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Replace', exact: true }).click();
    await page.waitForTimeout(1800);
  }
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.waitForTimeout(900);
  check(
    'one undo after two templates offers no resume over the first',
    (await page.locator('.resumeCard').count()) === 0
  );
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.waitForTimeout(900);
  check(
    'a second undo reaches the tutorial’s bar again',
    await page.locator('.resumeCard').isVisible()
  );
  await page.context().close();
}

// 10. A velocity read off a separate machine does not finish the tutorial.
{
  const page = await freshPage();
  await startFresh(page);
  await doIt(page, 4);
  await poke(page, ADD_BAR, [8, 0, 8, 1]);
  await poke(
    page,
    `const link = srv.links[srv.links.length - 1];
     const [base] = link.joints;
     srv.activeObjService.updateSelectedObj(base); srv.toggleGround();
     srv.activeObjService.updateSelectedObj(base); srv.adjustInput();`
  );
  await toKinematic(page);
  await page.getByRole('button', { name: 'Play' }).first().click();
  await page.waitForTimeout(1200);
  await poke(
    page,
    `const link = srv.links[srv.links.length - 1];
     srv.activeObjService.updateSelectedObj(link.joints[1]);`
  );
  await page.waitForTimeout(600);
  check(
    'the other machine’s joint does not complete it',
    (await page.locator('.doneCard').count()) === 0
  );
  await page.screenshot({ path: `${OUT}/13-other-machine.png` });
  await page.context().close();
}

// 11. A reload keeps the tutorial with the drawing it brings back.
{
  const page = await freshPage();
  await startFresh(page);
  await doIt(page, 2);
  await page.reload({ waitUntil: 'networkidle' });
  await waitForReady(page);
  await page.waitForTimeout(800);
  check('after a reload the chain is back', (await jointCount(page)) === 4);
  check(
    'and so is the tutorial, at step 3',
    (await stepOn(page)) === 3,
    String(await stepOn(page))
  );
  await page.screenshot({ path: `${OUT}/14-reload.png` });
  await page.context().close();
}

// 12. The finished card goes too when undo passes the tutorial's start.
{
  const page = await freshPage(SIX_BAR);
  const before = await jointCount(page);
  await menuTutorial(page);
  await page.getByRole('button', { name: 'Clear and Start' }).click();
  await page.waitForTimeout(900);
  await doIt(page, 5);
  check('it finishes on a cleared grid', await page.locator('.doneCard').isVisible());
  for (let i = 0; i < 20 && (await jointCount(page)) !== before; i++) {
    await page.getByRole('button', { name: 'Undo' }).click();
    await page.waitForTimeout(500);
  }
  check('undo reaches the six-bar', (await jointCount(page)) === before);
  check('and the finished card is gone', !(await page.locator('.doneCard').isVisible()));
  await page.context().close();
}

// 13. A cylinder is not a first bar.
{
  const page = await freshPage();
  await startFresh(page);
  await poke(page, 'srv.createCylinderFrom({ x: -2, y: 0 }, { x: 2, y: 0 });');
  await page.waitForTimeout(3000);
  check('a lone cylinder leaves step 1', (await stepOn(page)) === 1, String(await stepOn(page)));
  check(
    'and says to start with a Link',
    /cylinder is not a link/i.test(
      await page
        .locator('.warnHint')
        .innerText()
        .catch(() => '')
    )
  );
  await doIt(page, 1);
  check('Do This Step For Me then draws the bar', (await stepOn(page)) === 2);
  await page.screenshot({ path: `${OUT}/15-cylinder.png` });
  await page.context().close();
}

// 14. Scrubbing is not Play.
{
  const page = await freshPage();
  await startFresh(page);
  await doIt(page, 4);
  await toKinematic(page);
  await poke(
    page,
    `const mover = srv.joints.find((j) => !j.ground);
     srv.activeObjService.updateSelectedObj(mover);
     srv.animate(5, false);`
  );
  await page.waitForTimeout(600);
  check('a scrub alone does not finish step 5', (await page.locator('.doneCard').count()) === 0);
  // The real slider, not a poke: it publishes the moved pose as motion.
  await page.locator('.rowScrubber').first().focus();
  for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(400);
  await poke(
    page,
    `srv.activeObjService.updateSelectedObj(srv.joints.find((j) => !j.ground && !j.input));`
  );
  await page.waitForTimeout(600);
  check(
    'dragging the slider does not finish step 5 either',
    (await page.locator('.doneCard').count()) === 0
  );
  // A machine's own row Play, unsynced, runs it without the shared transport.
  await poke(
    page,
    `srv.syncMechanisms = false;
     const mover = srv.joints.find((j) => !j.ground && !j.input);
     srv.toggleMechanismPlaying(srv.indexOfMechanismContaining(mover));
     srv.activeObjService.updateSelectedObj(mover);`
  );
  await page.waitForTimeout(1200);
  check(
    'a row’s own Play, unsynced, counts as playing',
    await page
      .locator('.doneCard')
      .isVisible()
      .catch(() => false)
  );
  await page.context().close();
}

// 15. On a short phone the four-bar is built where the card does not cover it.
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 650 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await waitForReady(page);
  await menuTutorial(page);
  await doIt(page, 2);
  const covered = await page.evaluate(() => {
    const card = document.querySelector('app-tutorial-panel');
    const tutorial = ng.getComponent(card).tutorial;
    const { target, alsoTarget } = tutorial.progress();
    return [target, alsoTarget].filter(Boolean).map((joint) => {
      const node = document.getElementById(`joint_${joint.id}`);
      const box = node.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return `${joint.id}:${!!hit?.closest('#rightPanel, app-left-tabs, .topStrip, app-playback-bar')}`;
    });
  });
  check(
    'both named ends are clear of the chrome at 390×650',
    covered.length === 2 && covered.every((c) => c.endsWith(':false')),
    covered.join(', ')
  );
  await page.screenshot({ path: `${OUT}/16-phone.png` });
  await context.close();
}

await browser.close();
console.log(`\n${passed.length} passed, ${failed.length} failed`);
if (errors.length) console.log('page errors:\n' + errors.slice(0, 10).join('\n'));
process.exit(failed.length || errors.length ? 1 : 0);
