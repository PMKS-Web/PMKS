import { Coord } from './coord';
import { RevJoint } from './joint';
import { RealLink } from './link';
import { NotificationService } from '../services/notification.service';
import { createMechanismHarness, wireGraph } from '../../test-utils/mechanism-harness';
import { weldHoldNotice } from './weld-hold-notice';

function bar(id: string, a: RevJoint, b: RevJoint): RealLink {
  return new RealLink(id, [a, b], 1, 1, new Coord((a.x + b.x) / 2, (a.y + b.y) / 2));
}

describe('weldHoldNotice', () => {
  const a = new RevJoint('A', 0, 0);
  const b = new RevJoint('B', 4, 0);
  const c = new RevJoint('C', 4, 3);
  const name = (link: RealLink) => link.id;

  it('says nothing when no bar holds anything', () => {
    expect(weldHoldNotice([bar('AB', a, b), bar('BC', b, c)], name)).toBeUndefined();
  });

  it('names the bar, what it keeps, and the joints to change it from', () => {
    const cd = bar('BC', b, c);
    cd.hold = 'length';
    expect(weldHoldNotice([bar('AB', a, b), cd], name)).toBe(
      'Link BC keeps its Fixed Length in the welded body. To change it, select joint B or C ' +
        'and use Distance to Joints.'
    );
    cd.hold = 'both';
    expect(weldHoldNotice([cd], name)).toContain('keeps its Fixed Length and Fixed Angle');
  });

  it('lists every held bar when there are several', () => {
    const ab = bar('AB', a, b);
    const bc = bar('BC', b, c);
    ab.hold = 'length';
    bc.hold = 'angle';
    expect(weldHoldNotice([ab, bc], name)).toBe(
      'Links AB and BC keep their Fixed Length and Fixed Angle in the welded body. To change ' +
        'one, select a joint on it and use Distance to Joints.'
    );
  });
});

describe('welding a joint where a bar holds its length', () => {
  function twoBars() {
    const harness = createMechanismHarness();
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 4, 0);
    const c = new RevJoint('C', 4, 3);
    const ab = bar('AB', a, b);
    const bc = bar('BC', b, c);
    harness.service.joints.push(a, b, c);
    harness.service.links.push(ab, bc);
    wireGraph(harness.service);
    const news = vi.spyOn(harness.injector.get(NotificationService), 'news');
    return { ...harness, b, ab, bc, news };
  }

  it('keeps the hold and says where to change it', () => {
    const s = twoBars();
    s.bc.hold = 'length';
    s.service.weldJoint(s.b);
    expect(s.b.isWelded).toBe(true);
    expect(s.bc.hold).toBe('length');
    expect(s.news).toHaveBeenCalledWith(
      'weld.holds-kept',
      expect.stringContaining('Link BC keeps its Fixed Length')
    );
  });

  it('says nothing when no bar at the joint holds anything', () => {
    const s = twoBars();
    s.service.weldJoint(s.b);
    expect(s.b.isWelded).toBe(true);
    expect(s.news).not.toHaveBeenCalledWith('weld.holds-kept', expect.anything());
  });
});
