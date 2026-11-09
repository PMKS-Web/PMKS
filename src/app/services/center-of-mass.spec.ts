import '../model/joint';
import { Coord } from '../model/coord';
import { RevJoint } from '../model/joint';
import { RealLink } from '../model/link';
import { derivedBodyOf } from '../model/link-body';
import { MODEL_SCALE as S } from '../model/render-scale';
import { createMechanismHarness, wireGraph } from '../../test-utils/mechanism-harness';
import { GridUtilsService } from './grid-utils.service';
import { NotificationService } from './notification.service';
import { SettingsService } from './settings.service';

/**
 * Where a link's automatic center of mass is, asked from every door (#156).
 *
 * The mark a reader watches while dragging used to be the average of the
 * joints, and the one it settled on after release was the shape's centroid.
 * A tracer point on a bar pulled the first and not the second, so the mark
 * wandered and snapped back. One derivation answers both now.
 */
let previousScale: number;
beforeEach(() => {
  previousScale = SettingsService.objectScale;
  SettingsService._objectScale.next(S);
});
afterEach(() => SettingsService._objectScale.next(previousScale));

const at = (point: { x: number; y: number }) => [point.x / S, point.y / S];

function scene() {
  const h = createMechanismHarness();
  return { ...h, grid: h.injector.get(GridUtilsService) };
}

/** A bar AB along x, four long, with tracer T somewhere on it. */
function barWithTracer(tracer: Coord) {
  const h = scene();
  const a = new RevJoint('A', 0, 0);
  const b = new RevJoint('B', 4 * S, 0);
  const t = new RevJoint('T', tracer.x, tracer.y);
  const bar = new RealLink('ABT', [a, b, t], 1);
  h.service.joints.push(a, b, t);
  h.service.links.push(bar);
  wireGraph(h.service);
  h.service.updateMechanism(false);
  return { ...h, a, b, t, bar };
}

/** Bars AB (heavy, along x) and BC (light, up), meeting at B. */
function vee() {
  const h = scene();
  const a = new RevJoint('A', 0, 0);
  const b = new RevJoint('B', 4 * S, 0);
  const c = new RevJoint('C', 4 * S, 1 * S);
  const ab = new RealLink('AB', [a, b], 3);
  const bc = new RealLink('BC', [b, c], 1);
  h.service.joints.push(a, b, c);
  h.service.links.push(ab, bc);
  wireGraph(h.service);
  h.service.updateMechanism(false);
  return { ...h, a, b, c, ab, bc };
}

const compound = (links: unknown[]) =>
  links.find((link): link is RealLink => link instanceof RealLink && link.subset.length > 0)!;

describe('a tracer point on a bar', () => {
  it('does not pull the center of mass while it is dragged along the bar', () => {
    const h = barWithTracer(new Coord(1 * S, 0));
    expect(at(h.bar.CoM)).toEqual([2, 0]);

    h.grid.dragJoint(h.t, new Coord(3.5 * S, 0), false);

    expect(at(h.bar.CoM), 'mid-drag: still the middle of the bar').toEqual([2, 0]);
  });

  it('shows mid-drag the point the drag settles on', () => {
    const h = barWithTracer(new Coord(1 * S, 0));

    h.grid.dragJoint(h.t, new Coord(2 * S, 3 * S), false);
    const during = at(h.bar.CoM);
    h.service.updateMechanism(false);

    // The triangle's centroid, not the mean of the joints -- which happen to
    // agree for a triangle, so ask of the commit rather than of a formula.
    expect(during[0]).toBeCloseTo(at(h.bar.CoM)[0], 9);
    expect(during[1]).toBeCloseTo(at(h.bar.CoM)[1], 9);
  });
});

describe('a welded body', () => {
  it('weighs its members while one of its joints is dragged', () => {
    const h = vee();
    h.active.updateSelectedObj(h.b);
    h.service.weldJoint();
    const body = compound(h.service.links);
    // 3 kg at (2, 0) and 1 kg at (4, 0.5).
    expect(at(body.CoM)[0]).toBeCloseTo(2.5, 9);
    expect(at(body.CoM)[1]).toBeCloseTo(0.125, 9);

    h.grid.dragJoint(h.c, new Coord(4 * S, 2 * S), false);

    // BC's middle is now (4, 1): the weighted point, not the joints' mean.
    expect(at(body.CoM)[0]).toBeCloseTo(2.5, 9);
    expect(at(body.CoM)[1]).toBeCloseTo(0.25, 9);
  });

  it('gives each bar back its own center of mass when the weld comes off', () => {
    const h = vee();
    h.bc.placeCustomCoM(new Coord(4.5 * S, 0.5 * S));
    h.service.updateMechanism(false);
    h.active.updateSelectedObj(h.b);
    h.service.weldJoint();
    h.active.updateSelectedObj(h.b);

    h.service.unweldSelectedJoint();

    const ab = h.service.links.find((link) => link.id === 'AB') as RealLink;
    const bc = h.service.links.find((link) => link.id === 'BC') as RealLink;
    expect([ab.comIsCustom, ...at(ab.CoM)]).toEqual([false, 2, 0]);
    expect([bc.comIsCustom, ...at(bc.CoM)], 'the one placed by hand').toEqual([true, 4.5, 0.5]);
  });

  it('says so when a center of mass set on the body is lost with the weld', () => {
    const h = vee();
    const news = vi.spyOn(h.injector.get(NotificationService), 'news');
    h.active.updateSelectedObj(h.b);
    h.service.weldJoint();
    compound(h.service.links).placeCustomCoM(new Coord(1 * S, 1 * S));
    h.service.updateMechanism(false);
    h.active.updateSelectedObj(h.b);

    h.service.unweldSelectedJoint();

    expect(news).toHaveBeenCalledWith(
      'weld.split-values',
      expect.stringMatching(/center of mass you set/),
      expect.anything()
    );
  });

  it('says nothing when nothing was set on the body', () => {
    const h = vee();
    const news = vi.spyOn(h.injector.get(NotificationService), 'news');
    h.active.updateSelectedObj(h.b);
    h.service.weldJoint();
    h.active.updateSelectedObj(h.b);

    h.service.unweldSelectedJoint();

    expect(news).not.toHaveBeenCalledWith(
      'weld.split-values',
      expect.anything(),
      expect.anything()
    );
  });
});

describe('a link drawn as a disc', () => {
  /** Crank AB on ground pin A, with a third joint so the disc has a reach. */
  function disc() {
    const h = scene();
    const a = new RevJoint('A', 0, 0);
    a.ground = true;
    const b = new RevJoint('B', 2 * S, 0);
    const crank = new RealLink('AB', [a, b], 1);
    h.service.joints.push(a, b);
    h.service.links.push(crank);
    wireGraph(h.service);
    crank.isCircle = true;
    h.service.updateMechanism(false);
    return { ...h, a, b, crank };
  }

  it('has its center of mass on the ground pin', () => {
    const h = disc();
    expect(at(h.crank.CoM)).toEqual([0, 0]);
  });

  it('turns like a uniform disc about that pin', () => {
    const h = disc();
    const asBar = derivedBodyOf(Object.assign(Object.create(h.crank), { isCircle: false }));
    const asDisc = derivedBodyOf(h.crank);
    // Rod of length L about its middle: L^2/12. Disc of radius L: L^2/2.
    expect(asDisc.moi / asBar.moi).toBeCloseTo(6, 9);
  });

  it('keeps the pin while the far joint is dragged', () => {
    const h = disc();
    h.grid.dragJoint(h.b, new Coord(0, 3 * S), false);
    expect(at(h.crank.CoM)).toEqual([0, 0]);
  });
});
