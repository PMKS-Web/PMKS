/**
 * One place that answers "may this happen right now, and if not, in what words".
 *
 * Six surfaces used to answer that question for themselves -- the canvas's drag
 * gate, the Edit panel's disappearing act, the analysis geometry lock, the undo
 * buttons, the context menu's graying, and the service's own `isAnimating()` --
 * and they did not all ask the same thing. Three of them read the *shared*
 * clock, so with the machines unsynced and one row scrubbed mid-cycle the
 * canvas and the panel allowed edits against a displaced pose while undo
 * correctly refused. That disagreement is not fixable by patching three call
 * sites into agreement; it is fixable by there being one answer.
 *
 * The model is deliberately pure: it takes a described state and returns a
 * verdict. Nothing here reaches for a service, so the whole matrix in
 * The rule it encodes is `docs/editing-rules.md`: every control is one of six
 * kinds, and one table says in which mode and at which pose each kind is
 * offered. A new control picks its kind there; it never asks the pose itself.
 */

/** Which mode the reader is in, in the only three flavors that change an answer. */
export type EditMode = 'synthesis' | 'edit' | 'analysis';

/**
 * The kinds of thing that can be asked for.
 *
 * Split finer than today's answers need, because Phase 2 unlocks them at
 * different times and for different reasons: a drag is pose-relative by
 * definition, a typed coordinate is not, and a delete is addressed by identity
 * and never needs the pose at all. Collapsing them now would mean splitting the
 * plumbing later.
 */
export type EditAction =
  /** View: selecting, inspecting, panning, zooming -- never refused anywhere. */
  | 'inspect'
  /** Gesture: dragging a joint, a link, a force or a center of mass. */
  | 'drag'
  /** Annotation: adding or deleting a tracer point or a force. */
  | 'annotate'
  /** Safe property: mass, name, color, lock, hold, display shape. */
  | 'safeProperty'
  /** Structure: adding a link, welding -- geometry that captures its pose. */
  | 'build'
  /** Structure: new links or cylinders, which belong to Edit mode. */
  | 'create'
  /** Structure: delete, ground, set-input, joint type, split. */
  | 'structure'
  /** Typed geometry: joint X/Y, link length and angle, an arrow-key nudge. */
  | 'placement'
  /** Typed geometry: a typed center of mass, a force's direction and place. */
  | 'properties'
  /**
   * Load: a force's magnitude and Flip Force. Neither places nor turns
   * anything, so neither is read off the pose on screen.
   */
  | 'load'
  /** Typed geometry: input speed and direction, which move the visible pose. */
  | 'drive'
  /** Units, gravity and the other document-wide settings. */
  | 'settings'
  /** Play, scrub, stop. */
  | 'transport'
  /** Undo and redo. */
  | 'history';

/** Every action the matrix covers, for the tests and for any "all of them" sweep. */
export const EDIT_ACTIONS: readonly EditAction[] = [
  'inspect',
  'drag',
  'annotate',
  'safeProperty',
  'build',
  'create',
  'structure',
  'placement',
  'properties',
  'load',
  'drive',
  'settings',
  'transport',
  'history',
];

/**
 * Why an action is refused, in the two lengths the surfaces need.
 *
 * `short` labels a grayed menu row mid-sentence ("animation running"); `long`
 * is a whole sentence for a tooltip, a banner, or a snackbar. Both come from
 * here so the menu, the panel and the canvas cannot word the same rule
 * differently.
 */
export interface EditRefusal {
  short: string;
  /** The whole sentence, for a tooltip, a snackbar, or a grayed row's title. */
  long: string;
  /**
   * Whether returning to the start pose is what clears this refusal.
   *
   * The surfaces that can offer a way out need to know that the button would
   * help, rather than guessing from the wording.
   */
  backToStartHelps?: boolean;
  /** The glyph the Edit panel's strip draws beside it. */
  glyph: string;
  /**
   * The same sentence in three pieces, so the way out can be a link *inside*
   * it rather than a button beside it.
   *
   * The panel is 250px wide. A sentence and a button sharing that line left the
   * sentence four words deep with the button hard against it, and a button
   * stacked under it made the strip a different height in every state. Written
   * as prose with one word underlined, every message is the same two lines.
   */
  lead: string;
  action?: string;
  tail?: string;
  /** What pressing that word does. */
  actionKind?: 'backToStart' | 'toEdit';
}

/**
 * One refusal, written once.
 *
 * `long` is built from the pieces rather than written twice: the two used to be
 * separate strings, which is how a surface comes to quote a sentence the panel
 * no longer says.
 */
function refusal(parts: Omit<EditRefusal, 'long'>): EditRefusal {
  return {
    ...parts,
    long: [parts.lead, parts.action, parts.tail].filter(Boolean).join(' ').replace(/\s+/g, ' '),
  };
}

/** Everything the answers are decided from. Assembled by the service. */
export interface EditState {
  mode: EditMode;
  /** Any machine actually running. */
  playing: boolean;
  /** Every machine parked at its own start -- the service's `isAtStartPose()`. */
  atStart: boolean;
  /**
   * Whether the *shared* clock reads zero while something is nonetheless
   * displaced. Only the wording depends on it: "not at the start" over a
   * transport that reads 0:00 sends a reader to a scrubber that looks parked.
   */
  sharedStepZero: boolean;
  /**
   * The machine parked away from its own start, by name, where the shared clock
   * does not show it.
   *
   * Carried rather than derived: the model is pure, and what a machine is called
   * is the service's to know.
   */
  awayMachine?: string;
  /** Built, but its motion deliberately not worked out yet (large drawings). */
  solveDeferred: boolean;
  /** Nothing drawn at all. */
  empty: boolean;
  /** At least one machine could run if asked. */
  runnable: boolean;
}

/** Nothing has been drawn, so there is nothing to play. */
const NOTHING_DRAWN: EditRefusal = refusal({
  short: 'nothing drawn',
  glyph: 'draw',
  lead: 'Nothing to play yet \u2014 draw a mechanism.',
});

const IN_SYNTHESIS: EditRefusal = refusal({
  short: 'synthesis mode',
  glyph: 'polyline',
  lead: 'Synthesis describes a mechanism that does not exist yet.',
  action: 'Switch to Edit',
  tail: 'to change one.',
  actionKind: 'toEdit',
});

const CREATE_IN_EDIT: EditRefusal = refusal({
  short: 'Edit mode only',
  glyph: 'edit',
  lead: '',
  action: 'Switch to Edit',
  tail: 'to add links or cylinders.',
  actionKind: 'toEdit',
});

/**
 * The analysis modes read the motion. Everything but a drag, a tracer point, a
 * force and the view is Edit's, so a reader there cannot change the mechanism
 * into one that no longer runs and be left with nothing that works.
 */
const EDIT_MODE_ONLY: EditRefusal = refusal({
  short: 'Edit mode only',
  glyph: 'edit',
  lead: 'Analysis adds tracer points and forces.',
  action: 'Switch to Edit',
  tail: 'to change anything else.',
  actionKind: 'toEdit',
});

/** What an analysis mode refuses whatever the pose. */
const EDIT_ONLY_ACTIONS: ReadonlySet<EditAction> = new Set<EditAction>([
  'safeProperty',
  'build',
  'structure',
  'placement',
  'properties',
  'drive',
]);

const PLAYING: EditRefusal = refusal({
  short: 'animation running',
  glyph: 'play_circle',
  lead: 'Pause the animation to change the mechanism.',
  // The same button clears it: stopping is pausing plus the walk home, which
  // is what a reader who wants to edit is going to press next anyway.
  backToStartHelps: true,
});

/** Displaced, and the transport agrees it is displaced. */
const DISPLACED: EditRefusal = refusal({
  short: 'return to start',
  glyph: 'motion_photos_paused',
  lead: 'The mechanism is parked mid-cycle.',
  action: 'Return it to the start',
  tail: 'to change it.',
  actionKind: 'backToStart',
  backToStartHelps: true,
});

/**
 * Why the document-wide settings cannot be changed right now.
 *
 * Units and the like belong to the whole drawing, and changing one rescales
 * every stored coordinate -- so they are typed at the start pose, standing
 * still. Which of the two reasons applies is not worth a sentence of its own:
 * the reader is being told what to do about it, and the same press fixes
 * either. So the condition is stated once, with the "or" in it, and the way
 * out is one word whatever stopped them.
 *
 * The panel used to say "Pause the animation to change." or "Return to the
 * start pose to change." depending on which it was, which made the strip
 * rewrite itself under the reader's eyes as the animation ran on and stopped.
 */
export const SETTINGS_AT_START_ONLY: EditRefusal = refusal({
  short: 'playing or mid-cycle',
  glyph: 'motion_photos_paused',
  lead: 'Playing or away from the start.',
  action: 'Reset to the starting pose',
  tail: 'to change.',
  actionKind: 'backToStart',
  backToStartHelps: true,
});

/**
 * Displaced, but the shared clock reads zero -- so say which machine is not.
 *
 * Named, not counted. "One of the machines" is a sentence written by something
 * that does not know what the machine is called; the app does know, so it says
 * it.
 */
function displacedUnsynced(name: string | undefined): EditRefusal {
  return refusal({
    short: 'a mechanism is mid-cycle',
    glyph: 'pause_circle',
    lead: `${name ?? 'One of the mechanisms'} is parked away from its start.`,
    action: 'Return every mechanism',
    tail: 'to edit.',
    actionKind: 'backToStart',
    backToStartHelps: true,
  });
}

/**
 * A typed number at a displaced pose.
 *
 * Gestures at a pose are *defined* to mean "put it here, at this pose", and the
 * app can honor that: the drag lands, and the machine is put back on its anchor
 * underneath. Numbers are less forgiving. A joint's X and Y are pose
 * coordinates outright; a link's length reads pose-invariantly but the handler
 * behind it repositions joints along the *displayed* orientation. Each needs a
 * written transform back to t = 0 before it can be offered here, and until one
 * exists the field says so rather than writing the wrong thing quietly.
 */
const DISPLACED_TYPING: EditRefusal = refusal({
  short: 'shown at pose',
  glyph: 'motion_photos_paused',
  lead: 'Values at this pose. Drag to move parts, or',
  action: 'return to the start',
  tail: 'to change anything else.',
  actionKind: 'backToStart',
  backToStartHelps: true,
});

/**
 * A large drawing whose motion has not been worked out.
 *
 * Posed editing needs a cycle to anchor against, and re-anchoring costs a solve
 * per commit -- the exact cost the deferral exists to refuse. At the start pose
 * these drawings edit exactly as they always did.
 */
const DEFERRED_DISPLACED: EditRefusal = refusal({
  short: 'motion not worked out',
  glyph: 'hourglass_empty',
  lead: 'Motion is solved on request. Press Play, or',
  action: 'return to the start',
  tail: '.',
  actionKind: 'backToStart',
  backToStartHelps: true,
});

/**
 * The verdict for one action: the table in `docs/editing-rules.md`, as code.
 */
export function refusalFor(action: EditAction, state: EditState): EditRefusal | null {
  if (action === 'inspect') return null;

  if (action === 'transport') return transportRefusal(state);

  // Synthesis owns the grid entirely: it describes a mechanism that does not
  // exist yet, so there is nothing here to refuse *about*.
  if (state.mode === 'synthesis' && action !== 'history') return IN_SYNTHESIS;
  // Playing is read-only whatever the action. A reader reaching for a joint
  // that is moving is a fight nothing here can win.
  if (state.playing) return PLAYING;
  // How hard a force pushes is a question an analysis exists to ask, and the
  // answer is the same at every pose: `editForcesAtPose` carries it home.
  if (action === 'load') return state.solveDeferred && !state.atStart ? DEFERRED_DISPLACED : null;
  if (state.mode === 'analysis') {
    if (action === 'create') return CREATE_IN_EDIT;
    if (EDIT_ONLY_ACTIONS.has(action)) return EDIT_MODE_ONLY;
  }
  if (state.atStart) return null;

  // Paused, and away from the start: the reader is looking, not designing.
  switch (action) {
    case 'safeProperty':
      // Nothing here is read off the pose or can stop the mechanism running.
      return null;
    case 'drag':
    case 'history':
      // A posed drag is put back on the machine's anchor, in every mode.
      return state.solveDeferred ? DEFERRED_DISPLACED : null;
    case 'annotate':
    case 'build':
    case 'create':
    case 'structure':
      return displacementRefusal(state);
    default:
      // Typed geometry and settings. Which sentence depends on whether the
      // transport agrees it is displaced: "not at the start" over a scrubber
      // reading 0:00 sends a reader to a control that looks parked, so
      // unsynced, the machine that is actually away is named instead.
      return state.sharedStepZero ? displacedUnsynced(state.awayMachine) : DISPLACED_TYPING;
  }
}

/**
 * Why the transport is inert, if it is.
 *
 * Its refusals are about the *drawing* rather than about the pose, because the
 * transport is the one thing that stays usable while the mechanism is running:
 * refusing it for being mid-cycle would refuse the control that ends being
 * mid-cycle.
 */
function transportRefusal(state: EditState): EditRefusal | null {
  if (state.mode === 'synthesis') return IN_SYNTHESIS;
  // Deferred drawings are not refused: pressing Play is what asks for the
  // solve, and the button runs it behind the loading cover.
  if (state.solveDeferred) return null;
  if (state.empty) return NOTHING_DRAWN;
  if (!state.runnable) {
    // The readiness list has the specific answer and the caller pastes it in;
    // this is the sentence for a drawing whose parts belong to no machine at
    // all, which readiness has nothing to say about.
    return refusal({
      short: 'nothing to run',
      glyph: 'link_off',
      lead: 'Ground a joint and set one joint as an input.',
    });
  }
  return null;
}

/**
 * Everything refused purely for where in the cycle the mechanism is.
 *
 * Exported because two surfaces decide the *mode* half themselves and need only
 * this half: the context menu already builds a different set of rows per mode,
 * and graying every row of an analysis menu for being in an analysis mode would
 * gray the rows that mode exists to offer.
 */
export function displacementRefusal(state: EditState): EditRefusal | null {
  if (state.playing) return PLAYING;
  if (state.atStart) return null;
  return state.sharedStepZero ? displacedUnsynced(state.awayMachine) : DISPLACED;
}

/**
 * The kind of control a context-menu row is, in the table's words.
 *
 * `design` covers both Structure and Typed geometry: the two rows of the table
 * have the same answer in every column, and a menu row never types a number.
 */
export type MenuPosePolicy = 'view' | 'annotation' | 'safe' | 'load' | 'design' | 'create';

const MENU_ACTION: Record<Exclude<MenuPosePolicy, 'view'>, EditAction> = {
  annotation: 'annotate',
  safe: 'safeProperty',
  load: 'load',
  design: 'structure',
  create: 'create',
};

/** A menu row's answer: the same table, plus no document change while playing. */
export function menuRefusal(
  state: EditState,
  policy: MenuPosePolicy = 'design'
): EditRefusal | null {
  // View rows (traces) are document state too, so they wait for a pause.
  if (state.playing) return PLAYING;
  if (policy === 'view') return null;
  return refusalFor(MENU_ACTION[policy], state);
}
