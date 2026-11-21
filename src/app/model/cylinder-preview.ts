import { cylinderCreationLayout, cylinderHeadHalf } from './cylinder';
import { CylinderGestureEnd, cylinderGestureEnds } from './cylinder-gesture-ends';
import { barrelPath, cylinderBlockPath, rodBodyPath, slideMarkPath } from './joint-marks';

/**
 * The ghost cylinder of the creation gesture, in the seal's own frame (+x
 * toward the rod), drawn the way the committed part will be in either style.
 */
export interface CylinderPreview {
  x: number;
  y: number;
  rotation: number;
  barrel: string;
  rod: string;
  block: string;
  fill: string;
  /** Schematic's drawing of it: where mount A and the rod's end land, and the seal's mark. */
  anchor: number;
  reach: number;
  seal: string;
}

/**
 * `cylinderScale` lays the part out, exactly as the click will build it;
 * `drawingScale` only sizes what is drawn. The base goes at whichever end of
 * the gesture `cylinderGestureEnds` says the click will put it (#366).
 */
export function cylinderPreviewOf(
  start: CylinderGestureEnd,
  end: CylinderGestureEnd,
  cylinderScale: number,
  drawingScale: number,
  fill: string
): CylinderPreview {
  const { base, rodEnd } = cylinderGestureEnds(start, end, cylinderScale);
  const creation = cylinderCreationLayout(base.at, rodEnd.at, cylinderScale);
  const r = 0.15 * drawingScale;
  const head = cylinderHeadHalf(creation.barrelLength);
  const anchor = -creation.sealFromMount;
  return {
    x: creation.seal.x,
    y: creation.seal.y,
    rotation: (creation.angleRad * 180) / Math.PI,
    // The preview is the part it will become: the barrel at its own length,
    // straddling the piston, with the rod telescoping out of its mouth.
    barrel: barrelPath(r, anchor, anchor + creation.barrelLength),
    rod: rodBodyPath(r, creation.rodLength, head),
    block: cylinderBlockPath(r, head),
    fill,
    anchor,
    reach: creation.rodLength,
    seal: slideMarkPath(r, head),
  };
}
