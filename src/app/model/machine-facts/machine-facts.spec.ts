import '../joint';
import { TEMPLATE_LINKAGES } from '../../component/MODALS/templates/template-linkages';
import { solvedDrawing } from '../../../test-utils/machine-facts/drawing';
import { buildMechanism } from '../../../test-utils/verification/fixture';
import { sliderCrankTracerFixture } from '../../../test-utils/verification/fixtures';
import { partitionMechanisms } from '../mechanism/mechanism-partition';
import { machineFacts } from './machine-facts';
import { panelRole } from './roles';

/** What PMKS recognizes in each machine of a library drawing, in order. */
function familiesOf(id: keyof typeof TEMPLATE_LINKAGES): string[] {
  const { partitions, mechanisms } = solvedDrawing(TEMPLATE_LINKAGES[id]);
  return partitions.map((partition, index) => {
    const facts = machineFacts(partition, mechanisms[index]);
    return facts?.family[0]?.family ?? '';
  });
}

describe('what PMKS recognizes in a machine', () => {
  it('names the family of each machine in a drawing of several', () => {
    expect(familiesOf('Straight_Line_Pair')).toEqual([
      'Chebyshev straight-line linkage',
      'Peaucellier-Lipkin straight-line linkage',
    ]);
    expect(familiesOf('Pumping_Field')).toEqual([
      'walking-beam mechanism',
      'walking-beam mechanism',
      'walking-beam mechanism',
    ]);
  });

  it('reads a four-bar whose frame is drawn as a bar, not as a fifth link', () => {
    expect(familiesOf('Four_Bar_Inversions')).toEqual([
      'crank-rocker four-bar',
      'crank-rocker four-bar',
      'double-crank (drag-link) four-bar',
      'double-rocker four-bar',
    ]);
  });

  it('says nothing where its catalog matches nothing', () => {
    expect(familiesOf('Pantograph')).toEqual(['']);
  });

  it('gives each link of a four-bar its job, from the solved cycle', () => {
    const { partitions, mechanisms } = solvedDrawing(TEMPLATE_LINKAGES['4-Bar']);
    const jobs = machineFacts(partitions[0], mechanisms[0])!.jobs.map(panelRole);
    expect(jobs).toEqual(expect.arrayContaining(['Input crank', 'Coupler', 'Rocker']));
  });

  it('recognizes a slider-crank whatever order its rod lists its joints in (#351)', () => {
    const familyWithRod = (rod: string) => {
      const fixture = sliderCrankTracerFixture();
      fixture.links[1].joints = rod;
      const { joints, links, forces, mechanism } = buildMechanism(fixture);
      const [partition] = partitionMechanisms(joints, links, forces).mechanisms;
      return machineFacts(partition, mechanism)?.family[0]?.family;
    };
    // Tracer point D listed ahead of crank pin B on the connecting rod.
    expect(familyWithRod('DCB')).toBe(familyWithRod('BCD'));
    expect(familyWithRod('DCB')).toContain('slider-crank');
  });

  it('does not call a crank shared with a parallelogram a rocker (#352)', () => {
    // Crank AB drives two loops: the parallelogram ABEF, and the crank-rocker
    // ABCD. The side the two loops share is the crank, which turns fully, so
    // this is not a crank-rocker whose rocker swings a parallelogram.
    const familiesDrivenAt = (input: 'A' | 'D') => {
      const { joints, links, forces, mechanism } = buildMechanism({
        joints: [
          { id: 'A', x: 0, y: 0, ground: true, input: input === 'A' },
          { id: 'B', x: 1, y: 0 },
          { id: 'C', x: 3.6667, y: 2.9814 },
          { id: 'D', x: 4, y: 0, ground: true, input: input === 'D' },
          { id: 'E', x: 1, y: -3 },
          { id: 'F', x: 0, y: -3, ground: true },
        ],
        links: [
          { joints: 'AB' },
          { joints: 'BC' },
          { joints: 'CD' },
          { joints: 'BE' },
          { joints: 'EF' },
        ],
        inputAngVel: 1,
      });
      expect(mechanism.isMechanismValid()).toBe(true);
      const [partition] = partitionMechanisms(joints, links, forces).mechanisms;
      return machineFacts(partition, mechanism)!.family.map((match) => match.family);
    };
    // Driven from the rocker the input reverses, and nothing turns fully.
    for (const input of ['A', 'D'] as const) {
      expect(familiesDrivenAt(input)).not.toContain('crank-rocker driving a parallelogram');
    }
  });

  it('still names a crank-rocker whose rocker swings a parallelogram', () => {
    expect(familiesOf('Windshield_Wiper')).toEqual(['crank-rocker driving a parallelogram']);
  });

  it('has nothing to say about a machine that does not run', () => {
    const { partitions } = solvedDrawing(TEMPLATE_LINKAGES['4-Bar']);
    expect(machineFacts(partitions[0], undefined)).toBeUndefined();
  });
});
