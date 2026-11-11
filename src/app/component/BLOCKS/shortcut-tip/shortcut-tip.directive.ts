import {
  Directive,
  ElementRef,
  HostListener,
  OnDestroy,
  effect,
  inject,
  input,
} from '@angular/core';
import { AriaDescriber } from '@angular/cdk/a11y';
import { ConnectedPosition, Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { ShortcutId, KeyboardShortcutsService } from '../../../services/keyboard-shortcuts.service';
import { ShortcutTipComponent } from './shortcut-tip.component';

/** How long a pointer rests before the tip appears, matching Material's own. */
const OPEN_DELAY_MS = 400;

/** Which side of its control a tip sits on; the opposite side is the fallback. */
export type ShortcutTipPosition = 'below' | 'left';

const POSITIONS: Record<ShortcutTipPosition, ConnectedPosition[]> = {
  below: [
    { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 6 },
    { originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom', offsetY: -6 },
  ],
  // For a control at the edge of a card, whose tip below it would lie over
  // the rows the reader is about to choose from.
  left: [
    { originX: 'start', originY: 'center', overlayX: 'end', overlayY: 'center', offsetX: -6 },
    { originX: 'end', originY: 'center', overlayX: 'start', overlayY: 'center', offsetX: 6 },
  ],
};

/**
 * A tooltip whose keyboard shortcut is drawn as a key rather than written as
 * words in brackets.
 *
 * `matTooltip` takes a string and nothing else, so "Undo (Cmd-Z)" arrived as
 * one run of identical text and the reader had to parse the brackets to find
 * the shortcut -- which is harder than it sounds when the keys are not last,
 * as in "Play / Pause (Space)" against "Step back one frame". Drawn as a key
 * cap in the same type the Help panel uses for the same keys, it is a
 * different kind of thing at a glance and needs no parsing at all.
 *
 * Only for controls that *have* a shortcut. Everything else keeps `matTooltip`,
 * which is one dependency and one behavior fewer.
 *
 * The drawn tip is for the pointer. A screen reader is told the key through
 * the control's accessible description instead, which is where the key went
 * when it was written into the label in brackets: through CDK's
 * `AriaDescriber`, as `matTooltip` does, so the two can share one control
 * without either overwriting the other's `aria-describedby`.
 */
@Directive({ selector: '[appShortcutTip]' })
export class ShortcutTipDirective implements OnDestroy {
  /** What the control does, in the words its own label would use. */
  readonly appShortcutTip = input.required<string>();
  /** Which shortcut to draw. Without one there is nothing to add and no tip. */
  readonly shortcutTipFor = input<ShortcutId>();
  readonly shortcutTipDisabled = input(false);
  readonly shortcutTipPosition = input<ShortcutTipPosition>('below');

  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private overlay = inject(Overlay);
  private shortcuts = inject(KeyboardShortcutsService);
  private describer = inject(AriaDescriber);
  private open?: OverlayRef;
  private waiting?: ReturnType<typeof setTimeout>;
  /** The sentence currently attached to the host's `aria-describedby`, if any. */
  private described = '';

  constructor() {
    effect(() => {
      const id = this.shortcutTipFor();
      const keys = this.shortcutTipDisabled() || !id ? '' : this.shortcuts.spokenKeysFor(id);
      this.describe(keys ? `Keyboard shortcut: ${keys}` : '');
    });
  }

  @HostListener('mouseenter')
  @HostListener('focus')
  show(): void {
    if (this.shortcutTipDisabled() || this.open || this.waiting) return;
    this.waiting = setTimeout(() => {
      this.waiting = undefined;
      this.paint();
    }, OPEN_DELAY_MS);
  }

  @HostListener('mouseleave')
  @HostListener('blur')
  // A click is an answer, and a tip explaining the thing that just happened is
  // in the way of seeing it.
  @HostListener('click')
  hide(): void {
    clearTimeout(this.waiting);
    this.waiting = undefined;
    this.open?.dispose();
    this.open = undefined;
  }

  ngOnDestroy(): void {
    this.hide();
    this.describe('');
  }

  private describe(sentence: string): void {
    if (sentence === this.described) return;
    if (this.described) this.describer.removeDescription(this.host.nativeElement, this.described);
    if (sentence) this.describer.describe(this.host.nativeElement, sentence);
    this.described = sentence;
  }

  private paint(): void {
    const overlay = this.overlay.create({
      positionStrategy: this.overlay
        .position()
        .flexibleConnectedTo(this.host)
        .withPositions(POSITIONS[this.shortcutTipPosition()])
        /* CDK shrinks a flexible overlay to fit the space it lands in, which
           near a corner squeezed the tip narrow enough to break "Reset View"
           over two lines. The tip is small and pushes into view instead. */
        .withFlexibleDimensions(false)
        .withPush(true),
      scrollStrategy: this.overlay.scrollStrategies.close(),
      panelClass: 'shortcutTipPanel',
      // The tip is a label, not a target: a pointer that could land on it would
      // take the hover away from the control it belongs to.
      hasBackdrop: false,
    });
    const tip = overlay.attach(new ComponentPortal(ShortcutTipComponent));
    tip.setInput('text', this.appShortcutTip());
    tip.setInput('keys', this.keys());
    tip.changeDetectorRef.detectChanges();
    this.open = overlay;
  }

  private keys(): string {
    const id = this.shortcutTipFor();
    return id ? this.shortcuts.keysFor(id) : '';
  }
}
