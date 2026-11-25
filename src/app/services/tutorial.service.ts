import { AnalyticsService } from './analytics.service';
import { Injectable, inject } from '@angular/core';
import { Joint, RealJoint } from '../model/joint';
import { Link } from '../model/link';
import { Coord } from '../model/coord';
import { MODEL_SCALE } from '../model/render-scale';
import { LengthUnit, TimeUnit } from '../model/unit-enums';
import {
  TUTORIAL_STEP_COUNT,
  TutorialCopy,
  TutorialProgress,
  TutorialStepId,
  chainedLinks,
  copyFor,
  plainLinks,
  progressAt,
  progressFor,
  stepOf,
} from '../model/tutorial-steps';
import { MechanismService } from './mechanism.service';
import { ActiveObjService } from './active-obj.service';
import { SettingsService, writeStoredFlag } from './settings.service';
import { AnalysisSampleService } from './analysis-sample.service';
import { NumberUnitParserService } from './number-unit-parser.service';
import { SelectedTabService, TabID } from '../selected-tab.service';
import { SvgGridService } from './svg-grid.service';
import { local_storage_available } from '../model/utils';
import { ViewportService } from './viewport.service';
import { SaveHistoryService } from './save-history.service';
import { UrlProcessorService } from './url-processor.service';
import { NotificationService } from './notification.service';

/** The velocity the tutorial ends on, frozen at the moment it was read. */
export interface TutorialReading {
  joint: string;
  magnitude: string;
  unit: string;
  /** How far into the cycle, worded and measured as the playback row words it. */
  time: string;
}

/** Remembered on this machine so the offer stops pestering someone who has met it. */
const SEEN_KEY = 'tutorialSeen';

/**
 * A tutorial under way in this tab, kept across a reload. Session storage,
 * because the drawing a reload brings back is this tab's too: a reload at step
 * three restored the chain and lost the tutorial, and reopening it then asked
 * to clear the very drawing it had been building.
 */
const IN_PROGRESS_KEY = 'tutorialInProgress';

/**
 * The guided first build: five moves from a bare grid to a velocity.
 *
 * The service holds only what the drawing cannot say for itself — whether the
 * student asked for the tutorial, whether they walked out of it, and the
 * reading it finished on. *Which step they are on* is never stored, because
 * the drawing already knows: see `progressFor`. That is what stops it insisting
 * on a step the student has just undone. And it is why the tutorial only
 * believes a drawing it watched being built (`ownsDrawing`): it begins on a
 * cleared grid, and steps aside when a template, a file or an undo puts
 * somebody else's drawing back.
 */
@Injectable({ providedIn: 'root' })
export class TutorialService {
  private viewport = inject(ViewportService);
  private mechanism = inject(MechanismService);
  private activeObj = inject(ActiveObjService);
  private settings = inject(SettingsService);
  private samples = inject(AnalysisSampleService);
  private analytics = inject(AnalyticsService);
  private nup = inject(NumberUnitParserService);
  private tabs = inject(SelectedTabService);
  private svgGrid = inject(SvgGridService);
  private history = inject(SaveHistoryService);
  private urlProcessor = inject(UrlProcessorService);
  private notify = inject(NotificationService);

  /**
   * The history entry the tutorial's drawing began at: the cleared grid, or
   * the bare one it was started on.
   *
   * The tutorial reads its step off the drawing, so it is only telling the
   * truth about a drawing it watched being built. Somebody else's six-bar read
   * as "step 5 of 5, build a four-bar", with an input it never asked for
   * already reported done. An undo back past this entry brings that drawing
   * back, and so does opening a file or a template.
   */
  private baseline: number | undefined;

  /**
   * The history entry a different drawing arrived as, once one has -- a
   * template or an opened file. Undo back before it and the tutorial's drawing
   * is on the grid again, and its own once more. `null` is an arrival that left
   * no entry to undo, which is for good.
   */
  private replacedAt: number | null | undefined;

  started = false;
  exited = false;
  done = false;
  reading: TutorialReading | undefined;

  /**
   * Whether this drawing has been run at all.
   *
   * The last step is "play it and read a velocity", and a velocity read at the
   * start pose is zero — so the step is not finished by clicking a joint on a
   * mechanism that has never moved.
   */
  private hasPlayed = false;

  /** Set once the student has finished or walked out, and never unset. */
  private seen = local_storage_available() && localStorage.getItem(SEEN_KEY) === 'true';

  /**
   * The step the card is showing, which is not always the step the drawing is
   * on. It falls behind twice: while a finished step is being left up to read,
   * and while the student is paging back through steps they have done.
   */
  viewedStep: TutorialStepId = 1;

  /**
   * A step has just been satisfied and its card is being held up to be read.
   *
   * Without this the card changed under the reader at the instant they finished
   * the thing it was describing -- often mid-sentence, since the last words of
   * a step are usually the ones explaining *why* the move mattered.
   */
  settling = false;

  /** How long a finished step stays up before the next one arrives. */
  private static readonly SETTLE_MS = 2600;

  private settleTimer: ReturnType<typeof setTimeout> | undefined;
  private knownStep: TutorialStepId = 1;

  constructor() {
    // `animating` also turns on for a scrubbed pose, so it is a cue to look,
    // not proof of a play: only the chain's own machine running counts.
    this.settings.animating.subscribe(() => this.noticePlay());
    this.activeObj.onActiveObjChange.subscribe(() => this.checkForFinish());
    // A moved pose finishes nothing on its own: scrubbing one step along at
    // the start of the cycle completed the lesson at 0.00 s with Play never
    // pressed. The step asks for Play, so only playing counts as having played.
    // A row's own Play, unsynced, starts its machine without touching
    // `animating`, so the frames it draws are where that play is seen.
    this.mechanism.onMechPositionChange.subscribe(() => this.noticePlay());
    this.urlProcessor.drawingReplaced.subscribe(() => {
      if (!this.started) return;
      // The first replacement is the one that matters. A second template opened
      // over the first moved this mark onto itself, and one undo then landed on
      // the first template -- which the tutorial took for its own drawing.
      if (this.replacedAt === null) return;
      if (this.replacedAt === undefined || !this.history.standsOnOrPast(this.replacedAt)) {
        const arrived = this.history.currentEntry();
        this.replacedAt = arrived === undefined || arrived === this.baseline ? null : arrived;
      }
      this.stepAside('Tutorial closed, because a different drawing was opened.');
    });
    this.history.restored.subscribe(() => {
      if (!this.isRunning() || this.ownsDrawing()) return;
      // A finished card is about the four-bar it read, and is as wrong beside
      // somebody else's drawing as a step card is.
      this.stepAside(
        this.done
          ? 'Tutorial closed, because Undo brought back a drawing from before it started.'
          : 'Tutorial closed, because Undo brought back a drawing the tutorial did not build. Redo returns to the tutorial’s drawing.'
      );
    });
    this.pickUpAfterReload();
    window.addEventListener('pagehide', () => this.keepForReload());
  }

  /** A tutorial under way, and its drawing, came back with the page. */
  private pickUpAfterReload(): void {
    let kept: { exited?: boolean } | undefined;
    try {
      const raw = sessionStorage.getItem(IN_PROGRESS_KEY);
      sessionStorage.removeItem(IN_PROGRESS_KEY);
      kept = raw ? JSON.parse(raw) : undefined;
    } catch {
      kept = undefined;
    }
    if (!kept || !this.urlProcessor.restoredOnReturn) return;
    this.started = true;
    this.exited = kept.exited === true;
    this.baseline = this.history.currentEntry();
    this.knownStep = stepOf(this.mechanism.joints, this.mechanism.links);
    this.landOn(this.knownStep);
    if (!this.exited) this.showLetters();
  }

  private keepForReload(): void {
    try {
      if (this.canResume()) {
        sessionStorage.setItem(IN_PROGRESS_KEY, JSON.stringify({ exited: this.exited }));
      } else {
        sessionStorage.removeItem(IN_PROGRESS_KEY);
      }
    } catch {
      // Storage refused: a reload simply forgets the tutorial, as it used to.
    }
  }

  /**
   * Whether the drawing on the grid is the one this tutorial has been
   * building: nothing else has been opened over it, and undo has not gone back
   * past the grid it started on.
   */
  ownsDrawing(): boolean {
    if (!this.started || this.replacedAt === null) return false;
    if (this.replacedAt !== undefined && this.history.standsOnOrPast(this.replacedAt)) return false;
    return this.baseline === undefined || this.history.standsOnOrPast(this.baseline);
  }

  /** Put the card away because the drawing under it stopped being its own. */
  private stepAside(why: string): void {
    if (!this.isRunning()) return;
    this.exited = true;
    this.notify.news('tutorial.stepped-aside', why);
  }

  /**
   * The drawing moved. Decide whether the card should follow it, and when.
   *
   * Forwards is held for a moment; backwards is immediate. Undoing the thing a
   * step asked for has to take the card back with it, or the card sits there
   * congratulating the student on something that is no longer true.
   *
   * Called from the card's own change detection rather than from a subscription
   * on the mechanism. There is no event to subscribe to: `updateMechanism` is
   * what every edit ends in, and it does not publish on `onMechUpdateState` --
   * that subject carries the *analysis* state, which is why the caches
   * elsewhere in the app key on `poseRevision` instead.
   */
  noticeStep(): void {
    const now = stepOf(this.mechanism.joints, this.mechanism.links);
    if (now === this.knownStep) return;
    const wasOn = this.knownStep;
    this.knownStep = now;
    // Having played belongs to the mechanism that played. Undo the input, or
    // the chain, and build it again, and the last step must ask for Play
    // again -- otherwise clicking a joint at the start pose finishes the
    // tutorial on a velocity that has never been anything but the start.
    if (now < 5) this.hasPlayed = false;

    if (!this.isRunning() || this.done) {
      this.landOn(now);
      return;
    }
    if (now < this.viewedStep || now < wasOn) {
      this.landOn(now);
      return;
    }
    // Reading an earlier step: leave them where they are rather than yanking
    // the card forward under them.
    if (this.viewedStep !== wasOn) return;

    this.settling = true;
    this.clearSettle();
    this.settleTimer = setTimeout(() => this.landOn(this.knownStep), TutorialService.SETTLE_MS);
  }

  private landOn(step: TutorialStepId): void {
    this.clearSettle();
    this.settling = false;
    this.viewedStep = step;
  }

  private clearSettle(): void {
    if (this.settleTimer !== undefined) clearTimeout(this.settleTimer);
    this.settleTimer = undefined;
  }

  // ---------- where the student is ----------

  progress(): TutorialProgress {
    return progressFor(this.mechanism.joints, this.mechanism.links);
  }

  step(): number {
    return this.progress().step;
  }

  stepCount(): number {
    return TUTORIAL_STEP_COUNT;
  }

  /** What the card is showing, which may be a step the drawing is past. */
  viewedProgress(): TutorialProgress {
    return progressAt(this.mechanism.joints, this.mechanism.links, this.viewedStep);
  }

  copy(): TutorialCopy {
    return copyFor(this.viewedProgress(), {
      touch: this.viewport.isTouch(),
      sheetPanel: this.viewport.isPhone(),
    });
  }

  /** Whether the step on the card is one the student has already satisfied. */
  viewingCompleted(): boolean {
    return this.viewedStep < this.step() || this.settling;
  }

  canGoBack(): boolean {
    return this.viewedStep > 1;
  }

  /** Forward only as far as the drawing has got: the card never runs ahead. */
  canGoForward(): boolean {
    return this.viewedStep < this.step();
  }

  goBack(): void {
    if (this.canGoBack()) this.landOn((this.viewedStep - 1) as TutorialStepId);
  }

  goForward(): void {
    if (this.canGoForward()) this.landOn((this.viewedStep + 1) as TutorialStepId);
  }

  /** Jump straight to a step from the progress bar. */
  goToStep(step: number): void {
    const wanted = Math.min(Math.max(step, 1), this.step()) as TutorialStepId;
    this.landOn(wanted);
  }

  /**
   * Why the last step cannot be finished yet, when the mechanism the student
   * built will not run.
   *
   * Without this the card said "press Play" over a Play button that did
   * nothing, and Do This Step For Me changed the mode and stopped there. The
   * reason is the setup drawer's own first blocker, quoted, so the card and the
   * drawer cannot disagree about what is wrong.
   */
  stuckReason(): string | undefined {
    if (this.done || this.step() !== 5) return undefined;
    const input = this.chainInput();
    if (!input) return undefined;
    const machine = this.mechanism.mechanismContaining(input);
    if (machine?.isMechanismValid()) return undefined;
    const readiness = this.mechanism.readinessOfPart(input);
    const blocker = readiness?.checks.find((check) => check.severity === 'blocker');
    return blocker ? blocker.title : 'The mechanism cannot run yet';
  }

  /** The chain of links the tutorial is reading, if there is one yet. */
  private chain(): Link[] | undefined {
    return chainedLinks(plainLinks(this.mechanism.joints, this.mechanism.links));
  }

  /** The moving joints of that chain: the ones whose velocity is the lesson. */
  private chainMovers(): RealJoint[] {
    const joints = new Set<RealJoint>();
    for (const link of this.chain() ?? []) {
      for (const joint of real(link.joints)) if (!joint.ground) joints.add(joint);
    }
    return [...joints];
  }

  /** Record a play of the chain's machine if one is running, then check. */
  private noticePlay(): void {
    const input = this.chainInput();
    if (input) {
      const index = this.mechanism.indexOfMechanismContaining(input);
      if (index !== -1 && this.mechanism.isMechanismPlaying(index)) this.hasPlayed = true;
    }
    this.checkForFinish();
  }

  /** The input on the chain the tutorial is reading, if one is set. */
  private chainInput(): RealJoint | undefined {
    const chain = this.chain();
    if (!chain) return undefined;
    for (const link of chain) {
      for (const joint of link.joints) {
        if (joint instanceof RealJoint && joint.input) return joint;
      }
    }
    return undefined;
  }

  /**
   * Where the card is asking for a move the current mode does not offer.
   *
   * Adding a link is in the Edit menus only, and Synthesis has a menu of its
   * own, so a student who wandered into another mode mid-build right-clicked
   * the grid and found no Link anywhere.
   */
  wrongMode(): boolean {
    if (!this.isRunning() || this.done) return false;
    const step = this.viewedStep;
    if (this.viewingCompleted() || step === 5) return false;
    const tab = this.tabs.getCurrentTab();
    return tab === TabID.SYNTHESIZE || (step <= 2 && tab !== TabID.EDIT);
  }

  /** Live, so the tutorial is never running beside a card nobody asked for. */
  isRunning(): boolean {
    return this.started && !this.exited;
  }

  /**
   * The joint the grid rings.
   *
   * Only ever the step the student still has to do. Paging back to re-read a
   * finished step used to keep ringing whatever that step was about, which
   * pointed at a joint that wanted nothing — and while a finished step is being
   * held up to read, the move it asked for is already made.
   */
  ringJoint(): RealJoint | undefined {
    if (!this.isRunning() || this.done) return undefined;
    if (this.viewingCompleted()) return undefined;
    return this.viewedProgress().target;
  }

  /**
   * The offer that hangs off the Edit panel's empty state.
   *
   * Gone for good once the student has finished it or walked out — from then
   * on the way back in is the project menu, which is where a second reading of
   * a tutorial belongs.
   */
  offerVisible(): boolean {
    return !this.started && !this.seen;
  }

  /**
   * Whether the tutorial's own card is on screen. Set by the card itself.
   *
   * The panel knows this and the service cannot: the drawer shows one page at
   * a time, so opening Settings or Export puts the tutorial away without
   * anything here being told.
   */
  onScreen = false;

  /**
   * The one line the Edit panel keeps while the card is not showing.
   *
   * Deliberately not gated on the tutorial still running: walking out is the
   * main way of ending up here, and a student who exits at step two and then
   * wants back in has nowhere else to go — the offer above it is spent by
   * then, and the project menu is a thing you have to already know about.
   */
  resumeVisible(): boolean {
    return this.canResume() && !this.onScreen;
  }

  /**
   * Whether opening the tutorial now carries on with its own drawing rather
   * than starting again: it is under way, unfinished, and the drawing on the
   * grid is still the one it has been building.
   */
  canResume(): boolean {
    return this.started && !this.done && this.ownsDrawing();
  }

  /**
   * Whether starting the tutorial now would clear somebody's work: it would
   * start afresh, and the grid is not empty.
   */
  startWouldDiscard(): boolean {
    return !this.canResume() && this.restartWouldDiscard();
  }

  resumeLabel(): string {
    return `Resume Tutorial, step ${this.step()} of ${TUTORIAL_STEP_COUNT}`;
  }

  // ---------- entering and leaving ----------

  /**
   * Open the tutorial: carry on where it was, or begin it on a bare grid.
   *
   * Beginning clears whatever is drawn, so a caller with a drawing on the grid
   * asks first -- see `startWouldDiscard` and `TutorialEntryService`. It never
   * begins on a drawing it did not build: every step is read off the drawing,
   * and somebody else's mechanism reads as steps they never took.
   */
  start(): void {
    if (this.canResume()) {
      this.resume();
      return;
    }
    this.restart();
  }

  private resume(): void {
    this.exited = false;
    this.knownStep = stepOf(this.mechanism.joints, this.mechanism.links);
    // An undo while the card was away may have taken the input back off. The
    // play that came before it was of a machine that is no longer there.
    if (this.knownStep < 5) this.hasPlayed = false;
    this.landOn(this.knownStep);
    // Steps one to four are made from the Edit menus. Adding a link is offered
    // nowhere else, so a resume from an analysis mode would otherwise send the
    // student to a right-click that does not have the item it names.
    if (this.knownStep < 5) this.tabs.setTab(TabID.EDIT);
    this.showLetters();
  }

  /**
   * The copy names joints by letter -- "right-click joint A, the ringed one"
   * -- and the letters are off by default. A tutorial that points at a name
   * the student cannot see on the grid is pointing at nothing.
   */
  private showLetters(): void {
    this.settings.isShowID.next(true);
  }

  /**
   * Walked out of. The drawing is left exactly as it is: a student who quits
   * three links in has three links, not a rolled-back grid.
   */
  exit(): void {
    this.exited = true;
    this.remember();
  }

  /** Whether restarting would throw away work the student has done. */
  restartWouldDiscard(): boolean {
    return (
      this.mechanism.joints.length > 0 ||
      this.mechanism.links.length > 0 ||
      this.mechanism.forces.length > 0
    );
  }

  /** Back to a bare grid and step one. The only thing that discards work. */
  restart(): void {
    this.analytics.track('tutorial_begin');
    // Stopped first: a drawing cleared while it plays leaves the transport
    // running over an empty grid, and the first bar drawn is then mid-play.
    this.mechanism.setAllPlaying(false);
    this.settings.animating.next(false);
    this.mechanism.deleteAll();
    this.started = true;
    this.exited = false;
    this.done = false;
    this.replacedAt = undefined;
    this.reading = undefined;
    this.hasPlayed = false;
    // The entry the clear made, or the bare grid's own when there was nothing
    // to clear. Undo before it is somebody else's drawing.
    this.baseline = this.history.currentEntry();
    this.knownStep = 1;
    this.landOn(1);
    this.tabs.setTab(TabID.EDIT);
    this.showLetters();
  }

  /**
   * The offer turned down without being opened.
   *
   * Marked the same way finishing it is. The offer is a question asked once,
   * and "no" has to be as final an answer as "yes" — otherwise every new
   * session asks again, which is what made the tour it replaced so easy to
   * resent. The project menu is still the way in.
   */
  dismissOffer(): void {
    this.remember();
  }

  private remember(): void {
    this.seen = true;
    writeStoredFlag(SEEN_KEY, true);
  }

  // ---------- finishing ----------

  /**
   * The last step completes on the app's own state, like every other one: the
   * mechanism has run, and the student has clicked a joint that moves while
   * looking at its graphs.
   */
  private checkForFinish(): void {
    if (this.done || !this.isRunning()) return;
    if (this.tabs.getCurrentTab() !== TabID.ANALYZE) return;
    if (!this.hasPlayed || this.progress().step !== 5) return;
    const joint = this.activeObj.selectedJoint;
    if (!joint || this.activeObj.objType !== 'Joint' || joint.ground) return;
    // A joint of the four-bar the student built. A bar of its own elsewhere,
    // given an input and played, finished the tutorial on its velocity.
    if (!this.chainMovers().includes(joint)) return;
    this.finishOn(joint);
  }

  private finishOn(joint: RealJoint): void {
    const reading = this.readingFor(joint);
    if (!reading) return;
    this.reading = reading;
    this.done = true;
    this.analytics.track('tutorial_complete');
    this.remember();
  }

  /**
   * The velocity of one joint, right now, in the units the graph would show.
   *
   * Frozen into `reading` rather than recomputed: left live it kept counting
   * with the animation, which turns a result into a ticker.
   */
  private readingFor(joint: RealJoint): TutorialReading | undefined {
    const mechanism = this.mechanism.mechanismContaining(joint);
    if (!mechanism || !mechanism.isMechanismValid()) return undefined;
    const at = this.mechanism.mechanisms.indexOf(mechanism);
    const samples = mechanism.joints.length;
    const index = Math.max(
      0,
      Math.min(
        at === -1 ? this.mechanism.mechanismTimeStep : this.mechanism.currentSampleOf(at),
        samples - 1
      )
    );
    const values = this.samples.sampleAt(
      mechanism,
      index,
      'kinematic',
      'loop',
      'Linear Joint Vel',
      joint.id
    );
    if (values.length < 3 || !Number.isFinite(values[2])) return undefined;
    return {
      joint: joint.name || joint.id,
      magnitude: values[2].toFixed(2),
      unit: `${this.lengthUnit()}/s`,
      // The elapsed time, which is what the playback row beside it reads.
      //
      // The phase of the cycle in degrees is the obvious alternative and it
      // puts two different angles on screen at once: the row shows the input's
      // *bearing*, not how far through the cycle it is, so a card saying "90
      // degrees" beside a readout saying "360" is two right answers to
      // questions the student did not know were different.
      time: this.nup.formatValueAndUnit(this.mechanism.timeAtStep(index), TimeUnit.SECOND),
    };
  }

  private lengthUnit(): string {
    switch (this.settings.lengthUnit.value) {
      case LengthUnit.INCH:
        return 'in';
      case LengthUnit.METER:
        return 'm';
      default:
        return 'cm';
    }
  }

  // ---------- doing it for them ----------

  /**
   * Make the current step's move on the student's behalf.
   *
   * Every branch goes through the same service call the context menu uses, so
   * what lands is what they would have drawn, undoable in the usual way.
   */
  doStepForMe(): boolean {
    // The drawing's step, never the viewed one: the button offers to make the
    // move that is actually outstanding, even if the card has been turned back
    // to re-read something finished.
    const before = this.step();
    if (before < 5) {
      // Made where the student would make it, and on a still drawing: the
      // edits below are the Edit menus' own, and a structural edit mid-play is
      // one the app refuses everywhere else.
      this.mechanism.setAllPlaying(false);
      this.settings.animating.next(false);
      if (this.tabs.getCurrentTab() !== TabID.EDIT) this.tabs.setTab(TabID.EDIT);
    } else if (this.stuckReason()) {
      // Playing a mechanism that cannot run reads nothing. The card says why,
      // and the caller opens the setup that lists the fix.
      return false;
    }
    this.makeStep(before);
    if (before < 5 && this.step() === before) {
      this.notify.news(
        'tutorial.cannot-do',
        'This step can’t be done for you on this drawing. Follow the card by hand, or choose Start Over to clear the grid.'
      );
    }
    return true;
  }

  private makeStep(step: number): void {
    switch (step) {
      case 1:
        this.drawFirstBar();
        break;
      case 2:
        this.extendChain();
        break;
      case 3:
        this.groundEnds();
        break;
      case 4:
        this.driveIt();
        break;
      default:
        this.playAndRead();
    }
  }

  /**
   * The canonical four-bar, in the student's own length units.
   *
   * A crank-rocker rather than any four points that close: ground 4, crank 1,
   * coupler 3.5, rocker 3 satisfies Grashof with the crank adjacent to ground,
   * so the input turns all the way round and the mechanism actually plays. A
   * triple rocker would stall halfway through step five.
   */
  private static readonly SHAPE = {
    a: new Coord(-2, 0),
    b: new Coord(-2, 1),
    c: new Coord(0.99, 2.82),
    d: new Coord(2, 0),
  };

  /**
   * Where the canonical shape goes: inside what the student is already looking
   * at, rather than wherever its own coordinates happen to fall.
   *
   * Building at fixed model coordinates and then reframing onto them is the
   * obvious alternative, and it is wrong twice over: it moves the view out from
   * under someone who had panned somewhere deliberately, and the zoom it lands
   * on leaves the parts drawn far larger than the grid squares -- which the app
   * notices and warns about. Placing it in view instead means the same thing
   * happens as when a bar is drawn by hand: it is already where you are
   * looking, and nothing has to move.
   */
  private placeInView(): (point: Coord) => Coord {
    const { a, b, c, d } = TutorialService.SHAPE;
    const xs = [a.x, b.x, c.x, d.x];
    const ys = [a.y, b.y, c.y, d.y];
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);
    const middle = new Coord(
      (Math.max(...xs) + Math.min(...xs)) / 2,
      (Math.max(...ys) + Math.min(...ys)) / 2
    );

    const view = this.visibleRect();
    // Most of the clear space, leaving a margin so the finished four-bar reads
    // as a drawing on a grid rather than as a full-bleed diagram. Two thirds
    // rather than a half because the clear space is what is left between the
    // panels, and on a narrow window that is a strip a few hundred pixels wide
    // -- half of which is a mechanism too small to right-click accurately.
    const scale = Math.min((view.width * 0.66) / spanX, (view.height * 0.6) / spanY);
    return (point: Coord) =>
      new Coord(view.x + (point.x - middle.x) * scale, view.y + (point.y - middle.y) * scale);
  }

  /**
   * The middle of the *clear* canvas, and how much of the model it is showing.
   *
   * Not the whole canvas: the panels float over it, and a joint underneath one
   * cannot be right-clicked at all — which matters here more than anywhere,
   * because the tutorial goes on to ring one joint and tell the student to
   * right-click it by name.
   *
   * The room taken is the strip between the left panel and the drawer, and only
   * that. Two earlier attempts were worse: the whole canvas, which is the one
   * rectangle guaranteed to put a joint under a panel; and the largest of
   * beside-or-below, which on a narrow window chose the space below the panel
   * and was right until the panel grew into it a step later.
   */
  private visibleRect(): { x: number; y: number; width: number; height: number } {
    const canvas = document.getElementById('canvas');
    const box = canvas?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) {
      // No canvas to ask -- a test harness, or a call before the view exists.
      // The default view is centered on the origin and about twenty units wide.
      return { x: 0, y: 0, width: 20 * MODEL_SCALE, height: 12 * MODEL_SCALE };
    }

    const gap = 16;
    const leftPanel = onScreen('app-left-tabs .panel');
    const drawer = onScreen('#rightPanel');
    const strip = onScreen('.topStrip');
    const underneath = [onScreen('#bottomBar'), onScreen('.playbackRow')].filter(
      (one): one is DOMRect => one !== undefined
    );

    const ceiling = strip ? Math.max(box.top, strip.bottom + gap) : box.top;
    const floor = underneath.reduce((low, one) => Math.min(low, one.top - gap), box.bottom);
    const rightWall = drawer ? Math.min(box.right, drawer.left - gap) : box.right;

    // Beside the left panel, never below it. The panel's right edge is fixed —
    // it is a column of known width — but its height is not: it is a short help
    // card on an empty grid and two and a half times that once a joint is
    // selected, which is exactly what step three does on the way to step four.
    // Room measured below it is room the panel takes back a moment later, and
    // the joint the tutorial rings ends up underneath after all.
    const beside = {
      left: leftPanel ? Math.max(box.left, leftPanel.right + gap) : box.left,
      right: rightWall,
      top: ceiling,
      bottom: floor,
    };

    // Enough to draw a four-bar whose two ground joints can be told apart and
    // hit separately. Below this the window is narrower than the app's own
    // chrome and there is no honest answer -- the canvas at least keeps the
    // mechanism where the view is looking.
    const MIN_CLEAR = 90;
    const fits = (
      room: { left: number; right: number; top: number; bottom: number },
      tall = MIN_CLEAR
    ) => room.right - room.left >= MIN_CLEAR && room.bottom - room.top >= tall;

    // On a phone the drawer is a card across the whole width, so there is no
    // room beside it -- and falling back to the whole canvas built the
    // four-bar under the very card that names its joints. Under the card is
    // the other clear strip. It is short, so it is held to less height than
    // the side strip: a four-bar is wider than it is tall.
    const below = drawer
      ? {
          left: leftPanel && !this.viewport.isPhone() ? beside.left : box.left,
          right: box.right,
          top: Math.max(ceiling, drawer.bottom + gap),
          bottom: floor,
        }
      : undefined;
    const best = fits(beside)
      ? beside
      : below && fits(below, MIN_CLEAR / 1.5)
        ? below
        : { left: box.left, right: box.right, top: box.top, bottom: box.bottom };

    const from = this.svgGrid.screenToModelFromXY(best.left, best.top);
    const to = this.svgGrid.screenToModelFromXY(best.right, best.bottom);
    return {
      x: (from.x + to.x) / 2,
      y: (from.y + to.y) / 2,
      width: Math.abs(to.x - from.x),
      height: Math.abs(to.y - from.y),
    };
  }

  private drawFirstBar(): void {
    // The app's own rule for a first part: object scale is taken from the zoom
    // the student is at, and it has to be settled before anything is drawn,
    // because every part is sized from it.
    if (this.mechanism.links.length === 0) this.svgGrid.updateObjectScale();
    const place = this.placeInView();
    const { a, b } = TutorialService.SHAPE;
    this.mechanism.addBar(place(a), place(b));
  }

  /**
   * Extend whatever bar is there, rather than the one the tutorial would have
   * drawn.
   *
   * The remaining two points are placed through the similarity that carries
   * the canonical first bar onto the student's actual one, so a bar drawn
   * longer, shorter or at an angle still finishes as the same crank-rocker.
   */
  private extendChain(): void {
    const { a, b, c, d } = TutorialService.SHAPE;
    // Extend the biggest piece of chain there is, from its own first bar. The
    // first bar in the drawing is not necessarily on it: a student who drew
    // two bars that do not touch has two pieces, and extending from the
    // newest free end of the whole drawing put both new bars on the second
    // piece -- the second exactly on top of the first's far end, a bar of no
    // length.
    const piece = largestPiece(plainLinks(this.mechanism.joints, this.mechanism.links));
    if (!piece) return;
    const first = piece.links[0];
    const [from, to] = real(first.joints);
    if (!from || !to) return;
    const map = similarity(a, b, coordOf(from), coordOf(to));

    // Until the step is *done*, not one bar per press: the button offers to
    // make the move the card is asking for, and the card is asking for a chain
    // of three.
    if (piece.links.length === 1) {
      const middle = this.mechanism.addBarFrom(to, map(c));
      const newest = middle ? real(middle.joints).find((joint) => joint !== to) : undefined;
      if (newest) this.mechanism.addBarFrom(newest, map(d));
      return;
    }
    // Two bars already joined: one more, from whichever free end is not the
    // first bar's, so the chain grows away from where it started.
    const ends = piece.joints.filter((joint) => joint.links.length === 1);
    const anchor = ends.find((joint) => !first.joints.includes(joint)) ?? ends[0];
    if (anchor) this.mechanism.addBarFrom(anchor, clearOf(map(d), piece.joints));
  }

  private groundEnds(): void {
    // Until the step is satisfied, rather than a fixed two passes. `toggleGround`
    // is a toggle: on a drawing that already had one end grounded, the first
    // pass finished the step and the second one took the *next* step's target
    // -- an already-grounded joint -- and un-grounded it. The two canceled, and
    // from the outside the button did nothing at all.
    //
    // One at a time and through the panel's own call, which resolves sliders and
    // rebuilds, so the ends are re-read between passes.
    for (let guard = 0; guard < 4 && this.step() === 3; guard++) {
      const target = this.progress().target;
      if (!target) return;
      this.activeObj.updateSelectedObj(target);
      this.mechanism.toggleGround();
    }
  }

  private driveIt(): void {
    const target = this.progress().target;
    if (!target) return;
    this.activeObj.updateSelectedObj(target);
    this.mechanism.adjustInput();
  }

  private playAndRead(): void {
    this.tabs.setTab(TabID.ANALYZE);
    // A sample index, not a fraction of the cycle -- `animate` rounds what it
    // is given and clamps it into the sample range, so a fraction is the start
    // pose every time. A quarter of the way round is far enough that the
    // mechanism has visibly moved and the reading is about something.
    const samples = this.mechanism.masterMechanism()?.joints.length ?? 0;
    this.mechanism.animate(Math.floor(samples / 4), false);
    this.hasPlayed = true;
    const joint = this.fastestJoint();
    if (joint) this.activeObj.updateSelectedObj(joint);
    this.checkForFinish();
  }

  /**
   * The moving joint with the most to say, at the pose now on screen.
   *
   * "Read a velocity" wants one worth reading: the first non-grounded joint in
   * the drawing is usually on the crank, whose speed is the smallest in the
   * mechanism. On a crank-rocker the fastest is the coupler point, which is
   * also the one the graphs are interesting for.
   */
  private fastestJoint(): RealJoint | undefined {
    let best: RealJoint | undefined;
    let fastest = -1;
    for (const joint of this.chainMovers()) {
      const speed = Number(this.readingFor(joint)?.magnitude ?? -1);
      if (speed > fastest) {
        fastest = speed;
        best = joint;
      }
    }
    return best;
  }
}

/**
 * The similarity taking one segment onto another: rotate, scale, translate.
 *
 * Angles and length ratios survive it, which is the whole reason it is used
 * here -- the four-bar stays the four-bar whatever bar the student drew.
 */
function similarity(fromA: Coord, fromB: Coord, toA: Coord, toB: Coord): (point: Coord) => Coord {
  const source = { x: fromB.x - fromA.x, y: fromB.y - fromA.y };
  const target = { x: toB.x - toA.x, y: toB.y - toA.y };
  const denominator = source.x * source.x + source.y * source.y;
  if (denominator === 0) return () => new Coord(toA.x, toA.y);
  // The complex quotient target/source: one number carrying both the rotation
  // and the scale.
  const scaleX = (target.x * source.x + target.y * source.y) / denominator;
  const scaleY = (target.y * source.x - target.x * source.y) / denominator;
  return (point: Coord) => {
    const dx = point.x - fromA.x;
    const dy = point.y - fromA.y;
    return new Coord(toA.x + scaleX * dx - scaleY * dy, toA.y + scaleY * dx + scaleX * dy);
  };
}

const real = (joints: Joint[]): RealJoint[] =>
  joints.filter((joint): joint is RealJoint => joint instanceof RealJoint);

const coordOf = (joint: RealJoint): Coord => new Coord(joint.x, joint.y);

/**
 * The connected piece of the drawing with the most links, oldest link first,
 * and its joints. Ties go to the piece holding the oldest link.
 */
function largestPiece(links: Link[]): { links: Link[]; joints: RealJoint[] } | undefined {
  const seen = new Set<Link>();
  let best: Link[] | undefined;
  for (const start of links) {
    if (seen.has(start)) continue;
    const piece = new Set<Link>([start]);
    const queue = [start];
    while (queue.length > 0) {
      for (const joint of real(queue.pop()!.joints)) {
        for (const next of joint.links) {
          // Only through the links asked about: two bars joined by a cylinder
          // are two pieces, or the step is handed one bar too few.
          if (links.includes(next) && !piece.has(next)) {
            piece.add(next);
            queue.push(next);
          }
        }
      }
    }
    piece.forEach((link) => seen.add(link));
    if (!best || piece.size > best.length) best = links.filter((link) => piece.has(link));
  }
  if (!best) return undefined;
  const joints = new Set<RealJoint>();
  best.forEach((link) => real(link.joints).forEach((joint) => joints.add(joint)));
  return { links: best, joints: [...joints] };
}

/**
 * A point nudged off any joint it would land on. A bar ending on an existing
 * joint is a bar of no length or a merge nobody asked for, and the similarity
 * puts the last point exactly on one whenever the student's own second bar
 * already went where the tutorial's would have.
 */
function clearOf(point: Coord, joints: RealJoint[]): Coord {
  const span = joints.reduce(
    (most, joint) => Math.max(most, Math.hypot(joint.x - point.x, joint.y - point.y)),
    0
  );
  const near = span * 0.05;
  const crowded = joints.some((joint) => Math.hypot(joint.x - point.x, joint.y - point.y) < near);
  return crowded ? new Coord(point.x + span * 0.3, point.y) : point;
}

/** An element's box, if it is actually taking up room on screen. */
function onScreen(selector: string): DOMRect | undefined {
  const element = document.querySelector(selector);
  if (!element) return undefined;
  const box = element.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return undefined;
  // A closed drawer keeps its box and is parked off the edge with
  // `visibility: hidden`; it is not in the way and must not be treated as if
  // it were.
  return getComputedStyle(element).visibility === 'hidden' ? undefined : box;
}
