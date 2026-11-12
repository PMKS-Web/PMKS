// joint.ts first: the model modules form an import cycle that only resolves
// from this end.
import '../../app/model/joint';
import { PrisJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import {
  LibraryTemplateID,
  TEMPLATE_LINKAGES,
} from '../../app/component/MODALS/templates/template-linkages';
import { fixturePayload } from '../../test-utils/verification/fixture-gallery';
import {
  LIBRARY_TEMPLATE_NAMES,
  LIBRARY_TEMPLATE_SIZES,
  libraryTemplateEntry,
  libraryTemplateMasses,
} from '../../test-utils/verification/template-fixtures';
import { libraryTemplateFills } from '../../test-utils/verification/template-colors';
import { SettingsService } from '../../app/services/settings.service';
import { buildMechanismFixture } from '../fixtures/mechanism-fixtures';

/** Opens a payload, keeping the object scale it set before the next one does. */
function open(payload: string) {
  const built = buildMechanismFixture(payload);
  return { ...built, objectScale: SettingsService.objectScale };
}

/**
 * A library template that names a real machine opens at that machine's size
 * (#308), and nothing but its size differs from the fixture it is made from.
 */

/** The template as it would publish at its fixture's own size. */
function atFixtureSize(id: LibraryTemplateID) {
  const entry = libraryTemplateEntry(id);
  return open(
    fixturePayload(
      entry.fixture,
      entry.objectScale,
      entry.speed,
      libraryTemplateMasses(id),
      libraryTemplateFills(id, entry.fixture),
      LIBRARY_TEMPLATE_SIZES[id]!.unit,
      LIBRARY_TEMPLATE_NAMES[id]
    )
  );
}

const ids = Object.keys(LIBRARY_TEMPLATE_SIZES) as LibraryTemplateID[];

describe('library templates drawn at real size', () => {
  for (const id of ids) {
    const { unit, factor } = LIBRARY_TEMPLATE_SIZES[id]!;

    it(`${id} opens in its own unit, ${factor} times its fixture`, () => {
      const published = open(TEMPLATE_LINKAGES[id]);
      const fixture = atFixtureSize(id);
      expect(published.settings.lengthUnit.value).toBe(unit);

      fixture.service.joints.forEach((joint, index) => {
        const twin = published.service.joints[index];
        expect(twin.id).toBe(joint.id);
        expect(twin.x, `${id} ${joint.id}.x`).toBeCloseTo(joint.x * factor, 1);
        expect(twin.y, `${id} ${joint.id}.y`).toBeCloseTo(joint.y * factor, 1);
        // A slider's own speed is a length a second, so it grows with the
        // drawing and the stroke takes as long as it did.
        if (joint instanceof PrisJoint) {
          expect((twin as PrisJoint).driveSpeed).toBeCloseTo(joint.driveSpeed * factor, 3);
        }
      });
      expect(published.settings.linearInputSpeed.value).toBeCloseTo(
        fixture.settings.linearInputSpeed.value * factor,
        3
      );
      // Pins and bars are drawn in model units: grown with the drawing, the
      // template looks the same on its card as it did.
      expect(published.objectScale).toBeCloseTo(fixture.objectScale * factor, 1);
    });

    it(`${id} keeps its masses' numbers and its rpm`, () => {
      const published = open(TEMPLATE_LINKAGES[id]);
      const fixture = atFixtureSize(id);
      const masses = (built: typeof published) =>
        built.service.links.map((link) => (link instanceof RealLink ? link.mass : 0));
      expect(masses(published)).toEqual(masses(fixture));
      expect(published.settings.inputSpeed.value).toBe(fixture.settings.inputSpeed.value);
    });
  }

  it('leaves every other template at its fixture size', () => {
    expect(ids).not.toContain('Four_Bar');
    expect(ids).not.toContain('Toggle_Clamp');
  });
});
