import { RevJoint } from './joint';
import { RealLink } from './link';
import { tracerLines, tracerSnapTargets } from './tracer-lines';

const never = () => false;

/** A bar B-C with a tracer E riding it. */
function tracedBar() {
  const b = new RevJoint('B', 0, 0);
  const c = new RevJoint('C', 4, 3);
  const e = new RevJoint('E', 2, 1.6);
  const bar = new RealLink('BCE', [b, c, e]);
  [b, c, e].forEach((joint) => joint.links.push(bar));
  return { b, c, e, bar };
}

describe('tracerLines', () => {
  it("gives a tracer the line through its bar's other two joints", () => {
    const { e } = tracedBar();
    const lines = tracerLines(e, never);
    expect(lines).toHaveLength(1);
    expect([lines[0].from, lines[0].to].map((p) => (p as RevJoint).id)).toEqual(['B', 'C']);
  });

  it('gives a joint that also joins another body no line', () => {
    const { b, e } = tracedBar();
    b.links.push(new RealLink('AB', [new RevJoint('A', -1, -1), b]));
    expect(tracerLines(b, never)).toEqual([]);
    expect(tracerLines(e, never)).toHaveLength(1);
  });

  it('gives a grounded or driven pin no line', () => {
    const { e } = tracedBar();
    e.ground = true;
    expect(tracerLines(e, never)).toEqual([]);
  });

  it('takes the lines from the welded bar that holds the tracer, not the whole compound', () => {
    const { b, c, e, bar } = tracedBar();
    const d = new RevJoint('D', 4, -2);
    const other = new RealLink('CD', [c, d]);
    const compound = new RealLink('BCDE', [b, c, d, e]);
    compound.subset = [bar, other];
    [b, c, d, e].forEach((joint) => (joint.links = [compound]));
    const lines = tracerLines(e, never);
    expect(lines).toHaveLength(1);
  });

  it("does not snap onto a cylinder member's line", () => {
    const { e, bar } = tracedBar();
    expect(tracerLines(e, (link) => link === bar)).toEqual([]);
  });

  it('squares up against every other pin, and none when there is no line', () => {
    const { b, c, e } = tracedBar();
    expect(tracerSnapTargets(e, [b, c, e], never).others).toEqual([b, c]);
    b.ground = true;
    expect(tracerSnapTargets(b, [b, c, e], never).others).toEqual([]);
  });
});
