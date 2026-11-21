import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** How much a dialog's button asks to be pressed. */
export type DialogButtonKind = 'quiet' | 'outlined' | 'filled';

/**
 * A button in a dialog's action row: `<button dialogButton="filled">`.
 *
 * An attribute on a real `<button>` rather than an element of its own, so
 * `mat-dialog-close`, `cdkFocusInitial` and a test's role query all reach the
 * button they always did.
 *
 * Three weights and one rule for using them: Cancel is quiet, the action the
 * dialog is asking about is filled, and a second way forward -- the library's
 * New Tab -- is outlined. There used to be four looks for this row, and the
 * tutorial's "clear the grid?" put Cancel and the button that deletes the
 * drawing in the same gray text, so neither read as the answer.
 */
@Component({
  selector: 'button[dialogButton]',
  template: '<ng-content></ng-content>',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'dialogButton',
    '[class.quiet]': "dialogButton() === 'quiet'",
    '[class.outlined]': "dialogButton() === 'outlined'",
    '[class.filled]': "dialogButton() === 'filled'",
    type: 'button',
  },
})
export class DialogButtonComponent {
  /** The weight. A bare `dialogButton` attribute is quiet. */
  readonly dialogButton = input<DialogButtonKind, DialogButtonKind | ''>('quiet', {
    transform: (kind) => kind || 'quiet',
  });
}
