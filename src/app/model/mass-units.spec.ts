import {
  displayMassUnit,
  inertiaUnitFor,
  massUnitFromFlag,
  readsOtherMetricMass,
  storedInertiaUnit,
  storedMassUnit,
} from './mass-units';
import { InertiaUnit, LengthUnit, MassUnit } from './unit-enums';

// Issue #142: length, mass and force are chosen separately, and everything else
// is a product of them -- not a list of every combination of units.

describe('mass units', () => {
  it('stores mass in the unit that pairs with the length, whatever the reader picked', () => {
    expect(storedMassUnit(LengthUnit.CM)).toBe(MassUnit.GRAM);
    expect(storedMassUnit(LengthUnit.METER)).toBe(MassUnit.KG);
    expect(storedMassUnit(LengthUnit.INCH)).toBe(MassUnit.LBM);
  });

  it('shows grams or kilograms under either metric length', () => {
    for (const length of [LengthUnit.CM, LengthUnit.METER]) {
      expect(displayMassUnit(length, MassUnit.GRAM)).toBe(MassUnit.GRAM);
      expect(displayMassUnit(length, MassUnit.KG)).toBe(MassUnit.KG);
    }
  });

  it('keeps an English drawing in pounds-mass, so no metric mass mixes into it', () => {
    expect(displayMassUnit(LengthUnit.INCH, MassUnit.KG)).toBe(MassUnit.LBM);
    expect(displayMassUnit(LengthUnit.INCH, MassUnit.GRAM)).toBe(MassUnit.LBM);
  });

  it('falls back to storage for a pick that means nothing under a metric length', () => {
    expect(displayMassUnit(LengthUnit.CM, MassUnit.LBM)).toBe(MassUnit.GRAM);
    expect(displayMassUnit(LengthUnit.METER, MassUnit.NULL)).toBe(MassUnit.KG);
  });

  it('makes inertia the mass unit times the length squared', () => {
    expect(inertiaUnitFor(MassUnit.GRAM, LengthUnit.CM)).toBe(InertiaUnit.G_CM2);
    expect(inertiaUnitFor(MassUnit.KG, LengthUnit.CM)).toBe(InertiaUnit.KG_CM2);
    expect(inertiaUnitFor(MassUnit.GRAM, LengthUnit.METER)).toBe(InertiaUnit.G_M2);
    expect(inertiaUnitFor(MassUnit.KG, LengthUnit.METER)).toBe(InertiaUnit.KG_M2);
    expect(inertiaUnitFor(MassUnit.KG, LengthUnit.INCH)).toBe(InertiaUnit.LBM_IN2);
  });

  it('keeps the inertia storage every URL already carries', () => {
    // Centimeters store kg·cm² beside a mass in grams; it predates this file.
    expect(storedInertiaUnit(LengthUnit.CM)).toBe(InertiaUnit.KG_CM2);
    expect(storedInertiaUnit(LengthUnit.METER)).toBe(InertiaUnit.KG_M2);
    expect(storedInertiaUnit(LengthUnit.INCH)).toBe(InertiaUnit.LBM_IN2);
  });

  it('writes a flag only when the reader left the stored mass', () => {
    expect(readsOtherMetricMass(LengthUnit.CM, MassUnit.GRAM)).toBe(false);
    expect(readsOtherMetricMass(LengthUnit.CM, MassUnit.KG)).toBe(true);
    expect(readsOtherMetricMass(LengthUnit.METER, MassUnit.KG)).toBe(false);
    expect(readsOtherMetricMass(LengthUnit.METER, MassUnit.GRAM)).toBe(true);
    expect(readsOtherMetricMass(LengthUnit.INCH, MassUnit.KG)).toBe(false);
  });

  it('reads the flag back as the unit it was written from', () => {
    for (const length of [LengthUnit.CM, LengthUnit.METER, LengthUnit.INCH]) {
      for (const chosen of [MassUnit.GRAM, MassUnit.KG, MassUnit.NULL]) {
        const flag = readsOtherMetricMass(length, chosen);
        expect(displayMassUnit(length, massUnitFromFlag(length, flag))).toBe(
          displayMassUnit(length, chosen)
        );
      }
    }
  });

  it('treats no pick as the length’s own mass, and writes no flag for it', () => {
    // A fixture or template that sets meters and never thinks about mass must
    // encode exactly as it did before the choice existed.
    for (const length of [LengthUnit.CM, LengthUnit.METER, LengthUnit.INCH]) {
      expect(displayMassUnit(length, MassUnit.NULL)).toBe(storedMassUnit(length));
      expect(readsOtherMetricMass(length, MassUnit.NULL)).toBe(false);
    }
    expect(massUnitFromFlag(LengthUnit.METER, false)).toBe(MassUnit.NULL);
  });
});
