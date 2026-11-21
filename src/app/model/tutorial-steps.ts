import { Joint, RealJoint } from './joint';
import { Link } from './link';
import { canDrive } from './actuator';
import { cylindersIn, cylindersOfLinkIn } from './cylinder';

/**
 * The five moves the tutorial teaches, and how to tell from the drawing which
 * one is still outstanding.
 *
 * Read off the mechanism rather than counted by a Next button: a student who
 * grounds the wrong joint simply stays where they are, and one who undoes a
 * move is taken back to it. The tutorial always begins on a bare grid, though:
 * read off somebody else's linkage, the steps were moves nobody took -- a
 * six-bar arrived at "step 5 of 5, build a four-bar".
 */
export type TutorialStepId = 1 | 2 | 3 | 4 | 5;

export const TUTORIAL_STEP_COUNT = 5;

/** What the drawing has to look like for a step to be behind you. */
export interface TutorialProgress {
  /** The first step this drawing has not satisfied. */
  step: TutorialStepId;
  /** The joint the card names and the grid rings, where a step has one. */
  target?: RealJoint;
  /** The second joint step 3 still wants, so the copy can name both at once. */
  alsoTarget?: RealJoint;
  /** What the *previous* step achieved, shown as the card's green line. */
  achieved?: string;
  /**
   * Where the drawing has left the script in a way that will stop it later,
   * and what to do about it. The steps are read off the drawing, so a student
   * who builds something else is never refused -- but a chain of four links or
   * a triangle still satisfies "three links chained" and then cannot run, and
   * finding that out two steps later with no word of why is the tutorial
   * failing them.
   */
  offScript?: string;
}

const real = (joints: Joint[]): RealJoint[] =>
  joints.filter((joint): joint is RealJoint => joint instanceof RealJoint);

/**
 * The joints at the ends of a chain — the ones a four-bar grounds.
 *
 * Degree one in the link graph, which is what "the far end of the last bar"
 * means once the student has stopped following along exactly.
 */
export function endJoints(joints: Joint[]): RealJoint[] {
  return real(joints).filter((joint) => joint.links.length === 1);
}

/**
 * The three-or-more links that are actually joined up — the chain every later
 * step is then read against.
 *
 * Three separate bars are three links and are not a chain, and this is the
 * whole reason step 1 and step 2 are two steps: Add on the bare grid makes a
 * free-standing bar every time, so three of them never touch. Connectivity
 * is the test rather than a joint count, because a student who builds their
 * chain in a different order still built a chain — and every component is
 * tried, not only the one the first link happens to sit in, so a stray bar
 * left over from an earlier attempt does not hide the chain behind it.
 */
export function chainedLinks(links: Link[]): Link[] | undefined {
  // Walked only through the links it was given, so a cylinder left out of the
  // count is not the bridge that makes two bars look chained either.
  const allowed = new Set(links);
  const visited = new Set<Link>();
  for (const start of links) {
    if (visited.has(start)) continue;
    const reached = new Set<Link>([start]);
    const queue: Link[] = [start];
    while (queue.length > 0) {
      const link = queue.pop()!;
      for (const joint of link.joints) {
        if (!(joint instanceof RealJoint)) continue;
        for (const neighbor of joint.links) {
          if (allowed.has(neighbor) && !reached.has(neighbor)) {
            reached.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
    }
    for (const link of reached) visited.add(link);
    if (reached.size >= 3) return [...reached];
  }
  return undefined;
}

/** Whether the drawing holds three links that are actually joined up. */
export function linksAreChained(links: Link[]): boolean {
  return chainedLinks(links) !== undefined;
}

/**
 * The links the tutorial counts: the ordinary bars and plates.
 *
 * A cylinder is two members in `links`, and the steps read it as "first bar
 * drawn" -- after which Do This Step For Me had no bar to extend and said it
 * could not continue. Everything welded into a cylinder is left out too.
 */
export function plainLinks(joints: Joint[], links: Link[]): Link[] {
  const cylinders = cylindersIn(joints);
  if (cylinders.length === 0) return links;
  return links.filter((link) => cylindersOfLinkIn(cylinders, link).length === 0);
}

/**
 * The chain's free ends: on each link at the end of the chain, the one joint
 * that goes nowhere else.
 *
 * Not every joint on one link. A tracer point is a joint on one link too, and
 * counting it as an end had the tutorial ring it, ground it for the student,
 * and leave a four-bar that could not turn. So a link that joins the chain at
 * two places has no ends of its own, and a link at the end of it has one: the
 * grounded one if the student grounded one, else the first drawn.
 */
export function chainEnds(chain: Link[]): RealJoint[] {
  const inChain = new Set(chain);
  const ends: RealJoint[] = [];
  for (const link of chain) {
    const joints = real(link.joints);
    const joins = joints.filter((joint) =>
      joint.links.some((other) => other !== link && inChain.has(other))
    );
    if (joins.length !== 1) continue;
    const loose = joints.filter((joint) => !joins.includes(joint) && joint.links.length === 1);
    const end = loose.find((joint) => joint.ground) ?? loose[0];
    if (end) ends.push(end);
  }
  return ends;
}

/** The joints the qualifying chain is made of. */
function chainJoints(chain: Link[]): RealJoint[] {
  const joints = new Set<RealJoint>();
  for (const link of chain) for (const joint of real(link.joints)) joints.add(joint);
  return [...joints];
}

/**
 * The grounded joints step 3 is actually asking for.
 *
 * Scoped to the chain and to its free ends, so grounding a joint in the middle
 * of it — or one on an unrelated component — leaves the student where they
 * are, which is the contract at the top of this file. A chain that already
 * closes a loop has no degree-one end at all, and there any two of its own
 * grounded joints count, so a drawing that arrives finished is not stuck being
 * asked for ends it does not have.
 */
function groundedAnchors(own: RealJoint[], ends: RealJoint[]): RealJoint[] {
  return (ends.length > 0 ? ends : own).filter((joint) => joint.ground);
}

const nameOf = (joint: RealJoint): string => joint.name || joint.id;

/**
 * Which step this drawing is on, and the joint that step is about.
 *
 * The target is resolved from the drawing before the copy that names it: a
 * drawing that arrives with one end already grounded must ring the *other*
 * end, or the sentence sends the student to the finished one.
 */
export function progressFor(joints: Joint[], links: Link[]): TutorialProgress {
  return progressAt(joints, links, stepOf(joints, links));
}

/** The first of the five moves this drawing has not made. */
export function stepOf(joints: Joint[], drawn: Link[]): TutorialStepId {
  const links = plainLinks(joints, drawn);
  if (links.length < 1) return 1;
  const chain = chainedLinks(links);
  if (!chain) return 2;
  const own = chainJoints(chain);
  if (groundedAnchors(own, chainEnds(chain)).length < 2) return 3;
  if (!own.some((joint) => joint.input)) return 4;
  return 5;
}

/**
 * One step's view of this drawing — including a step it is already past.
 *
 * The card can be turned back to re-read a step that is done, so every step has
 * to be describable against a drawing that has moved on. Where the joint a step
 * asks about has already been dealt with, the finished one is named instead of
 * nothing: the sentence becomes a record of what was done rather than an
 * instruction, and a record still has to say which joint it was about.
 */
export function progressAt(joints: Joint[], drawn: Link[], step: TutorialStepId): TutorialProgress {
  const links = plainLinks(joints, drawn);
  // Everything the card names comes off the qualifying chain, so the ringed
  // joint is one of the chain's own and not a lookalike on a stray component.
  const chain = chainedLinks(links);
  const own = chain ? chainJoints(chain) : real(joints);
  const ends = chain ? chainEnds(chain) : [];
  const grounded = groundedAnchors(own, ends);
  const input = own.find((joint) => joint.input);

  const offScript = chain ? chainTrouble(chain, own, ends) : looseTrouble(links);

  switch (step) {
    case 1:
      return {
        step: 1,
        offScript:
          drawn.length > 0
            ? 'A cylinder is not a link. Start the four-bar with Link, under Add, beside it.'
            : undefined,
      };
    case 2:
      return { step: 2, achieved: 'First bar drawn', offScript };
    case 3: {
      const loose = ends.filter((joint) => !joint.ground);
      const named = loose.length > 0 ? loose : ends;
      return {
        step: 3,
        target: named[0],
        alsoTarget: named[1],
        achieved: 'Three links chained',
        offScript: offScript ?? middleGrounded(own, ends),
      };
    }
    case 4: {
      const drivable = grounded.filter((joint) => canDrive(joint));
      return {
        step: 4,
        offScript,
        target: input ?? drivable[0] ?? grounded[0],
        achieved:
          grounded.length > 0
            ? `${grounded.length > 1 ? 'Joints' : 'Joint'} ${grounded.map(nameOf).join(' and ')} grounded`
            : undefined,
      };
    }
    default:
      return {
        step: 5,
        achieved: input ? `Joint ${nameOf(input)} is the input` : undefined,
        offScript,
      };
  }
}

/**
 * What is wrong with a chain that counts as three links joined up but is not
 * the open chain of three a four-bar is built from.
 *
 * Each of these passes the step it was built in and fails at Play, which is
 * the worst place to find out: a longer chain needs a second input, a branch
 * leaves a link swinging loose, and a closed triangle is rigid.
 */
function chainTrouble(chain: Link[], own: RealJoint[], ends: RealJoint[]): string | undefined {
  if (chain.length > 3) {
    return `This chain has ${chain.length} links, and a four-bar uses three. Delete the extra links, or the mechanism will need more than one input to run.`;
  }
  if (ends.length === 0) {
    return 'These three links close into a triangle, which cannot move. Delete one link and attach the three end to end.';
  }
  if (ends.length > 2) {
    const hub = own.find((joint) => joint.links.length > 2);
    return `This chain branches${hub ? ` at joint ${nameOf(hub)}` : ''}. A four-bar needs its three links end to end, so delete the odd one out and attach it to the far end instead.`;
  }
  return undefined;
}

/**
 * Bars that never touch, which is what drawing Link from the bare grid three
 * times leaves -- the commonest way off the script, and the reason the step
 * names Attach. Said only once there are enough bars that a chain was
 * plainly what was being attempted.
 */
function looseTrouble(links: Link[]): string | undefined {
  if (links.length < 3) return undefined;
  return `These ${links.length} bars do not touch. A new bar joins the chain only when you start it from a joint already there, under Attach.`;
}

/**
 * A joint grounded in the middle of the chain: the step stays where it is, as
 * it should, and the student is told why rather than left wondering.
 */
function middleGrounded(own: RealJoint[], ends: RealJoint[]): string | undefined {
  const middle = own.filter((joint) => joint.ground && !ends.includes(joint));
  if (middle.length === 0 || ends.length === 0) return undefined;
  const names = middle.map(nameOf).join(' and ');
  const several = middle.length > 1;
  return `${several ? 'Joints' : 'Joint'} ${names} ${several ? 'are' : 'is'} in the middle of the chain, so grounding ${several ? 'them' : 'it'} holds the chain still. Turn off Grounded for ${several ? 'joints' : 'joint'} ${names}, and ground the two ends instead.`;
}

/** A joint worth reading a velocity off: one that moves. */
export function readableJoints(joints: Joint[]): RealJoint[] {
  return real(joints).filter((joint) => !joint.ground);
}

/** The card's words for one step, with the joints of this drawing named in them. */
export interface TutorialCopy {
  title: string;
  body: string;
  hint?: string;
  hintGlyph?: string;
}

/**
 * What the card says, given where the student is.
 *
 * Step 1 and step 2 name *different gestures*, which is the point of their
 * being two steps. Add on the bare grid always makes a free-standing bar —
 * doing it three times leaves three bars that never touch — so the chain is
 * built by attaching to the far end of what is already there.
 */
/**
 * The words for the two gestures the tutorial asks for, and where the panel is.
 *
 * The steps are the same on either device -- draw a bar, chain it, ground it,
 * drive it -- but three of the five open a menu, and a reader with no right
 * button cannot follow an instruction to right-click. Telling a phone to
 * right-click is the tutorial telling a student to do something impossible on
 * the first step, which is a worse first impression than not having a tutorial.
 */
interface Gestures {
  /** Opening the menu, at the start of a sentence. */
  Open: string;
  /** The same, mid-sentence. */
  open: string;
  /** Setting a point down. */
  set: string;
  /** What the far end of a new bar follows between the two. */
  pointer: string;
  /** The glyph beside the first hint. */
  glyph: string;
}

/**
 * What the card needs to know about the reader's device.
 *
 * Two questions, not one, and an iPad is what proves it: it is a touch device
 * with no right button *and* it is wide enough to keep the side panel. Asking
 * only "is this touch" told an iPad to look at the bottom of the window for a
 * panel that was down its left-hand side.
 */
export interface TutorialChrome {
  /** No right button: the menu is opened by holding. */
  touch?: boolean;
  /** Narrow enough that the mode panel is the sheet along the bottom. */
  sheetPanel?: boolean;
}

const MOUSE: Gestures = {
  Open: 'Right-click',
  open: 'right-click',
  set: 'left-click',
  pointer: 'your pointer',
  glyph: 'mouse',
};

const TOUCH: Gestures = {
  Open: 'Press and hold on',
  open: 'press and hold on',
  set: 'tap',
  pointer: 'your finger',
  glyph: 'touch_app',
};

export function copyFor(progress: TutorialProgress, chrome: TutorialChrome = {}): TutorialCopy {
  const target = progress.target ? nameOf(progress.target) : '';
  const touch = chrome.touch ?? false;
  const g = touch ? TOUCH : MOUSE;
  const panel = chrome.sheetPanel ? 'The panel at the bottom' : 'The panel on the left';
  switch (progress.step) {
    case 1:
      return {
        title: 'Draw the first link',
        // The gesture is a click, then a move, then a click -- not a drag. The
        // bar's far end follows the pointer between the two, and describing it
        // as "drag and release" had readers holding the button down through a
        // move that does not want it held.
        body: `${g.Open} the empty grid and choose Link, under Add. One end is placed where you started and the other follows ${g.pointer} — move to where you want it and ${g.set} to set it.`,
        hint: `That is how everything is added in PMKS: ${g.open} whatever you want to add to. ${panel} edits whatever you then select.`,
        hintGlyph: g.glyph,
      };
    case 2:
      return {
        title: 'Extend it into a chain of three',
        body: `${g.Open} the joint at the far end of the bar and choose Link, under Attach, then ${g.set} where the new bar should end. Do that twice, each time from the newest end, so the three links make a chain.`,
        hint: 'On the grid the group is Add, and the new bar stands on its own. On a joint it is Attach, and the new bar joins the joint that is already there.',
        hintGlyph: 'link',
      };
    case 3: {
      const also = progress.alsoTarget ? nameOf(progress.alsoTarget) : '';
      return {
        title: 'Ground the two end joints',
        body:
          `${g.Open} joint ${target} (highlighted), and turn on Grounded. A grounded joint is fixed to the frame.` +
          (also ? ` Then do the same at joint ${also}, at the other end.` : ''),
        hint: 'A mechanism with nothing grounded floats away.',
        hintGlyph: 'push_pin',
      };
    }
    case 4:
      return {
        title: 'Set a joint as the input',
        body: `${g.Open} joint ${target} (highlighted), and turn on Driven Input. The input is the joint that drives the mechanism. A mechanism needs exactly one.`,
      };
    default:
      return {
        title: 'Play it and read a velocity',
        // The transport is chrome now, so this no longer teaches the mode as
        // the way to *play*: Play is at the bottom of the window in Edit too,
        // and a step that sent a student elsewhere to press a button already in
        // front of them taught the wall rather than the tool. What the analysis
        // mode is still for is the reading, so that is what it is named for.
        //
        // Named by where it is, not only by what it says: below about 900px the
        // mode tabs give up their labels and a student is looking at four
        // unexplained glyphs.
        body: `Press Play at the bottom of the window and watch it run. Then switch to Kinematic Analysis — the third mode in the strip along the top — and ${touch ? 'tap' : 'click'} a moving joint to read its velocity.`,
        hint: 'The reading updates live as you scrub the playback slider.',
        hintGlyph: 'speed',
      };
  }
}
