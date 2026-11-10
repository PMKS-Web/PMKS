/**
 * A link's name is drawn on the link.
 *
 * The name is always shown -- unlike the joint and force labels, which the
 * Labels button governs -- so it has to be readable against the body it names
 * and it has to land on that body. Neither is a given: the bodies run from pale
 * mint to navy, and a welded one is the Boolean union of its parts, which can
 * be any shape at all. An L has its center of mass in the crook, outside the
 * metal.
 *
 *   PMKS_BASE_URL=<origin> node e2e/link-labels.mjs
 */

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { startQuiet } from './quiet-start.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
import { TEMPLATE_LINKAGES as payloads } from './template-payloads.mjs';
import { inAngular } from './in-angular.mjs';

const results = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await startQuiet(context);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

/**
 * Whether each label has landed on a body at all.
 *
 * Two ways of counting, because bodies are drawn two ways. A filled one paints
 * under the label, and hit-testing finds it. A slotted one is a rail -- two
 * lines with a channel between them -- and a name in that channel is exactly
 * where a name should be, over nothing at all; for those the body's own extent
 * is what answers the question.
 *
 * What this catches is a label floating in empty space. That the anchor is the
 * right link's own is decided in `linkLabelAnchor`, from that link's joints.
 */
const labelsOnBodies = () =>
  page.evaluate(() => {
    const bodies = [...document.querySelectorAll('#linkHolder path')]
      .concat([...document.querySelectorAll('[class*="cylinder-"]')])
      .map((node) => node.getBoundingClientRect())
      .filter((box) => box.width > 0 || box.height > 0);
    return [...document.querySelectorAll('#linkTagHolder > svg')]
      .map((holder) => holder.querySelector('text'))
      .filter(Boolean)
      .map((text) => {
        const label = text.getBoundingClientRect();
        const x = label.left + label.width / 2;
        const y = label.top + label.height / 2;
        const painted = document
          .elementsFromPoint(x, y)
          .some(
            (node) =>
              node.closest('#linkHolder') ||
              /cylinder-|__rider|__rail/.test(String(node.className.baseVal ?? node.className))
          );
        const within = bodies.some(
          (box) =>
            x >= box.left - 1 && x <= box.right + 1 && y >= box.top - 1 && y <= box.bottom + 1
        );
        return { name: text.textContent.trim(), onBody: painted || within };
      });
  });

const load = async (payload) => {
  await page.goto(`${BASE}/?${payload}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  // Frame the whole drawing: a label that is off the edge of the window cannot
  // be hit-tested, and "off screen" is not the question being asked here.
  await inAngular(page, () =>
    ng.getComponent(document.querySelector('app-new-grid')).svgGrid.scaleToFitLinkage(false)
  );
  await page.waitForTimeout(900);
};

/** Check the actual body, allowing an outlined external name when it cannot fit. */
const anchorsAreAttached = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    return grid.mechanismSrv.getLinks().map((link) => {
      const tag = grid.linkLabelStyle(link);
      const paths = [
        document.getElementById(link.id),
        document.getElementById(link.id + '__rider'),
      ];
      const screen = grid.svgGrid.modelToScreen(tag);
      const onBody = paths.some(
        (path) =>
          path instanceof SVGPathElement &&
          path.isPointInFill(
            new DOMPoint(screen.x, screen.y).matrixTransform(path.getScreenCTM().inverse())
          )
      );
      // Channels and cylinder members are checked separately against their
      // visible halves below; they may have no root path in the links layer.
      const channel = grid.mechanismSrv.joints.some(
        (joint) => joint.carrier?.id === link.id && joint.slotJointA && joint.slotJointB
      );
      return {
        id: link.id,
        attached: tag.outside || !!grid.mechanismSrv.cylinderOfBar(link) || channel || onBody,
      };
    });
  });

// --- every template ---------------------------------------------------------
for (const name of [
  '4-Bar',
  'Stephenson_III',
  'Watt_I',
  'Jansen_Leg',
  'Cylinder_Boom',
  'Scissor_Lift',
]) {
  await load(payloads[name]);
  const anchors = await anchorsAreAttached();
  record(
    `every label in ${name} stays attached to the body it names`,
    anchors.length > 0 && anchors.every((link) => link.attached),
    anchors.filter((link) => !link.attached)
  );
}

// And, where the body is a filled shape this can hit-test, that the label is
// actually painted on it.
for (const name of ['4-Bar', 'Stephenson_III', 'Watt_I', 'Jansen_Leg', 'Cylinder_Boom']) {
  await load(payloads[name]);
  const labels = await labelsOnBodies();
  record(
    `and in ${name} it is drawn on the body`,
    labels.length > 0 && labels.every((label) => label.onBody),
    labels.filter((label) => !label.onBody)
  );
}

// --- a bar carrying a slot, whose name goes in the channel ------------------
for (const name of ['Scotch_Yoke', 'Whitworth_Quick_Return']) {
  await load(payloads[name]);
  const slotted = await page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    return grid.mechanismSrv
      .getLinks()
      .map((link) => {
        const slot = grid.mechanismSrv.joints.find(
          (joint) => joint.carrier?.id === link.id && joint.slotJointA && joint.slotJointB
        );
        if (!slot) return null;
        const style = grid.linkLabelStyle(link);
        const a = slot.slotJointA,
          b = slot.slotJointB;
        const dx = b.x - a.x,
          dy = b.y - a.y;
        const along = ((style.x - a.x) * dx + (style.y - a.y) * dy) / (dx * dx + dy * dy);
        const across = Math.abs((style.x - a.x) * dy - (style.y - a.y) * dx) / Math.hypot(dx, dy);
        return {
          id: link.id,
          attached: style.outside,
          inTheChannel: along > 0 && along < 1 && across < grid.settings.drawingScale * 0.18,
          ink: style.ink,
          opacity: style.opacity,
        };
      })
      .filter(Boolean);
  });
  record(
    `in ${name} the slotted bar's name uses the channel or an attached clear position, in full black`,
    slotted.length > 0 &&
      slotted.every(
        (link) => (link.inTheChannel || link.attached) && link.ink === 'black' && link.opacity === 1
      ),
    slotted
  );
}

// --- a welded body, which is where the center of mass stops being safe -------
await load(payloads['Stephenson_III']);
await inAngular(page, () => {
  const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  const shared = srv.joints.find((joint) => joint.links?.length > 1 && !joint.ground);
  if (shared) srv.weldJoint(shared);
});
await page.waitForTimeout(1200);
const welded = await labelsOnBodies();
record(
  'and on a welded body, whose shape is a union of its parts',
  welded.length > 0 && welded.every((label) => label.onBody),
  welded
);
record(
  'which is named for all of its joints',
  welded.some((label) => label.name.length > 2),
  welded.map((label) => label.name)
);

// --- readable against the body, and the size of the grid's own numbers -------
await load(payloads['Stephenson_III']);
const type = await page.evaluate(() => {
  const svg = document.querySelector('#canvas') ?? document.querySelector('svg');
  const perUnit = Math.abs(svg.querySelector('g').getScreenCTM().a);
  const px = (node) => +(parseFloat(getComputedStyle(node).fontSize) * perUnit).toFixed(1);
  // Each label against the body it is written on, paired by the name it
  // carries, so the rule can be checked rather than the coincidence that this
  // drawing happens to hold both a pale body and a dark one.
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const lum = (hex) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
    if (!m) return null;
    const [r, g, b] = [0, 2, 4].map(
      (at) => 0.7 * (parseInt(m[1].slice(at, at + 2), 16) / 255) + 0.3
    );
    const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  const bodies = grid.mechanismSrv.getLinks().map((link) => ({
    name: grid.linkDisplayName(link),
    // The color it is painted, which for the two navies is a step lighter
    // than the stored value (`paintOf`).
    fill: grid.mechanismSrv.getLinkProp(link, 'fill') ?? null,
    lum: lum(grid.mechanismSrv.getLinkProp(link, 'fill')),
    inert: grid.mechanismSrv.isPartInert(link),
  }));
  return {
    bodies,
    labels: [...document.querySelectorAll('#linkTagHolder text')].map((text) => ({
      name: text.textContent.trim(),
      ink: text.getAttribute('fill'),
      opacity: text.getAttribute('fill-opacity'),
      size: px(text),
    })),
    gridNumber: px(document.querySelector('#axes_numbers')),
    perUnit,
    objectScale: ng.getComponent(document.querySelector('app-new-grid')).settings.objectScale,
    // Asked of the grid rather than restated here: one number decides how big
    // every name on the canvas is, and a copy of it in this file is a copy that
    // goes stale the first time it is tuned.
    tagFontSize: ng.getComponent(document.querySelector('app-new-grid')).tagFontSize,
  };
});
// Every name is black, and the palette is painted light enough that black
// reads on each body. Checked against the body each label names, so the rule
// is tested rather than the colors this drawing happens to use.
const bodyOf = (label) => type.bodies.find((body) => body.name === label.name);
const wrongInk = type.labels.filter((label) => {
  const body = bodyOf(label);
  if (!body || body.inert || body.lum === null) return false;
  return (body.lum + 0.05) / 0.05 < 4.5;
});
record(
  'each label is black, and black reads on the body it names',
  type.labels.length > 0 &&
    type.labels.every((label) => label.ink === 'black') &&
    wrongInk.length === 0,
  { wrongInk, labels: type.labels, bodies: type.bodies }
);
record(
  'at full opacity, so names keep their contrast',
  type.labels.every((label) => label.opacity === '1'),
  type.labels
);
// Sized from the drawing, held between 11 and 16 px on screen, and written
// smaller when a long name would not otherwise fit its body. Never larger than
// the drawing's own size (MIN_LABEL_PX and MAX_LABEL_PX in canvas-labels).
record(
  'every label is drawn between 11 and 16 px, no larger than the drawing size',
  type.labels.every(
    (label) =>
      label.size >= 10.5 &&
      label.size <= 16.5 &&
      label.size <= type.tagFontSize * type.perUnit + 0.06
  ),
  { labels: type.labels.map((l) => l.size), want: type.tagFontSize * type.perUnit }
);

// Labels share the parts' model proportions between the screen limits.
await inAngular(page, () => {
  const settings = ng.getComponent(document.querySelector('app-new-grid')).settings;
  settings.constructor._objectScale.next(settings.objectScale * 2);
});
await page.waitForTimeout(600);
const doubled = await page.evaluate(() => {
  const svg = document.querySelector('#canvas') ?? document.querySelector('svg');
  const perUnit = Math.abs(svg.querySelector('g').getScreenCTM().a);
  const text = document.querySelector('#linkTagHolder text');
  return +(parseFloat(getComputedStyle(text).fontSize) * perUnit).toFixed(1);
});
// A larger object size makes the bars wider and leaves less room between the
// pins, so a long name may be written smaller; it is never drawn outside the
// screen limits.
record(
  'labels stay between 11 and 16 px when the base scale grows',
  doubled >= 10.5 && doubled <= 16.5,
  {
    was: type.labels[0].size,
    now: doubled,
  }
);

// --- a joint's name lands wherever its joint is -----------------------------
await load(payloads['Stephenson_III']);
await inAngular(page, () => {
  ng.getComponent(document.querySelector('app-new-grid')).settings.isShowID.next(true);
});
await page.waitForTimeout(600);
const jointInk = await page.evaluate(() => {
  const svg = document.querySelector('#canvas') ?? document.querySelector('svg');
  const perUnit = Math.abs(svg.querySelector('g').getScreenCTM().a);
  return [...document.querySelectorAll('#jointTagHolder text')].map((text) => {
    const style = getComputedStyle(text);
    return {
      name: text.textContent.trim(),
      halo: style.stroke,
      order: style.paintOrder,
      haloPx: +(parseFloat(style.strokeWidth) * perUnit).toFixed(2),
    };
  });
});
record(
  'a joint name wears a white halo, so it reads over whatever it has landed on',
  jointInk.length > 0 &&
    jointInk.every(
      (label) => label.halo === 'rgb(255, 255, 255)' && label.order === 'stroke' && label.haloPx > 1
    ),
  jointInk.slice(0, 4)
);

// --- the other labels still answer to the button ----------------------------
await load(payloads['4-Bar']);
const governed = await inAngular(page, () => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const count = () => ({
    joints: document.querySelectorAll('#jointTagHolder text').length,
    links: document.querySelectorAll('#linkTagHolder text').length,
  });
  const off = count();
  grid.settings.isShowID.next(true);
  return { off, on: count() };
});
record('the Labels button still governs the joint labels', true, governed);

// --- the review's crane: long names, CoM, force IDs and proportional zoom ---
const OUT = 'artifacts/proportional-zoom';
mkdirSync(OUT, { recursive: true });
await load(payloads['Crane_Two_Loads']);
await inAngular(page, () => {
  const g = ng.getComponent(document.querySelector('app-new-grid'));
  g.settings.isShowID.next(true);
  g.activeObjService.updateSelectedObj(g.mechanismSrv.forces[0]);
});
await page.waitForTimeout(200);
const measure = () =>
  page.evaluate(() => {
    const g = ng.getComponent(document.querySelector('app-new-grid'));
    const pin = document.querySelector('#jointHolder circle[id^="joint_"]');
    const text = document.querySelector('#linkTagHolder text');
    const jointText = document.querySelector('#jointTagHolder text');
    const forceText = document.querySelector('#forceTagHolder text');
    const zoom = Math.hypot(pin.getScreenCTM().a, pin.getScreenCTM().b);
    const width = (node) =>
      node.getBBox().width * Math.hypot(node.getScreenCTM().a, node.getScreenCTM().b);
    return {
      zoom,
      pin: 2 * Number(pin.getAttribute('r')) * zoom,
      linkName: width(text),
      jointName: width(jointText),
      forceName: width(forceText),
      jointPx:
        parseFloat(getComputedStyle(jointText).fontSize) *
        Math.hypot(jointText.getScreenCTM().a, jointText.getScreenCTM().b),
      linkPx: [...document.querySelectorAll('#linkTagHolder text')].map(
        (node) =>
          parseFloat(getComputedStyle(node).fontSize) *
          Math.hypot(node.getScreenCTM().a, node.getScreenCTM().b)
      ),
      com: g.objectDisplay.comRadius() * zoom,
      comStroke:
        Number(document.querySelector('#comTagHolder path').getAttribute('stroke-width')) * zoom,
      forceDisc: Number(document.querySelector('.forceDisc').getAttribute('r')) * zoom,
      anchors: g.mechanismSrv.links.map((l) => g.linkLabelStyle(l)),
      data: JSON.stringify({
        joints: g.mechanismSrv.joints.map((j) => [j.id, j.x, j.y]),
        links: g.mechanismSrv.links.map((l) => [l.id, l.d, l.mass, l.massMoI]),
        forces: g.mechanismSrv.forces.map((f) => [f.mag, f.angleRad]),
        solve: g.mechanismSrv.solveRevision,
      }),
    };
  });
const initial = await measure();
const film = filmstrip(page, `${OUT}/crane-zoom`);
const measurements = [initial];
for (const [direction, count] of [
  ['Out', 4],
  ['In', 8],
  ['Out', 4],
]) {
  await film.during(70, 8, `zoom-${direction}`, async () => {
    for (let n = 0; n < count; n++)
      await page.getByRole('button', { name: `Zoom ${direction}`, exact: true }).click();
  });
  const got = await measure();
  measurements.push(got);
  const ratio = got.zoom / initial.zoom;
  record(
    `crane zoom ${direction}: pins, CoM and force marks keep their proportions`,
    ['pin', 'com', 'comStroke', 'forceDisc'].every(
      (key) => Math.abs(got[key] / initial[key] - ratio) < 0.002
    ),
    got
  );
  // Names scale with the zoom too, until they reach 11 or 16 px on screen,
  // where they hold (MIN_LABEL_PX and MAX_LABEL_PX in canvas-labels).
  const free = initial.jointPx * ratio;
  record(
    `crane zoom ${direction}: names scale with the zoom between 11 and 16 px and hold there`,
    (free > 11.5 && free < 15.5
      ? Math.abs(got.jointPx / initial.jointPx - ratio) < 0.01
      : got.jointPx > 10.5 && got.jointPx < 16.5) &&
      got.linkPx.every((px) => px > 10.5 && px < 16.5),
    { ratio, jointPx: got.jointPx, linkPx: got.linkPx }
  );
  // Where a name sits changes only when its size does.
  const sizes = (one) => JSON.stringify(one.anchors.map((tag) => tag.fontSize));
  record(
    `crane zoom ${direction}: label anchors and authored data stay unchanged`,
    got.data === initial.data &&
      (sizes(got) !== sizes(initial) ||
        JSON.stringify(got.anchors) === JSON.stringify(initial.anchors)),
    got
  );
}
await inAngular(page, () => {
  const g = ng.getComponent(document.querySelector('app-new-grid'));
  g.activeObjService.clearPartSelection();
  g.svgGrid.scaleToFitLinkage(false);
});
await page.waitForTimeout(300);
const playback = filmstrip(page, `${OUT}/crane-playback`);
const placements = [];
for (let step = 0; step <= 300; step += 30) {
  await inAngular(
    page,
    (step) =>
      ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.animate(step, false),
    step
  );
  await page.waitForTimeout(60);
  await playback.shot(`pose-${step}`);
  placements.push(
    ...(await inAngular(page, () => {
      const g = ng.getComponent(document.querySelector('app-new-grid'));
      return g.mechanismSrv.links
        .filter((l) => l.name.includes('Luffing'))
        .map((link) => {
          const text = [...document.querySelectorAll('#linkTagHolder text')].find(
            (t) => t.textContent.trim() === link.name
          );
          const box = text.getBBox();
          const screen = g.svgGrid.modelToScreen(link.CoM);
          const point = new DOMPoint(screen.x, screen.y).matrixTransform(
            text.getScreenCTM().inverse()
          );
          const dx = Math.max(box.x - point.x, 0, point.x - box.x - box.width);
          const dy = Math.max(box.y - point.y, 0, point.y - box.y - box.height);
          return {
            name: link.name,
            clear: Math.hypot(dx, dy) > g.objectDisplay.comRadius(),
            place: g.linkLabelStyle(link),
          };
        });
    }))
  );
}
record(
  'both luffing names stay clear of their CoM glyphs throughout the sampled cycle',
  placements.length > 0 && placements.every((p) => p.clear),
  placements.filter((p) => !p.clear)
);
await inAngular(page, () =>
  ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.animate(0, false)
);
await page.screenshot({ path: `${OUT}/crane.png` });
writeFileSync(`${OUT}/measurements.json`, JSON.stringify({ measurements, placements }, null, 2));
await contactSheet(`${OUT}/crane-zoom/*.png`, `${OUT}/crane-zoom-film.png`, 4, 0.45);
await contactSheet(`${OUT}/crane-playback/*.png`, `${OUT}/crane-playback-film.png`, 4, 0.45);

// A long compound ID used to cross a narrow limb horizontally, leaving
// white letters on the white background outside the body (review screenshot).
await load(payloads['Aircraft_Landing_Gear'] + '#backdrop=Aircraft_Landing_Gear');
const compoundFilm = filmstrip(page, `${OUT}/compound-motion`);
const compoundChecks = [];
for (const step of [0, 30, 60, 90, 120, 150]) {
  await inAngular(
    page,
    (step) =>
      ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.animate(step, false),
    step
  );
  await page.waitForTimeout(80);
  await compoundFilm.shot(`pose-${step}`);
  compoundChecks.push(
    await page.evaluate(() => {
      const g = ng.getComponent(document.querySelector('app-new-grid'));
      const link = g.mechanismSrv.links.find((l) => l.id === 'ABHKLMNOPQ');
      const text = [...document.querySelectorAll('#linkTagHolder text')].find(
        (t) => t.textContent.trim() === g.linkDisplayName(link)
      );
      const path = document.getElementById(link.id);
      const box = text.getBBox();
      const matrix = path.getScreenCTM().inverse().multiply(text.getScreenCTM());
      const points = [0.05, 0.5, 0.95].flatMap((x) =>
        [0.1, 0.5, 0.9].map((y) =>
          new DOMPoint(box.x + box.width * x, box.y + box.height * y).matrixTransform(matrix)
        )
      );
      const style = getComputedStyle(text);
      return {
        name: text.textContent.trim(),
        angle: g.linkLabelStyle(link).angle,
        supported: points.every((point) => path.isPointInFill(point)),
        clearOfPins: link.joints.every((joint) => {
          const screen = g.svgGrid.modelToScreen(joint);
          const point = new DOMPoint(screen.x, screen.y).matrixTransform(
            text.getScreenCTM().inverse()
          );
          const dx = Math.max(box.x - point.x, 0, point.x - box.x - box.width);
          const dy = Math.max(box.y - point.y, 0, point.y - box.y - box.height);
          return Math.hypot(dx, dy) > 0.15 * g.settings.drawingScale;
        }),
        plainInk: style.stroke === 'none',
      };
    })
  );
}
record(
  'the entire long compound ID stays on its narrow member through motion',
  compoundChecks.length > 0 && compoundChecks.every((c) => c.supported && c.clearOfPins),
  compoundChecks
);
record(
  'link names use plain ink without a contrasting outline',
  compoundChecks.every((c) => c.plainInk),
  compoundChecks
);
await inAngular(page, () =>
  ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.animate(0, false)
);
await page.waitForTimeout(100);
await page.screenshot({ path: `${OUT}/compound-after.png` });
writeFileSync(`${OUT}/compound-checks.json`, JSON.stringify(compoundChecks, null, 2));
await contactSheet(`${OUT}/compound-motion/*.png`, `${OUT}/compound-film.png`, 3, 0.6);

// Collinear spokes at I must not turn angular roundoff into a label flip.
await load(payloads['Steam_Locomotive']);
await inAngular(page, () =>
  ng.getComponent(document.querySelector('app-new-grid')).settings.isShowID.next(true)
);
const locomotiveFilm = filmstrip(page, `${OUT}/locomotive-label`);
const labelOffsets = [];
for (let step = 0; step <= 360; step++) {
  await inAngular(
    page,
    (step) =>
      ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.animate(step, false),
    step
  );
  labelOffsets.push(
    await page.evaluate(() => {
      const g = ng.getComponent(document.querySelector('app-new-grid'));
      const joint = g.mechanismSrv.joints.find((j) => j.id === 'I');
      const anchor = g.jointTagAnchor(joint);
      return {
        x: (anchor.x - joint.x) / g.settings.drawingScale,
        y: (-anchor.y - joint.y) / g.settings.drawingScale,
      };
    })
  );
  if (step % 30 === 0) await locomotiveFilm.shot(`pose-${step}`);
}
const labelSteps = labelOffsets
  .slice(1)
  .map((point, i) => Math.hypot(point.x - labelOffsets[i].x, point.y - labelOffsets[i].y));
record(
  'locomotive joint I moves its letter smoothly through a full revolution',
  labelSteps.length === 360 && Math.max(...labelSteps) < 0.03,
  { maxStep: Math.max(...labelSteps) }
);
writeFileSync(
  `${OUT}/locomotive-label.json`,
  JSON.stringify({ labelOffsets, maxStep: Math.max(...labelSteps) }, null, 2)
);
await contactSheet(`${OUT}/locomotive-label/*.png`, `${OUT}/locomotive-label-film.png`, 4, 0.55);

record('nothing threw', errors.length === 0, errors.slice(0, 3));
await browser.close();

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
