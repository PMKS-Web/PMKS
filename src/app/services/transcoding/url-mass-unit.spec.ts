import '../../model/joint';
import { RevJoint } from '../../model/joint';
import { RealLink } from '../../model/link';
import { LengthUnit, MassUnit } from '../../model/utils';
import { displayMassUnit } from '../../model/mass-units';
import { ActiveObjService } from '../active-obj.service';
import { MechanismService } from '../mechanism.service';
import { SettingsService } from '../settings.service';
import { urlGeneratorFor } from '../../../test-utils/url-encoding';
import { MechanismBuilder } from './mechanism-builder';
import { StringTranscoder } from './string-transcoder';
import { MODEL_SCALE } from '../../model/render-scale';
import { FlagPacker } from './flag-packer';

// Issue #142. The reader's mass unit rides the URL as one appended flag, "the
// other metric mass", so a drawing read in the mass its length stores writes
// exactly the URL it always did -- and every URL written before the flag opens
// in the mass it always showed.

const S = MODEL_SCALE;

/** Any linkage at all: this file is about the settings, not the geometry. */
function source() {
  const a = new RevJoint('A', 0, 0, false, true);
  const b = new RevJoint('B', 2 * S, 0);
  const bar = new RealLink('AB', [a, b], 1, 1);
  [a, b].forEach((joint) => joint.links.push(bar));
  a.connectedJoints.push(b);
  b.connectedJoints.push(a);
  return { joints: [a, b], links: [bar], forces: [] };
}

function encodeWith(settings: SettingsService): string {
  return urlGeneratorFor(
    { ...source(), mechanismTimeStep: 0 } as unknown as MechanismService,
    settings
  ).generateUrlQuery();
}

function decodeInto(encoded: string, settings: SettingsService): void {
  const decoder = new StringTranscoder();
  decoder.decodeURL(encoded);
  const target = {
    joints: [],
    links: [],
    forces: [],
    mechanismTimeStep: 0,
  } as unknown as MechanismService;
  new MechanismBuilder(target, decoder, settings, new ActiveObjService()).build(true);
}

function settingsIn(length: LengthUnit, mass: MassUnit): SettingsService {
  const settings = new SettingsService();
  settings.lengthUnit.next(length);
  settings.massUnit.next(mass);
  return settings;
}

/** What the reader sees, which is the question; the setting itself may be "no pick". */
const shown = (settings: SettingsService) =>
  displayMassUnit(settings.lengthUnit.value, settings.massUnit.value);

describe('mass unit in the URL', () => {
  it('writes no flag for a drawing whose length was set without a mass pick', () => {
    // Fixtures and templates set meters and leave mass alone; they must encode
    // as they did before the choice existed.
    const meters = new SettingsService();
    meters.lengthUnit.next(LengthUnit.METER);
    const flags = encodeWith(meters).split('.')[0];
    expect(FlagPacker.unpack(flags, 10)[9]).toBe(false);
  });

  it('round-trips kilograms under centimeters and grams under meters', () => {
    for (const [length, mass] of [
      [LengthUnit.CM, MassUnit.KG],
      [LengthUnit.METER, MassUnit.GRAM],
    ] as const) {
      const read = new SettingsService();
      decodeInto(encodeWith(settingsIn(length, mass)), read);
      expect(read.lengthUnit.value).toBe(length);
      expect(shown(read)).toBe(mass);
    }
  });

  it('opens a drawing in its stored mass when the reader never left it', () => {
    for (const [length, mass] of [
      [LengthUnit.CM, MassUnit.GRAM],
      [LengthUnit.METER, MassUnit.KG],
      [LengthUnit.INCH, MassUnit.LBM],
    ] as const) {
      // Start the reader on the other pick, so a decode that leaves the
      // setting alone cannot pass.
      const read = settingsIn(LengthUnit.CM, MassUnit.KG);
      decodeInto(encodeWith(settingsIn(length, mass)), read);
      expect(shown(read)).toBe(mass);
    }
  });

  it('writes the same URL as before the choice existed while the stored mass is read', () => {
    // The flag is the tenth boolean. Ten flags pack into the same two
    // characters as nine, so with it false the settings token is exactly what
    // a nine-flag encoder wrote.
    const flags = (url: string) => url.split('.')[0];
    const plain = flags(encodeWith(settingsIn(LengthUnit.CM, MassUnit.GRAM)));
    expect(FlagPacker.pack(FlagPacker.unpack(plain, 9))).toBe(plain);

    const other = flags(encodeWith(settingsIn(LengthUnit.CM, MassUnit.KG)));
    expect(other.length).toBe(plain.length);
    expect(FlagPacker.unpack(other, 10)[9]).toBe(true);
  });

  it('keeps an English drawing in pounds-mass whatever the reader had picked', () => {
    const read = new SettingsService();
    decodeInto(encodeWith(settingsIn(LengthUnit.INCH, MassUnit.KG)), read);
    expect(shown(read)).toBe(MassUnit.LBM);
  });
});
