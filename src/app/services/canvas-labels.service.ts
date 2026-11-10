import { Injectable, inject } from '@angular/core';
import { Joint, PrisJoint, RealJoint } from '../model/joint';
import { Link, RealLink } from '../model/link';
import { barHalfWidth, cylinderLabelOffset } from '../model/joint-marks';
import {
  bodyLabelTurns,
  jointLabelOffset,
  labelRoom,
  uprightAngle,
} from '../model/label-placement';
import { MechanismService } from './mechanism.service';
import { ObjectDisplayService } from './object-display.service';
import { SettingsService } from './settings.service';
import { CylinderMark, SliderMark } from './slider-mark.service';

/**
 * The smallest and largest a name is drawn on screen, in pixels.
 *
 * Between the two a name scales with the zoom like everything else. Past them
 * it holds: below 11 px a name cannot be read at all, and above 16 px a short
 * drawing's names outgrow the bars they are written on.
 */
export const MIN_LABEL_PX = 11;
export const MAX_LABEL_PX = 16;

type Point = { x: number; y: number };
export interface CanvasLabel extends Point {
  ink: string;
  opacity: number;
  name: string;
  angle: number;
  outside?: boolean;
  /** This name's own size, in model units: a long name is drawn smaller. */
  fontSize?: number;
  /** The text's box in model units, for the gap cut in the lines under it. */
  width?: number;
  height?: number;
}
/** Where a body's name prefers to be, written at the size it will be drawn. */
export type PreferredLabel = (link: Link, fontSize: number) => CanvasLabel;
type Obstacle = Point & { radius: number };
type Box = Point & { width: number; height: number; angle: number };
type Placement = Point & {
  angle: number;
  frame: number;
  turns: boolean;
  outside: boolean;
  offset: Point;
  font: number;
  width: number;
  height: number;
};
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const offset = (p: Point, x: number, y: number): Point => ({ x: p.x + x, y: p.y + y });
const rotate = (p: Point, angle: number): Point => ({
  x: p.x * Math.cos(angle) - p.y * Math.sin(angle),
  y: p.x * Math.sin(angle) + p.y * Math.cos(angle),
});
function frame(link: Link): number {
  if (link instanceof RealLink && link.isCircle) return 0;
  const a = link.joints[0];
  const b = link.joints.find((joint) => distance(a, joint) > 1e-7);
  return b ? Math.atan2(b.y - a.y, b.x - a.x) : 0;
}
function bodyOrigin(link: Link): Point {
  return (link instanceof RealLink && link.discCenter()) || link.joints[0];
}
function hits(box: Box, pin: Obstacle): boolean {
  const local = rotate({ x: pin.x - box.x, y: pin.y - box.y }, -box.angle);
  return (
    Math.hypot(
      Math.max(0, Math.abs(local.x) - box.width / 2),
      Math.max(0, Math.abs(local.y) - box.height / 2)
    ) < pin.radius
  );
}
function overlaps(a: Box, b: Box): boolean {
  // Separating axes of both rectangles, rather than their large axis-aligned
  // boxes: two parallel names on diagonal rods can be quite close and clear.
  for (const angle of [a.angle, a.angle + Math.PI / 2, b.angle, b.angle + Math.PI / 2]) {
    const extent = (box: Box) =>
      (Math.abs(Math.cos(box.angle - angle)) * box.width +
        Math.abs(Math.sin(box.angle - angle)) * box.height) /
      2;
    const gap = Math.abs((a.x - b.x) * Math.cos(angle) + (a.y - b.y) * Math.sin(angle));
    if (gap >= extent(a) + extent(b)) return false;
  }
  return true;
}
/** Points over the letters themselves, not the padded box: a grid of 5 by 3. */
function inkPoints(box: Box): Point[] {
  const points: Point[] = [];
  for (const x of [-0.45, -0.225, 0, 0.225, 0.45]) {
    for (const y of [-0.3, 0, 0.3]) {
      const p = rotate({ x: box.width * x, y: box.height * y }, box.angle);
      points.push(offset(box, p.x, p.y));
    }
  }
  return points;
}

/**
 * Model-sized typography and clearance, chosen once per edit, carried by each
 * body in motion.
 *
 * A name is placed against everything else on the drawing, not only its own
 * body: the other names, the joint letters, the pins, the ground and slider
 * blocks, the cylinder heads, the rails and the force arrows. It sits wholly on
 * its body or wholly beside it, never across the edge, and it is always black:
 * the palette is painted light enough for black to read on every color
 * (`paintOf`).
 */
@Injectable({ providedIn: 'root' })
export class CanvasLabelsService {
  private mechanism = inject(MechanismService);
  private settings = inject(SettingsService);
  private display = inject(ObjectDisplayService);
  private fontRevision = -1;
  private extent = 0;
  private layoutKey = '';
  private quickKey = '';
  private placements = new Map<Link, Placement>();
  private canvas?: CanvasRenderingContext2D;
  private paths = new WeakMap<Link, { source: string; path: Path2D }>();
  private widthPerFont = new Map<string, number>();

  /**
   * The size names are written at in the drawing's own units, before any
   * screen limit: what decides whether a name turns along its body, so that
   * neither the zoom nor the style can turn it.
   */
  modelFontSize(): number {
    if (this.fontRevision !== this.mechanism.solveRevision) {
      const references = this.mechanism.mechanisms.flatMap((one) => one.joints[0] ?? []);
      const byId = new Map(references.map((joint) => [joint.id, joint]));
      const points = this.mechanism.visibleJoints().map((joint) => byId.get(joint.id) ?? joint);
      const span = (axis: 'x' | 'y') =>
        Math.max(...points.map((p) => p[axis])) - Math.min(...points.map((p) => p[axis]));
      this.extent = points.length ? Math.max(span('x'), span('y')) : 0;
      this.fontRevision = this.mechanism.solveRevision;
    }
    // A short edge on a large drawing can make Object Size tiny. Typography
    // also considers the authored drawing's span. Neither term reads the zoom
    // or the animation pose; Fine and Schematic keep the same type.
    return Math.max(this.settings.forceScale * 0.2, this.extent / 55);
  }

  /** The size of a joint's letter, and the largest any name is drawn at. */
  fontSize(): number {
    return Math.min(Math.max(this.modelFontSize(), this.screenUnits(MIN_LABEL_PX)), this.ceiling());
  }

  /**
   * One body's name size: the drawing's, made smaller until a long name fits
   * between the pins, but never under the smallest readable size. A name that
   * still does not fit is set beside its body instead.
   */
  fontFor(link: Link, name: string): number {
    const base = this.fontSize();
    const room = labelRoom(link, this.settings.forceScale);
    if (room === undefined) return base;
    const wanted = this.textWidth(name, base);
    const fitted = wanted > room ? (base * room) / wanted : base;
    return Math.max(fitted, Math.min(base, this.screenUnits(MIN_LABEL_PX)));
  }

  forLink(
    link: Link,
    preferred: PreferredLabel,
    marks: SliderMark[],
    cylinders: CylinderMark[] = []
  ): CanvasLabel {
    const links = this.mechanism.getLinks();
    const names = links.map((one) => this.mechanism.visibleBodyName(one));
    const drawing = `${this.mechanism.solveRevision}/${this.settings.drawingStyle.value}/${this.settings.drawingScale}/${this.settings.isShowCOM.value}/${this.settings.isShowID.value}/${links.map((one, i) => names[i] + this.mechanism.isPartInert(one)).join('|')}`;
    const quick = `${drawing}/${this.screenUnits(MIN_LABEL_PX)}`;
    if (quick !== this.quickKey) {
      this.quickKey = quick;
      // The zoom reaches the layout only through the sizes it sets, and those
      // move only at the screen limits. Keyed on the sizes themselves, a zoom
      // between the limits re-lays nothing.
      const sizes = links.map((one, i) => this.fontFor(one, names[i]).toPrecision(6)).join(',');
      const scene = `${drawing}/${this.fontSize()}/${sizes}`;
      if (scene !== this.layoutKey) {
        this.layoutKey = scene;
        this.arrange(links, preferred, marks, cylinders);
      }
    }
    const held = this.placements.get(link);
    const tag = preferred(
      link,
      held?.font ?? this.fontFor(link, this.mechanism.visibleBodyName(link))
    );
    if (!held) return { ...tag, ink: 'black' };
    const direction = frame(link);
    const cylinder = this.mechanism.cylinderOfBar(link);
    const point = rotate(cylinder ? held.offset : held, direction);
    const origin = cylinder ? tag : bodyOrigin(link);
    const angle = held.turns ? held.angle - ((direction - held.frame) * 180) / Math.PI : held.angle;
    return {
      ...tag,
      ...offset(origin, point.x, point.y),
      angle: uprightAngle(angle),
      ink: 'black',
      outside: held.outside,
      fontSize: held.font,
      width: held.width,
      height: held.height,
    };
  }

  /** The largest a name may be, in model units, at this zoom. */
  private ceiling(): number {
    return this.screenUnits(MAX_LABEL_PX);
  }

  /**
   * A screen size in model units. The zoom is read in steps of about 4%, so a
   * wheel turn re-lays the names a handful of times rather than on every tick
   * while the size is held at one of its limits.
   */
  private screenUnits(pixels: number): number {
    const zoom = this.settings.drawingZoom;
    if (!(zoom > 0) || !Number.isFinite(zoom)) return pixels === MIN_LABEL_PX ? 0 : Infinity;
    return pixels / 2 ** (Math.round(Math.log2(zoom) * 16) / 16);
  }

  private textWidth(name: string, font: number): number {
    let perFont = this.widthPerFont.get(name);
    if (perFont === undefined) {
      this.canvas ??= this.context();
      if (this.canvas) {
        this.canvas.font = `600 100px "Helvetica Neue", Arial, sans-serif`;
        perFont = this.canvas.measureText(name).width / 100;
      }
      perFont = perFont || name.length * 0.57;
      this.widthPerFont.set(name, perFont);
    }
    return perFont * font;
  }

  private context(): CanvasRenderingContext2D | undefined {
    try {
      return document.createElement('canvas').getContext('2d') ?? undefined;
    } catch {
      return undefined;
    }
  }

  private arrange(
    links: Link[],
    preferred: PreferredLabel,
    marks: SliderMark[],
    cylinders: CylinderMark[]
  ): void {
    this.placements.clear();
    this.canvas ??= this.context();
    const canvas = this.canvas;
    if (!canvas) return;
    const scale = this.settings.drawingScale;
    const schematic = this.settings.isSchematic;
    const jointFont = this.fontSize();
    const scenery = this.scenery(links, marks);
    const furniture = this.furniture(marks, cylinders, scale);
    const pins = this.pins(links, scale);
    const taken: Box[] = this.settings.isShowID.value ? this.jointBoxes(jointFont, scale) : [];
    const bodies = schematic
      ? []
      : links.map((link) => ({ link, ...this.bodyExtent(link, scale) }));
    // The most constrained first: a bar has a row of places along it, a disc
    // or plate a whole face. Placed in drawing order, a wheel could take the one
    // spot its crossing rod had, and the rod's name then landed on the wheel's.
    const order = [...links].sort(
      (a, b) =>
        Number(a.joints.length !== 2) - Number(b.joints.length !== 2) ||
        this.mechanism.visibleBodyName(b).length - this.mechanism.visibleBodyName(a).length
    );
    for (const link of order) {
      const name = this.mechanism.visibleBodyName(link);
      const font = this.fontFor(link, name);
      const tag = preferred(link, font);
      const angle = (-tag.angle * Math.PI) / 180;
      const width = this.textWidth(tag.name, font) + font * 0.3;
      const height = font * 1.4;
      const box = (point: Point): Box => ({ ...point, width, height, angle });
      const path = this.pathFor(link);
      const inside = (point: Point) => canvas.isPointInPath(path, point.x, point.y);
      // A name must still visibly belong to its body without a leader line:
      // within nine tenths of a letter height of its outline (the guard in
      // e2e/library-label-motion.mjs uses the same distance), never a distant
      // collision-free island.
      canvas.lineWidth = font * 1.8;
      const close = (point: Point) =>
        inside(point) || canvas.isPointInStroke(path, point.x, point.y);
      const nearby = [
        ...this.candidates(tag, font, scale).filter(close),
        ...this.besideBar(link, tag, width, height, scale),
        ...this.acrossBody(link, scale).filter(inside),
      ];
      // Other bodies this name could be printed on, found by their extents
      // first so the path tests run only where they can matter.
      const reach = Math.hypot(width, height) / 2;
      const others = bodies.filter((one) => one.link !== link);
      const onAnother = (rect: Box, letters: Point[]) =>
        others.some(
          (one) =>
            rect.x + reach > one.left &&
            rect.x - reach < one.right &&
            rect.y + reach > one.bottom &&
            rect.y - reach < one.top &&
            letters.some((p) => canvas.isPointInPath(this.pathFor(one.link), p.x, p.y))
        );
      // A schematic body's own line, which its name should run beside rather
      // than along. Scored, not filtered: a disc's rim and spokes cross most of
      // its face, and a filter left a wheel's name only the places on its
      // neighbors' letters. The gap mask keeps a crossing legible.
      const ownLine = new Path2D(schematic ? this.lineFor(link) : '');
      const candidates = nearby;
      // The cheap terms first: a place that already scores worse than the best
      // so far is not worth the path tests, which are most of the cost.
      const penalty = (point: Point, i: number, best: number): number => {
        const rect = box(point);
        const cheap =
          (pins.filter((pin) => hits(rect, pin)).length +
            taken.filter((other) => overlaps(rect, other)).length) *
            10000 +
          distance(tag, point) / font +
          i * 1e-4;
        if (cheap >= best) return Infinity;
        const letters = inkPoints(rect);
        const collisions = letters.some((p) => canvas.isPointInPath(furniture, p.x, p.y)) ? 1 : 0;
        canvas.lineWidth = font * 1.1;
        // Along the text's middle row, against a band a little wider than the
        // letters are tall: a name beside its line is clear, one across it not.
        const onOwnLine =
          schematic &&
          letters.some((p, k) => k % 3 === 1 && canvas.isPointInStroke(ownLine, p.x, p.y));
        canvas.lineWidth = font * 0.3;
        const ruled = letters.some((p) => canvas.isPointInStroke(scenery, p.x, p.y));
        // Wholly on the body or wholly off it. Half on the fill and half on the
        // grid is the one placement that reads worst, so it is all but refused.
        // A schematic body is a line, which the own-line test already keeps
        // the letters off.
        const painted = schematic ? 0 : letters.filter(inside).length;
        const straddles = painted > 0 && painted < letters.length;
        const off = !schematic && painted === 0;
        // Printed over another body, a name reads as that body's. Not refused:
        // a wheel crossed by its rods may have nowhere else to be.
        const covered = !schematic && onAnother(rect, letters);
        return (
          cheap +
          collisions * 10000 +
          (straddles ? 3000 : 0) +
          (onOwnLine ? 2500 : 0) +
          (ruled ? 1000 : 0) +
          (covered ? 150 : 0) +
          (off ? 12 : 0)
        );
      };
      const best = candidates.reduce(
        (best, point, i) => {
          const score = penalty(point, i, best.score);
          return score < best.score ? { point, score } : best;
        },
        { point: tag as Point, score: Infinity }
      ).point;
      taken.push(box(best));
      this.placements.set(link, {
        ...rotate({ x: best.x - bodyOrigin(link).x, y: best.y - bodyOrigin(link).y }, -frame(link)),
        offset: rotate({ x: best.x - tag.x, y: best.y - tag.y }, -frame(link)),
        angle: tag.angle,
        frame: frame(link),
        turns: bodyLabelTurns(link, tag.name, this.modelFontSize(), this.settings.forceScale),
        outside: !!tag.outside || !inside(best),
        font,
        width,
        height: font * 1.05,
      });
    }
  }

  private candidates(tag: CanvasLabel, font: number, scale: number): Point[] {
    const points: Point[] = [tag];
    const angle = (-tag.angle * Math.PI) / 180;
    const push = (x: number, y: number) => {
      const delta = rotate({ x, y }, angle);
      points.push(offset(tag, delta.x, delta.y));
    };
    // Enough room for the letters beside a schematic hairline, while staying
    // within the body's text clearance even when the style is very thin.
    if (this.settings.isSchematic) {
      push(0, font * 0.75);
      push(0, -font * 0.75);
    }
    // Prefer a small move inside the body; when there is no room, clear either
    // side. Search both sides so a nearby pin or name cannot trap the label.
    for (const step of [0.8, 1.4, 2.2, 3.2]) {
      for (const sign of [1, -1]) {
        if (this.settings.isSchematic) {
          push(sign * font * step, font * 0.75);
          push(sign * font * step, -font * 0.75);
        }
        push(0, sign * (font * step + scale * 0.16));
        push(sign * font * step, 0);
        push(sign * font * step, font * step);
        push(sign * font * step, -font * step);
      }
    }
    return points;
  }

  /**
   * Places alongside a bar, one small gap clear of its edge, at the middle and
   * at points along it: where a name goes when it does not fit on the bar, or
   * when a block or another name holds the middle.
   */
  private besideBar(
    link: Link,
    tag: CanvasLabel,
    width: number,
    height: number,
    scale: number
  ): Point[] {
    if (link.joints.length !== 2 || (link instanceof RealLink && link.isCircle)) return [];
    const [a, b] = link.joints;
    const length = distance(a, b);
    if (length < 1e-9) return [];
    const axis = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
    const normal = { x: -axis.y, y: axis.x };
    const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const half = this.settings.isSchematic ? scale * 0.03 : barHalfWidth(scale);
    // The letters are about a font tall, inside a padded box of 1.4: three
    // quarters of a font from the edge leaves a quarter-font gap to the glyphs.
    const across = half + (height / 1.4) * 0.75;
    const reach = Math.max(0, (length - width) / 2);
    const points: Point[] = [];
    for (const t of [0, 0.25, -0.25, 0.5, -0.5, 0.75, -0.75, 1, -1]) {
      for (const side of [1, -1]) {
        const along = t * reach;
        points.push({
          x: middle.x + axis.x * along + normal.x * side * across,
          y: middle.y + axis.y * along + normal.y * side * across,
        });
      }
    }
    // The bar's name can sit nowhere but along it, so these are only useful
    // when the text runs the bar's way.
    const turned = Math.abs(Math.sin((-tag.angle * Math.PI) / 180 - Math.atan2(axis.y, axis.x)));
    return turned < 0.05 ? points : [];
  }

  /**
   * Places spread over a disc or a plate, for when its middle is taken by its
   * pivot, the pivot's letter and the ground glyph under it. A bar has its own
   * row of places along it (`besideBar`).
   */
  private acrossBody(link: Link, scale: number): Point[] {
    if (link.joints.length === 2 && !(link instanceof RealLink && link.isCircle)) return [];
    const { left, right, bottom, top } = this.bodyExtent(link, scale);
    const points: Point[] = [];
    for (const u of [0.2, 0.35, 0.5, 0.65, 0.8]) {
      for (const v of [0.2, 0.35, 0.5, 0.65, 0.8]) {
        points.push({ x: left + (right - left) * u, y: bottom + (top - bottom) * v });
      }
    }
    return points;
  }

  /** A body's extent, from its joints and, for a disc, its rim. */
  private bodyExtent(link: Link, scale: number) {
    const points: Point[] = [...link.joints];
    const center = link instanceof RealLink && link.isCircle ? link.discCenter() : undefined;
    if (center) {
      const radius = Math.max(...link.joints.map((joint) => distance(joint, center)));
      points.push(
        { x: center.x - radius, y: center.y - radius },
        { x: center.x + radius, y: center.y + radius }
      );
    }
    const pad = barHalfWidth(scale);
    return {
      left: Math.min(...points.map((p) => p.x)) - pad,
      right: Math.max(...points.map((p) => p.x)) + pad,
      bottom: Math.min(...points.map((p) => p.y)) - pad,
      top: Math.max(...points.map((p) => p.y)) + pad,
    };
  }

  /** The pins, the center-of-mass marks and the force arrows, as discs to keep clear of. */
  private pins(links: Link[], scale: number): Obstacle[] {
    const pins: Obstacle[] = this.mechanism.visibleJoints().map((joint) => ({
      x: joint.x,
      y: joint.y,
      radius:
        scale *
        (joint instanceof PrisJoint
          ? 0.62
          : joint instanceof RealJoint && joint.input
            ? 0.44
            : 0.19),
    }));
    if (this.settings.isShowCOM.value) {
      for (const link of links) {
        if (link instanceof RealLink && link.mass > 0)
          pins.push({ x: link.CoM.x, y: link.CoM.y, radius: scale * 0.15 });
      }
    }
    for (const force of this.mechanism.forces) {
      for (let i = 0; i <= 24; i++) {
        pins.push({
          x: force.startCoord.x + ((force.endCoord.x - force.startCoord.x) * i) / 24,
          y: force.startCoord.y + ((force.endCoord.y - force.startCoord.y) * i) / 24,
          radius: this.settings.forceScale * (i >= 20 ? 0.2 : 0.1),
        });
      }
    }
    return pins;
  }

  /**
   * The solid marks a name must not be printed on: slider blocks, cylinder
   * heads, and the ground and input glyphs, which are drawn from one image at
   * `drawingScale * 1.2` below or around their pin.
   */
  private furniture(marks: SliderMark[], cylinders: CylinderMark[], scale: number): Path2D {
    const path = new Path2D();
    const at = (mark: { x: number; y: number; rotation: number }) =>
      new DOMMatrix().translate(mark.x, mark.y).rotate(mark.rotation);
    for (const mark of marks) if (mark.block) path.addPath(new Path2D(mark.block), at(mark));
    for (const cyl of cylinders) {
      const block = this.settings.isSchematic ? cyl.sealBlock : cyl.block;
      if (block) path.addPath(new Path2D(block), at(cyl));
    }
    for (const joint of this.mechanism.visibleJoints()) {
      if (!(joint instanceof RealJoint) || !joint.ground || joint instanceof PrisJoint) continue;
      // The input glyph wraps its pin; the ground glyph hangs below it.
      const top = joint.input ? 0.52 : 0;
      const bottom = joint.input ? -0.68 : -0.78;
      path.rect(
        joint.x - 0.6 * scale,
        joint.y + bottom * scale,
        1.2 * scale,
        (top - bottom) * scale
      );
    }
    return path;
  }

  private jointBoxes(font: number, scale: number): Box[] {
    return this.mechanism.visibleJoints().map((joint: Joint) => {
      // Where the canvas draws the letter (`jointTagAnchor`): a cylinder's seal
      // clears the barrel along its normal rather than taking an open sector.
      const sealed = this.mechanism.cylinderAt(joint);
      const ref = this.mechanism.mechanismContaining(joint)?.joints[0];
      const delta =
        sealed && sealed.seal.id === joint.id
          ? cylinderLabelOffset(
              { x: sealed.mountB.x - sealed.mountA.x, y: sealed.mountB.y - sealed.mountA.y },
              0.15 * scale
            )
          : jointLabelOffset(joint, font, scale, ref);
      return {
        ...offset(joint, delta.x, delta.y),
        width: font * 0.75 * Math.max(1, joint.name.length),
        height: font * 1.2,
        angle: 0,
      };
    });
  }

  private pathFor(link: Link): Path2D {
    const source = this.display.path(link);
    let held = this.paths.get(link);
    if (held?.source !== source) {
      held = { source, path: new Path2D(source) };
      this.paths.set(link, held);
    }
    return held.path;
  }

  /** Lines a name should not be printed across: the rails, and in Schematic every body. */
  private scenery(links: Link[], marks: SliderMark[]): Path2D {
    const path = new Path2D();
    if (this.settings.isSchematic) {
      for (const link of links) path.addPath(new Path2D(this.lineFor(link)));
    }
    for (const mark of marks) {
      const rails = mark.rails;
      if (!rails) continue;
      const local = new Path2D(
        [...rails.rails, ...rails.dashedRails, ...rails.ticks]
          .map((s) => `M ${s.x1} ${s.y1} L ${s.x2} ${s.y2}`)
          .join(' ')
      );
      path.addPath(local, new DOMMatrix().translate(rails.x, rails.y).rotate(rails.rotation));
    }
    return path;
  }

  private lineFor(link: Link): string {
    if (link instanceof RealLink && link.subset.length)
      return link.subset.map((part) => this.lineFor(part)).join(' ');
    const cylinder = this.mechanism.cylinderOfBar(link);
    if (!cylinder) return this.display.skeleton(link);
    const barrel = cylinder.barrel.id === link.id;
    const from = barrel ? cylinder.mountA : cylinder.seal;
    const to = barrel ? cylinder.seal : cylinder.mountB;
    return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  }
}
