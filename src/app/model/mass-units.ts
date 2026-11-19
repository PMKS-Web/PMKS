import { InertiaUnit, LengthUnit, MassUnit } from './unit-enums';

/**
 * Which mass and inertia units a drawing is stored in, and which the reader sees.
 *
 * The two are different questions. Storage follows the length unit and nothing
 * else -- grams under centimeters, kilograms under meters, pounds-mass under
 * inches -- because the solver's `siUnitFactors`, the length-unit rescale and
 * every URL in circulation are written against that pairing. What the reader
 * sees is a choice of its own under the two metric lengths, the way kilograms-
 * force already is for force: a student measuring in centimeters can weigh in
 * kilograms without the drawing changing underneath them.
 *
 * Inertia is never chosen. It is the mass unit times the length unit squared,
 * one rule, so the number beside a link's mass and the one beside its moment of
 * inertia always speak the same system.
 */

/** The mass unit stored under a length: what `siUnitFactors` assumes. */
export function storedMassUnit(length: LengthUnit): MassUnit {
  switch (length) {
    case LengthUnit.INCH:
      return MassUnit.LBM;
    case LengthUnit.METER:
      return MassUnit.KG;
    default:
      return MassUnit.GRAM;
  }
}

/**
 * The mass unit a reader sees, given what they chose.
 *
 * `MassUnit.NULL` is the usual pick: no choice made, so the length's own mass.
 * It is what a new drawing, a change of length and every URL without the flag
 * leave behind, which is what keeps code that sets a length without thinking
 * about mass -- a fixture, a template, a spec -- reading what it always did.
 *
 * Inches have one mass, pounds-mass, whatever was chosen before: mixing a
 * metric mass into an English drawing is where a list of every combination
 * would come from, and it helps nobody. Under centimeters and meters, grams
 * and kilograms are both honest; anything else falls back to storage.
 */
export function displayMassUnit(length: LengthUnit, chosen: MassUnit): MassUnit {
  if (length === LengthUnit.INCH) return MassUnit.LBM;
  return chosen === MassUnit.GRAM || chosen === MassUnit.KG ? chosen : storedMassUnit(length);
}

/**
 * Whether the reader's mass differs from the one stored under this length.
 *
 * This is what the URL records, as a single flag: false is what every URL
 * written before the choice existed unpacks, and false has to keep meaning
 * what those URLs have always shown -- the stored unit.
 */
export function readsOtherMetricMass(length: LengthUnit, chosen: MassUnit): boolean {
  return displayMassUnit(length, chosen) !== storedMassUnit(length);
}

/**
 * The inverse of `readsOtherMetricMass`: the pick a decoded flag stands for.
 *
 * `MassUnit.NULL` when the flag is off, which means "whatever this length
 * stores" -- the same thing a reader who never opened Mass Units has.
 */
export function massUnitFromFlag(length: LengthUnit, other: boolean): MassUnit {
  if (!other || length === LengthUnit.INCH) return MassUnit.NULL;
  return storedMassUnit(length) === MassUnit.GRAM ? MassUnit.KG : MassUnit.GRAM;
}

/**
 * The inertia unit stored under a length.
 *
 * Not `inertiaUnitFor(storedMassUnit(length), length)`: centimeters store
 * kg·cm² beside a mass in grams. That pairing predates this file, and every
 * URL carries it, so it is kept rather than tidied.
 */
export function storedInertiaUnit(length: LengthUnit): InertiaUnit {
  switch (length) {
    case LengthUnit.INCH:
      return InertiaUnit.LBM_IN2;
    case LengthUnit.METER:
      return InertiaUnit.KG_M2;
    default:
      return InertiaUnit.KG_CM2;
  }
}

/** Mass times length squared: g·cm², kg·cm², g·m², kg·m² or lbm·in². */
export function inertiaUnitFor(mass: MassUnit, length: LengthUnit): InertiaUnit {
  if (length === LengthUnit.INCH) return InertiaUnit.LBM_IN2;
  const grams = displayMassUnit(length, mass) === MassUnit.GRAM;
  if (length === LengthUnit.METER) return grams ? InertiaUnit.G_M2 : InertiaUnit.KG_M2;
  return grams ? InertiaUnit.G_CM2 : InertiaUnit.KG_CM2;
}
