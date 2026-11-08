import '../../app/model/joint';
import { solvedDrawing } from '../machine-facts/drawing';
import { fixturePayload } from '../verification/fixture-gallery';
import {
  frictionBearingFixture,
  frictionSliderCrankFixture,
} from '../verification/friction-fixtures';
import { exportPartition } from './export-problem';

describe('oracle friction equivalence', () => {
  for (const make of [frictionBearingFixture, frictionSliderCrankFixture]) {
    it(`does not certify frictionless oracle forces for ${make.name}`, () => {
      const fixture = make();
      const enabled = solvedDrawing(fixturePayload(fixture), 'degree');
      const problem = exportPartition(
        'friction-test',
        'Friction',
        enabled.partitions[0],
        enabled.settings
      );
      expect(problem.unsupported.some((note) => note.includes('Coulomb friction'))).toBe(true);
      fixture.friction = [];
      const disabled = solvedDrawing(fixturePayload(fixture), 'degree');
      const ideal = exportPartition(
        'friction-test',
        'Frictionless',
        disabled.partitions[0],
        disabled.settings
      );
      expect(ideal.unsupported).toEqual([]);
    });
  }
});
