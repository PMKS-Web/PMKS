import { Coord } from '../../model/coord';
import { RealLink } from '../../model/link';
import { TEMPLATE_LINKAGES } from '../../component/MODALS/templates/template-linkages';
import { createMechanismHarness } from '../../../test-utils/mechanism-harness';
import { MechanismBuilder } from './mechanism-builder';
import { StringTranscoder } from './string-transcoder';
import { urlGeneratorFor } from '../../../test-utils/url-encoding';

/**
 * A part is named after its id until someone gives it a name (#317).
 *
 * The codec writes a part's name as `name` reads it, which is the id when
 * nobody named it -- so a URL cannot tell "AB" the automatic name from "AB" a
 * name somebody typed. Read back as a typed name, it froze: a link drawn in
 * this session became `ABE` when a tracer point was added to it, and the same
 * link opened from a template, a shared URL, a reload or an undo stayed `AB`.
 */
describe('A part’s automatic name, after the URL', () => {
  beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  function open(url: string) {
    const harness = createMechanismHarness();
    const decoder = new StringTranscoder();
    decoder.decodeURL(url);
    new MechanismBuilder(harness.service, decoder, harness.settings, harness.active).build(true);
    harness.service.updateMechanism();
    return harness;
  }

  const linkAB = (harness: ReturnType<typeof open>) =>
    harness.service.links.find((link) => link.id === 'AB') as RealLink;

  /** A tracer point on AB, a little off its line, the way the menu adds one. */
  function addTracer(harness: ReturnType<typeof open>): RealLink {
    const link = linkAB(harness);
    const [a, b] = link.joints;
    harness.active.updateSelectedObj(link);
    harness.service.addJointAt(new Coord((a.x + b.x) / 2, (a.y + b.y) / 2 + 10));
    return link;
  }

  it('follows the joints of a link opened from a template', () => {
    const harness = open(TEMPLATE_LINKAGES['4-Bar']);
    const link = addTracer(harness);
    expect(link.id).toBe('ABE');
    expect(link.name).toBe('ABE');
  });

  it('and of one that has been through the URL again, as undo and reload put it', () => {
    let url = TEMPLATE_LINKAGES['4-Bar'];
    for (let pass = 0; pass < 3; pass++) {
      const harness = open(url);
      url = urlGeneratorFor(harness.service, harness.settings).generateUrlQuery();
    }
    const link = addTracer(open(url));
    expect(link.name).toBe('ABE');
  });

  it('and of one drawn here, added to once, written out and opened again', () => {
    const first = open(TEMPLATE_LINKAGES['4-Bar']);
    addTracer(first);
    const harness = open(urlGeneratorFor(first.service, first.settings).generateUrlQuery());
    const link = harness.service.links.find((one) => one.id === 'ABE') as RealLink;
    const [a, b] = link.joints;
    harness.active.updateSelectedObj(link);
    harness.service.addJointAt(new Coord((a.x + b.x) / 2, (a.y + b.y) / 2 - 10));
    expect(link.name).toBe('ABEF');
  });

  it('leaves a name somebody typed exactly as it was', () => {
    const first = open(TEMPLATE_LINKAGES['4-Bar']);
    linkAB(first).name = 'Crank';
    const harness = open(urlGeneratorFor(first.service, first.settings).generateUrlQuery());
    expect(linkAB(harness).name).toBe('Crank');
    const link = addTracer(harness);
    expect(link.id).toBe('ABE');
    expect(link.name).toBe('Crank');
  });

  it('keeps a joint’s typed name through the URL too', () => {
    const first = open(TEMPLATE_LINKAGES['4-Bar']);
    first.service.joints.find((joint) => joint.id === 'A')!.name = 'Pivot';
    const harness = open(urlGeneratorFor(first.service, first.settings).generateUrlQuery());
    expect(harness.service.joints.map((joint) => joint.name)).toEqual(['Pivot', 'B', 'C', 'D']);
  });

  it('still shows the id, and writes it, so no URL already shared changes', () => {
    const harness = open(TEMPLATE_LINKAGES['4-Bar']);
    expect(harness.service.links.map((link) => link.name)).toEqual(['AB', 'BC', 'CD']);
    expect(harness.service.joints.map((joint) => joint.name)).toEqual(['A', 'B', 'C', 'D']);
    const once = urlGeneratorFor(harness.service, harness.settings).generateUrlQuery();
    const again = open(once);
    expect(urlGeneratorFor(again.service, again.settings).generateUrlQuery()).toBe(once);
    expect(once).toMatch(/RAB,AB,/);
  });
});
